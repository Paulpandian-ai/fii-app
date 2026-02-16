"""FII API Handler — Main router for all API requests.

Routes:
  GET  /feed                         — Latest compiled feed
  GET  /signals/<ticker>             — Full signal for a ticker
  GET  /signals/batch?tickers=A,B,C  — Batch fetch signals
  POST /signals/generate/<ticker>    — On-demand signal generation
  POST /signals/refresh-all          — Refresh all tracked stocks
  GET  /portfolio                    — User portfolio enriched with prices
  POST /portfolio                    — Save/update portfolio holdings
  POST /portfolio/parse-csv          — Parse CSV, return structured holdings
  GET  /portfolio/summary            — Portfolio summary stats
  GET  /portfolio/health             — Portfolio health score (0-100)
  GET  /baskets                      — AI-optimized stock baskets
  GET  /baskets/<name>               — Single basket detail
  GET  /trending                     — Social proof / trending stocks
  GET  /discovery                    — Tinder-style discovery cards
  GET  /watchlist                    — User watchlists
  POST /watchlist                    — Create/update watchlist
  DELETE /watchlist/<name>           — Delete watchlist
  POST /watchlist/add                — Add ticker to watchlist
  POST /watchlist/remove             — Remove ticker from watchlist
  GET  /coach/insights               — Coaching insights
"""

import json
import sys
import traceback

# Lambda adds /opt/python to sys.path for layers automatically.
# This explicit insert ensures it works in all execution contexts.
sys.path.insert(0, "/opt/python")

import db
import s3


def lambda_handler(event, context):
    """Main API Gateway event router."""
    try:
        http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
        path = event.get("rawPath", "/")
        # Strip stage prefix if present (e.g., /dev/signals/NVDA -> /signals/NVDA)
        stage = event.get("requestContext", {}).get("stage", "")
        if stage and path.startswith(f"/{stage}"):
            path = path[len(f"/{stage}"):]
        body = json.loads(event.get("body", "{}") or "{}")
        query_params = event.get("queryStringParameters") or {}
        user_id = (
            event.get("requestContext", {})
            .get("authorizer", {})
            .get("jwt", {})
            .get("claims", {})
            .get("sub", "anonymous")
        )

        # ─── Route Dispatch ───

        if path.startswith("/feed"):
            return _handle_feed(http_method, body, user_id)
        elif path.startswith("/price/"):
            ticker = path.split("/price/")[-1].strip("/").upper()
            return _handle_price(http_method, ticker)
        elif path.startswith("/search"):
            return _handle_search(http_method, query_params)
        elif path.startswith("/signals/refresh-all"):
            return _handle_refresh_all(http_method, user_id)
        elif path.startswith("/signals/generate/"):
            ticker = path.split("/signals/generate/")[-1].strip("/").upper()
            return _handle_generate_signal(http_method, ticker, user_id)
        elif path.startswith("/signals/batch"):
            return _handle_batch_signals(http_method, query_params, user_id)
        elif path.startswith("/signals/"):
            ticker = path.split("/signals/")[-1].strip("/").upper()
            return _handle_signal(http_method, ticker, user_id)
        elif path.startswith("/baskets"):
            return _handle_baskets(http_method, path)
        elif path.startswith("/trending"):
            return _handle_trending(http_method)
        elif path.startswith("/discovery"):
            return _handle_discovery(http_method)
        elif path.startswith("/watchlist"):
            return _handle_watchlist(http_method, path, body, user_id)
        elif path.startswith("/portfolio"):
            return _handle_portfolio(http_method, path, body, user_id)
        elif path.startswith("/coach"):
            return _handle_coach(http_method, user_id)
        else:
            return _response(404, {"error": "Not found"})

    except Exception as e:
        traceback.print_exc()
        return _response(500, {"error": str(e)})


# ─── Signal Endpoints ───

def _handle_signal(method, ticker, user_id):
    """GET /signals/<ticker> — Return full signal from DynamoDB + S3."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    # Try DynamoDB first for summary
    summary = db.get_item(f"SIGNAL#{ticker}", "LATEST")

    if not summary:
        return _response(404, {
            "ticker": ticker,
            "status": "not_found",
            "message": f"No signal data available for {ticker}",
        })

    # Fetch full detail from S3
    full_signal = s3.read_json(f"signals/{ticker}.json")

    if full_signal:
        return _response(200, full_signal)

    # Fallback: return DynamoDB summary
    top_factors = json.loads(summary.get("topFactors", "[]"))
    return _response(200, {
        "ticker": summary["ticker"],
        "companyName": summary.get("companyName", ticker),
        "compositeScore": float(summary.get("compositeScore", 5.0)),
        "signal": summary.get("signal", "HOLD"),
        "confidence": summary.get("confidence", "MEDIUM"),
        "insight": summary.get("insight", ""),
        "reasoning": summary.get("reasoning", ""),
        "topFactors": top_factors,
        "lastUpdated": summary.get("lastUpdated", ""),
    })


def _handle_batch_signals(method, query_params, user_id):
    """GET /signals/batch?tickers=NVDA,AAPL — Batch fetch from DynamoDB."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    tickers_str = query_params.get("tickers", "")
    if not tickers_str:
        return _response(400, {"error": "Missing 'tickers' query parameter"})

    tickers = [t.strip().upper() for t in tickers_str.split(",") if t.strip()]

    if len(tickers) > 50:
        return _response(400, {"error": "Maximum 50 tickers per batch request"})

    # Batch get from DynamoDB
    keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in tickers]
    items = db.batch_get(keys)

    signals = {}
    for item in items:
        ticker = item.get("ticker", "")
        top_factors = json.loads(item.get("topFactors", "[]"))
        signals[ticker] = {
            "ticker": ticker,
            "companyName": item.get("companyName", ticker),
            "compositeScore": float(item.get("compositeScore", 5.0)),
            "signal": item.get("signal", "HOLD"),
            "confidence": item.get("confidence", "MEDIUM"),
            "insight": item.get("insight", ""),
            "topFactors": top_factors,
            "lastUpdated": item.get("lastUpdated", ""),
        }

    return _response(200, {
        "signals": signals,
        "requested": len(tickers),
        "found": len(signals),
    })


def _handle_generate_signal(method, ticker, user_id):
    """POST /signals/generate/<ticker> — On-demand signal generation."""
    if method != "POST":
        return _response(405, {"error": "Method not allowed"})

    if not ticker or len(ticker) > 10:
        return _response(400, {"error": "Invalid ticker"})

    # Invoke the SignalEngine Lambda for on-demand analysis
    import boto3
    import os

    stage = os.environ.get("STAGE", "dev")
    lambda_client = boto3.client("lambda")

    response = lambda_client.invoke(
        FunctionName=f"fii-signal-engine-{stage}",
        InvocationType="RequestResponse",
        Payload=json.dumps({"ticker": ticker}),
    )

    payload = json.loads(response["Payload"].read())
    result = json.loads(payload.get("body", "{}")) if "body" in payload else payload

    return _response(200, {
        "ticker": ticker,
        "status": "completed",
        "message": f"Signal generated for {ticker}",
        "result": result,
    })


def _handle_refresh_all(method, user_id):
    """POST /signals/refresh-all — Trigger refresh for all tracked stocks."""
    if method != "POST":
        return _response(405, {"error": "Method not allowed"})

    import boto3
    import os
    from models import STOCK_UNIVERSE

    stage = os.environ.get("STAGE", "dev")
    lambda_client = boto3.client("lambda")

    # Invoke signal engine asynchronously
    lambda_client.invoke(
        FunctionName=f"fii-signal-engine-{stage}",
        InvocationType="Event",  # Async
        Payload=json.dumps({"tickers": STOCK_UNIVERSE}),
    )

    return _response(200, {
        "status": "initiated",
        "message": f"Refresh initiated for {len(STOCK_UNIVERSE)} stocks",
        "tickers": STOCK_UNIVERSE,
    })


# ─── Feed Endpoint ───

def _handle_feed(method, body, user_id):
    """GET /feed — Return the latest compiled feed from S3."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    # Try S3 compiled feed first
    compiled = s3.read_json("feed/default.json")
    if compiled and compiled.get("items"):
        return _response(200, {"items": compiled["items"], "cursor": None})

    # Fallback: build feed from DynamoDB signal summaries
    from models import STOCK_UNIVERSE

    keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in STOCK_UNIVERSE]
    items = db.batch_get(keys)

    feed_items = []
    for item in items:
        top_factors = json.loads(item.get("topFactors", "[]"))
        feed_items.append({
            "id": f"signal-{item.get('ticker', '')}",
            "type": "signal",
            "ticker": item.get("ticker", ""),
            "companyName": item.get("companyName", ""),
            "compositeScore": float(item.get("compositeScore", 5.0)),
            "signal": item.get("signal", "HOLD"),
            "confidence": item.get("confidence", "MEDIUM"),
            "insight": item.get("insight", ""),
            "topFactors": top_factors,
            "updatedAt": item.get("lastUpdated", ""),
        })

    return _response(200, {"items": feed_items, "cursor": None})


# ─── Price Endpoint ───

def _handle_price(method, ticker):
    """GET /price/<ticker> — Real-time price from Yahoo Finance."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    if not ticker or len(ticker) > 10:
        return _response(400, {"error": "Invalid ticker"})

    import os
    os.environ["YF_USE_CURL"] = "0"

    try:
        import yfinance as yf
        yf.set_tz_cache_location("/tmp")

        stock = yf.Ticker(ticker)
        info = stock.info or {}

        current_price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
        previous_close = info.get("previousClose") or info.get("regularMarketPreviousClose", 0)
        change = current_price - previous_close if current_price and previous_close else 0
        change_pct = (change / previous_close * 100) if previous_close else 0

        return _response(200, {
            "ticker": ticker,
            "price": round(current_price or 0, 2),
            "previousClose": round(previous_close or 0, 2),
            "change": round(change, 2),
            "changePercent": round(change_pct, 2),
            "marketCap": info.get("marketCap", 0),
            "fiftyTwoWeekLow": round(info.get("fiftyTwoWeekLow", 0) or 0, 2),
            "fiftyTwoWeekHigh": round(info.get("fiftyTwoWeekHigh", 0) or 0, 2),
            "beta": round(info.get("beta", 1.0) or 1.0, 2),
            "forwardPE": round(info.get("forwardPE", 0) or 0, 2),
            "trailingPE": round(info.get("trailingPE", 0) or 0, 2),
            "sector": info.get("sector", ""),
            "companyName": info.get("shortName") or info.get("longName", ticker),
        })
    except Exception as e:
        return _response(500, {"error": f"Failed to fetch price for {ticker}: {str(e)}"})


# ─── Search Endpoint ───

def _handle_search(method, query_params):
    """GET /search?q=<query> — Ticker search via yfinance."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    query = query_params.get("q", "").strip()
    if not query or len(query) < 1:
        return _response(400, {"error": "Missing 'q' query parameter"})

    import os
    os.environ["YF_USE_CURL"] = "0"

    try:
        import yfinance as yf
        yf.set_tz_cache_location("/tmp")

        # Try direct ticker lookup first
        results = []
        ticker_upper = query.upper()

        # Try the exact ticker
        try:
            stock = yf.Ticker(ticker_upper)
            info = stock.info or {}
            name = info.get("shortName") or info.get("longName", "")
            if name and info.get("regularMarketPrice"):
                results.append({
                    "ticker": ticker_upper,
                    "companyName": name,
                    "exchange": info.get("exchange", ""),
                    "sector": info.get("sector", ""),
                })
        except Exception:
            pass

        # Also search using yfinance search if direct lookup yielded nothing
        if not results:
            try:
                search_results = yf.Search(query)
                for quote in getattr(search_results, "quotes", [])[:8]:
                    symbol = quote.get("symbol", "")
                    name = quote.get("shortname") or quote.get("longname", "")
                    if symbol and name:
                        results.append({
                            "ticker": symbol,
                            "companyName": name,
                            "exchange": quote.get("exchange", ""),
                            "sector": "",
                        })
            except Exception:
                pass

        return _response(200, {"results": results[:10], "query": query})
    except Exception as e:
        return _response(500, {"error": f"Search failed: {str(e)}"})


# ─── Portfolio Endpoints ───

def _handle_portfolio(method, path, body, user_id):
    """Portfolio CRUD with sub-route dispatch."""
    if "/parse-csv" in path and method == "POST":
        return _handle_parse_csv(body)
    elif "/health" in path and method == "GET":
        return _handle_portfolio_health(user_id)
    elif "/summary" in path and method == "GET":
        return _handle_portfolio_summary(user_id)
    elif method == "GET":
        return _handle_get_portfolio(user_id)
    elif method == "POST":
        return _handle_save_portfolio(body, user_id)
    else:
        return _response(405, {"error": "Method not allowed"})


def _handle_get_portfolio(user_id):
    """GET /portfolio — Return holdings enriched with live prices."""
    from datetime import datetime

    record = db.get_item(f"USER#{user_id}", "PORTFOLIO")
    if not record or not record.get("holdings"):
        return _response(200, {
            "holdings": [],
            "totalValue": 0,
            "totalCost": 0,
            "totalGainLoss": 0,
            "totalGainLossPercent": 0,
            "dailyChange": 0,
            "dailyChangePercent": 0,
        })

    holdings_raw = json.loads(record["holdings"]) if isinstance(record["holdings"], str) else record["holdings"]

    # Enrich with prices
    enriched = []
    total_value = 0.0
    total_cost = 0.0
    daily_change = 0.0

    for h in holdings_raw:
        shares = float(h.get("shares", 0))
        avg_cost = float(h.get("avgCost", 0))
        cost_basis = shares * avg_cost
        total_cost += cost_basis

        price_data = _fetch_price_quiet(h["ticker"])
        current_price = price_data.get("price", avg_cost) if price_data else avg_cost
        change = price_data.get("change", 0) if price_data else 0
        change_pct = price_data.get("changePercent", 0) if price_data else 0

        holding_value = shares * current_price
        gain_loss = holding_value - cost_basis
        gain_loss_pct = (gain_loss / cost_basis * 100) if cost_basis else 0

        total_value += holding_value
        daily_change += shares * change

        enriched.append({
            "id": h.get("id", h["ticker"]),
            "ticker": h["ticker"],
            "companyName": h.get("companyName", h["ticker"]),
            "shares": shares,
            "avgCost": avg_cost,
            "currentPrice": round(current_price, 2),
            "change": round(change, 2),
            "changePercent": round(change_pct, 2),
            "totalValue": round(holding_value, 2),
            "gainLoss": round(gain_loss, 2),
            "gainLossPercent": round(gain_loss_pct, 2),
            "dateAdded": h.get("dateAdded", ""),
        })

    # Sort by value descending
    enriched.sort(key=lambda x: x["totalValue"], reverse=True)

    # Compute weights
    for h in enriched:
        h["weight"] = round(h["totalValue"] / total_value, 4) if total_value else 0

    total_gain_loss = total_value - total_cost
    total_gain_loss_pct = (total_gain_loss / total_cost * 100) if total_cost else 0
    daily_change_pct = (daily_change / (total_value - daily_change) * 100) if (total_value - daily_change) else 0

    return _response(200, {
        "holdings": enriched,
        "totalValue": round(total_value, 2),
        "totalCost": round(total_cost, 2),
        "totalGainLoss": round(total_gain_loss, 2),
        "totalGainLossPercent": round(total_gain_loss_pct, 2),
        "dailyChange": round(daily_change, 2),
        "dailyChangePercent": round(daily_change_pct, 2),
    })


def _handle_save_portfolio(body, user_id):
    """POST /portfolio — Save holdings to DynamoDB."""
    from datetime import datetime

    holdings = body.get("holdings", [])
    if not isinstance(holdings, list):
        return _response(400, {"error": "holdings must be an array"})

    # Validate and normalize
    clean = []
    for h in holdings:
        ticker = h.get("ticker", "").upper().strip()
        if not ticker:
            continue
        clean.append({
            "id": h.get("id", ticker),
            "ticker": ticker,
            "companyName": h.get("companyName", ticker),
            "shares": float(h.get("shares", 0)),
            "avgCost": float(h.get("avgCost", 0)),
            "dateAdded": h.get("dateAdded", datetime.utcnow().isoformat()),
        })

    now = datetime.utcnow().isoformat()
    db.put_item({
        "PK": f"USER#{user_id}",
        "SK": "PORTFOLIO",
        "holdings": json.dumps(clean),
        "lastUpdated": now,
    })

    # Also update watchlist for feed integration
    tickers = [h["ticker"] for h in clean]
    if tickers:
        db.put_item({
            "PK": f"USER#{user_id}",
            "SK": "WATCHLIST",
            "tickers": json.dumps(tickers),
            "lastUpdated": now,
        })

    return _response(200, {
        "holdings": clean,
        "saved": len(clean),
        "lastUpdated": now,
    })


def _handle_parse_csv(body):
    """POST /portfolio/parse-csv — Parse CSV text into structured holdings."""
    import csv
    import io

    csv_content = body.get("csv", "")
    if not csv_content:
        return _response(400, {"error": "Missing 'csv' field"})

    reader = csv.DictReader(io.StringIO(csv_content))
    headers = reader.fieldnames or []

    if not headers:
        return _response(400, {"error": "CSV has no headers"})

    # Auto-detect column mapping for common brokerage formats
    mapping = _detect_csv_mapping(headers)
    if not mapping.get("ticker"):
        return _response(200, {
            "holdings": [],
            "headers": headers,
            "needsMapping": True,
            "message": "Could not auto-detect column mapping. Headers: " + ", ".join(headers),
        })

    holdings = []
    for row in reader:
        ticker = row.get(mapping["ticker"], "").strip().upper()
        if not ticker or len(ticker) > 10:
            continue
        # Skip options, mutual funds, money market
        if any(c in ticker for c in [" ", ".", "/"]) and len(ticker) > 5:
            continue

        shares_str = row.get(mapping.get("shares", ""), "0")
        cost_str = row.get(mapping.get("cost", ""), "0")

        shares = _parse_number(shares_str)
        cost = _parse_number(cost_str)

        if shares <= 0:
            continue

        holdings.append({
            "id": ticker,
            "ticker": ticker,
            "companyName": "",
            "shares": round(shares, 6),
            "avgCost": round(cost, 2) if cost > 0 else 0,
        })

    return _response(200, {
        "holdings": holdings,
        "parsed": len(holdings),
        "headers": headers,
        "mapping": mapping,
    })


def _detect_csv_mapping(headers):
    """Auto-detect CSV column mapping for common brokerage formats."""
    headers_lower = [h.lower().strip() for h in headers]
    mapping = {}

    # Ticker / Symbol
    for pattern in ["symbol", "ticker", "stock symbol", "sym"]:
        for i, h in enumerate(headers_lower):
            if pattern in h:
                mapping["ticker"] = headers[i]
                break
        if "ticker" in mapping:
            break

    # Shares / Quantity
    for pattern in ["quantity", "shares", "qty", "units", "share"]:
        for i, h in enumerate(headers_lower):
            if pattern in h and "price" not in h:
                mapping["shares"] = headers[i]
                break
        if "shares" in mapping:
            break

    # Cost basis / Average cost
    for pattern in ["cost basis", "avg cost", "average cost", "cost per share",
                     "purchase price", "cost/share", "unit cost", "average price"]:
        for i, h in enumerate(headers_lower):
            if pattern in h:
                mapping["cost"] = headers[i]
                break
        if "cost" in mapping:
            break

    # Fallback: try "price" if no cost found
    if "cost" not in mapping:
        for pattern in ["price", "last price", "current price"]:
            for i, h in enumerate(headers_lower):
                if pattern in h:
                    mapping["cost"] = headers[i]
                    break
            if "cost" in mapping:
                break

    return mapping


def _parse_number(s):
    """Parse a number string, handling $, commas, parentheses for negatives."""
    if not s or not isinstance(s, str):
        return 0.0
    s = s.strip().replace("$", "").replace(",", "").replace(" ", "")
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    try:
        return float(s)
    except ValueError:
        return 0.0


def _handle_portfolio_summary(user_id):
    """GET /portfolio/summary — Return summary stats with signal data."""
    record = db.get_item(f"USER#{user_id}", "PORTFOLIO")
    if not record or not record.get("holdings"):
        return _response(200, {
            "totalValue": 0, "totalGainLoss": 0, "totalGainLossPercent": 0,
            "dailyChange": 0, "dailyChangePercent": 0,
            "biggestWinner": None, "biggestRisk": None,
            "sellCount": 0, "holdingsCount": 0,
        })

    holdings_raw = json.loads(record["holdings"]) if isinstance(record["holdings"], str) else record["holdings"]
    tickers = [h["ticker"] for h in holdings_raw]

    # Fetch signals for portfolio tickers
    signal_keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in tickers]
    signal_items = db.batch_get(signal_keys) if signal_keys else []
    signals_by_ticker = {}
    for s in signal_items:
        signals_by_ticker[s.get("ticker", "")] = s

    biggest_winner = None
    biggest_risk = None
    sell_count = 0

    for h in holdings_raw:
        ticker = h["ticker"]
        shares = float(h.get("shares", 0))
        avg_cost = float(h.get("avgCost", 0))

        price_data = _fetch_price_quiet(ticker)
        current_price = price_data.get("price", avg_cost) if price_data else avg_cost
        cost_basis = shares * avg_cost
        gain_loss_pct = ((current_price - avg_cost) / avg_cost * 100) if avg_cost else 0

        if biggest_winner is None or gain_loss_pct > biggest_winner["gainLossPercent"]:
            biggest_winner = {"ticker": ticker, "gainLossPercent": round(gain_loss_pct, 2)}

        sig = signals_by_ticker.get(ticker, {})
        signal_val = sig.get("signal", "HOLD")
        score = float(sig.get("compositeScore", 5.0))

        if signal_val == "SELL":
            sell_count += 1

        if biggest_risk is None or score < biggest_risk["score"]:
            biggest_risk = {"ticker": ticker, "signal": signal_val, "score": score}

    return _response(200, {
        "biggestWinner": biggest_winner,
        "biggestRisk": biggest_risk,
        "sellCount": sell_count,
        "holdingsCount": len(holdings_raw),
    })


def _fetch_price_quiet(ticker):
    """Fetch price for a ticker, return None on failure."""
    import os
    os.environ["YF_USE_CURL"] = "0"
    try:
        import yfinance as yf
        yf.set_tz_cache_location("/tmp")
        stock = yf.Ticker(ticker)
        info = stock.info or {}
        current_price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
        previous_close = info.get("previousClose") or info.get("regularMarketPreviousClose", 0)
        change = current_price - previous_close if current_price and previous_close else 0
        change_pct = (change / previous_close * 100) if previous_close else 0
        return {
            "price": round(current_price or 0, 2),
            "change": round(change, 2),
            "changePercent": round(change_pct, 2),
            "companyName": info.get("shortName") or info.get("longName", ticker),
        }
    except Exception:
        return None


# ─── Portfolio Health Endpoint ───

def _handle_portfolio_health(user_id):
    """GET /portfolio/health — Compute portfolio health score 0-100."""
    record = db.get_item(f"USER#{user_id}", "PORTFOLIO")
    if not record or not record.get("holdings"):
        return _response(200, {
            "overallScore": 0,
            "grade": "F",
            "diversification": {"label": "Diversification", "score": 0, "description": "No holdings"},
            "riskBalance": {"label": "Risk Balance", "score": 0, "description": "No holdings"},
            "signalAlignment": {"label": "Signal Alignment", "score": 0, "description": "No holdings"},
            "concentration": {"label": "Concentration", "score": 0, "description": "No holdings"},
            "suggestions": ["Add holdings to get your health score"],
            "updatedAt": "",
        })

    holdings_raw = json.loads(record["holdings"]) if isinstance(record["holdings"], str) else record["holdings"]
    n = len(holdings_raw)

    # Fetch signals
    tickers = [h["ticker"] for h in holdings_raw]
    signal_keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in tickers]
    signal_items = db.batch_get(signal_keys) if signal_keys else []
    signals_map = {s.get("ticker", ""): s for s in signal_items}

    # 1) Diversification (0-100): more stocks = better, sector spread
    div_score = min(100, n * 12)  # 8+ stocks = 96+
    div_desc = f"{n} holdings"
    if n < 3:
        div_desc += " — too concentrated"
    elif n < 6:
        div_desc += " — consider adding more"
    else:
        div_desc += " — well diversified"

    # 2) Risk Balance (0-100): ratio of BUY/HOLD vs SELL signals
    buy_count = sum(1 for t in tickers if signals_map.get(t, {}).get("signal") == "BUY")
    hold_count = sum(1 for t in tickers if signals_map.get(t, {}).get("signal") == "HOLD")
    sell_count = sum(1 for t in tickers if signals_map.get(t, {}).get("signal") == "SELL")
    if n > 0:
        risk_score = int(((buy_count * 1.0 + hold_count * 0.6) / n) * 100)
    else:
        risk_score = 0
    risk_score = min(100, max(0, risk_score))
    risk_desc = f"{buy_count} BUY, {hold_count} HOLD, {sell_count} SELL"

    # 3) Signal Alignment (0-100): avg composite score normalized
    avg_score = 0
    for t in tickers:
        sig = signals_map.get(t, {})
        avg_score += float(sig.get("compositeScore", 5.0))
    avg_score = avg_score / n if n else 5.0
    align_score = int((avg_score / 10.0) * 100)
    align_score = min(100, max(0, align_score))
    align_desc = f"Avg FII score: {avg_score:.1f}/10"

    # 4) Concentration (0-100): inverse of top-holding weight
    # We need prices for weights
    values = []
    for h in holdings_raw:
        shares = float(h.get("shares", 0))
        avg_cost = float(h.get("avgCost", 0))
        values.append(shares * avg_cost)  # Use cost basis as proxy
    total = sum(values) or 1
    max_weight = max(values) / total if values else 1
    conc_score = int((1 - max_weight) * 100)
    conc_score = min(100, max(0, conc_score))
    conc_desc = f"Top holding: {max_weight * 100:.0f}% of portfolio"

    overall = int(div_score * 0.25 + risk_score * 0.30 + align_score * 0.25 + conc_score * 0.20)
    overall = min(100, max(0, overall))

    if overall >= 80:
        grade = "A"
    elif overall >= 65:
        grade = "B"
    elif overall >= 50:
        grade = "C"
    elif overall >= 35:
        grade = "D"
    else:
        grade = "F"

    suggestions = []
    if sell_count > 0:
        suggestions.append(f"Review {sell_count} holding(s) with SELL signals")
    if n < 5:
        suggestions.append("Add more stocks for better diversification")
    if max_weight > 0.4:
        suggestions.append("Your portfolio is top-heavy — consider rebalancing")
    if avg_score < 5:
        suggestions.append("Average FII score is below neutral — review holdings")
    if not suggestions:
        suggestions.append("Your portfolio looks healthy!")

    from datetime import datetime
    return _response(200, {
        "overallScore": overall,
        "grade": grade,
        "diversification": {"label": "Diversification", "score": div_score, "description": div_desc},
        "riskBalance": {"label": "Risk Balance", "score": risk_score, "description": risk_desc},
        "signalAlignment": {"label": "Signal Alignment", "score": align_score, "description": align_desc},
        "concentration": {"label": "Concentration", "score": conc_score, "description": conc_desc},
        "suggestions": suggestions,
        "updatedAt": datetime.utcnow().isoformat(),
    })


# ─── Baskets Endpoint ───

DEFAULT_BASKETS = [
    {
        "id": "ai-dominators",
        "name": "AI Dominators",
        "emoji": "\U0001f916",
        "description": "Companies leading the AI revolution with strong fundamentals and FII scores",
        "stocks": [
            {"ticker": "NVDA", "companyName": "NVIDIA Corporation", "weight": 0.30, "score": 8.4, "signal": "BUY", "reason": "AI chip monopoly + datacenter demand"},
            {"ticker": "MSFT", "companyName": "Microsoft Corporation", "weight": 0.25, "score": 7.8, "signal": "BUY", "reason": "Azure AI + Copilot integration"},
            {"ticker": "GOOGL", "companyName": "Alphabet Inc.", "weight": 0.20, "score": 7.0, "signal": "BUY", "reason": "Gemini AI + Search dominance"},
            {"ticker": "META", "companyName": "Meta Platforms, Inc.", "weight": 0.15, "score": 6.5, "signal": "HOLD", "reason": "LLaMA open-source + ad AI"},
            {"ticker": "AMD", "companyName": "Advanced Micro Devices", "weight": 0.10, "score": 6.8, "signal": "HOLD", "reason": "MI300 GPU alternative"},
        ],
        "returnYTD": 24.3,
        "riskLevel": "High",
    },
    {
        "id": "steady-compounders",
        "name": "Steady Compounders",
        "emoji": "\U0001f3af",
        "description": "Reliable large-caps with consistent earnings growth and low volatility",
        "stocks": [
            {"ticker": "AAPL", "companyName": "Apple Inc.", "weight": 0.25, "score": 7.1, "signal": "BUY", "reason": "Services flywheel + iPhone cycle"},
            {"ticker": "V", "companyName": "Visa Inc.", "weight": 0.20, "score": 7.5, "signal": "BUY", "reason": "Payments duopoly + cross-border growth"},
            {"ticker": "UNH", "companyName": "UnitedHealth Group", "weight": 0.20, "score": 6.9, "signal": "HOLD", "reason": "Healthcare moat + aging demographics"},
            {"ticker": "MSFT", "companyName": "Microsoft Corporation", "weight": 0.20, "score": 7.8, "signal": "BUY", "reason": "Enterprise software + cloud"},
            {"ticker": "JPM", "companyName": "JPMorgan Chase", "weight": 0.15, "score": 6.6, "signal": "HOLD", "reason": "Banking leader + rate tailwind"},
        ],
        "returnYTD": 15.7,
        "riskLevel": "Low",
    },
    {
        "id": "cloud-kings",
        "name": "Cloud Kings",
        "emoji": "\u2601\ufe0f",
        "description": "Dominant cloud infrastructure and SaaS platforms driving digital transformation",
        "stocks": [
            {"ticker": "AMZN", "companyName": "Amazon.com, Inc.", "weight": 0.30, "score": 7.3, "signal": "BUY", "reason": "AWS market leader + advertising"},
            {"ticker": "MSFT", "companyName": "Microsoft Corporation", "weight": 0.25, "score": 7.8, "signal": "BUY", "reason": "Azure growth + enterprise"},
            {"ticker": "CRM", "companyName": "Salesforce, Inc.", "weight": 0.20, "score": 6.4, "signal": "HOLD", "reason": "CRM market share + AI agents"},
            {"ticker": "GOOGL", "companyName": "Alphabet Inc.", "weight": 0.15, "score": 7.0, "signal": "BUY", "reason": "Google Cloud + BigQuery"},
            {"ticker": "AVGO", "companyName": "Broadcom Inc.", "weight": 0.10, "score": 7.2, "signal": "BUY", "reason": "VMware + cloud networking"},
        ],
        "returnYTD": 19.1,
        "riskLevel": "Medium",
    },
    {
        "id": "energy-transition",
        "name": "Energy Titans",
        "emoji": "\u26a1",
        "description": "Traditional energy leaders with strong cash flows benefiting from AI power demand",
        "stocks": [
            {"ticker": "XOM", "companyName": "Exxon Mobil Corporation", "weight": 0.35, "score": 5.8, "signal": "HOLD", "reason": "Cash cow + Pioneer acquisition"},
            {"ticker": "AVGO", "companyName": "Broadcom Inc.", "weight": 0.25, "score": 7.2, "signal": "BUY", "reason": "Data center power management"},
            {"ticker": "NFLX", "companyName": "Netflix, Inc.", "weight": 0.20, "score": 7.4, "signal": "BUY", "reason": "Content spending discipline + ads tier"},
            {"ticker": "JPM", "companyName": "JPMorgan Chase", "weight": 0.20, "score": 6.6, "signal": "HOLD", "reason": "Energy financing + rate margin"},
        ],
        "returnYTD": 11.2,
        "riskLevel": "Medium",
    },
    {
        "id": "momentum-plays",
        "name": "Momentum Plays",
        "emoji": "\U0001f680",
        "description": "High-beta names with strong recent performance and positive FII signals",
        "stocks": [
            {"ticker": "NVDA", "companyName": "NVIDIA Corporation", "weight": 0.25, "score": 8.4, "signal": "BUY", "reason": "Strongest momentum in market"},
            {"ticker": "NFLX", "companyName": "Netflix, Inc.", "weight": 0.20, "score": 7.4, "signal": "BUY", "reason": "Subscriber re-acceleration"},
            {"ticker": "AMZN", "companyName": "Amazon.com, Inc.", "weight": 0.20, "score": 7.3, "signal": "BUY", "reason": "Margin expansion story"},
            {"ticker": "META", "companyName": "Meta Platforms, Inc.", "weight": 0.20, "score": 6.5, "signal": "HOLD", "reason": "AI ad revenue boost"},
            {"ticker": "TSLA", "companyName": "Tesla, Inc.", "weight": 0.15, "score": 5.2, "signal": "HOLD", "reason": "Robotaxi catalyst potential"},
        ],
        "returnYTD": 28.9,
        "riskLevel": "High",
    },
]


def _handle_baskets(method, path):
    """GET /baskets or GET /baskets/<id>."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    # Check for specific basket
    parts = path.strip("/").split("/")
    if len(parts) > 1 and parts[1]:
        basket_id = parts[1]
        # Try S3 first
        s3_basket = s3.read_json(f"baskets/{basket_id}.json")
        if s3_basket:
            return _response(200, s3_basket)
        # Fallback to default
        for b in DEFAULT_BASKETS:
            if b["id"] == basket_id:
                return _response(200, b)
        return _response(404, {"error": f"Basket '{basket_id}' not found"})

    # List all baskets
    s3_baskets = s3.read_json("baskets/default.json")
    if s3_baskets and s3_baskets.get("baskets"):
        return _response(200, {"baskets": s3_baskets["baskets"]})

    from datetime import datetime
    now = datetime.utcnow().isoformat()
    baskets_with_dates = [
        {**b, "updatedAt": now} for b in DEFAULT_BASKETS
    ]
    return _response(200, {"baskets": baskets_with_dates})


# ─── Trending Endpoint ───

DEFAULT_TRENDING = [
    {"ticker": "NVDA", "companyName": "NVIDIA Corporation", "score": 8.4, "signal": "BUY", "reason": "AI chip demand surge after earnings beat", "changePercent": 4.2, "volume": "52.3M", "rank": 1},
    {"ticker": "TSLA", "companyName": "Tesla, Inc.", "score": 5.2, "signal": "HOLD", "reason": "Robotaxi unveil drives speculation", "changePercent": -2.1, "volume": "38.7M", "rank": 2},
    {"ticker": "AAPL", "companyName": "Apple Inc.", "score": 7.1, "signal": "BUY", "reason": "iPhone 17 pre-orders exceed expectations", "changePercent": 1.8, "volume": "28.1M", "rank": 3},
    {"ticker": "AMZN", "companyName": "Amazon.com, Inc.", "score": 7.3, "signal": "BUY", "reason": "AWS growth accelerates to 19% YoY", "changePercent": 3.1, "volume": "22.5M", "rank": 4},
    {"ticker": "META", "companyName": "Meta Platforms, Inc.", "score": 6.5, "signal": "HOLD", "reason": "Threads user growth hits 200M DAUs", "changePercent": 0.9, "volume": "18.9M", "rank": 5},
]


def _handle_trending(method):
    """GET /trending — Return trending / social proof data."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    s3_trending = s3.read_json("trending/latest.json")
    if s3_trending and s3_trending.get("items"):
        return _response(200, {"items": s3_trending["items"]})

    return _response(200, {"items": DEFAULT_TRENDING})


# ─── Discovery Endpoint ───

DEFAULT_DISCOVERY = [
    {"ticker": "AVGO", "companyName": "Broadcom Inc.", "score": 7.2, "signal": "BUY", "insight": "VMware integration drives recurring revenue; AI networking chip demand surges", "sector": "Technology", "price": 185.30, "changePercent": 2.4, "topFactors": [{"name": "Supply Chain", "score": 1.4}, {"name": "Performance", "score": 1.2}]},
    {"ticker": "CRM", "companyName": "Salesforce, Inc.", "score": 6.4, "signal": "HOLD", "insight": "AgentForce AI platform gaining traction; margins expanding through discipline", "sector": "Technology", "price": 312.50, "changePercent": 1.1, "topFactors": [{"name": "Customers", "score": 1.0}, {"name": "Performance", "score": 0.8}]},
    {"ticker": "NFLX", "companyName": "Netflix, Inc.", "score": 7.4, "signal": "BUY", "insight": "Ad-supported tier exceeds projections; content spending discipline improves margins", "sector": "Communication", "price": 725.80, "changePercent": 3.5, "topFactors": [{"name": "Customers", "score": 1.5}, {"name": "Performance", "score": 1.3}]},
    {"ticker": "JPM", "companyName": "JPMorgan Chase", "score": 6.6, "signal": "HOLD", "insight": "Rate environment supports NII; investment banking recovery underway", "sector": "Financials", "price": 215.40, "changePercent": 0.7, "topFactors": [{"name": "Macro", "score": 0.9}, {"name": "Performance", "score": 0.8}]},
    {"ticker": "V", "companyName": "Visa Inc.", "score": 7.5, "signal": "BUY", "insight": "Cross-border volume recovery accelerates; new value-added services growing 20%+", "sector": "Financials", "price": 298.60, "changePercent": 1.3, "topFactors": [{"name": "Customers", "score": 1.4}, {"name": "Performance", "score": 1.1}]},
    {"ticker": "UNH", "companyName": "UnitedHealth Group", "score": 6.9, "signal": "HOLD", "insight": "Optum Health growth offsets Medicare Advantage headwinds; aging population tailwind", "sector": "Healthcare", "price": 542.30, "changePercent": -0.4, "topFactors": [{"name": "Customers", "score": 1.1}, {"name": "Macro", "score": 0.7}]},
    {"ticker": "XOM", "companyName": "Exxon Mobil Corporation", "score": 5.8, "signal": "HOLD", "insight": "Pioneer acquisition adds Permian scale; free cash flow supports buybacks", "sector": "Energy", "price": 118.90, "changePercent": -1.2, "topFactors": [{"name": "Supply Chain", "score": 0.8}, {"name": "Macro", "score": -0.5}]},
    {"ticker": "AMD", "companyName": "Advanced Micro Devices", "score": 6.8, "signal": "HOLD", "insight": "MI300 GPU demand strong but supply constrained; data center revenue doubles", "sector": "Technology", "price": 178.40, "changePercent": 2.8, "topFactors": [{"name": "Supply Chain", "score": 1.2}, {"name": "Performance", "score": 1.0}]},
]


def _handle_discovery(method):
    """GET /discovery — Return cards for Tinder-style stock discovery."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    s3_discovery = s3.read_json("discovery/latest.json")
    if s3_discovery and s3_discovery.get("cards"):
        return _response(200, {"cards": s3_discovery["cards"]})

    return _response(200, {"cards": DEFAULT_DISCOVERY})


# ─── Watchlist Endpoints ───

def _handle_watchlist(method, path, body, user_id):
    """Watchlist CRUD with sub-route dispatch."""
    if "/add" in path and method == "POST":
        return _handle_watchlist_add(body, user_id)
    elif "/remove" in path and method == "POST":
        return _handle_watchlist_remove(body, user_id)
    elif method == "DELETE":
        parts = path.strip("/").split("/")
        wl_name = parts[1] if len(parts) > 1 else ""
        return _handle_watchlist_delete(wl_name, user_id)
    elif method == "POST":
        return _handle_watchlist_save(body, user_id)
    elif method == "GET":
        return _handle_watchlist_get(user_id)
    else:
        return _response(405, {"error": "Method not allowed"})


def _handle_watchlist_get(user_id):
    """GET /watchlist — Return all user watchlists."""
    record = db.get_item(f"USER#{user_id}", "WATCHLISTS")
    if not record or not record.get("watchlists"):
        # Return default watchlist
        return _response(200, {"watchlists": [
            {"id": "default", "name": "Watchlist", "items": [], "createdAt": "", "updatedAt": ""},
        ]})

    watchlists_raw = json.loads(record["watchlists"]) if isinstance(record["watchlists"], str) else record["watchlists"]
    return _response(200, {"watchlists": watchlists_raw})


def _handle_watchlist_save(body, user_id):
    """POST /watchlist — Create or update a watchlist."""
    from datetime import datetime
    now = datetime.utcnow().isoformat()

    name = body.get("name", "Watchlist").strip()
    items = body.get("items", [])
    wl_id = body.get("id", name.lower().replace(" ", "-"))

    # Load existing watchlists
    record = db.get_item(f"USER#{user_id}", "WATCHLISTS")
    existing = []
    if record and record.get("watchlists"):
        existing = json.loads(record["watchlists"]) if isinstance(record["watchlists"], str) else record["watchlists"]

    # Update or create
    found = False
    for wl in existing:
        if wl["id"] == wl_id:
            wl["name"] = name
            wl["items"] = items
            wl["updatedAt"] = now
            found = True
            break

    if not found:
        existing.append({
            "id": wl_id,
            "name": name,
            "items": items,
            "createdAt": now,
            "updatedAt": now,
        })

    db.put_item({
        "PK": f"USER#{user_id}",
        "SK": "WATCHLISTS",
        "watchlists": json.dumps(existing),
        "lastUpdated": now,
    })

    return _response(200, {"watchlists": existing})


def _handle_watchlist_add(body, user_id):
    """POST /watchlist/add — Add a ticker to a watchlist."""
    from datetime import datetime
    now = datetime.utcnow().isoformat()

    wl_id = body.get("watchlistId", "default")
    ticker = body.get("ticker", "").upper().strip()
    company_name = body.get("companyName", ticker)

    if not ticker:
        return _response(400, {"error": "Missing ticker"})

    record = db.get_item(f"USER#{user_id}", "WATCHLISTS")
    existing = []
    if record and record.get("watchlists"):
        existing = json.loads(record["watchlists"]) if isinstance(record["watchlists"], str) else record["watchlists"]

    # Find or create watchlist
    target = None
    for wl in existing:
        if wl["id"] == wl_id:
            target = wl
            break

    if not target:
        target = {"id": wl_id, "name": "Watchlist", "items": [], "createdAt": now, "updatedAt": now}
        existing.append(target)

    # Check if already in watchlist
    if not any(item.get("ticker") == ticker for item in target["items"]):
        target["items"].append({
            "ticker": ticker,
            "companyName": company_name,
            "addedAt": now,
        })
        target["updatedAt"] = now

    db.put_item({
        "PK": f"USER#{user_id}",
        "SK": "WATCHLISTS",
        "watchlists": json.dumps(existing),
        "lastUpdated": now,
    })

    return _response(200, {"watchlists": existing})


def _handle_watchlist_remove(body, user_id):
    """POST /watchlist/remove — Remove a ticker from a watchlist."""
    from datetime import datetime
    now = datetime.utcnow().isoformat()

    wl_id = body.get("watchlistId", "default")
    ticker = body.get("ticker", "").upper().strip()

    if not ticker:
        return _response(400, {"error": "Missing ticker"})

    record = db.get_item(f"USER#{user_id}", "WATCHLISTS")
    if not record or not record.get("watchlists"):
        return _response(200, {"watchlists": []})

    existing = json.loads(record["watchlists"]) if isinstance(record["watchlists"], str) else record["watchlists"]

    for wl in existing:
        if wl["id"] == wl_id:
            wl["items"] = [item for item in wl["items"] if item.get("ticker") != ticker]
            wl["updatedAt"] = now
            break

    db.put_item({
        "PK": f"USER#{user_id}",
        "SK": "WATCHLISTS",
        "watchlists": json.dumps(existing),
        "lastUpdated": now,
    })

    return _response(200, {"watchlists": existing})


def _handle_watchlist_delete(wl_name, user_id):
    """DELETE /watchlist/<name> — Delete a watchlist."""
    from datetime import datetime
    now = datetime.utcnow().isoformat()

    record = db.get_item(f"USER#{user_id}", "WATCHLISTS")
    if not record or not record.get("watchlists"):
        return _response(200, {"watchlists": []})

    existing = json.loads(record["watchlists"]) if isinstance(record["watchlists"], str) else record["watchlists"]
    existing = [wl for wl in existing if wl["id"] != wl_name]

    db.put_item({
        "PK": f"USER#{user_id}",
        "SK": "WATCHLISTS",
        "watchlists": json.dumps(existing),
        "lastUpdated": now,
    })

    return _response(200, {"watchlists": existing})


# ─── Coach Endpoint ───

def _handle_coach(method, user_id):
    """GET /coach/insights — Return behavioral coaching insights."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    return _response(200, {"insights": [], "message": "Coach not yet available"})


# ─── Response Helper ───

def _response(status_code, body):
    """Build an API Gateway-compatible response."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, default=str),
    }
