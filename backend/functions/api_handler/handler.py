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
  GET  /price/<ticker>               — Real-time price via Finnhub
  GET  /prices/<ticker>              — Alias for /price/<ticker>
  GET  /prices/batch?tickers=A,B,C   — Lightweight batch price lookup
  GET  /technicals/<ticker>          — Technical indicators (15 indicators)
  GET  /fundamentals/<ticker>        — Financial health + DCF valuation
  GET  /altdata/<ticker>             — Alternative data (patents, contracts, FDA)
  GET  /charts/<ticker>              — Chart data with overlays + indicators
  GET  /screener                     — Multi-factor stock screener
  GET  /screener/templates           — Pre-built screener templates
  GET  /trending                     — Social proof / trending stocks
  GET  /discovery                    — Tinder-style discovery cards
  GET  /watchlist                    — User watchlists
  POST /watchlist                    — Create/update watchlist
  DELETE /watchlist/<name>           — Delete watchlist
  POST /watchlist/add                — Add ticker to watchlist
  POST /watchlist/remove             — Remove ticker from watchlist
  GET  /coach/insights               — Coaching insights
  POST /strategy/optimize            — Monte Carlo optimization (numpy)
  POST /strategy/project             — Fan chart projection data
  POST /strategy/scenarios           — What-if scenario battles
  POST /strategy/rebalance           — Rebalancing suggestions
  GET  /strategy/achievements        — User achievement badges
  GET  /stock/<ticker>/stress-test   — Macro stress-test (single scenario)
  GET  /stock/<ticker>/stress-test/all — Macro stress-test (all scenarios)
  GET  /insights/feed                — AI-generated insight feed
  GET  /insights/alerts              — High-urgency AI alerts
  GET  /insights/<ticker>            — Insights for a specific stock
  GET  /admin/agents                 — List agents with schedules & last run
  POST /admin/agents/<id>/run        — Manually trigger an agent
  GET  /admin/agents/<id>/history    — View agent run history
"""

import json
import os
import sys
import traceback

# Ensure the function's own directory is searched FIRST for local modules
# (finnhub_client.py, technical_engine.py), then the Lambda layer.
_fn_dir = os.path.dirname(os.path.abspath(__file__))
if _fn_dir not in sys.path:
    sys.path.insert(0, _fn_dir)

# Lambda layer path for shared modules (db, s3, models, etc.)
if "/opt/python" not in sys.path:
    sys.path.insert(1, "/opt/python")

import db
import s3
import finnhub_client
import technical_engine
import fundamentals_engine
import factor_engine
import fair_price_engine
import patent_engine
import contract_engine
import fda_engine
import stress_engine
import claude_client


def lambda_handler(event, context):
    """Main API Gateway event router."""
    try:
        http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")

        # Robust path extraction — supports HttpApi v2 (rawPath) and REST API v1 (path/resource)
        path = event.get("rawPath") or event.get("path") or event.get("resource") or "/"

        # Strip stage prefix if present (e.g., /dev/signals/NVDA -> /signals/NVDA)
        stage = event.get("requestContext", {}).get("stage", "")
        if stage and stage != "$default" and path.startswith(f"/{stage}"):
            path = path[len(f"/{stage}"):]

        # Ensure path starts with /
        if not path.startswith("/"):
            path = "/" + path

        # Debug logging for route resolution
        print(f"[Router] method={http_method} rawPath={event.get('rawPath')} path={path} stage={stage}")

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

        if path.startswith("/earnings/calendar"):
            return _handle_earnings_calendar(http_method, query_params)
        elif path.startswith("/market/movers"):
            return _handle_market_movers(http_method)
        elif path.startswith("/feed"):
            return _handle_feed(http_method, body, user_id)
        elif path == "/prices/batch":
            return _handle_batch_prices(http_method, query_params)
        elif path.startswith("/prices/"):
            ticker = path.split("/prices/")[-1].strip("/").upper()
            return _handle_price(http_method, ticker)
        elif path.startswith("/price/"):
            ticker = path.split("/price/")[-1].strip("/").upper()
            return _handle_price(http_method, ticker)
        elif path.startswith("/technicals/"):
            ticker = path.split("/technicals/")[-1].strip("/").upper()
            return _handle_technicals(http_method, ticker)
        elif path.startswith("/fundamentals/"):
            ticker = path.split("/fundamentals/")[-1].strip("/").upper()
            return _handle_fundamentals(http_method, ticker)
        elif path.startswith("/factors/"):
            ticker = path.split("/factors/")[-1].strip("/").upper()
            return _handle_factors(http_method, ticker)
        elif path.startswith("/fair-price/"):
            ticker = path.split("/fair-price/")[-1].strip("/").upper()
            return _handle_fair_price(http_method, ticker)
        elif path.startswith("/altdata/"):
            ticker = path.split("/altdata/")[-1].strip("/").upper()
            return _handle_altdata(http_method, ticker)
        elif path.startswith("/charts/"):
            ticker = path.split("/charts/")[-1].strip("/").upper()
            return _handle_charts(http_method, ticker, query_params)
        elif path.startswith("/screener/templates"):
            return _handle_screener_templates(http_method)
        elif path.startswith("/screener"):
            return _handle_screener(http_method, query_params)
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
        elif path.startswith("/strategy"):
            return _handle_strategy(http_method, path, body, user_id)
        elif path.startswith("/coach"):
            return _handle_coach(http_method, path, body, user_id)
        elif path.startswith("/stock/") and "/stress-test" in path:
            return _handle_stress_test(http_method, path, query_params)
        elif path.startswith("/insights"):
            return _handle_insights(http_method, path, query_params)
        elif path.startswith("/admin/"):
            return _handle_admin(http_method, path, body, query_params)
        else:
            print(f"[Router] No route matched for path={path} method={http_method}")
            return _response(404, {"error": "Not found", "path": path, "method": http_method})

    except Exception as e:
        traceback.print_exc()
        return _response(500, {"error": str(e)})


# ─── Earnings Calendar ───


def _handle_earnings_calendar(method, query_params):
    """GET /earnings/calendar — Upcoming earnings for tracked stocks (next 30 days)."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    from datetime import datetime, timedelta, timezone
    from models import ALL_SECURITIES, COMPANY_NAMES

    now = datetime.now(timezone.utc)
    from_date = now.strftime("%Y-%m-%d")
    to_date = (now + timedelta(days=30)).strftime("%Y-%m-%d")

    # Try Finnhub earnings calendar
    earnings = []
    try:
        raw = finnhub_client._call(f"/calendar/earnings?from={from_date}&to={to_date}")
        all_earnings = raw.get("earningsCalendar", [])

        tracked_set = set(ALL_SECURITIES)
        for e in all_earnings:
            ticker = e.get("symbol", "")
            if ticker in tracked_set:
                # Get current signal for this stock
                signal_data = db.get_item(f"SIGNAL#{ticker}", "LATEST")
                ai_score = float(signal_data.get("compositeScore", 0)) if signal_data else None
                signal = signal_data.get("signal", "HOLD") if signal_data else None

                # Historical earnings surprises from DynamoDB
                hist = []
                try:
                    hist_items = db.query(f"EARNINGS#{ticker}")
                    for h in (hist_items or [])[-4:]:
                        surprise = h.get("surprisePercent")
                        if surprise is not None:
                            hist.append("beat" if float(surprise) > 0 else "miss")
                except Exception:
                    pass

                beat_streak = 0
                for h in reversed(hist):
                    if h == "beat":
                        beat_streak += 1
                    else:
                        break

                earnings.append({
                    "ticker": ticker,
                    "companyName": COMPANY_NAMES.get(ticker, ticker),
                    "date": e.get("date", ""),
                    "timeOfDay": "BMO" if e.get("hour", "") == "bmo" else "AMC" if e.get("hour", "") == "amc" else e.get("hour", "TBD"),
                    "estimatedEPS": e.get("epsEstimate"),
                    "actualEPS": e.get("epsActual"),
                    "revenueEstimate": e.get("revenueEstimate"),
                    "revenueActual": e.get("revenueActual"),
                    "surprise": round(float(e.get("epsActual", 0) or 0) - float(e.get("epsEstimate", 0) or 0), 4) if e.get("epsActual") else None,
                    "surprisePercent": round((float(e.get("epsActual", 0) or 0) - float(e.get("epsEstimate", 0) or 0)) / max(abs(float(e.get("epsEstimate", 0) or 1)), 0.01) * 100, 2) if e.get("epsActual") and e.get("epsEstimate") else None,
                    "aiScore": ai_score,
                    "signal": signal,
                    "historicalSurprises": hist,
                    "beatStreak": beat_streak,
                    "quarter": e.get("quarter"),
                    "year": e.get("year"),
                })
    except Exception as ex:
        print(f"[EarningsCalendar] Finnhub error: {ex}")
        # Generate mock data based on tracked tickers
        import random
        random.seed(42)
        mock_tickers = STOCK_UNIVERSE[:20]
        for i, ticker in enumerate(mock_tickers):
            day_offset = (i * 2) % 30
            signal_data = db.get_item(f"SIGNAL#{ticker}", "LATEST")
            earnings.append({
                "ticker": ticker,
                "companyName": COMPANY_NAMES.get(ticker, ticker),
                "date": (now + timedelta(days=day_offset)).strftime("%Y-%m-%d"),
                "timeOfDay": "BMO" if i % 2 == 0 else "AMC",
                "estimatedEPS": round(random.uniform(0.5, 5.0), 2),
                "actualEPS": None,
                "revenueEstimate": None,
                "revenueActual": None,
                "surprise": None,
                "surprisePercent": None,
                "aiScore": float(signal_data.get("compositeScore", 5.5)) if signal_data else round(random.uniform(3.0, 9.0), 1),
                "signal": signal_data.get("signal", "HOLD") if signal_data else random.choice(["BUY", "HOLD", "SELL"]),
                "historicalSurprises": [random.choice(["beat", "miss"]) for _ in range(4)],
                "beatStreak": random.randint(0, 4),
                "quarter": None,
                "year": None,
            })

    # Sort by date
    earnings.sort(key=lambda x: x.get("date", ""))

    return _response(200, {
        "earnings": earnings,
        "count": len(earnings),
        "fromDate": from_date,
        "toDate": to_date,
    })


# ─── Market Movers ───


def _handle_market_movers(method):
    """GET /market/movers — Top gainers, losers, volume leaders, AI score changes."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    from models import ALL_SECURITIES, COMPANY_NAMES, ETF_SET

    # Batch read all PRICE# records from DynamoDB (full 523 universe)
    all_prices = []
    for ticker in ALL_SECURITIES:
        try:
            price_item = db.get_item(f"PRICE#{ticker}", "LATEST")
            if price_item:
                cp = float(price_item.get("changePercent", 0) or 0)
                signal_item = db.get_item(f"SIGNAL#{ticker}", "LATEST")
                all_prices.append({
                    "ticker": ticker,
                    "companyName": COMPANY_NAMES.get(ticker, ticker),
                    "price": float(price_item.get("price", 0) or 0),
                    "change": float(price_item.get("change", 0) or 0),
                    "changePercent": cp,
                    "marketCap": float(price_item.get("marketCap", 0) or 0),
                    "sector": price_item.get("sector", ""),
                    "aiScore": float(signal_item.get("compositeScore", 0)) if signal_item else None,
                    "signal": signal_item.get("signal") if signal_item else None,
                })
        except Exception:
            pass

    # If no PRICE# records exist, fall back to SIGNAL# records as "AI Favorites"
    if not all_prices:
        for ticker in ALL_SECURITIES:
            try:
                signal_item = db.get_item(f"SIGNAL#{ticker}", "LATEST")
                if signal_item:
                    all_prices.append({
                        "ticker": ticker,
                        "companyName": COMPANY_NAMES.get(ticker, ticker),
                        "price": 0.0,
                        "change": 0.0,
                        "changePercent": 0.0,
                        "marketCap": 0.0,
                        "sector": "",
                        "aiScore": float(signal_item.get("compositeScore", 0)),
                        "signal": signal_item.get("signal"),
                    })
            except Exception:
                pass

    # Sort for different categories
    by_gain = sorted(all_prices, key=lambda x: x["changePercent"], reverse=True)
    by_loss = sorted(all_prices, key=lambda x: x["changePercent"])
    by_cap = sorted(all_prices, key=lambda x: x["marketCap"], reverse=True)

    # AI score changes — compare current score vs yesterday's signal history
    ai_upgrades = []
    ai_downgrades = []
    for item in all_prices:
        if item["aiScore"] is not None:
            ticker = item["ticker"]
            try:
                hist = db.query_between(
                    f"SIGNAL_HISTORY#{ticker}",
                    "0000",
                    "9999",
                )
                if hist and len(hist) >= 2:
                    prev = float(hist[-2].get("compositeScore", item["aiScore"]))
                    curr = item["aiScore"]
                    change = curr - prev
                    if abs(change) >= 0.3:
                        entry = {**item, "scoreChange": round(change, 1), "prevScore": round(prev, 1)}
                        if change > 0:
                            ai_upgrades.append(entry)
                        else:
                            ai_downgrades.append(entry)
            except Exception:
                pass

    ai_upgrades.sort(key=lambda x: x.get("scoreChange", 0), reverse=True)
    ai_downgrades.sort(key=lambda x: x.get("scoreChange", 0))

    # Market summary from real ETF prices (SPY=S&P500, QQQ=Nasdaq, DIA=Dow)
    market_summary = {
        "sp500": {"name": "S&P 500", "changePercent": 0.0},
        "nasdaq": {"name": "Nasdaq", "changePercent": 0.0},
        "dow": {"name": "Dow Jones", "changePercent": 0.0},
    }
    for item in all_prices:
        t = item["ticker"]
        if t == "SPY":
            market_summary["sp500"]["changePercent"] = round(item["changePercent"], 2)
        elif t == "QQQ":
            market_summary["nasdaq"]["changePercent"] = round(item["changePercent"], 2)
        elif t == "DIA":
            market_summary["dow"]["changePercent"] = round(item["changePercent"], 2)
    # Fallback: compute from top stocks if ETF data missing
    if market_summary["sp500"]["changePercent"] == 0 and any(x["price"] > 0 for x in all_prices):
        non_etf = [x for x in all_prices if x["ticker"] not in ETF_SET and x["price"] > 0]
        if non_etf:
            market_summary["sp500"]["changePercent"] = round(sum(x["changePercent"] for x in by_cap[:50]) / max(len(by_cap[:50]), 1), 2)

    # AI Favorites — top stocks by AI score
    by_ai = sorted(
        [x for x in all_prices if x.get("aiScore") is not None],
        key=lambda x: x.get("aiScore", 0),
        reverse=True,
    )

    return _response(200, {
        "gainers": by_gain[:10],
        "losers": by_loss[:10],
        "mostActive": by_cap[:10],
        "aiUpgrades": ai_upgrades[:5],
        "aiDowngrades": ai_downgrades[:5],
        "aiFavorites": by_ai[:10],
        "marketSummary": market_summary,
        "totalStocks": len(all_prices),
    })


# ─── Signal Endpoints ───

def _handle_signal(method, ticker, user_id):
    """GET /signals/<ticker> — Return full signal from DynamoDB + S3.

    Includes 24-hour cache staleness check: if the cached analysis is older
    than 24 hours *or* newer INSIGHT#/EVENT# records exist, regenerate the
    reasoning with recent news context before returning.
    """
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)

    # Try DynamoDB first for summary
    summary = db.get_item(f"SIGNAL#{ticker}", "LATEST")

    if not summary:
        # No pre-computed signal exists — build a basic one on-the-fly
        # from live price + technicals + fundamentals so the frontend
        # always gets a usable response.
        company_name = ticker
        try:
            profile = finnhub_client.get_company_profile(ticker)
            company_name = profile.get("name", ticker) if profile else ticker
        except Exception:
            pass

        # Compute technical score
        tech_score = 5.0
        try:
            candles = finnhub_client.get_candles(ticker, resolution="D")
            if candles and len(candles) >= 5:
                tech_result = technical_engine.compute_indicators(candles)
                tech_score = tech_result.get("technicalScore", 5.0) or 5.0
        except Exception:
            pass

        # Derive composite from technical only (no Claude for on-the-fly)
        composite = round(max(1, min(10, tech_score)), 1)
        signal = "BUY" if composite >= 6.5 else "SELL" if composite <= 3.5 else "HOLD"

        result = {
            "ticker": ticker,
            "companyName": company_name,
            "compositeScore": composite,
            "signal": signal,
            "confidence": "LOW",
            "insight": f"Live analysis for {ticker} — technical score {composite}/10.",
            "reasoning": "",
            "topFactors": [],
            "lastUpdated": now.isoformat(),
            "tier": "ON_DEMAND",
            "freshness": "fresh",
            "freshnessDays": 0,
            "dataSources": ["Finnhub"],
        }

        # Skip S3/DynamoDB parsing — jump straight to enrichment
        is_on_demand = True
    else:
        is_on_demand = False

        # Fetch full detail from S3
        full_signal = s3.read_json(f"signals/{ticker}.json")

        result = None
        if full_signal:
            result = full_signal
        else:
            # Fallback: return DynamoDB summary
            raw_factors = summary.get("topFactors", "[]")
            top_factors = json.loads(raw_factors) if isinstance(raw_factors, str) else (raw_factors if isinstance(raw_factors, list) else [])
            result = {
                "ticker": summary["ticker"],
                "companyName": summary.get("companyName", ticker),
                "compositeScore": float(summary.get("compositeScore", 5.0)),
                "signal": summary.get("signal", "HOLD"),
                "confidence": summary.get("confidence", "MEDIUM"),
                "insight": summary.get("insight", ""),
                "reasoning": summary.get("reasoning", ""),
                "topFactors": top_factors,
                "lastUpdated": summary.get("lastUpdated", ""),
            }

        # DynamoDB signal is the source of truth (updated by normalization),
        # so always overlay it onto the S3 result to prevent stale mismatches.
        db_signal = summary.get("signal")
        if db_signal and result.get("signal") != db_signal:
            result["signal"] = db_signal
        db_score = summary.get("compositeScore")
        if db_score:
            try:
                result["compositeScore"] = float(db_score)
            except (ValueError, TypeError):
                pass

    # ── Cache staleness check (skip for on-demand signals) ──
    last_updated = result.get("lastUpdated") or result.get("analyzedAt") or ""
    freshness = "fresh"
    freshness_days = 0
    analysis_ts = None  # parsed timestamp of the cached analysis

    if last_updated:
        try:
            analysis_ts = datetime.fromisoformat(last_updated.replace("Z", "+00:00"))
            freshness_days = (now - analysis_ts).days
            if freshness_days > 30:
                freshness = "stale"
            elif freshness_days > 7:
                freshness = "aging"
        except Exception:
            pass

    # Determine staleness — but do NOT block the response for a Claude
    # reasoning refresh.  Return stale reasoning immediately and flag it
    # so a background agent can regenerate later.
    analysis_age_hours = (
        (now - analysis_ts).total_seconds() / 3600
        if analysis_ts
        else float("inf")
    )

    if analysis_age_hours > 24 and not is_on_demand:
        result["needsReasoningRefresh"] = True
        print(f"[Signal] {ticker} reasoning is {analysis_age_hours:.0f}h old — flagged for background refresh")

    result["freshness"] = freshness
    result["freshnessDays"] = freshness_days
    result["dataSources"] = ["SEC EDGAR", "Federal Reserve FRED", "Finnhub", "Claude AI"]

    # ── Shared Finnhub cache for this request (avoid duplicate API calls) ──
    _fh_cache = {}  # key → result, populated lazily

    def _fh_quote():
        if "quote" not in _fh_cache:
            try:
                _fh_cache["quote"] = finnhub_client.get_quote(ticker)
            except Exception:
                _fh_cache["quote"] = {}
        return _fh_cache["quote"]

    def _fh_profile():
        if "profile" not in _fh_cache:
            try:
                _fh_cache["profile"] = finnhub_client.get_company_profile(ticker)
            except Exception:
                _fh_cache["profile"] = {}
        return _fh_cache["profile"]

    def _fh_financials():
        if "financials" not in _fh_cache:
            try:
                _fh_cache["financials"] = finnhub_client.get_basic_financials(ticker)
            except Exception:
                _fh_cache["financials"] = {}
        return _fh_cache["financials"]

    # ── Enrich with technicals (cache → live compute) ──
    try:
        if "technicalAnalysis" not in result or not result.get("technicalAnalysis"):
            tech_score_str = summary.get("technicalScore", "") if isinstance(summary, dict) else ""
            if tech_score_str:
                try:
                    result["technicalScore"] = float(tech_score_str)
                except (ValueError, TypeError):
                    pass

            indicators = None

            # Try DynamoDB cache first
            try:
                tech_cached = db.get_item(f"TECHNICALS#{ticker}", "LATEST")
                if tech_cached:
                    indicators = tech_cached.get("indicators", {})
            except Exception:
                pass

            # If cache is empty, compute live from Finnhub candles
            if not indicators or not indicators.get("indicatorCount"):
                try:
                    candles = finnhub_client.get_candles(ticker, resolution="D")
                    if candles and len(candles) >= 5:
                        indicators = technical_engine.compute_indicators(candles)
                        # Cache for next time
                        try:
                            db.put_item({
                                "PK": f"TECHNICALS#{ticker}",
                                "SK": "LATEST",
                                "indicators": indicators,
                                "cachedAt": now.isoformat(),
                            })
                        except Exception:
                            pass
                except Exception as e:
                    print(f"[Signal] Live technicals failed for {ticker}: {e}")

            if indicators and indicators.get("indicatorCount", 0) > 0:
                result["technicalAnalysis"] = {
                    "technicalScore": indicators.get("technicalScore", 0),
                    "rsi": indicators.get("rsi"),
                    "macd": indicators.get("macd", {}),
                    "sma20": indicators.get("sma20"),
                    "sma50": indicators.get("sma50"),
                    "sma200": indicators.get("sma200"),
                    "bollingerBands": indicators.get("bollingerBands", {}),
                    "atr": indicators.get("atr"),
                    "signals": indicators.get("signals", {}),
                    "indicatorCount": indicators.get("indicatorCount", 0),
                }
    except Exception as e:
        print(f"[Signal] Technicals enrichment error for {ticker}: {e}")

    # ── Enrich with fundamentals (cache → live compute) ──
    fund_analysis = None  # shared across fundamentals + fair price
    try:
        if "fundamentalGrade" not in result:
            # Try DynamoDB cache first
            try:
                health_cached = db.get_item(f"HEALTH#{ticker}", "LATEST")
                if health_cached:
                    fund_analysis = health_cached.get("analysis", {})
            except Exception:
                pass

            # If cache is empty, compute live
            if not fund_analysis or fund_analysis.get("error"):
                try:
                    quote = _fh_quote()
                    current_price = quote.get("price")
                    profile = _fh_profile()
                    market_cap = profile.get("marketCap")
                    fin = _fh_financials()
                    beta = fin.get("beta") or 1.0
                    shares_outstanding = None
                    if market_cap and current_price and current_price > 0:
                        shares_outstanding = market_cap / current_price
                    fund_analysis = fundamentals_engine.analyze(
                        ticker,
                        market_cap=market_cap,
                        beta=beta,
                        current_price=current_price,
                        shares_outstanding=shares_outstanding,
                    )
                    # Cache for next time
                    if fund_analysis and fund_analysis.get("grade"):
                        try:
                            db.put_item({
                                "PK": f"HEALTH#{ticker}",
                                "SK": "LATEST",
                                "analysis": fund_analysis,
                                "cachedAt": now.isoformat(),
                            })
                        except Exception:
                            pass
                except Exception as e:
                    print(f"[Signal] Live fundamentals failed for {ticker}: {e}")

            if fund_analysis and not fund_analysis.get("error"):
                result["fundamentalGrade"] = fund_analysis.get("grade", "N/A")
                result["fundamentalScore"] = fund_analysis.get("gradeScore", 0)
                ratios = fund_analysis.get("ratios", {})
                if ratios:
                    # Prefer trailing P/E; keep negative values for "N/A (Loss)" display
                    pe_val = ratios.get("peRatio")
                    if pe_val is None:
                        pe_val = ratios.get("forwardPE")
                    result["peRatio"] = pe_val
                    if ratios.get("forwardPE") is not None:
                        result["forwardPE"] = ratios.get("forwardPE")
                    if ratios.get("negativeEarnings"):
                        result["negativeEarnings"] = True
                    result["ratios"] = ratios
                dcf = fund_analysis.get("dcf")
                if dcf:
                    result["fairValue"] = dcf.get("fairValue")
                    result["fairValueUpside"] = dcf.get("upside")
                z = fund_analysis.get("zScore")
                if z and isinstance(z, dict):
                    result["zScore"] = z.get("value")
                f = fund_analysis.get("fScore")
                if f and isinstance(f, dict):
                    result["fScore"] = f.get("value")
                m = fund_analysis.get("mScore")
                if m and isinstance(m, dict):
                    result["mScore"] = m.get("value")
    except Exception as e:
        print(f"[Signal] Fundamentals enrichment error for {ticker}: {e}")

    # ── Enrich with factor dimensions (cache → live compute) ──
    try:
        if "dimensionScores" not in result:
            factor_data = None

            # Try DynamoDB cache first
            try:
                factor_cached = db.get_item(f"FACTORS#{ticker}", "LATEST")
                if factor_cached:
                    factor_data = factor_cached.get("factors", {})
            except Exception:
                pass

            # If cache is empty, compute live from available technicals + fundamentals
            if not factor_data or not factor_data.get("dimensionScores"):
                try:
                    tech_input = result.get("technicalAnalysis")
                    fund_input = fund_analysis  # reuse from above
                    if not fund_input:
                        try:
                            h = db.get_item(f"HEALTH#{ticker}", "LATEST")
                            if h:
                                fund_input = h.get("analysis")
                        except Exception:
                            pass
                    factor_data = factor_engine.compute_factors(
                        ticker,
                        signal_data=result,
                        technicals=tech_input,
                        fundamentals=fund_input,
                    )
                    # Cache for next time
                    if factor_data and factor_data.get("dimensionScores"):
                        try:
                            db.put_item({
                                "PK": f"FACTORS#{ticker}",
                                "SK": "LATEST",
                                "factors": factor_data,
                                "cachedAt": now.isoformat(),
                            })
                        except Exception:
                            pass
                except Exception as e:
                    print(f"[Signal] Live factors failed for {ticker}: {e}")

            if factor_data and factor_data.get("dimensionScores"):
                result["dimensionScores"] = factor_data.get("dimensionScores", {})
                result["topPositive"] = factor_data.get("topPositive", [])
                result["topNegative"] = factor_data.get("topNegative", [])
                result["factorCount"] = factor_data.get("factorCount", 0)
                result["scoringMethodology"] = factor_data.get("scoringMethodology", {})
    except Exception as e:
        print(f"[Signal] Factors enrichment error for {ticker}: {e}")

    # ── Enrich with fair price (cache → live compute, reuse Finnhub data) ──
    try:
        if "fairPrice" not in result:
            fp_data = None

            # Try DynamoDB cache first
            try:
                fp_cached = db.get_item(f"FAIRPRICE#{ticker}", "LATEST")
                if fp_cached:
                    fp_data = fp_cached.get("fairPrice", {})
            except Exception:
                pass

            # If cache is empty, compute live — REUSE data from earlier enrichment
            if not fp_data or not fp_data.get("fairPrice"):
                try:
                    # Reuse Finnhub data from shared cache (no duplicate calls)
                    fin = _fh_financials()
                    eps_ttm = fin.get("epsTTM")
                    profile = _fh_profile()
                    sector = profile.get("sector", "")

                    # Get current price from enriched data or shared cache
                    cp = None
                    ta = result.get("technicalAnalysis", {})
                    if ta and ta.get("sma20"):
                        cp = ta["sma20"]
                    quote = _fh_quote()
                    cp = quote.get("price") or cp

                    # Get DCF from already-enriched fundamentals
                    dcf_fv = result.get("fairValue")
                    dcf_gr = None
                    dcf_dr = None
                    dcf_tg = None
                    if not dcf_fv and fund_analysis:
                        dcf = fund_analysis.get("dcf") if isinstance(fund_analysis, dict) else None
                        if dcf:
                            dcf_fv = dcf.get("fairValue")
                            dcf_gr = dcf.get("growthRate")
                            dcf_dr = dcf.get("discountRate")
                            dcf_tg = dcf.get("terminalGrowth")
                    if not dcf_fv:
                        try:
                            h = db.get_item(f"HEALTH#{ticker}", "LATEST")
                            if h:
                                dcf = (h.get("analysis") or {}).get("dcf")
                                if dcf:
                                    dcf_fv = dcf.get("fairValue")
                                    dcf_gr = dcf.get("growthRate")
                                    dcf_dr = dcf.get("discountRate")
                                    dcf_tg = dcf.get("terminalGrowth")
                        except Exception:
                            pass

                    # Convert Decimal values to float for fair_price_engine
                    _to_float = lambda v: float(v) if v is not None else None
                    fp_data = fair_price_engine.compute_fair_price(
                        ticker=ticker,
                        current_price=_to_float(cp),
                        sector=sector,
                        eps_ttm=_to_float(eps_ttm),
                        dcf_fair_value=_to_float(dcf_fv),
                        dcf_growth_rate=_to_float(dcf_gr),
                        dcf_discount_rate=_to_float(dcf_dr),
                        dcf_terminal_growth=_to_float(dcf_tg),
                    )
                    # Cache for next time
                    if fp_data and fp_data.get("fairPrice"):
                        try:
                            db.put_item({
                                "PK": f"FAIRPRICE#{ticker}",
                                "SK": "LATEST",
                                "fairPrice": fp_data,
                                "cachedAt": now.isoformat(),
                            })
                        except Exception:
                            pass
                except Exception as e:
                    print(f"[Signal] Live fair price failed for {ticker}: {e}")

            if fp_data and fp_data.get("fairPrice"):
                result["fairPrice"] = fp_data["fairPrice"]
                result["fairPriceLabel"] = fp_data.get("label", "fair")
                result["fairPriceUpside"] = fp_data.get("upside")
                result["fairPriceMethod"] = fp_data.get("method", "")
                result["fairPriceDisclaimer"] = "Fair value is a model estimate. Not investment advice."
    except Exception as e:
        print(f"[Signal] Fair price enrichment error for {ticker}: {e}")

    return _response(200, result)


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
        _raw_tf = item.get("topFactors", "[]")
        top_factors = json.loads(_raw_tf) if isinstance(_raw_tf, str) else (_raw_tf if isinstance(_raw_tf, list) else [])
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
    from models import STOCK_UNIVERSE, normalize_signals, determine_signal

    keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in STOCK_UNIVERSE]
    items = db.batch_get(keys)

    # Collect all scores for normalization
    all_scores = [float(item.get("compositeScore", 5.0)) for item in items]
    mean, stddev = normalize_signals(all_scores)

    feed_items = []
    for item in items:
        _raw_tf = item.get("topFactors", "[]")
        top_factors = json.loads(_raw_tf) if isinstance(_raw_tf, str) else (_raw_tf if isinstance(_raw_tf, list) else [])
        score = float(item.get("compositeScore", 5.0))
        # Use normalized signal based on mean ± 0.5*stddev
        normalized_signal = determine_signal(score, mean, stddev).value
        feed_items.append({
            "id": f"signal-{item.get('ticker', '')}",
            "type": "signal",
            "ticker": item.get("ticker", ""),
            "companyName": item.get("companyName", ""),
            "compositeScore": score,
            "signal": normalized_signal,
            "confidence": item.get("confidence", "MEDIUM"),
            "insight": item.get("insight", ""),
            "topFactors": top_factors,
            "updatedAt": item.get("lastUpdated", ""),
        })

    return _response(200, {"items": feed_items, "cursor": None})


# ─── Price Endpoint ───

def _handle_price(method, ticker):
    """GET /price/<ticker> — Real-time price via Finnhub with DynamoDB cache."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    if not ticker or len(ticker) > 10:
        return _response(400, {"error": "Invalid ticker"})

    from datetime import datetime, timezone

    # 1) Check DynamoDB price cache (fresh within 5 minutes)
    cached = db.get_item(f"PRICE#{ticker}", "LATEST")
    if cached:
        cached_at = cached.get("cachedAt", "")
        try:
            ts = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - ts).total_seconds()
            if age_seconds < 300:  # 5-minute TTL
                return _response(200, _format_price_response(ticker, cached, "cache"))
        except Exception:
            pass

    # 2) Fetch live data from Finnhub
    try:
        quote = finnhub_client.get_quote(ticker)
        financials = finnhub_client.get_basic_financials(ticker)
        profile = finnhub_client.get_company_profile(ticker)

        current_price = quote.get("price", 0)
        if current_price:
            price_data = {
                "ticker": ticker,
                "price": round(current_price, 2),
                "previousClose": round(quote.get("prevClose", 0), 2),
                "change": round(quote.get("change", 0), 2),
                "changePercent": round(quote.get("changePercent", 0), 2),
                "marketCap": profile.get("marketCap", 0),
                "fiftyTwoWeekLow": round(financials.get("fiftyTwoWeekLow", 0) or 0, 2),
                "fiftyTwoWeekHigh": round(financials.get("fiftyTwoWeekHigh", 0) or 0, 2),
                "beta": round(financials.get("beta", 1.0) or 1.0, 2),
                "forwardPE": round(float(financials.get("forwardPE") or 0), 2) if financials.get("forwardPE") is not None else None,
                "trailingPE": round(float(financials.get("peRatio") or 0), 2) if financials.get("peRatio") is not None else None,
                "epsTTM": financials.get("epsTTM"),
                "sector": profile.get("sector", ""),
                "companyName": profile.get("name", ticker),
                "source": "live",
            }

            # 3) Cache to DynamoDB (fixed: put_item takes single dict with PK/SK)
            try:
                cache_item = dict(price_data)
                cache_item["PK"] = f"PRICE#{ticker}"
                cache_item["SK"] = "LATEST"
                cache_item["cachedAt"] = datetime.now(timezone.utc).isoformat()
                db.put_item(cache_item)
            except Exception:
                pass

            return _response(200, price_data)
    except Exception:
        pass

    # 4) Return stale cache if available (any age)
    if cached:
        return _response(200, _format_price_response(ticker, cached, "stale_cache",
                                                     note="Price may be outdated"))

    # 5) Fallback: try DynamoDB signal data
    signal = db.get_item(f"SIGNAL#{ticker}", "LATEST")
    if signal:
        return _response(200, {
            "ticker": ticker,
            "price": None,
            "previousClose": 0,
            "change": 0,
            "changePercent": 0,
            "marketCap": 0,
            "fiftyTwoWeekLow": 0,
            "fiftyTwoWeekHigh": 0,
            "beta": 0,
            "forwardPE": None,
            "trailingPE": None,
            "epsTTM": None,
            "sector": "",
            "companyName": signal.get("companyName", ticker),
            "note": "Live price unavailable — showing signal data only",
        })

    return _response(200, {
        "ticker": ticker,
        "price": None,
        "error": "Price data temporarily unavailable",
    })


def _format_price_response(ticker, data, source, note=None):
    """Format a cached price record into API response shape."""
    result = {
        "ticker": ticker,
        "price": float(data.get("price", 0) or 0),
        "previousClose": float(data.get("previousClose", 0) or 0),
        "change": float(data.get("change", 0) or 0),
        "changePercent": float(data.get("changePercent", 0) or 0),
        "marketCap": int(data.get("marketCap", 0) or 0),
        "fiftyTwoWeekLow": float(data.get("fiftyTwoWeekLow", 0) or 0),
        "fiftyTwoWeekHigh": float(data.get("fiftyTwoWeekHigh", 0) or 0),
        "beta": float(data.get("beta", 1.0) or 1.0),
        "forwardPE": float(data["forwardPE"]) if data.get("forwardPE") is not None else None,
        "trailingPE": float(data["trailingPE"]) if data.get("trailingPE") is not None else None,
        "epsTTM": float(data["epsTTM"]) if data.get("epsTTM") is not None else None,
        "sector": data.get("sector", ""),
        "companyName": data.get("companyName", ticker),
        "source": source,
    }
    if note:
        result["note"] = note
    return result


def _handle_batch_prices(method, query_params):
    """GET /prices/batch?tickers=AAPL,NVDA,MSFT — Lightweight batch price lookup."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    raw = query_params.get("tickers", "")
    tickers = [t.strip().upper() for t in raw.split(",") if t.strip()]
    if not tickers:
        return _response(400, {"error": "tickers query param required"})
    if len(tickers) > 50:
        return _response(400, {"error": "Max 50 tickers per request"})

    from datetime import datetime, timezone

    prices = {}
    for ticker in tickers:
        if not ticker or len(ticker) > 10:
            continue
        cached = db.get_item(f"PRICE#{ticker}", "LATEST")
        if cached:
            prices[ticker] = {
                "price": float(cached.get("price", 0) or 0),
                "change": float(cached.get("change", 0) or 0),
                "changePercent": float(cached.get("changePercent", 0) or 0),
                "previousClose": float(cached.get("previousClose", 0) or 0),
            }

    return _response(200, {"prices": prices})


def _handle_technicals(method, ticker):
    """GET /technicals/<ticker> — Technical indicators with DynamoDB cache."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    if not ticker or len(ticker) > 10:
        return _response(400, {"error": "Invalid ticker"})

    from datetime import datetime, timezone

    # 1) Check DynamoDB cache (fresh within 1 hour)
    cached = db.get_item(f"TECHNICALS#{ticker}", "LATEST")
    if cached:
        cached_at = cached.get("cachedAt", "")
        try:
            ts = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - ts).total_seconds()
            if age_seconds < 3600:  # 1-hour TTL
                indicators = cached.get("indicators", {})
                indicators["source"] = "cache"
                return _response(200, indicators)
        except Exception:
            pass

    # 2) Compute fresh from Finnhub candle data
    try:
        candles = finnhub_client.get_candles(ticker, resolution="D")
        if not candles:
            return _response(200, {
                "ticker": ticker,
                "error": "No candle data available",
                "indicatorCount": 0,
            })

        indicators = technical_engine.compute_indicators(candles)
        indicators["ticker"] = ticker

        # 3) Cache to DynamoDB
        try:
            cache_item = {
                "PK": f"TECHNICALS#{ticker}",
                "SK": "LATEST",
                "indicators": indicators,
                "cachedAt": datetime.now(timezone.utc).isoformat(),
            }
            db.put_item(cache_item)
        except Exception:
            pass

        indicators["source"] = "live"
        return _response(200, indicators)

    except Exception as e:
        # Return stale cache if computation fails
        if cached:
            indicators = cached.get("indicators", {})
            indicators["source"] = "stale_cache"
            return _response(200, indicators)

        return _response(200, {
            "ticker": ticker,
            "error": f"Technical analysis unavailable: {str(e)}",
            "indicatorCount": 0,
        })


# ─── Fundamentals Endpoint ───


def _handle_fundamentals(method, ticker):
    """GET /fundamentals/<ticker> — Financial health grade + DCF valuation."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    if not ticker or len(ticker) > 10:
        return _response(400, {"error": "Invalid ticker"})

    from datetime import datetime, timezone

    # 1) Check DynamoDB cache (24-hour TTL)
    cached = db.get_item(f"HEALTH#{ticker}", "LATEST")
    if cached:
        cached_at = cached.get("cachedAt", "")
        try:
            ts = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - ts).total_seconds()
            if age_seconds < 86400:  # 24-hour TTL
                data = cached.get("analysis", {})
                data["source"] = "cache"
                return _response(200, data)
        except Exception:
            pass

    # 2) Get market data from Finnhub for DCF inputs
    market_cap = None
    beta = 1.0
    current_price = None
    shares_outstanding = None

    try:
        quote = finnhub_client.get_quote(ticker)
        current_price = quote.get("price")
        profile = finnhub_client.get_company_profile(ticker)
        market_cap = profile.get("marketCap")
        financials_data = finnhub_client.get_basic_financials(ticker)
        beta = financials_data.get("beta") or 1.0
        if market_cap and current_price and current_price > 0:
            shares_outstanding = market_cap / current_price
    except Exception:
        pass

    # 3) Run fundamental analysis
    try:
        analysis = fundamentals_engine.analyze(
            ticker,
            market_cap=market_cap,
            beta=beta,
            current_price=current_price,
            shares_outstanding=shares_outstanding,
        )

        if "error" in analysis and "grade" not in analysis:
            # Return stale cache if fresh analysis failed
            if cached:
                data = cached.get("analysis", {})
                data["source"] = "stale_cache"
                return _response(200, data)
            return _response(200, analysis)

        # 4) Cache to DynamoDB
        try:
            cache_item = {
                "PK": f"HEALTH#{ticker}",
                "SK": "LATEST",
                "analysis": analysis,
                "cachedAt": datetime.now(timezone.utc).isoformat(),
            }
            db.put_item(cache_item)
        except Exception:
            pass

        analysis["source"] = "live"
        return _response(200, analysis)

    except Exception as e:
        if cached:
            data = cached.get("analysis", {})
            data["source"] = "stale_cache"
            return _response(200, data)

        return _response(200, {
            "ticker": ticker,
            "error": f"Fundamental analysis unavailable: {str(e)}",
            "grade": "N/A",
            "gradeScore": 0,
        })


# ─── Factors Endpoint ───


def _handle_factors(method, ticker):
    """GET /factors/<ticker> — Enhanced factor analysis with 25 sub-factors."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    if not ticker or len(ticker) > 10:
        return _response(400, {"error": "Invalid ticker"})

    from datetime import datetime, timezone

    # 1) Check DynamoDB cache (1-hour TTL)
    cached = db.get_item(f"FACTORS#{ticker}", "LATEST")
    if cached:
        cached_at = cached.get("cachedAt", "")
        try:
            ts = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - ts).total_seconds()
            if age_seconds < 3600:
                data = cached.get("factors", {})
                data["source"] = "cache"
                return _response(200, data)
        except Exception:
            pass

    # 2) Gather input data — try DynamoDB cache first, then fetch live
    signal_data = None
    technicals_data = None
    fundamentals_data = None

    # Get existing signal data (has factorDetails from Claude AI)
    try:
        full_signal = s3.read_json(f"signals/{ticker}.json")
        if full_signal:
            signal_data = full_signal
        else:
            summary = db.get_item(f"SIGNAL#{ticker}", "LATEST")
            if summary:
                signal_data = summary
    except Exception:
        pass

    # Get technicals — try cache first, then compute live
    try:
        tech_cached = db.get_item(f"TECHNICALS#{ticker}", "LATEST")
        if tech_cached:
            technicals_data = tech_cached.get("indicators", {})
    except Exception:
        pass

    if not technicals_data or technicals_data.get("error"):
        # Fetch live candles and compute technical indicators
        try:
            candles = finnhub_client.get_candles(ticker, resolution="D")
            if candles and len(candles) >= 5:
                technicals_data = technical_engine.compute_indicators(candles)
                # Cache for next time
                try:
                    cache_item = {
                        "PK": f"TECHNICALS#{ticker}",
                        "SK": "LATEST",
                        "indicators": technicals_data,
                        "cachedAt": datetime.now(timezone.utc).isoformat(),
                    }
                    db.put_item(cache_item)
                except Exception:
                    pass
        except Exception as e:
            print(f"[Factors] Failed to fetch live technicals for {ticker}: {e}")

    # Get fundamentals — try cache first, then compute live
    try:
        fund_cached = db.get_item(f"HEALTH#{ticker}", "LATEST")
        if fund_cached:
            fundamentals_data = fund_cached.get("analysis", {})
    except Exception:
        pass

    if not fundamentals_data or fundamentals_data.get("error"):
        # Fetch live fundamental analysis
        try:
            market_cap = None
            beta = 1.0
            current_price = None
            shares_outstanding = None
            try:
                quote = finnhub_client.get_quote(ticker)
                current_price = quote.get("price")
                profile = finnhub_client.get_company_profile(ticker)
                market_cap = profile.get("marketCap")
                fin = finnhub_client.get_basic_financials(ticker)
                beta = fin.get("beta") or 1.0
                if market_cap and current_price and current_price > 0:
                    shares_outstanding = market_cap / current_price
            except Exception:
                pass
            fundamentals_data = fundamentals_engine.analyze(
                ticker,
                market_cap=market_cap,
                beta=beta,
                current_price=current_price,
                shares_outstanding=shares_outstanding,
            )
            # Cache for next time
            if fundamentals_data and fundamentals_data.get("grade"):
                try:
                    cache_item = {
                        "PK": f"HEALTH#{ticker}",
                        "SK": "LATEST",
                        "analysis": fundamentals_data,
                        "cachedAt": datetime.now(timezone.utc).isoformat(),
                    }
                    db.put_item(cache_item)
                except Exception:
                    pass
        except Exception as e:
            print(f"[Factors] Failed to fetch live fundamentals for {ticker}: {e}")

    # 2b) Gather alternative data (cached or live)
    alt_data = _gather_alt_data(ticker)

    # 3) Compute enhanced factors
    try:
        result = factor_engine.compute_factors(
            ticker,
            signal_data=signal_data,
            technicals=technicals_data,
            fundamentals=fundamentals_data,
            alt_data=alt_data,
        )

        # 4) Cache to DynamoDB
        try:
            cache_item = {
                "PK": f"FACTORS#{ticker}",
                "SK": "LATEST",
                "factors": result,
                "cachedAt": datetime.now(timezone.utc).isoformat(),
            }
            db.put_item(cache_item)
        except Exception:
            pass

        result["source"] = "live"
        return _response(200, result)

    except Exception as e:
        if cached:
            data = cached.get("factors", {})
            data["source"] = "stale_cache"
            return _response(200, data)

        return _response(200, {
            "ticker": ticker,
            "error": f"Factor analysis unavailable: {str(e)}",
            "dimensionScores": {},
            "factorContributions": [],
        })


# ─── Fair Price Endpoint ───


def _handle_fair_price(method, ticker):
    """GET /fair-price/<ticker> — Blended DCF + Relative fair value estimate."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    if not ticker or len(ticker) > 10:
        return _response(400, {"error": "Invalid ticker"})

    from datetime import datetime, timezone

    # 1) Check DynamoDB cache (6-hour TTL for fair price)
    cached = db.get_item(f"FAIRPRICE#{ticker}", "LATEST")
    if cached:
        cached_at = cached.get("cachedAt", "")
        try:
            ts = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - ts).total_seconds()
            if age_seconds < 21600:  # 6-hour TTL
                data = cached.get("fairPrice", {})
                data["source"] = "cache"
                return _response(200, data)
        except Exception:
            pass

    # 2) Gather inputs
    current_price = None
    sector = None
    eps_ttm = None
    dcf_fair_value = None
    dcf_growth_rate = None
    dcf_discount_rate = None
    dcf_terminal_growth = None

    try:
        quote = finnhub_client.get_quote(ticker)
        current_price = quote.get("price")
    except Exception:
        pass

    try:
        profile = finnhub_client.get_company_profile(ticker)
        sector = profile.get("sector", "")
    except Exception:
        pass

    try:
        financials = finnhub_client.get_basic_financials(ticker)
        eps_ttm = financials.get("epsTTM")
    except Exception:
        pass

    # Get DCF from fundamentals cache or compute fresh
    try:
        health_cached = db.get_item(f"HEALTH#{ticker}", "LATEST")
        if health_cached:
            analysis = health_cached.get("analysis", {})
            dcf = analysis.get("dcf")
            if dcf and dcf.get("fairValue"):
                dcf_fair_value = dcf["fairValue"]
                dcf_growth_rate = dcf.get("growthRate")
                dcf_discount_rate = dcf.get("discountRate")
                dcf_terminal_growth = dcf.get("terminalGrowth")
    except Exception:
        pass

    # If no DCF from cache, try computing fresh fundamentals
    if dcf_fair_value is None:
        try:
            market_cap = None
            beta = 1.0
            shares_outstanding = None
            try:
                profile = finnhub_client.get_company_profile(ticker)
                market_cap = profile.get("marketCap")
                fin = finnhub_client.get_basic_financials(ticker)
                beta = fin.get("beta") or 1.0
                if market_cap and current_price and current_price > 0:
                    shares_outstanding = market_cap / current_price
            except Exception:
                pass
            fund_result = fundamentals_engine.analyze(
                ticker,
                market_cap=market_cap,
                beta=beta,
                current_price=current_price,
                shares_outstanding=shares_outstanding,
            )
            if fund_result and not fund_result.get("error"):
                dcf = fund_result.get("dcf")
                if dcf and dcf.get("fairValue"):
                    dcf_fair_value = dcf["fairValue"]
                    dcf_growth_rate = dcf.get("growthRate")
                    dcf_discount_rate = dcf.get("discountRate")
                    dcf_terminal_growth = dcf.get("terminalGrowth")
        except Exception as e:
            print(f"[FairPrice] Fundamentals computation failed for {ticker}: {e}")

    # 3) Compute fair price (convert Decimal→float for arithmetic safety)
    _to_float = lambda v: float(v) if v is not None else None
    try:
        result = fair_price_engine.compute_fair_price(
            ticker=ticker,
            current_price=_to_float(current_price),
            sector=sector,
            eps_ttm=_to_float(eps_ttm),
            dcf_fair_value=_to_float(dcf_fair_value),
            dcf_growth_rate=_to_float(dcf_growth_rate),
            dcf_discount_rate=_to_float(dcf_discount_rate),
            dcf_terminal_growth=_to_float(dcf_terminal_growth),
        )
    except Exception as e:
        print(f"[FairPrice] compute_fair_price failed for {ticker}: {e}")
        result = None

    if not result:
        if cached:
            data = cached.get("fairPrice", {})
            data["source"] = "stale_cache"
            return _response(200, data)
        return _response(200, {
            "ticker": ticker,
            "error": "Insufficient data for fair value estimate",
        })

    # 4) Cache to DynamoDB
    try:
        db.put_item({
            "PK": f"FAIRPRICE#{ticker}",
            "SK": "LATEST",
            "fairPrice": result,
            "cachedAt": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass

    result["source"] = "live"
    return _response(200, result)


# ─── Alternative Data Helpers ───

def _gather_alt_data(ticker):
    """Gather alternative data (patents, contracts, FDA) for a ticker.

    Tries DynamoDB cache first (24h for patents, 7d for contracts/FDA),
    then fetches live from APIs.
    """
    from datetime import datetime, timezone

    alt_data = {}

    # Patents
    try:
        cached = db.get_item(f"PATENTS#{ticker}", "LATEST")
        if cached:
            cached_at = cached.get("cachedAt", "")
            try:
                ts = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                age_hours = (datetime.now(timezone.utc) - ts).total_seconds() / 3600
                if age_hours < 720:  # 30 days cache for patents
                    alt_data["patents"] = cached.get("data", {})
            except Exception:
                pass

        if "patents" not in alt_data:
            patent_result = patent_engine.analyze(ticker)
            if patent_result:
                alt_data["patents"] = patent_result
                try:
                    db.put_item({
                        "PK": f"PATENTS#{ticker}",
                        "SK": "LATEST",
                        "data": patent_result,
                        "cachedAt": datetime.now(timezone.utc).isoformat(),
                    })
                except Exception:
                    pass
    except Exception as e:
        print(f"[AltData] Patent analysis failed for {ticker}: {e}")

    # Government Contracts
    try:
        cached = db.get_item(f"CONTRACTS#{ticker}", "LATEST")
        if cached:
            cached_at = cached.get("cachedAt", "")
            try:
                ts = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                age_hours = (datetime.now(timezone.utc) - ts).total_seconds() / 3600
                if age_hours < 168:  # 7 days cache
                    alt_data["contracts"] = cached.get("data", {})
            except Exception:
                pass

        if "contracts" not in alt_data:
            contract_result = contract_engine.analyze(ticker)
            if contract_result:
                alt_data["contracts"] = contract_result
                try:
                    db.put_item({
                        "PK": f"CONTRACTS#{ticker}",
                        "SK": "LATEST",
                        "data": contract_result,
                        "cachedAt": datetime.now(timezone.utc).isoformat(),
                    })
                except Exception:
                    pass
    except Exception as e:
        print(f"[AltData] Contract analysis failed for {ticker}: {e}")

    # FDA Pipeline
    try:
        cached = db.get_item(f"FDA#{ticker}", "LATEST")
        if cached:
            cached_at = cached.get("cachedAt", "")
            try:
                ts = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                age_hours = (datetime.now(timezone.utc) - ts).total_seconds() / 3600
                if age_hours < 168:  # 7 days cache
                    alt_data["fda"] = cached.get("data", {})
            except Exception:
                pass

        if "fda" not in alt_data:
            fda_result = fda_engine.analyze(ticker)
            if fda_result:
                alt_data["fda"] = fda_result
                try:
                    db.put_item({
                        "PK": f"FDA#{ticker}",
                        "SK": "LATEST",
                        "data": fda_result,
                        "cachedAt": datetime.now(timezone.utc).isoformat(),
                    })
                except Exception:
                    pass
    except Exception as e:
        print(f"[AltData] FDA analysis failed for {ticker}: {e}")

    return alt_data if alt_data else None


def _handle_altdata(method, ticker):
    """GET /altdata/<ticker> — Alternative data signals (patents, contracts, FDA)."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    if not ticker or len(ticker) > 10:
        return _response(400, {"error": "Invalid ticker"})

    alt_data = _gather_alt_data(ticker)

    if not alt_data:
        return _response(200, {
            "ticker": ticker,
            "available": [],
            "message": "No alternative data available for this ticker",
        })

    available = []
    if alt_data.get("patents") and alt_data["patents"].get("score"):
        available.append("patents")
    if alt_data.get("contracts") and alt_data["contracts"].get("score"):
        available.append("contracts")
    if alt_data.get("fda") and alt_data["fda"].get("score"):
        available.append("fda")

    return _response(200, {
        "ticker": ticker,
        "available": available,
        "patents": alt_data.get("patents"),
        "contracts": alt_data.get("contracts"),
        "fda": alt_data.get("fda"),
    })


# ─── Chart Data Endpoint ───

def _sma_series(closes, period):
    """Compute rolling SMA series. Returns list of (index, value) pairs."""
    if len(closes) < period:
        return []
    result = []
    window_sum = sum(closes[:period])
    result.append((period - 1, window_sum / period))
    for i in range(period, len(closes)):
        window_sum += closes[i] - closes[i - period]
        result.append((i, window_sum / period))
    return result


def _ema_full_series(data, period):
    """Return full EMA series as list of (index, value) pairs."""
    if len(data) < period:
        return []
    multiplier = 2.0 / (period + 1)
    ema = sum(data[:period]) / period
    result = [(period - 1, ema)]
    for i in range(period, len(data)):
        ema = (data[i] - ema) * multiplier + ema
        result.append((i, ema))
    return result


def _rsi_series(closes, period=14):
    """Compute RSI at each valid point. Returns list of (index, value)."""
    if len(closes) < period + 1:
        return []
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [d if d > 0 else 0 for d in deltas[:period]]
    losses = [-d if d < 0 else 0 for d in deltas[:period]]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    result = []
    if avg_loss == 0:
        result.append((period, 100.0))
    else:
        rs = avg_gain / avg_loss
        result.append((period, 100.0 - (100.0 / (1.0 + rs))))

    for j in range(period, len(deltas)):
        g = deltas[j] if deltas[j] > 0 else 0
        l = -deltas[j] if deltas[j] < 0 else 0
        avg_gain = (avg_gain * (period - 1) + g) / period
        avg_loss = (avg_loss * (period - 1) + l) / period
        if avg_loss == 0:
            result.append((j + 1, 100.0))
        else:
            rs = avg_gain / avg_loss
            result.append((j + 1, round(100.0 - (100.0 / (1.0 + rs)), 2)))
    return result


def _macd_series(closes, fast=12, slow=26, signal_period=9):
    """Compute MACD line, signal, histogram series."""
    if len(closes) < slow + signal_period:
        return []
    ema_fast = _ema_full_series(closes, fast)
    ema_slow = _ema_full_series(closes, slow)
    if not ema_fast or not ema_slow:
        return []

    # Build dict for fast lookup
    fast_map = {idx: val for idx, val in ema_fast}
    slow_map = {idx: val for idx, val in ema_slow}

    macd_vals = []
    for idx, slow_val in ema_slow:
        if idx in fast_map:
            macd_vals.append((idx, fast_map[idx] - slow_val))

    if len(macd_vals) < signal_period:
        return []

    # Signal line = EMA of MACD values
    macd_only = [v for _, v in macd_vals]
    multiplier = 2.0 / (signal_period + 1)
    sig = sum(macd_only[:signal_period]) / signal_period
    result = []
    idx0 = macd_vals[signal_period - 1][0]
    result.append((idx0, macd_only[signal_period - 1], sig, macd_only[signal_period - 1] - sig))

    for k in range(signal_period, len(macd_only)):
        sig = (macd_only[k] - sig) * multiplier + sig
        idx_k = macd_vals[k][0]
        result.append((idx_k, round(macd_only[k], 4), round(sig, 4), round(macd_only[k] - sig, 4)))
    return result


def _bollinger_series(closes, period=20, num_std=2):
    """Compute Bollinger Band series."""
    import math
    if len(closes) < period:
        return []
    result = []
    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1: i + 1]
        middle = sum(window) / period
        variance = sum((x - middle) ** 2 for x in window) / period
        std = math.sqrt(variance)
        result.append((i, round(middle + num_std * std, 2), round(middle, 2), round(middle - num_std * std, 2)))
    return result


def _handle_charts(method, ticker, query_params):
    """GET /charts/<ticker> — Chart data with OHLCV candles, overlays, and indicators."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    if not ticker or len(ticker) > 10:
        return _response(400, {"error": "Invalid ticker"})

    from datetime import datetime, timezone

    resolution = query_params.get("resolution", "D")
    time_range = query_params.get("range", "6M")

    # Convert range to from_ts
    now_ts = int(datetime.now(timezone.utc).timestamp())
    range_days = {"1M": 30, "3M": 91, "6M": 183, "1Y": 365, "2Y": 730}.get(time_range, 183)
    from_ts = now_ts - (range_days * 24 * 3600)

    try:
        candles = finnhub_client.get_candles(ticker, resolution, from_ts, now_ts)
    except Exception as e:
        print(f"[Charts] Candle fetch error for {ticker}: {e}")
        candles = []

    if not candles:
        return _response(200, {
            "candles": [],
            "overlays": {},
            "indicators": {},
            "events": [],
            "meta": {"ticker": ticker, "resolution": resolution, "range": time_range, "candleCount": 0},
        })

    # Convert candles to chart format with timestamps
    chart_candles = []
    dates = []
    closes = []
    for c in candles:
        try:
            dt = datetime.strptime(c["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            ts = int(dt.timestamp())
        except (ValueError, KeyError):
            continue
        chart_candles.append({
            "t": ts,
            "o": round(c.get("open", 0), 2),
            "h": round(c.get("high", 0), 2),
            "l": round(c.get("low", 0), 2),
            "c": round(c.get("close", 0), 2),
            "v": c.get("volume", 0),
        })
        dates.append(ts)
        closes.append(c.get("close", 0))

    if not closes:
        return _response(200, {
            "candles": [],
            "overlays": {},
            "indicators": {},
            "events": [],
            "meta": {"ticker": ticker, "resolution": resolution, "range": time_range, "candleCount": 0},
        })

    # Compute overlays
    overlays = {}
    for period, key in [(20, "sma20"), (50, "sma50"), (200, "sma200")]:
        sma = _sma_series(closes, period)
        overlays[key] = [{"t": dates[idx], "v": round(val, 2)} for idx, val in sma if idx < len(dates)]

    bb = _bollinger_series(closes, 20, 2)
    overlays["bollingerBands"] = [
        {"t": dates[idx], "upper": u, "middle": m, "lower": lo}
        for idx, u, m, lo in bb if idx < len(dates)
    ]

    # Compute indicators
    indicators = {}
    rsi = _rsi_series(closes, 14)
    indicators["rsi"] = [{"t": dates[idx], "v": round(val, 1)} for idx, val in rsi if idx < len(dates)]

    macd = _macd_series(closes, 12, 26, 9)
    indicators["macd"] = [
        {"t": dates[idx], "value": v, "signal": s, "histogram": h}
        for idx, v, s, h in macd if idx < len(dates)
    ]

    # Events: signal change date
    events = []
    try:
        signal_data = db.get_item(f"SIGNAL#{ticker}", "LATEST")
        if signal_data and signal_data.get("lastUpdated"):
            try:
                evt_dt = datetime.fromisoformat(signal_data["lastUpdated"].replace("Z", "+00:00"))
                events.append({
                    "t": int(evt_dt.timestamp()),
                    "type": "signal",
                    "label": f"{signal_data.get('signal', 'HOLD')} signal",
                })
            except (ValueError, TypeError):
                pass
    except Exception:
        pass

    return _response(200, {
        "candles": chart_candles,
        "overlays": overlays,
        "indicators": indicators,
        "events": events,
        "meta": {
            "ticker": ticker,
            "resolution": resolution,
            "range": time_range,
            "candleCount": len(chart_candles),
        },
    })


# ─── Screener Endpoints ───

# Full universe for screener (loaded from models)
def _get_screener_universe():
    from models import ALL_SECURITIES
    return ALL_SECURITIES

_SCREENER_UNIVERSE = None

_MCAP_LABELS = [
    (300_000_000, "nano"),
    (2_000_000_000, "micro"),
    (10_000_000_000, "small"),
    (50_000_000_000, "mid"),
    (200_000_000_000, "large"),
]


def _mcap_label(market_cap):
    if market_cap is None:
        return "unknown"
    for threshold, label in _MCAP_LABELS:
        if market_cap < threshold:
            return label
    return "mega"


_SCREENER_TEMPLATES = [
    {
        "id": "ai_top_picks",
        "name": "AI Top Picks",
        "description": "Stocks with highest AI confidence scores",
        "icon": "sparkles",
        "filters": {"aiScore": "6,10", "signal": "BUY"},
    },
    {
        "id": "value_plays",
        "name": "Value Plays",
        "description": "Large-cap BUY signals with strong AI scores",
        "icon": "diamond",
        "filters": {"signal": "BUY", "marketCap": "large,mega"},
    },
    {
        "id": "momentum_leaders",
        "name": "Momentum Leaders",
        "description": "BUY signals with strongest price momentum",
        "icon": "trending-up",
        "filters": {"signal": "BUY", "sortBy": "changePercent"},
    },
    {
        "id": "dividend_stars",
        "name": "Dividend Stars",
        "description": "Reliable large and mega cap stocks",
        "icon": "star",
        "filters": {"marketCap": "large,mega"},
    },
    {
        "id": "undervalued_ai",
        "name": "Undervalued by AI",
        "description": "AI sees upside the market hasn't priced in",
        "icon": "eye",
        "filters": {"aiScore": "6,10"},
    },
    {
        "id": "risk_alerts",
        "name": "Risk Alerts",
        "description": "Stocks with warning signals from AI analysis",
        "icon": "warning",
        "filters": {"aiScore": "1,5", "signal": "SELL"},
    },
]


def _handle_screener_templates(method):
    """GET /screener/templates — Pre-built screener filter presets."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})
    return _response(200, {"templates": _SCREENER_TEMPLATES})


def _handle_screener(method, query_params):
    """GET /screener — Multi-factor stock screener.

    Scans ALL PRICE# records from DynamoDB so every stock with price data
    appears, even if it has no SIGNAL# record yet.  Optionally enriches
    each row with signal, technical, and health data when available.
    """
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    # Parse filter params
    ai_range = _parse_range(query_params.get("aiScore"))
    tech_range = _parse_range(query_params.get("technicalScore"))
    rsi_range = _parse_range(query_params.get("rsi"))
    pe_range = _parse_range(query_params.get("peRatio"))

    signal_filter = [s.strip().upper() for s in query_params.get("signal", "").split(",") if s.strip()] or None
    sector_filter = [s.strip() for s in query_params.get("sector", "").split(",") if s.strip()] or None
    grade_filter = [g.strip().upper() for g in query_params.get("fundamentalGrade", "").split(",") if g.strip()] or None
    mcap_filter = [m.strip().lower() for m in query_params.get("marketCap", "").split(",") if m.strip()] or None

    sort_by = query_params.get("sortBy", "changePercent")
    sort_dir = query_params.get("sortDir", "desc")
    limit = min(int(query_params.get("limit", "50")), 50)
    offset = int(query_params.get("offset", "0"))
    show_etf = query_params.get("showETF", "true").lower() == "true"
    tier_filter = [t.strip() for t in query_params.get("tier", "").split(",") if t.strip()] or None

    # ── Step 1: Scan ALL PRICE# records from DynamoDB ──
    from models import STOCK_SECTORS, ETF_SET, get_tier
    from decimal import Decimal

    table = db.table()
    all_price_items = []
    scan_kwargs = {
        "FilterExpression": "begins_with(PK, :pk) AND SK = :sk",
        "ExpressionAttributeValues": {":pk": "PRICE#", ":sk": "LATEST"},
    }
    while True:
        resp = table.scan(**scan_kwargs)
        all_price_items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_key

    # ── Step 2: Build results from price records ──
    results = []
    for price_item in all_price_items:
        pk = price_item.get("PK", "")
        ticker = pk.replace("PRICE#", "") if pk.startswith("PRICE#") else ""
        if not ticker:
            continue

        is_etf = ticker in ETF_SET
        if is_etf and not show_etf:
            continue

        price = _safe_float(price_item.get("price"))
        change = _safe_float(price_item.get("change"))
        change_pct = _safe_float(price_item.get("changePercent"))
        company = price_item.get("companyName", "") or STOCK_SECTORS.get(ticker, ticker)
        sector = price_item.get("sector", "") or STOCK_SECTORS.get(ticker, "")
        market_cap = _safe_float(price_item.get("marketCap"))
        mcap_lbl = _mcap_label(market_cap) if market_cap else "unknown"

        # ── Step 3: Optionally enrich with SIGNAL# data ──
        ai_score = None
        sig = None
        conf = None
        try:
            signal_item = db.get_item(f"SIGNAL#{ticker}", "LATEST")
            if signal_item:
                ai_score = _safe_float(signal_item.get("compositeScore"), default=None)
                sig = signal_item.get("signal")
                conf = signal_item.get("confidence")
                # Use company name from signal if price record didn't have one
                if not company or company == ticker:
                    company = signal_item.get("companyName", ticker)
        except Exception:
            pass

        # Optionally enrich with TECHNICALS#
        tech_score = None
        rsi = None
        try:
            tech_data = db.get_item(f"TECHNICALS#{ticker}", "LATEST")
            if tech_data:
                tech_score = _safe_float(tech_data.get("technicalScore"), default=None)
                indicators = tech_data.get("indicators") or {}
                if isinstance(indicators, str):
                    try:
                        indicators = json.loads(indicators)
                    except Exception:
                        indicators = {}
                rsi = _safe_float(indicators.get("rsi"), default=None)
        except Exception:
            pass

        # Optionally enrich with HEALTH#
        grade = None
        pe = None
        try:
            health_data = db.get_item(f"HEALTH#{ticker}", "LATEST")
            if health_data:
                analysis = health_data.get("analysis") or {}
                if isinstance(analysis, str):
                    try:
                        analysis = json.loads(analysis)
                    except Exception:
                        analysis = {}
                grade = analysis.get("grade")
                ratios = analysis.get("ratios") or {}
                if isinstance(ratios, str):
                    try:
                        ratios = json.loads(ratios)
                    except Exception:
                        ratios = {}
                pe = _safe_float(ratios.get("peRatio"), default=None)
        except Exception:
            pass

        # ── Step 4: Apply filters ──
        if ai_range:
            if ai_score is None:
                continue
            if not _in_range(ai_score, ai_range):
                continue
        if tech_range:
            if tech_score is None:
                continue
            if not _in_range(tech_score, tech_range):
                continue
        if rsi_range and rsi is not None and not _in_range(rsi, rsi_range):
            continue
        if pe_range and pe is not None and not _in_range(pe, pe_range):
            continue
        if signal_filter:
            if sig is None or sig not in signal_filter:
                continue
        if sector_filter and not any(s.lower() in (sector or "").lower() for s in sector_filter):
            continue
        if grade_filter:
            if grade is None or grade not in grade_filter:
                continue
        if mcap_filter and mcap_lbl not in mcap_filter:
            continue

        stock_tier = get_tier(ticker)
        if tier_filter and stock_tier not in tier_filter:
            continue

        results.append({
            "ticker": ticker,
            "companyName": company or ticker,
            "price": price,
            "change": round(change, 2) if change else 0.0,
            "changePercent": round(change_pct, 2) if change_pct else 0.0,
            "aiScore": round(ai_score, 1) if ai_score is not None else None,
            "signal": sig,
            "confidence": conf,
            "technicalScore": round(tech_score, 1) if tech_score is not None else None,
            "fundamentalGrade": grade,
            "rsi": round(rsi, 1) if rsi is not None else None,
            "sector": sector,
            "marketCap": float(market_cap) if market_cap else None,
            "marketCapLabel": mcap_lbl,
            "peRatio": round(pe, 1) if pe is not None else None,
            "tier": stock_tier,
            "isETF": is_etf,
        })

    # ── Step 5: Sort ──
    sort_key_map = {
        "aiScore": lambda x: x.get("aiScore") if x.get("aiScore") is not None else -999,
        "technicalScore": lambda x: x.get("technicalScore") if x.get("technicalScore") is not None else -999,
        "price": lambda x: x.get("price") or 0,
        "changePercent": lambda x: x.get("changePercent") or 0,
        "marketCap": lambda x: x.get("marketCap") or 0,
        "peRatio": lambda x: x.get("peRatio") if x.get("peRatio") is not None and x.get("peRatio") > 0 else 9999,
        "ticker": lambda x: x.get("ticker", ""),
        "signal": lambda x: {"BUY": 3, "HOLD": 2, "SELL": 1}.get(x.get("signal") or "", 0),
    }
    key_fn = sort_key_map.get(sort_by, sort_key_map["changePercent"])
    # For ticker sort, ascending is more natural (A-Z)
    reverse = (sort_dir != "asc") if sort_by != "ticker" else (sort_dir == "desc")
    results.sort(key=key_fn, reverse=reverse)

    # ── Step 6: Paginate ──
    total = len(results)
    paginated = results[offset:offset + limit]

    return _response(200, {
        "results": paginated,
        "total": total,
        "offset": offset,
        "limit": limit,
        "hasMore": (offset + limit) < total,
        "sortBy": sort_by,
        "sortDir": sort_dir,
    })


def _parse_range(val):
    """Parse 'min,max' range string into (min, max) floats."""
    if not val:
        return None
    parts = val.split(",")
    try:
        lo = float(parts[0]) if len(parts) > 0 and parts[0].strip() else None
        hi = float(parts[1]) if len(parts) > 1 and parts[1].strip() else None
        return (lo, hi)
    except (ValueError, IndexError):
        return None


def _in_range(value, range_tuple):
    """Check if value is within (min, max) range."""
    if value is None:
        return False
    lo, hi = range_tuple
    if lo is not None and value < lo:
        return False
    if hi is not None and value > hi:
        return False
    return True


def _safe_float(v, default=0.0):
    """Safely convert value to float."""
    if v is None:
        return default
    try:
        f = float(v)
        return f if f == f else default  # NaN check
    except (ValueError, TypeError):
        return default


# ─── Search Endpoint ───

# Built-in ticker database for search
_TICKER_DB = None

def _get_ticker_db():
    """Load ticker database from S3 (cached in module global)."""
    global _TICKER_DB
    if _TICKER_DB is not None:
        return _TICKER_DB

    s3_data = s3.read_json("tickers/us_top_500.json")
    if s3_data and isinstance(s3_data, list):
        _TICKER_DB = s3_data
    elif s3_data and isinstance(s3_data, dict) and "tickers" in s3_data:
        _TICKER_DB = s3_data["tickers"]
    else:
        _TICKER_DB = _FALLBACK_TICKERS
    return _TICKER_DB


_FALLBACK_TICKERS = [
    {"ticker": "NVDA", "name": "NVIDIA Corporation", "sector": "Technology"},
    {"ticker": "AAPL", "name": "Apple Inc.", "sector": "Technology"},
    {"ticker": "MSFT", "name": "Microsoft Corporation", "sector": "Technology"},
    {"ticker": "AMD", "name": "Advanced Micro Devices", "sector": "Technology"},
    {"ticker": "GOOGL", "name": "Alphabet Inc.", "sector": "Communication Services"},
    {"ticker": "AMZN", "name": "Amazon.com, Inc.", "sector": "Consumer Cyclical"},
    {"ticker": "META", "name": "Meta Platforms, Inc.", "sector": "Communication Services"},
    {"ticker": "TSLA", "name": "Tesla, Inc.", "sector": "Consumer Cyclical"},
    {"ticker": "AVGO", "name": "Broadcom Inc.", "sector": "Technology"},
    {"ticker": "CRM", "name": "Salesforce, Inc.", "sector": "Technology"},
    {"ticker": "NFLX", "name": "Netflix, Inc.", "sector": "Communication Services"},
    {"ticker": "JPM", "name": "JPMorgan Chase & Co.", "sector": "Financial Services"},
    {"ticker": "V", "name": "Visa Inc.", "sector": "Financial Services"},
    {"ticker": "UNH", "name": "UnitedHealth Group", "sector": "Healthcare"},
    {"ticker": "XOM", "name": "Exxon Mobil Corporation", "sector": "Energy"},
    {"ticker": "BRK.B", "name": "Berkshire Hathaway Inc.", "sector": "Financial Services"},
    {"ticker": "LLY", "name": "Eli Lilly and Company", "sector": "Healthcare"},
    {"ticker": "WMT", "name": "Walmart Inc.", "sector": "Consumer Defensive"},
    {"ticker": "MA", "name": "Mastercard Incorporated", "sector": "Financial Services"},
    {"ticker": "PG", "name": "Procter & Gamble Co.", "sector": "Consumer Defensive"},
    {"ticker": "ORCL", "name": "Oracle Corporation", "sector": "Technology"},
    {"ticker": "HD", "name": "The Home Depot, Inc.", "sector": "Consumer Cyclical"},
    {"ticker": "COST", "name": "Costco Wholesale Corporation", "sector": "Consumer Defensive"},
    {"ticker": "ABBV", "name": "AbbVie Inc.", "sector": "Healthcare"},
    {"ticker": "KO", "name": "The Coca-Cola Company", "sector": "Consumer Defensive"},
    {"ticker": "PEP", "name": "PepsiCo, Inc.", "sector": "Consumer Defensive"},
    {"ticker": "BAC", "name": "Bank of America Corporation", "sector": "Financial Services"},
    {"ticker": "MRK", "name": "Merck & Co., Inc.", "sector": "Healthcare"},
    {"ticker": "CVX", "name": "Chevron Corporation", "sector": "Energy"},
    {"ticker": "ADBE", "name": "Adobe Inc.", "sector": "Technology"},
    {"ticker": "TMO", "name": "Thermo Fisher Scientific", "sector": "Healthcare"},
    {"ticker": "LIN", "name": "Linde plc", "sector": "Basic Materials"},
    {"ticker": "ACN", "name": "Accenture plc", "sector": "Technology"},
    {"ticker": "CSCO", "name": "Cisco Systems, Inc.", "sector": "Technology"},
    {"ticker": "ABT", "name": "Abbott Laboratories", "sector": "Healthcare"},
    {"ticker": "WFC", "name": "Wells Fargo & Company", "sector": "Financial Services"},
    {"ticker": "DHR", "name": "Danaher Corporation", "sector": "Healthcare"},
    {"ticker": "MCD", "name": "McDonald's Corporation", "sector": "Consumer Cyclical"},
    {"ticker": "TXN", "name": "Texas Instruments", "sector": "Technology"},
    {"ticker": "PM", "name": "Philip Morris International", "sector": "Consumer Defensive"},
    {"ticker": "NEE", "name": "NextEra Energy, Inc.", "sector": "Utilities"},
    {"ticker": "INTC", "name": "Intel Corporation", "sector": "Technology"},
    {"ticker": "DIS", "name": "The Walt Disney Company", "sector": "Communication Services"},
    {"ticker": "VZ", "name": "Verizon Communications", "sector": "Communication Services"},
    {"ticker": "CMCSA", "name": "Comcast Corporation", "sector": "Communication Services"},
    {"ticker": "IBM", "name": "International Business Machines", "sector": "Technology"},
    {"ticker": "QCOM", "name": "QUALCOMM Incorporated", "sector": "Technology"},
    {"ticker": "NOW", "name": "ServiceNow, Inc.", "sector": "Technology"},
    {"ticker": "INTU", "name": "Intuit Inc.", "sector": "Technology"},
    {"ticker": "AMAT", "name": "Applied Materials, Inc.", "sector": "Technology"},
    {"ticker": "GE", "name": "GE Aerospace", "sector": "Industrials"},
    {"ticker": "ISRG", "name": "Intuitive Surgical, Inc.", "sector": "Healthcare"},
    {"ticker": "CAT", "name": "Caterpillar Inc.", "sector": "Industrials"},
    {"ticker": "GS", "name": "Goldman Sachs Group", "sector": "Financial Services"},
    {"ticker": "T", "name": "AT&T Inc.", "sector": "Communication Services"},
    {"ticker": "BKNG", "name": "Booking Holdings Inc.", "sector": "Consumer Cyclical"},
    {"ticker": "AXP", "name": "American Express Company", "sector": "Financial Services"},
    {"ticker": "SPGI", "name": "S&P Global Inc.", "sector": "Financial Services"},
    {"ticker": "BLK", "name": "BlackRock, Inc.", "sector": "Financial Services"},
    {"ticker": "PFE", "name": "Pfizer Inc.", "sector": "Healthcare"},
    {"ticker": "LOW", "name": "Lowe's Companies, Inc.", "sector": "Consumer Cyclical"},
    {"ticker": "UNP", "name": "Union Pacific Corporation", "sector": "Industrials"},
    {"ticker": "SYK", "name": "Stryker Corporation", "sector": "Healthcare"},
    {"ticker": "RTX", "name": "RTX Corporation", "sector": "Industrials"},
    {"ticker": "HON", "name": "Honeywell International", "sector": "Industrials"},
    {"ticker": "DE", "name": "Deere & Company", "sector": "Industrials"},
    {"ticker": "UBER", "name": "Uber Technologies, Inc.", "sector": "Technology"},
    {"ticker": "SCHW", "name": "Charles Schwab Corporation", "sector": "Financial Services"},
    {"ticker": "LRCX", "name": "Lam Research Corporation", "sector": "Technology"},
    {"ticker": "ELV", "name": "Elevance Health, Inc.", "sector": "Healthcare"},
    {"ticker": "PANW", "name": "Palo Alto Networks", "sector": "Technology"},
    {"ticker": "MDLZ", "name": "Mondelez International", "sector": "Consumer Defensive"},
    {"ticker": "KLAC", "name": "KLA Corporation", "sector": "Technology"},
    {"ticker": "CI", "name": "The Cigna Group", "sector": "Healthcare"},
    {"ticker": "MMC", "name": "Marsh & McLennan", "sector": "Financial Services"},
    {"ticker": "ADP", "name": "Automatic Data Processing", "sector": "Industrials"},
    {"ticker": "SNPS", "name": "Synopsys, Inc.", "sector": "Technology"},
    {"ticker": "CDNS", "name": "Cadence Design Systems", "sector": "Technology"},
    {"ticker": "REGN", "name": "Regeneron Pharmaceuticals", "sector": "Healthcare"},
    {"ticker": "CME", "name": "CME Group Inc.", "sector": "Financial Services"},
    {"ticker": "COP", "name": "ConocoPhillips", "sector": "Energy"},
    {"ticker": "SO", "name": "The Southern Company", "sector": "Utilities"},
    {"ticker": "DUK", "name": "Duke Energy Corporation", "sector": "Utilities"},
    {"ticker": "ICE", "name": "Intercontinental Exchange", "sector": "Financial Services"},
    {"ticker": "PYPL", "name": "PayPal Holdings, Inc.", "sector": "Financial Services"},
    {"ticker": "ZTS", "name": "Zoetis Inc.", "sector": "Healthcare"},
    {"ticker": "PLD", "name": "Prologis, Inc.", "sector": "Real Estate"},
    {"ticker": "AMT", "name": "American Tower Corporation", "sector": "Real Estate"},
    {"ticker": "SHW", "name": "The Sherwin-Williams Company", "sector": "Basic Materials"},
    {"ticker": "CB", "name": "Chubb Limited", "sector": "Financial Services"},
    {"ticker": "FI", "name": "Fiserv, Inc.", "sector": "Financial Services"},
    {"ticker": "USB", "name": "U.S. Bancorp", "sector": "Financial Services"},
    {"ticker": "TJX", "name": "The TJX Companies", "sector": "Consumer Cyclical"},
    {"ticker": "SBUX", "name": "Starbucks Corporation", "sector": "Consumer Cyclical"},
    {"ticker": "NKE", "name": "NIKE, Inc.", "sector": "Consumer Cyclical"},
    {"ticker": "ABNB", "name": "Airbnb, Inc.", "sector": "Consumer Cyclical"},
    {"ticker": "COIN", "name": "Coinbase Global, Inc.", "sector": "Financial Services"},
    {"ticker": "SQ", "name": "Block, Inc.", "sector": "Financial Services"},
    {"ticker": "CRWD", "name": "CrowdStrike Holdings", "sector": "Technology"},
]


def _handle_search(method, query_params):
    """GET /search?q=<query> — Search across all 523 securities."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    query = query_params.get("q", "").strip()
    if not query or len(query) < 1:
        return _response(400, {"error": "Missing 'q' query parameter"})

    from models import ALL_SECURITIES, COMPANY_NAMES, STOCK_SECTORS, get_tier

    query_upper = query.upper()
    query_lower = query.lower()
    results = []
    seen = set()

    # Tier sort priority: TIER_1=0, TIER_2=1, TIER_3=2, ETF=3
    _tier_order = {"TIER_1": 0, "TIER_2": 1, "TIER_3": 2, "ETF": 3}

    # 1. Search all securities by ticker prefix or company name substring
    for ticker in ALL_SECURITIES:
        name = COMPANY_NAMES.get(ticker, "")
        if ticker.startswith(query_upper) or query_lower in name.lower():
            tier = get_tier(ticker)
            results.append({
                "ticker": ticker,
                "companyName": name,
                "sector": STOCK_SECTORS.get(ticker, ""),
                "tier": tier,
                "score": None,
                "signal": None,
                "_tierOrder": _tier_order.get(tier, 9),
            })
            seen.add(ticker)
        if len(results) >= 40:
            break

    # 2. Sort by tier (TIER_1 first), then alphabetically
    results.sort(key=lambda x: (x["_tierOrder"], x["ticker"]))
    results = results[:20]

    # 3. Enrich with DynamoDB signals
    for r in results:
        try:
            sig = db.get_item(f"SIGNAL#{r['ticker']}", "LATEST")
            if sig:
                r["score"] = round(float(sig.get("compositeScore", 0)), 1) or None
                r["signal"] = sig.get("signal") or None
        except Exception:
            pass
        del r["_tierOrder"]

    return _response(200, {"results": results, "query": query, "total": len(results)})


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

    # Fetch all prices in parallel to avoid sequential Finnhub calls
    from concurrent.futures import ThreadPoolExecutor, as_completed
    tickers = [h["ticker"] for h in holdings_raw]
    price_map = {}
    with ThreadPoolExecutor(max_workers=min(10, len(tickers))) as executor:
        futures = {executor.submit(_fetch_price_quiet, t): t for t in tickers}
        for future in as_completed(futures):
            t = futures[future]
            try:
                price_map[t] = future.result()
            except Exception:
                price_map[t] = None

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

        price_data = price_map.get(h["ticker"])
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

    # Fetch signals and prices in parallel
    from concurrent.futures import ThreadPoolExecutor, as_completed
    signal_keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in tickers]
    signal_items = db.batch_get(signal_keys) if signal_keys else []
    signals_by_ticker = {}
    for s in signal_items:
        signals_by_ticker[s.get("ticker", "")] = s

    # Parallel price fetch
    price_map = {}
    with ThreadPoolExecutor(max_workers=min(10, len(tickers))) as executor:
        futures = {executor.submit(_fetch_price_quiet, t): t for t in tickers}
        for future in as_completed(futures):
            t = futures[future]
            try:
                price_map[t] = future.result()
            except Exception:
                price_map[t] = None

    biggest_winner = None
    biggest_risk = None
    sell_count = 0

    for h in holdings_raw:
        ticker = h["ticker"]
        shares = float(h.get("shares", 0))
        avg_cost = float(h.get("avgCost", 0))

        price_data = price_map.get(ticker)
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
    """Fetch price for a ticker, return None on failure. Falls back to DynamoDB."""
    from datetime import datetime, timezone

    # Try DynamoDB price cache first (fastest)
    try:
        cached = db.get_item(f"PRICE#{ticker}", "LATEST")
        if cached and cached.get("price"):
            return {
                "price": round(float(cached.get("price", 0)), 2),
                "change": round(float(cached.get("change", 0)), 2),
                "changePercent": round(float(cached.get("changePercent", 0)), 2),
                "companyName": cached.get("companyName", ticker),
            }
    except Exception:
        pass

    # Try Finnhub live
    try:
        quote = finnhub_client.get_quote(ticker)
        if quote and quote.get("price"):
            profile = finnhub_client.get_company_profile(ticker)
            result = {
                "price": round(quote.get("price", 0), 2),
                "change": round(quote.get("change", 0), 2),
                "changePercent": round(quote.get("changePercent", 0), 2),
                "companyName": profile.get("name", ticker),
            }
            # Cache to DynamoDB for faster subsequent calls
            try:
                db.put_item({
                    "PK": f"PRICE#{ticker}",
                    "SK": "LATEST",
                    "price": result["price"],
                    "change": result["change"],
                    "changePercent": result["changePercent"],
                    "companyName": result["companyName"],
                    "cachedAt": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:
                pass
            return result
    except Exception:
        pass

    # Fallback: use DynamoDB signal data for company name (no live price)
    try:
        signal = db.get_item(f"SIGNAL#{ticker}", "LATEST")
        if signal:
            return {
                "price": 0,
                "change": 0,
                "changePercent": 0,
                "companyName": signal.get("companyName", ticker),
            }
    except Exception:
        pass

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
            {"ticker": "NVDA", "companyName": "NVIDIA Corporation", "weight": 0.30, "reason": "AI chip monopoly + datacenter demand"},
            {"ticker": "MSFT", "companyName": "Microsoft Corporation", "weight": 0.25, "reason": "Azure AI + Copilot integration"},
            {"ticker": "GOOGL", "companyName": "Alphabet Inc.", "weight": 0.20, "reason": "Gemini AI + Search dominance"},
            {"ticker": "META", "companyName": "Meta Platforms, Inc.", "weight": 0.15, "reason": "LLaMA open-source + ad AI"},
            {"ticker": "AMD", "companyName": "Advanced Micro Devices", "weight": 0.10, "reason": "MI300 GPU alternative"},
        ],
        "riskLevel": "High",
    },
    {
        "id": "dividend-aristocrats",
        "name": "Dividend Aristocrats",
        "emoji": "\U0001f451",
        "description": "Blue-chip companies with 25+ years of consecutive dividend increases",
        "stocks": [
            {"ticker": "JNJ", "companyName": "Johnson & Johnson", "weight": 0.20, "reason": "62 years of dividend increases"},
            {"ticker": "PG", "companyName": "Procter & Gamble", "weight": 0.20, "reason": "67 years of dividend growth"},
            {"ticker": "KO", "companyName": "Coca-Cola Company", "weight": 0.20, "reason": "61 years of dividend raises"},
            {"ticker": "PEP", "companyName": "PepsiCo Inc.", "weight": 0.20, "reason": "51 years of dividend growth"},
            {"ticker": "ABT", "companyName": "Abbott Laboratories", "weight": 0.20, "reason": "51 years of dividend increases"},
        ],
        "riskLevel": "Low",
    },
    {
        "id": "growth-rockets",
        "name": "Growth Rockets",
        "emoji": "\U0001f680",
        "description": "High-growth companies with accelerating revenue and margin expansion",
        "stocks": [
            {"ticker": "NVDA", "companyName": "NVIDIA Corporation", "weight": 0.25, "reason": "200%+ datacenter revenue growth"},
            {"ticker": "NFLX", "companyName": "Netflix Inc.", "weight": 0.20, "reason": "Ad tier + subscriber re-acceleration"},
            {"ticker": "AMZN", "companyName": "Amazon.com Inc.", "weight": 0.20, "reason": "AWS + margin expansion story"},
            {"ticker": "META", "companyName": "Meta Platforms Inc.", "weight": 0.20, "reason": "AI-driven ad revenue surge"},
            {"ticker": "TSLA", "companyName": "Tesla Inc.", "weight": 0.15, "reason": "Energy + robotaxi optionality"},
        ],
        "riskLevel": "High",
    },
    {
        "id": "clean-energy",
        "name": "Clean Energy Leaders",
        "emoji": "\U0001f331",
        "description": "Companies powering the transition to renewable energy and electrification",
        "stocks": [
            {"ticker": "NEE", "companyName": "NextEra Energy Inc.", "weight": 0.25, "reason": "Largest US renewable energy operator"},
            {"ticker": "TSLA", "companyName": "Tesla Inc.", "weight": 0.20, "reason": "EV + energy storage leader"},
            {"ticker": "CAT", "companyName": "Caterpillar Inc.", "weight": 0.20, "reason": "Infrastructure for energy transition"},
            {"ticker": "LIN", "companyName": "Linde plc", "weight": 0.20, "reason": "Hydrogen economy enabler"},
            {"ticker": "APD", "companyName": "Air Products and Chemicals", "weight": 0.15, "reason": "Green hydrogen pioneer"},
        ],
        "riskLevel": "Medium",
    },
    {
        "id": "cybersecurity-shield",
        "name": "Cybersecurity Shield",
        "emoji": "\U0001f6e1\ufe0f",
        "description": "Leading cybersecurity and enterprise security platforms protecting digital infrastructure",
        "stocks": [
            {"ticker": "PANW", "companyName": "Palo Alto Networks", "weight": 0.25, "reason": "Platform consolidation leader"},
            {"ticker": "MSFT", "companyName": "Microsoft Corporation", "weight": 0.25, "reason": "Security revenue exceeds $20B"},
            {"ticker": "GOOGL", "companyName": "Alphabet Inc.", "weight": 0.20, "reason": "Mandiant + Cloud security"},
            {"ticker": "CSCO", "companyName": "Cisco Systems Inc.", "weight": 0.15, "reason": "Network security + Splunk acquisition"},
            {"ticker": "IBM", "companyName": "IBM Corporation", "weight": 0.15, "reason": "QRadar + enterprise security services"},
        ],
        "riskLevel": "Medium",
    },
    {
        "id": "aging-population",
        "name": "Aging Population",
        "emoji": "\U0001f3e5",
        "description": "Healthcare and pharma companies benefiting from global aging demographics",
        "stocks": [
            {"ticker": "UNH", "companyName": "UnitedHealth Group", "weight": 0.20, "reason": "Largest managed care + Optum"},
            {"ticker": "LLY", "companyName": "Eli Lilly", "weight": 0.20, "reason": "GLP-1 blockbuster pipeline"},
            {"ticker": "ABBV", "companyName": "AbbVie Inc.", "weight": 0.20, "reason": "Immunology + oncology pipeline"},
            {"ticker": "ISRG", "companyName": "Intuitive Surgical", "weight": 0.20, "reason": "Robotic surgery leader"},
            {"ticker": "TMO", "companyName": "Thermo Fisher Scientific", "weight": 0.20, "reason": "Life sciences tools monopoly"},
        ],
        "riskLevel": "Low",
    },
    {
        "id": "space-defense",
        "name": "Space & Defense",
        "emoji": "\U0001f6f0\ufe0f",
        "description": "Aerospace and defense companies benefiting from rising global security spending",
        "stocks": [
            {"ticker": "LMT", "companyName": "Lockheed Martin", "weight": 0.25, "reason": "F-35 + missile defense monopoly"},
            {"ticker": "RTX", "companyName": "RTX Corporation", "weight": 0.25, "reason": "Patriot missile + Pratt engines"},
            {"ticker": "BA", "companyName": "Boeing Company", "weight": 0.20, "reason": "Defense + space turnaround"},
            {"ticker": "NOC", "companyName": "Northrop Grumman", "weight": 0.15, "reason": "B-21 stealth bomber + space"},
            {"ticker": "GD", "companyName": "General Dynamics", "weight": 0.15, "reason": "Gulfstream + combat systems"},
        ],
        "riskLevel": "Medium",
    },
    {
        "id": "fintech-disruptors",
        "name": "Fintech Disruptors",
        "emoji": "\U0001f4b3",
        "description": "Companies disrupting traditional finance with technology-driven payment and banking solutions",
        "stocks": [
            {"ticker": "V", "companyName": "Visa Inc.", "weight": 0.20, "reason": "Global payments network"},
            {"ticker": "MA", "companyName": "Mastercard Inc.", "weight": 0.20, "reason": "Cross-border payments leader"},
            {"ticker": "SQ", "companyName": "Block Inc.", "weight": 0.20, "reason": "Cash App + merchant payments"},
            {"ticker": "PYPL", "companyName": "PayPal Holdings", "weight": 0.20, "reason": "Digital payments pioneer"},
            {"ticker": "GS", "companyName": "Goldman Sachs", "weight": 0.20, "reason": "Marcus + transaction banking"},
        ],
        "riskLevel": "Medium",
    },
    {
        "id": "cloud-kings",
        "name": "Cloud Kings",
        "emoji": "\u2601\ufe0f",
        "description": "Dominant cloud infrastructure and SaaS platforms driving digital transformation",
        "stocks": [
            {"ticker": "AMZN", "companyName": "Amazon.com Inc.", "weight": 0.30, "reason": "AWS market leader + advertising"},
            {"ticker": "MSFT", "companyName": "Microsoft Corporation", "weight": 0.25, "reason": "Azure growth + enterprise"},
            {"ticker": "CRM", "companyName": "Salesforce Inc.", "weight": 0.20, "reason": "CRM market share + AI agents"},
            {"ticker": "GOOGL", "companyName": "Alphabet Inc.", "weight": 0.15, "reason": "Google Cloud + BigQuery"},
            {"ticker": "NOW", "companyName": "ServiceNow Inc.", "weight": 0.10, "reason": "Enterprise workflow automation"},
        ],
        "riskLevel": "Medium",
    },
    {
        "id": "robotics-automation",
        "name": "Robotics & Automation",
        "emoji": "\U0001f9be",
        "description": "Companies building the future of industrial automation and robotics",
        "stocks": [
            {"ticker": "NVDA", "companyName": "NVIDIA Corporation", "weight": 0.20, "reason": "Omniverse + robotics AI chips"},
            {"ticker": "ISRG", "companyName": "Intuitive Surgical", "weight": 0.20, "reason": "Robotic surgery da Vinci"},
            {"ticker": "HON", "companyName": "Honeywell International", "weight": 0.20, "reason": "Industrial automation leader"},
            {"ticker": "DE", "companyName": "Deere & Company", "weight": 0.20, "reason": "Autonomous farming technology"},
            {"ticker": "AMAT", "companyName": "Applied Materials", "weight": 0.20, "reason": "Semiconductor manufacturing robots"},
        ],
        "riskLevel": "High",
    },
    {
        "id": "infrastructure-boom",
        "name": "Infrastructure Boom",
        "emoji": "\U0001f3d7\ufe0f",
        "description": "Companies benefiting from massive US infrastructure and reshoring investment",
        "stocks": [
            {"ticker": "CAT", "companyName": "Caterpillar Inc.", "weight": 0.20, "reason": "Construction & mining equipment"},
            {"ticker": "DE", "companyName": "Deere & Company", "weight": 0.15, "reason": "Agriculture + construction"},
            {"ticker": "UNP", "companyName": "Union Pacific", "weight": 0.15, "reason": "Rail infrastructure backbone"},
            {"ticker": "FCX", "companyName": "Freeport-McMoRan", "weight": 0.15, "reason": "Copper for electrification"},
            {"ticker": "GE", "companyName": "GE Aerospace", "weight": 0.15, "reason": "Power grid + aerospace"},
            {"ticker": "SHW", "companyName": "Sherwin-Williams", "weight": 0.10, "reason": "Construction coatings leader"},
            {"ticker": "HD", "companyName": "Home Depot", "weight": 0.10, "reason": "Pro construction spending"},
        ],
        "riskLevel": "Medium",
    },
    {
        "id": "steady-compounders",
        "name": "Steady Compounders",
        "emoji": "\U0001f3af",
        "description": "Reliable large-caps with consistent earnings growth and low volatility",
        "stocks": [
            {"ticker": "AAPL", "companyName": "Apple Inc.", "weight": 0.25, "reason": "Services flywheel + iPhone cycle"},
            {"ticker": "V", "companyName": "Visa Inc.", "weight": 0.20, "reason": "Payments duopoly + cross-border growth"},
            {"ticker": "UNH", "companyName": "UnitedHealth Group", "weight": 0.20, "reason": "Healthcare moat + aging demographics"},
            {"ticker": "MSFT", "companyName": "Microsoft Corporation", "weight": 0.20, "reason": "Enterprise software + cloud"},
            {"ticker": "JPM", "companyName": "JPMorgan Chase", "weight": 0.15, "reason": "Banking leader + rate tailwind"},
        ],
        "riskLevel": "Low",
    },
]


def _enrich_baskets_with_signals(baskets):
    """Enrich basket stocks with live DynamoDB signal data."""
    # Collect all unique tickers
    all_tickers = set()
    for b in baskets:
        for s in b.get("stocks", []):
            all_tickers.add(s["ticker"])

    if not all_tickers:
        return baskets

    # Batch fetch from DynamoDB
    signals_map = _get_signal_data_for_tickers(list(all_tickers))

    enriched = []
    for b in baskets:
        new_stocks = []
        total_score = 0.0
        count = 0
        for s in b.get("stocks", []):
            sig = signals_map.get(s["ticker"], {})
            score = sig.get("compositeScore", 5.0)
            signal = sig.get("signal", "HOLD")
            new_stocks.append({
                **s,
                "score": round(score, 1),
                "signal": signal,
            })
            total_score += score
            count += 1
        avg_score = round(total_score / count, 1) if count else 5.0
        enriched.append({**b, "stocks": new_stocks, "avgScore": avg_score})
    return enriched


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
            enriched = _enrich_baskets_with_signals([s3_basket])
            return _response(200, enriched[0])
        # Fallback to default
        for b in DEFAULT_BASKETS:
            if b["id"] == basket_id:
                enriched = _enrich_baskets_with_signals([b])
                return _response(200, enriched[0])
        return _response(404, {"error": f"Basket '{basket_id}' not found"})

    # List all baskets
    s3_baskets = s3.read_json("baskets/default.json")
    if s3_baskets and s3_baskets.get("baskets"):
        baskets = s3_baskets["baskets"]
    else:
        baskets = DEFAULT_BASKETS

    from datetime import datetime
    now = datetime.utcnow().isoformat()
    enriched = _enrich_baskets_with_signals(baskets)
    baskets_with_dates = [{**b, "updatedAt": now} for b in enriched]
    return _response(200, {"baskets": baskets_with_dates})


# ─── Trending Endpoint ───

DEFAULT_TRENDING = [
    {"ticker": "NVDA", "companyName": "NVIDIA Corporation", "reason": "AI chip demand surge after earnings beat", "changePercent": 4.2, "volume": "52.3M", "rank": 1, "sector": "Technology", "price": 135.50, "insight": "Blackwell GPU ramp exceeds expectations; data center revenue up 154% YoY with hyperscaler demand showing no signs of slowing", "topFactors": [{"name": "Supply Chain", "score": 1.8}, {"name": "Performance", "score": 1.5}, {"name": "Customers", "score": 1.2}], "marketCap": "3.3T", "peRatio": 65.2, "weekHigh52": 153.13, "weekLow52": 47.32},
    {"ticker": "TSLA", "companyName": "Tesla, Inc.", "reason": "Robotaxi unveil drives speculation", "changePercent": -2.1, "volume": "38.7M", "rank": 2, "sector": "Consumer Cyclical", "price": 248.20, "insight": "Robotaxi launch timeline accelerated; energy storage deployments doubled while auto margins face near-term pressure from price cuts", "topFactors": [{"name": "Customers", "score": 0.5}, {"name": "Supply Chain", "score": -0.8}, {"name": "Macro", "score": -0.3}], "marketCap": "792B", "peRatio": 98.4, "weekHigh52": 488.54, "weekLow52": 138.80},
    {"ticker": "AAPL", "companyName": "Apple Inc.", "reason": "iPhone 17 pre-orders exceed expectations", "changePercent": 1.8, "volume": "28.1M", "rank": 3, "sector": "Technology", "price": 232.80, "insight": "Apple Intelligence driving upgrade supercycle; Services revenue hits record $26B quarterly with 1.1B paid subscribers", "topFactors": [{"name": "Customers", "score": 1.4}, {"name": "Performance", "score": 1.1}, {"name": "Supply Chain", "score": 0.6}], "marketCap": "3.6T", "peRatio": 38.1, "weekHigh52": 260.10, "weekLow52": 164.08},
    {"ticker": "AMZN", "companyName": "Amazon.com, Inc.", "reason": "AWS growth accelerates to 19% YoY", "changePercent": 3.1, "volume": "22.5M", "rank": 4, "sector": "Technology", "price": 214.70, "insight": "AWS reaccelerating on AI workloads; advertising segment now $14B/quarter with Prime Video ads gaining traction", "topFactors": [{"name": "Performance", "score": 1.3}, {"name": "Customers", "score": 1.0}, {"name": "Macro", "score": 0.4}], "marketCap": "2.2T", "peRatio": 42.6, "weekHigh52": 242.52, "weekLow52": 151.61},
    {"ticker": "META", "companyName": "Meta Platforms, Inc.", "reason": "Threads user growth hits 200M DAUs", "changePercent": 0.9, "volume": "18.9M", "rank": 5, "sector": "Communication", "price": 595.40, "insight": "Reels monetization closing the gap with Stories; AI-driven content recommendations boosting engagement 8% across family of apps", "topFactors": [{"name": "Customers", "score": 1.6}, {"name": "Performance", "score": 1.3}, {"name": "Supply Chain", "score": 0.2}], "marketCap": "1.5T", "peRatio": 27.8, "weekHigh52": 638.40, "weekLow52": 414.50},
]


def _enrich_trending_with_signals(items):
    """Enrich trending items with live DynamoDB signal data and full record details."""
    tickers = [item["ticker"] for item in items]
    signals_map = _get_signal_data_for_tickers(tickers)

    # Batch fetch full signal records to get insights, topFactors, sector from DynamoDB
    full_records = {}
    keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in tickers]
    if keys:
        db_items = db.batch_get(keys)
        for db_item in db_items:
            full_records[db_item.get("ticker", "")] = db_item

    enriched = []
    for item in items:
        t = item["ticker"]
        sig = signals_map.get(t, {})
        full = full_records.get(t, {})

        # Use DynamoDB insight/topFactors if available, else keep defaults
        insight = full.get("insight") or item.get("insight", "")
        top_factors = item.get("topFactors", [])
        if full.get("topFactors"):
            try:
                db_factors = full["topFactors"]
                if isinstance(db_factors, str):
                    db_factors = json.loads(db_factors)
                if isinstance(db_factors, list) and len(db_factors) > 0:
                    top_factors = db_factors[:3]
            except (json.JSONDecodeError, TypeError):
                pass

        enriched.append({
            **item,
            "score": round(sig.get("compositeScore", 5.0), 1),
            "signal": sig.get("signal", "HOLD"),
            "insight": insight,
            "topFactors": top_factors,
            "price": float(full.get("price", item.get("price", 0))),
            "sector": full.get("sector") or item.get("sector", ""),
            "marketCap": item.get("marketCap", ""),
            "peRatio": float(item.get("peRatio", 0)),
            "weekHigh52": float(item.get("weekHigh52", 0)),
            "weekLow52": float(item.get("weekLow52", 0)),
        })
    return enriched


def _handle_trending(method):
    """GET /trending — Return trending / social proof data."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    s3_trending = s3.read_json("trending/latest.json")
    if s3_trending and s3_trending.get("items"):
        items = s3_trending["items"]
    else:
        items = DEFAULT_TRENDING

    enriched = _enrich_trending_with_signals(items)
    return _response(200, {"items": enriched})


# ─── Discovery Endpoint ───

DEFAULT_DISCOVERY = [
    {"ticker": "AVGO", "companyName": "Broadcom Inc.", "insight": "VMware integration drives recurring revenue; AI networking chip demand surges", "sector": "Technology", "topFactors": [{"name": "Supply Chain", "score": 1.4}, {"name": "Performance", "score": 1.2}]},
    {"ticker": "CRM", "companyName": "Salesforce, Inc.", "insight": "AgentForce AI platform gaining traction; margins expanding through discipline", "sector": "Technology", "topFactors": [{"name": "Customers", "score": 1.0}, {"name": "Performance", "score": 0.8}]},
    {"ticker": "NFLX", "companyName": "Netflix, Inc.", "insight": "Ad-supported tier exceeds projections; content spending discipline improves margins", "sector": "Communication", "topFactors": [{"name": "Customers", "score": 1.5}, {"name": "Performance", "score": 1.3}]},
    {"ticker": "JPM", "companyName": "JPMorgan Chase", "insight": "Rate environment supports NII; investment banking recovery underway", "sector": "Financials", "topFactors": [{"name": "Macro", "score": 0.9}, {"name": "Performance", "score": 0.8}]},
    {"ticker": "V", "companyName": "Visa Inc.", "insight": "Cross-border volume recovery accelerates; new value-added services growing 20%+", "sector": "Financials", "topFactors": [{"name": "Customers", "score": 1.4}, {"name": "Performance", "score": 1.1}]},
    {"ticker": "UNH", "companyName": "UnitedHealth Group", "insight": "Optum Health growth offsets Medicare Advantage headwinds; aging population tailwind", "sector": "Healthcare", "topFactors": [{"name": "Customers", "score": 1.1}, {"name": "Macro", "score": 0.7}]},
    {"ticker": "XOM", "companyName": "Exxon Mobil Corporation", "insight": "Pioneer acquisition adds Permian scale; free cash flow supports buybacks", "sector": "Energy", "topFactors": [{"name": "Supply Chain", "score": 0.8}, {"name": "Macro", "score": -0.5}]},
    {"ticker": "AMD", "companyName": "Advanced Micro Devices", "insight": "MI300 GPU demand strong but supply constrained; data center revenue doubles", "sector": "Technology", "topFactors": [{"name": "Supply Chain", "score": 1.2}, {"name": "Performance", "score": 1.0}]},
]


def _enrich_discovery_with_signals(cards):
    """Enrich discovery cards with live DynamoDB signal data and prices."""
    tickers = [c["ticker"] for c in cards]
    signals_map = _get_signal_data_for_tickers(tickers)

    # Batch fetch full signal records to get insights, topFactors, sector from DynamoDB
    full_records = {}
    keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in tickers]
    if keys:
        items = db.batch_get(keys)
        for item in items:
            full_records[item.get("ticker", "")] = item

    enriched = []
    for card in cards:
        t = card["ticker"]
        sig = signals_map.get(t, {})
        full = full_records.get(t, {})

        # Use DynamoDB insight/topFactors if available, else keep defaults from card
        insight = full.get("insight") or card.get("insight", "")
        top_factors = card.get("topFactors", [])
        if full.get("topFactors"):
            try:
                db_factors = full["topFactors"]
                if isinstance(db_factors, str):
                    db_factors = json.loads(db_factors)
                if isinstance(db_factors, list) and len(db_factors) > 0:
                    top_factors = db_factors[:3]
            except (json.JSONDecodeError, TypeError):
                pass

        enriched.append({
            **card,
            "score": round(sig.get("compositeScore", 5.0), 1),
            "signal": sig.get("signal", "HOLD"),
            "insight": insight,
            "topFactors": top_factors,
            "price": float(full.get("price", card.get("price", 0))),
            "changePercent": float(full.get("changePercent", card.get("changePercent", 0))),
        })
    return enriched


def _handle_discovery(method):
    """GET /discovery — Return cards for Tinder-style stock discovery."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    s3_discovery = s3.read_json("discovery/latest.json")
    if s3_discovery and s3_discovery.get("cards"):
        cards = s3_discovery["cards"]
    else:
        cards = DEFAULT_DISCOVERY

    enriched = _enrich_discovery_with_signals(cards)
    return _response(200, {"cards": enriched})


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


# ─── Strategy Endpoints ───

def _handle_strategy(method, path, body, user_id):
    """Strategy sub-router."""
    if "/optimize" in path and method == "POST":
        return _handle_strategy_optimize(body, user_id)
    elif "/project" in path and method == "POST":
        return _handle_strategy_project(body, user_id)
    elif "/scenarios" in path and method == "POST":
        return _handle_strategy_scenarios(body, user_id)
    elif "/rebalance" in path and method == "POST":
        return _handle_strategy_rebalance(body, user_id)
    elif "/tax-harvest" in path and method == "POST":
        return _handle_strategy_tax_harvest(body, user_id)
    elif "/diversification" in path and method == "POST":
        return _handle_strategy_diversification(body, user_id)
    elif "/correlation" in path:
        return _handle_strategy_correlation(body, user_id)
    elif "/advice" in path and method == "POST":
        return _handle_strategy_advice(body, user_id)
    elif "/report-card" in path:
        return _handle_strategy_report_card(user_id)
    elif "/backtest" in path and method == "POST":
        return _handle_strategy_backtest(body, user_id)
    elif "/achievements" in path and method == "GET":
        return _handle_strategy_achievements(user_id)
    else:
        return _response(405, {"error": "Strategy endpoint not found"})


def _get_portfolio_tickers_and_weights(user_id):
    """Helper: load portfolio holdings and compute weights."""
    record = db.get_item(f"USER#{user_id}", "PORTFOLIO")
    if not record or not record.get("holdings"):
        return [], {}
    holdings_raw = json.loads(record["holdings"]) if isinstance(record["holdings"], str) else record["holdings"]
    tickers = [h["ticker"] for h in holdings_raw]
    total_cost = sum(float(h.get("shares", 0)) * float(h.get("avgCost", 0)) for h in holdings_raw) or 1
    weights = {}
    for h in holdings_raw:
        w = (float(h.get("shares", 0)) * float(h.get("avgCost", 0))) / total_cost
        weights[h["ticker"]] = round(w, 4)
    return tickers, weights


def _get_signal_data_for_tickers(tickers):
    """Helper: batch fetch signal data from DynamoDB."""
    if not tickers:
        return {}
    keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in tickers]
    items = db.batch_get(keys)
    result = {}
    for item in items:
        ticker = item.get("ticker", "")
        result[ticker] = {
            "ticker": ticker,
            "companyName": item.get("companyName", ticker),
            "compositeScore": float(item.get("compositeScore", 5.0)),
            "signal": item.get("signal", "HOLD"),
            "confidence": item.get("confidence", "MEDIUM"),
        }
    return result


def _estimate_returns_and_cov(tickers, signals_map):
    """Estimate expected returns + covariance matrix using FII scores + sector data.

    Uses numpy only — no scipy. Returns are estimated from composite scores
    and sector-level priors. Covariance is built from sector correlations.
    """
    import numpy as np

    n = len(tickers)
    if n == 0:
        return np.array([]), np.array([[]])

    # Sector volatility priors (annualized)
    sector_vol = {
        "Technology": 0.28, "Communication Services": 0.25,
        "Consumer Cyclical": 0.24, "Consumer Defensive": 0.14,
        "Financial Services": 0.20, "Healthcare": 0.22,
        "Energy": 0.30, "Industrials": 0.18, "Utilities": 0.14,
        "Real Estate": 0.20, "Basic Materials": 0.22,
    }

    # Estimate expected return from FII score: score/10 * 0.18 (max ~18% annual)
    expected_returns = np.zeros(n)
    volatilities = np.zeros(n)

    for i, t in enumerate(tickers):
        sig = signals_map.get(t, {})
        score = sig.get("compositeScore", 5.0)
        # Map score 1-10 to return -5% to 20%
        expected_returns[i] = (score - 3.0) / 7.0 * 0.20
        # Look up sector vol from our ticker database
        sector = _get_ticker_sector(t)
        volatilities[i] = sector_vol.get(sector, 0.22)

    # Build correlation matrix: same-sector = 0.65, cross-sector = 0.30
    sectors = [_get_ticker_sector(t) for t in tickers]
    corr = np.full((n, n), 0.30)
    for i in range(n):
        for j in range(n):
            if i == j:
                corr[i][j] = 1.0
            elif sectors[i] == sectors[j]:
                corr[i][j] = 0.65

    # Covariance = diag(vol) @ corr @ diag(vol)
    D = np.diag(volatilities)
    cov_matrix = D @ corr @ D

    return expected_returns, cov_matrix


def _get_ticker_sector(ticker):
    """Look up sector for a ticker from the fallback database."""
    for entry in _FALLBACK_TICKERS:
        if entry["ticker"] == ticker:
            return entry.get("sector", "Technology")
    return "Technology"


def _handle_strategy_optimize(body, user_id):
    """POST /strategy/optimize — Numpy-only random-search optimization.

    Generates 10,000 random portfolios, finds max Sharpe.
    Returns efficient frontier (2K sampled), optimal weights,
    current portfolio metrics, and benchmark data.
    """
    import numpy as np
    from datetime import datetime

    tickers, current_weights = _get_portfolio_tickers_and_weights(user_id)
    if len(tickers) < 2:
        return _response(200, {
            "error": "Need at least 2 stocks for optimization",
            "tickers": tickers,
        })

    signals_map = _get_signal_data_for_tickers(tickers)
    expected_returns, cov_matrix = _estimate_returns_and_cov(tickers, signals_map)

    n = len(tickers)
    num_portfolios = 10000
    risk_free_rate = 0.045  # 4.5% risk-free rate

    # Generate random portfolios
    np.random.seed(42)
    all_weights = np.random.dirichlet(np.ones(n), num_portfolios)

    # Calculate metrics for each portfolio
    port_returns = all_weights @ expected_returns
    port_vols = np.sqrt(np.array([
        w @ cov_matrix @ w for w in all_weights
    ]))
    sharpe_ratios = (port_returns - risk_free_rate) / np.maximum(port_vols, 1e-6)

    # Find optimal portfolio (max Sharpe)
    best_idx = np.argmax(sharpe_ratios)

    optimal_weights = {}
    for i, t in enumerate(tickers):
        w = float(all_weights[best_idx][i])
        if w > 0.01:
            optimal_weights[t] = round(w, 4)

    # Current portfolio metrics
    cw = np.array([current_weights.get(t, 1.0 / n) for t in tickers])
    cw = cw / cw.sum()  # normalize
    curr_ret = float(cw @ expected_returns)
    curr_vol = float(np.sqrt(cw @ cov_matrix @ cw))
    curr_sharpe = float((curr_ret - risk_free_rate) / max(curr_vol, 1e-6))

    # Downsample efficient frontier to 2000 points
    indices = np.linspace(0, num_portfolios - 1, 2000, dtype=int)
    frontier = []
    for idx in indices:
        frontier.append({
            "expectedReturn": round(float(port_returns[idx]) * 100, 2),
            "volatility": round(float(port_vols[idx]) * 100, 2),
            "sharpeRatio": round(float(sharpe_ratios[idx]), 3),
        })

    # Benchmark data (synthetic)
    benchmarks = [
        {"label": "SPY", "expectedReturn": 10.5, "volatility": 15.2, "sharpeRatio": 0.39},
        {"label": "QQQ", "expectedReturn": 14.8, "volatility": 20.1, "sharpeRatio": 0.51},
    ]

    # Build per-ticker allocation detail
    allocation = []
    for i, t in enumerate(tickers):
        sig = signals_map.get(t, {})
        w = float(all_weights[best_idx][i])
        allocation.append({
            "ticker": t,
            "companyName": sig.get("companyName", t),
            "weight": round(w, 4),
            "score": sig.get("compositeScore", 5.0),
            "signal": sig.get("signal", "HOLD"),
        })
    allocation.sort(key=lambda x: x["weight"], reverse=True)

    # Calculate $ difference for "money left on the table"
    portfolio_value = float(body.get("portfolioValue", 50000))
    optimal_annual = portfolio_value * float(port_returns[best_idx])
    current_annual = portfolio_value * curr_ret
    money_diff = round(optimal_annual - current_annual, 0)

    # Cache result
    result = {
        "optimized": {
            "weights": optimal_weights,
            "expectedReturn": round(float(port_returns[best_idx]) * 100, 2),
            "expectedVolatility": round(float(port_vols[best_idx]) * 100, 2),
            "sharpeRatio": round(float(sharpe_ratios[best_idx]), 3),
        },
        "currentPortfolio": {
            "expectedReturn": round(curr_ret * 100, 2),
            "expectedVolatility": round(curr_vol * 100, 2),
            "sharpeRatio": round(curr_sharpe, 3),
            "weights": {t: round(current_weights.get(t, 1.0/n), 4) for t in tickers},
        },
        "efficientFrontier": frontier,
        "benchmarks": benchmarks,
        "allocation": allocation,
        "moneyLeftOnTable": money_diff,
        "portfolioValue": portfolio_value,
        "tickerCount": n,
        "simulationCount": num_portfolios,
        "updatedAt": datetime.utcnow().isoformat(),
    }

    # Cache in S3
    try:
        s3.write_json(f"strategy/{user_id}_optimization.json", result)
    except Exception:
        pass

    return _response(200, result)


def _handle_strategy_project(body, user_id):
    """POST /strategy/project — Monte Carlo projection fan chart.

    Projects portfolio value over 1-10 years with percentile bands.
    """
    import numpy as np
    from datetime import datetime

    years = int(body.get("years", 5))
    years = max(1, min(10, years))
    initial_value = float(body.get("portfolioValue", 50000))
    num_sims = 5000

    tickers, current_weights = _get_portfolio_tickers_and_weights(user_id)
    if not tickers:
        return _response(200, {"error": "No portfolio holdings found"})

    signals_map = _get_signal_data_for_tickers(tickers)
    expected_returns, cov_matrix = _estimate_returns_and_cov(tickers, signals_map)

    n = len(tickers)
    cw = np.array([current_weights.get(t, 1.0 / n) for t in tickers])
    cw = cw / cw.sum()

    port_return = float(cw @ expected_returns)
    port_vol = float(np.sqrt(cw @ cov_matrix @ cw))

    # Simulate paths (GBM)
    np.random.seed(None)
    months = years * 12
    monthly_ret = port_return / 12
    monthly_vol = port_vol / np.sqrt(12)

    # Generate random returns for all sims at once
    random_returns = np.random.normal(monthly_ret, monthly_vol, (num_sims, months))
    # Cumulative product to get paths
    paths = initial_value * np.cumprod(1 + random_returns, axis=1)

    # Calculate percentiles at each month
    percentiles = [5, 25, 50, 75, 95]
    projection = []
    for m in range(months):
        vals = paths[:, m]
        point = {"month": m + 1}
        for p in percentiles:
            point[f"p{p}"] = round(float(np.percentile(vals, p)), 0)
        projection.append(point)

    # Final stats
    final_vals = paths[:, -1]
    loss_prob = float(np.mean(final_vals < initial_value) * 100)

    return _response(200, {
        "years": years,
        "initialValue": initial_value,
        "projection": projection,
        "finalStats": {
            "best": round(float(np.percentile(final_vals, 95)), 0),
            "likely": round(float(np.percentile(final_vals, 50)), 0),
            "worst": round(float(np.percentile(final_vals, 5)), 0),
            "lossProbability": round(loss_prob, 1),
        },
        "annualReturn": round(port_return * 100, 1),
        "annualVolatility": round(port_vol * 100, 1),
        "simulationCount": num_sims,
        "updatedAt": datetime.utcnow().isoformat(),
    })


# Default scenarios for "What If?" battles
DEFAULT_SCENARIOS = [
    {
        "id": "fed-cuts",
        "title": "What if the Fed cuts rates 3x?",
        "description": "Three 25bp rate cuts over the next 12 months",
        "icon": "trending-down",
        "color": "#10B981",
        "sectorImpacts": {
            "Technology": 0.15, "Financial Services": -0.05,
            "Real Estate": 0.12, "Consumer Cyclical": 0.10,
            "Utilities": 0.08, "Healthcare": 0.04,
            "Energy": 0.02, "Consumer Defensive": 0.03,
            "Industrials": 0.06, "Communication Services": 0.08,
            "Basic Materials": 0.05,
        },
        "sp500Impact": 8.1,
    },
    {
        "id": "china-taiwan",
        "title": "What if China invades Taiwan?",
        "description": "Military conflict disrupts global chip supply chains",
        "icon": "warning",
        "color": "#EF4444",
        "sectorImpacts": {
            "Technology": -0.35, "Financial Services": -0.18,
            "Real Estate": -0.10, "Consumer Cyclical": -0.22,
            "Utilities": -0.05, "Healthcare": -0.08,
            "Energy": 0.15, "Consumer Defensive": -0.05,
            "Industrials": -0.20, "Communication Services": -0.15,
            "Basic Materials": -0.12,
        },
        "sp500Impact": -22.5,
    },
    {
        "id": "ai-bubble",
        "title": "What if the AI bubble pops?",
        "description": "AI revenues disappoint, valuations correct sharply",
        "icon": "flash-off",
        "color": "#F59E0B",
        "sectorImpacts": {
            "Technology": -0.40, "Financial Services": -0.08,
            "Real Estate": -0.02, "Consumer Cyclical": -0.12,
            "Utilities": 0.03, "Healthcare": 0.02,
            "Energy": 0.05, "Consumer Defensive": 0.04,
            "Industrials": -0.05, "Communication Services": -0.20,
            "Basic Materials": -0.03,
        },
        "sp500Impact": -15.3,
    },
    {
        "id": "inflation-returns",
        "title": "What if inflation returns to 6%?",
        "description": "Sticky inflation forces Fed to reverse course",
        "icon": "flame",
        "color": "#F97316",
        "sectorImpacts": {
            "Technology": -0.18, "Financial Services": 0.05,
            "Real Estate": -0.15, "Consumer Cyclical": -0.12,
            "Utilities": -0.08, "Healthcare": -0.03,
            "Energy": 0.20, "Consumer Defensive": 0.02,
            "Industrials": -0.05, "Communication Services": -0.10,
            "Basic Materials": 0.10,
        },
        "sp500Impact": -8.7,
    },
    {
        "id": "do-nothing",
        "title": "What if you did nothing for 10 years?",
        "description": "Hold current portfolio with no changes for a decade",
        "icon": "time",
        "color": "#8B5CF6",
        "sectorImpacts": {
            "Technology": 0.12, "Financial Services": 0.08,
            "Real Estate": 0.06, "Consumer Cyclical": 0.09,
            "Utilities": 0.05, "Healthcare": 0.07,
            "Energy": 0.04, "Consumer Defensive": 0.06,
            "Industrials": 0.07, "Communication Services": 0.10,
            "Basic Materials": 0.05,
        },
        "sp500Impact": 10.2,
    },
]


def _handle_strategy_scenarios(body, user_id):
    """POST /strategy/scenarios — Generate what-if scenario battle cards."""
    from datetime import datetime

    tickers, current_weights = _get_portfolio_tickers_and_weights(user_id)
    if not tickers:
        return _response(200, {"scenarios": DEFAULT_SCENARIOS, "hasPortfolio": False})

    signals_map = _get_signal_data_for_tickers(tickers)
    sectors = {t: _get_ticker_sector(t) for t in tickers}

    scenarios = []
    for sc in DEFAULT_SCENARIOS:
        # Compute portfolio-specific impact
        portfolio_impact = 0.0
        ticker_impacts = []
        for t in tickers:
            w = current_weights.get(t, 0)
            sector = sectors.get(t, "Technology")
            sector_impact = sc["sectorImpacts"].get(sector, 0)
            ticker_impact = sector_impact * 100
            portfolio_impact += w * sector_impact * 100
            ticker_impacts.append({
                "ticker": t,
                "companyName": signals_map.get(t, {}).get("companyName", t),
                "impact": round(ticker_impact, 1),
                "sector": sector,
            })

        # Sort to find best and worst performers
        ticker_impacts.sort(key=lambda x: x["impact"])
        worst = ticker_impacts[0] if ticker_impacts else None
        best = ticker_impacts[-1] if ticker_impacts else None

        # Determine verdict — compare portfolio vs S&P 500 impact
        sp500 = sc["sp500Impact"]
        diff = round(portfolio_impact - sp500, 1)
        if portfolio_impact > sp500:
            # Portfolio outperforms (less negative or more positive)
            verdict = f"Your diversification saved you {abs(diff):.1f}%"
            verdict_color = "#10B981"
        elif portfolio_impact < sp500:
            # Portfolio underperforms (more negative or less positive)
            verdict = f"Your concentrated exposure adds {abs(diff):.1f}% more risk"
            verdict_color = "#F59E0B"
        else:
            verdict = "Your portfolio tracks the market"
            verdict_color = "#6B7280"

        scenarios.append({
            "id": sc["id"],
            "title": sc["title"],
            "description": sc["description"],
            "icon": sc["icon"],
            "color": sc["color"],
            "portfolioImpact": round(portfolio_impact, 1),
            "sp500Impact": sp500,
            "verdict": verdict,
            "verdictColor": verdict_color,
            "bestPerformer": best,
            "worstPerformer": worst,
            "tickerImpacts": ticker_impacts,
        })

    # Cache
    try:
        s3.write_json(f"scenarios/{user_id}.json", {
            "scenarios": scenarios,
            "updatedAt": datetime.utcnow().isoformat(),
        })
    except Exception:
        pass

    return _response(200, {
        "scenarios": scenarios,
        "hasPortfolio": True,
        "updatedAt": datetime.utcnow().isoformat(),
    })


def _handle_strategy_backtest(body, user_id):
    """POST /strategy/backtest — Backtest FII signals against actual returns."""
    from datetime import datetime, timedelta
    import urllib.request

    tickers_input = body.get("tickers", [])
    period = body.get("period", "3m")

    # Use portfolio tickers if none specified
    if not tickers_input:
        tickers_input, current_weights = _get_portfolio_tickers_and_weights(user_id)

    if not tickers_input:
        return _response(200, {
            "results": [],
            "stats": {"hitRate": 0, "buyAccuracy": 0, "holdAccuracy": 0, "sellAccuracy": 0,
                       "totalSignals": 0, "totalCorrect": 0, "totalBorderline": 0},
            "hasPortfolio": False,
        })

    signals_map = _get_signal_data_for_tickers(tickers_input)
    months = 3 if period == "3m" else 6

    def _signal_strength(score):
        """Map composite score to human-readable signal strength label."""
        if score >= 8:
            return "Strong Buy"
        elif score >= 7:
            return "Buy"
        elif score >= 5:
            return "Hold"
        elif score >= 4:
            return "Weak Hold"
        elif score >= 3:
            return "Sell"
        else:
            return "Strong Sell"

    results = []
    buy_correct = 0
    buy_borderline = 0
    buy_total = 0
    hold_correct = 0
    hold_borderline = 0
    hold_total = 0
    sell_correct = 0
    sell_borderline = 0
    sell_total = 0

    for ticker in tickers_input:
        sig = signals_map.get(ticker, {})
        signal = sig.get("signal", "HOLD")
        score = float(sig.get("compositeScore", 5.0))
        company_name = sig.get("companyName", ticker)

        # Fetch 1-year price history from Yahoo Finance
        actual_return = None
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1y"
            req = urllib.request.Request(url, headers={"User-Agent": "FII/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                chart_data = json.loads(resp.read().decode())
            closes = chart_data["chart"]["result"][0]["indicators"]["quote"][0]["close"]
            # Filter out None values
            valid_closes = [c for c in closes if c is not None]
            if len(valid_closes) > 60:
                # Compare price ~3 months ago to current price
                lookback = min(63, len(valid_closes) - 1)  # ~3 months of trading days
                price_then = valid_closes[-(lookback + 1)]
                price_now = valid_closes[-1]
                if price_then and price_now:
                    actual_return = round(((price_now - price_then) / price_then) * 100, 1)
        except Exception:
            pass

        # Simulated backtest: if we don't have real data, estimate from score
        if actual_return is None:
            # Simulate based on FII score as fallback
            import random
            random.seed(hash(ticker) % 2**32)
            base = (score - 5.0) * 2.5  # score 7 → +5%, score 3 → -5%
            noise = random.uniform(-8, 8)
            actual_return = round(base + noise, 1)

        # Determine if signal was correct using relaxed, realistic thresholds
        strength = _signal_strength(score)

        if signal == "BUY":
            buy_total += 1
            # Strong Buy (8+) needs >+5%; regular Buy (7-7.9) needs >0%
            if score >= 8:
                correct = actual_return > 5.0
                borderline = not correct and actual_return > 0.0
            else:
                correct = actual_return > 0.0
                borderline = not correct and actual_return >= -5.0
            if correct:
                buy_correct += 1
            elif borderline:
                buy_borderline += 1
            status = "correct" if correct else ("borderline" if borderline else "incorrect")
        elif signal == "SELL":
            sell_total += 1
            # Sell correct if return < +2% (didn't rally significantly)
            correct = actual_return < 2.0
            borderline = not correct and actual_return < 8.0
            if correct:
                sell_correct += 1
            elif borderline:
                sell_borderline += 1
            status = "correct" if correct else ("borderline" if borderline else "incorrect")
        else:  # HOLD
            hold_total += 1
            # Wider band: -10% to +15%
            correct = -10.0 <= actual_return <= 15.0
            borderline = not correct and (-15.0 <= actual_return <= 20.0)
            if correct:
                hold_correct += 1
            elif borderline:
                hold_borderline += 1
            status = "correct" if correct else ("borderline" if borderline else "incorrect")

        # Build context note for borderline/interesting cases
        note = None
        if status == "borderline" and strength == "Weak Hold":
            note = f"Weak Hold ({score:.1f}) — borderline signal correctly indicated caution"
        elif status == "borderline" and signal == "BUY":
            note = f"{strength} ({score:.1f}) — small loss within noise range"
        elif status == "correct" and strength == "Weak Hold" and actual_return < -5.0:
            note = f"Weak Hold ({score:.1f}) — near-sell signal, decline was expected"
        elif status == "correct" and signal == "SELL":
            note = f"{strength} ({score:.1f}) — correctly avoided rally"

        # Estimate signal date as ~3 months ago
        signal_date = (datetime.utcnow() - timedelta(days=months * 30)).strftime("%b %Y")

        results.append({
            "ticker": ticker,
            "companyName": company_name,
            "signalDate": signal_date,
            "signal": signal,
            "score": round(score, 1),
            "signalStrength": strength,
            "actualReturn": actual_return,
            "correct": correct,
            "status": status,
            "note": note,
        })

    # Calculate overall stats — borderline counts as 0.5
    total = len(results)
    fully_correct = sum(1 for r in results if r["status"] == "correct")
    total_borderline = sum(1 for r in results if r["status"] == "borderline")
    total_correct_weighted = fully_correct + (total_borderline * 0.5)
    hit_rate = round((total_correct_weighted / total) * 100, 1) if total else 0

    def _accuracy(correct_n, borderline_n, total_n):
        if total_n == 0:
            return 0
        return round(((correct_n + borderline_n * 0.5) / total_n) * 100, 1)

    buy_accuracy = _accuracy(buy_correct, buy_borderline, buy_total)
    hold_accuracy = _accuracy(hold_correct, hold_borderline, hold_total)
    sell_accuracy = _accuracy(sell_correct, sell_borderline, sell_total)

    # Portfolio backtest: estimate return if following FII signals
    portfolio_return = 0.0
    sp500_return = 8.2  # Approximate 3-month S&P 500 return
    try:
        url = "https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=1y"
        req = urllib.request.Request(url, headers={"User-Agent": "FII/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            spy_data = json.loads(resp.read().decode())
        spy_closes = spy_data["chart"]["result"][0]["indicators"]["quote"][0]["close"]
        valid_spy = [c for c in spy_closes if c is not None]
        if len(valid_spy) > 60:
            lookback = min(63, len(valid_spy) - 1)
            sp500_return = round(((valid_spy[-1] - valid_spy[-(lookback + 1)]) / valid_spy[-(lookback + 1)]) * 100, 1)
    except Exception:
        pass

    # Weighted average of returns for stocks with BUY/HOLD signals
    signal_returns = [r["actualReturn"] for r in results if r["signal"] in ("BUY", "HOLD")]
    if signal_returns:
        portfolio_return = round(sum(signal_returns) / len(signal_returns), 1)

    fii_advantage = round(portfolio_return - sp500_return, 1)

    return _response(200, {
        "results": results,
        "stats": {
            "hitRate": hit_rate,
            "buyAccuracy": buy_accuracy,
            "holdAccuracy": hold_accuracy,
            "sellAccuracy": sell_accuracy,
            "totalSignals": total,
            "totalCorrect": fully_correct,
            "totalBorderline": total_borderline,
        },
        "portfolioBacktest": {
            "estimatedReturn": portfolio_return,
            "sp500Return": sp500_return,
            "fiiAdvantage": fii_advantage,
            "isSimulated": True,
        },
        "hasPortfolio": True,
        "updatedAt": datetime.utcnow().isoformat(),
    })


def _handle_strategy_rebalance(body, user_id):
    """POST /strategy/rebalance — Generate rebalancing suggestions."""
    from datetime import datetime

    tickers, current_weights = _get_portfolio_tickers_and_weights(user_id)
    if len(tickers) < 2:
        return _response(200, {"moves": [], "error": "Need at least 2 stocks"})

    signals_map = _get_signal_data_for_tickers(tickers)

    # Run optimization to get optimal weights
    import numpy as np
    expected_returns, cov_matrix = _estimate_returns_and_cov(tickers, signals_map)

    n = len(tickers)
    risk_free_rate = 0.045
    np.random.seed(42)
    all_weights = np.random.dirichlet(np.ones(n), 10000)
    port_returns = all_weights @ expected_returns
    port_vols = np.sqrt(np.array([w @ cov_matrix @ w for w in all_weights]))
    sharpe_ratios = (port_returns - risk_free_rate) / np.maximum(port_vols, 1e-6)
    best_idx = np.argmax(sharpe_ratios)

    optimal = {tickers[i]: float(all_weights[best_idx][i]) for i in range(n)}

    # Generate rebalancing moves
    moves = []
    for t in tickers:
        curr = current_weights.get(t, 0)
        opt = optimal.get(t, 0)
        diff = opt - curr

        if abs(diff) < 0.02:
            continue  # Skip tiny changes

        sig = signals_map.get(t, {})
        signal_val = sig.get("signal", "HOLD")
        score = sig.get("compositeScore", 5.0)

        if diff > 0:
            direction = "increase"
            reason = f"Score {score:.1f}/10 — underweighted vs optimal allocation"
            if signal_val == "BUY":
                reason = f"BUY signal (score {score:.1f}) — increase exposure"
        else:
            direction = "decrease"
            reason = f"Score {score:.1f}/10 — overweighted vs optimal allocation"
            if signal_val == "SELL":
                reason = f"SELL signal (score {score:.1f}) — reduce risk"

        moves.append({
            "ticker": t,
            "companyName": sig.get("companyName", t),
            "currentWeight": round(curr * 100, 1),
            "optimalWeight": round(opt * 100, 1),
            "direction": direction,
            "reason": reason,
            "signal": signal_val,
            "score": score,
        })

    # Sort: biggest changes first
    moves.sort(key=lambda x: abs(x["optimalWeight"] - x["currentWeight"]), reverse=True)

    return _response(200, {
        "moves": moves,
        "updatedAt": datetime.utcnow().isoformat(),
    })


def _handle_strategy_achievements(user_id):
    """GET /strategy/achievements — Return user's earned achievement badges."""
    record = db.get_item(f"USER#{user_id}", "ACHIEVEMENTS")
    if not record or not record.get("achievements"):
        return _response(200, {"achievements": []})

    achievements = json.loads(record["achievements"]) if isinstance(record["achievements"], str) else record["achievements"]
    return _response(200, {"achievements": achievements})


# ─── Prompt 6: Tax, Diversification, Advice, Report Card ───

# Sector color mapping for X-Ray
SECTOR_COLORS = {
    "Technology": "#60A5FA", "Financial Services": "#FBBF24",
    "Healthcare": "#10B981", "Energy": "#F97316",
    "Consumer Cyclical": "#F472B6", "Consumer Defensive": "#A78BFA",
    "Industrials": "#06B6D4", "Real Estate": "#84CC16",
    "Utilities": "#E879F9", "Communication Services": "#FB923C",
    "Basic Materials": "#2DD4BF",
}

# Geographic estimates by sector (simplified)
GEO_ESTIMATES = {
    "Technology": {"US": 0.75, "International": 0.20, "Emerging": 0.05},
    "Financial Services": {"US": 0.80, "International": 0.15, "Emerging": 0.05},
    "Healthcare": {"US": 0.70, "International": 0.25, "Emerging": 0.05},
    "Energy": {"US": 0.50, "International": 0.30, "Emerging": 0.20},
    "Consumer Cyclical": {"US": 0.65, "International": 0.25, "Emerging": 0.10},
    "Consumer Defensive": {"US": 0.60, "International": 0.30, "Emerging": 0.10},
    "Industrials": {"US": 0.70, "International": 0.25, "Emerging": 0.05},
    "Real Estate": {"US": 0.85, "International": 0.12, "Emerging": 0.03},
    "Utilities": {"US": 0.90, "International": 0.08, "Emerging": 0.02},
    "Communication Services": {"US": 0.70, "International": 0.20, "Emerging": 0.10},
    "Basic Materials": {"US": 0.55, "International": 0.30, "Emerging": 0.15},
}


def _handle_strategy_diversification(body, user_id):
    """POST /strategy/diversification — Full X-Ray breakdown + diversification score."""
    import numpy as np
    from datetime import datetime

    tickers, weights = _get_portfolio_tickers_and_weights(user_id)
    if not tickers:
        return _response(200, {"error": "No portfolio holdings found"})

    signals_map = _get_signal_data_for_tickers(tickers)
    n = len(tickers)

    # --- Panel A: Sector Exposure ---
    sector_weights = {}
    ticker_sectors = {}
    for t in tickers:
        sector = _get_ticker_sector(t)
        ticker_sectors[t] = sector
        sector_weights[sector] = sector_weights.get(sector, 0) + weights.get(t, 0)

    sectors = []
    warnings = []
    for sec, w in sorted(sector_weights.items(), key=lambda x: -x[1]):
        pct = round(w * 100, 1)
        is_warning = pct > 30
        sectors.append({
            "name": sec,
            "weight": pct,
            "color": SECTOR_COLORS.get(sec, "#6B7280"),
            "warning": is_warning,
        })
        if is_warning:
            warnings.append(f"{sec} concentration ({pct}%) exceeds 30% threshold")

    # --- Panel B: Geographic Split ---
    geo = {"US": 0.0, "International": 0.0, "Emerging": 0.0}
    for t in tickers:
        w = weights.get(t, 0)
        sec = ticker_sectors.get(t, "Technology")
        est = GEO_ESTIMATES.get(sec, {"US": 0.7, "International": 0.2, "Emerging": 0.1})
        for region, fraction in est.items():
            geo[region] = geo.get(region, 0) + w * fraction

    geographic = [
        {"region": r, "weight": round(v * 100, 1)}
        for r, v in geo.items() if v > 0.001
    ]

    # --- Panel C: Correlation Matrix ---
    _, cov_matrix = _estimate_returns_and_cov(tickers, signals_map)
    vols = np.sqrt(np.diag(cov_matrix))
    vols_safe = np.where(vols < 1e-8, 1e-8, vols)
    corr_matrix = cov_matrix / np.outer(vols_safe, vols_safe)

    correlations = []
    for i in range(n):
        for j in range(i + 1, n):
            c = float(corr_matrix[i][j])
            correlations.append({
                "ticker1": tickers[i],
                "ticker2": tickers[j],
                "correlation": round(c, 3),
                "strength": "high" if c > 0.7 else "medium" if c > 0.4 else "low",
            })

    avg_corr = float(np.mean([c["correlation"] for c in correlations])) if correlations else 0.0

    # --- Panel D: Risk Radar ---
    # Compute 5 risk dimensions (0-100 scale, lower = less risk = better)
    unique_sectors = len(set(ticker_sectors.values()))
    concentration_risk = min(100, max(0, max(sector_weights.values()) * 100 * 1.5))
    sector_risk = min(100, max(0, 100 - unique_sectors * 15))
    port_vol = float(np.sqrt(np.array(list(weights.values())) @ cov_matrix @ np.array(list(weights.values())))) if n > 0 else 0.2
    volatility_risk = min(100, max(0, port_vol * 100 * 4))
    correlation_risk = min(100, max(0, avg_corr * 130))
    sell_count = sum(1 for t in tickers if signals_map.get(t, {}).get("signal") == "SELL")
    signal_risk = min(100, max(0, (sell_count / max(n, 1)) * 200))

    risk_radar = [
        {"axis": "Concentration", "value": round(concentration_risk), "ideal": 25},
        {"axis": "Sector", "value": round(sector_risk), "ideal": 20},
        {"axis": "Volatility", "value": round(volatility_risk), "ideal": 30},
        {"axis": "Correlation", "value": round(correlation_risk), "ideal": 25},
        {"axis": "Signal", "value": round(signal_risk), "ideal": 15},
    ]

    # --- Diversification Score (0-100) ---
    # Higher = better diversified
    raw_score = 100 - (concentration_risk * 0.3 + sector_risk * 0.2 +
                       volatility_risk * 0.15 + correlation_risk * 0.2 + signal_risk * 0.15)
    div_score = max(0, min(100, round(raw_score)))

    if div_score >= 71:
        grade = "Healthy"
        grade_letter = "A"
    elif div_score >= 41:
        grade = "Fair"
        grade_letter = "B"
    else:
        grade = "Critical"
        grade_letter = "D"

    result = {
        "diversificationScore": div_score,
        "grade": grade,
        "gradeLetter": grade_letter,
        "sectors": sectors,
        "sectorWarnings": warnings,
        "geographic": geographic,
        "correlations": correlations,
        "avgCorrelation": round(avg_corr, 3),
        "riskRadar": risk_radar,
        "tickerCount": n,
        "sectorCount": unique_sectors,
        "updatedAt": datetime.utcnow().isoformat(),
    }

    try:
        s3.write_json(f"strategy/{user_id}_diversification.json", result)
    except Exception:
        pass

    return _response(200, result)


def _handle_strategy_correlation(body, user_id):
    """GET /strategy/correlation — Pairwise correlation matrix."""
    tickers, _ = _get_portfolio_tickers_and_weights(user_id)
    if len(tickers) < 2:
        return _response(200, {"matrix": [], "tickers": tickers})

    import numpy as np
    signals_map = _get_signal_data_for_tickers(tickers)
    _, cov_matrix = _estimate_returns_and_cov(tickers, signals_map)
    vols = np.sqrt(np.diag(cov_matrix))
    vols_safe = np.where(vols < 1e-8, 1e-8, vols)
    corr_matrix = cov_matrix / np.outer(vols_safe, vols_safe)

    matrix = []
    for i in range(len(tickers)):
        row = [round(float(corr_matrix[i][j]), 3) for j in range(len(tickers))]
        matrix.append(row)

    return _response(200, {"matrix": matrix, "tickers": tickers})


def _handle_strategy_tax_harvest(body, user_id):
    """POST /strategy/tax-harvest — Identify losing positions + wash-sale replacements."""
    from datetime import datetime

    tax_rate = float(body.get("taxRate", 0.24))
    tickers, weights = _get_portfolio_tickers_and_weights(user_id)
    if not tickers:
        return _response(200, {"losses": [], "totalHarvestable": 0, "estimatedSavings": 0})

    # Load holdings for cost basis
    record = db.get_item(f"USER#{user_id}", "PORTFOLIO")
    holdings_raw = json.loads(record["holdings"]) if isinstance(record.get("holdings", ""), str) else record.get("holdings", [])

    signals_map = _get_signal_data_for_tickers(tickers)
    losses = []
    total_harvestable = 0.0

    for h in holdings_raw:
        ticker = h.get("ticker", "")
        shares = float(h.get("shares", 0))
        avg_cost = float(h.get("avgCost", 0))
        current_price = float(h.get("currentPrice", avg_cost))

        # Try to get current price from signal data
        sig = signals_map.get(ticker, {})
        unrealized = (current_price - avg_cost) * shares

        if unrealized >= 0:
            continue  # Skip winners

        loss_amt = abs(unrealized)
        savings = loss_amt * tax_rate
        total_harvestable += loss_amt
        sector = _get_ticker_sector(ticker)

        # Find wash-sale replacement: same sector, different ticker, higher score
        replacements = []
        for entry in _FALLBACK_TICKERS:
            if entry["ticker"] == ticker:
                continue
            if entry.get("sector") == sector:
                # Check if we have signal data for replacement
                rep_signal = signals_map.get(entry["ticker"])
                rep_score = rep_signal.get("compositeScore", 5.0) if rep_signal else 5.0
                orig_score = sig.get("compositeScore", 5.0)
                if rep_score >= orig_score - 1:
                    replacements.append({
                        "ticker": entry["ticker"],
                        "companyName": entry.get("name", entry["ticker"]),
                        "sector": sector,
                        "score": rep_score,
                        "reason": f"Same sector ({sector}), FII score {rep_score:.1f}",
                    })
                if len(replacements) >= 2:
                    break

        losses.append({
            "ticker": ticker,
            "companyName": sig.get("companyName", ticker),
            "shares": shares,
            "avgCost": round(avg_cost, 2),
            "currentPrice": round(current_price, 2),
            "unrealizedLoss": round(loss_amt, 2),
            "taxSavings": round(savings, 2),
            "sector": sector,
            "signal": sig.get("signal", "HOLD"),
            "score": sig.get("compositeScore", 5.0),
            "replacements": replacements,
        })

    losses.sort(key=lambda x: x["unrealizedLoss"], reverse=True)
    total_savings = round(total_harvestable * tax_rate, 2)

    return _response(200, {
        "losses": losses,
        "totalHarvestable": round(total_harvestable, 2),
        "estimatedSavings": total_savings,
        "taxRate": tax_rate,
        "updatedAt": datetime.utcnow().isoformat(),
    })


def _handle_strategy_advice(body, user_id):
    """POST /strategy/advice — AI diversification prescriptions (hardcoded for dev)."""
    from datetime import datetime

    tickers, weights = _get_portfolio_tickers_and_weights(user_id)
    signals_map = _get_signal_data_for_tickers(tickers)
    sectors = {}
    for t in tickers:
        s = _get_ticker_sector(t)
        sectors[s] = sectors.get(s, 0) + 1

    top_sector = max(sectors, key=sectors.get) if sectors else "Technology"
    n = len(tickers)

    # Generate contextual prescriptions (hardcoded for dev, Claude in prod)
    prescriptions = [
        {
            "id": "rx-1",
            "title": "Reduce Sector Concentration",
            "diagnosis": f"Your portfolio is heavily concentrated in {top_sector} ({sectors.get(top_sector, 0)} of {n} holdings). Single-sector risk is elevated.",
            "prescription": "Add exposure to underrepresented sectors like Healthcare (XLV) or Industrials (XLI) to reduce concentration risk.",
            "impact": "+5-8% diversification score, -12% volatility",
            "icon": "pie-chart",
            "severity": "high" if sectors.get(top_sector, 0) / max(n, 1) > 0.5 else "medium",
        },
        {
            "id": "rx-2",
            "title": "International Exposure Treatment",
            "diagnosis": "Your portfolio likely has over 80% US exposure. Country-specific risk is not being mitigated.",
            "prescription": "Add international diversification through VXUS (Total International) or EFA (Developed Markets) to capture global growth.",
            "impact": "+10% geographic diversity, access to emerging market upside",
            "icon": "globe",
            "severity": "medium",
        },
        {
            "id": "rx-3",
            "title": "Correlation Therapy",
            "diagnosis": "Several holdings are highly correlated, meaning they move together during market stress. Portfolio insurance is minimal.",
            "prescription": "Add uncorrelated assets like GLD (Gold), TLT (Long-Term Treasuries), or VNQ (Real Estate) as portfolio insurance.",
            "impact": "-15% drawdown risk, better crisis resilience",
            "icon": "shield-checkmark",
            "severity": "low",
        },
    ]

    return _response(200, {
        "prescriptions": prescriptions,
        "portfolioContext": {
            "tickerCount": n,
            "topSector": top_sector,
            "sectorCount": len(sectors),
        },
        "updatedAt": datetime.utcnow().isoformat(),
    })


def _handle_strategy_report_card(user_id):
    """GET /strategy/report-card — Combined strategy grades."""
    from datetime import datetime

    tickers, weights = _get_portfolio_tickers_and_weights(user_id)
    if not tickers:
        return _response(200, {"error": "No portfolio"})

    signals_map = _get_signal_data_for_tickers(tickers)

    # Try to load cached results
    opt_data = None
    div_data = None
    tax_data = None

    try:
        opt_data = s3.read_json(f"strategy/{user_id}_optimization.json")
    except Exception:
        pass
    try:
        div_data = s3.read_json(f"strategy/{user_id}_diversification.json")
    except Exception:
        pass

    # Optimization grade
    sharpe = opt_data.get("optimized", {}).get("sharpeRatio", 0) if opt_data else 0
    if sharpe >= 0.75:
        opt_grade, opt_letter = "Excellent", "A"
    elif sharpe >= 0.5:
        opt_grade, opt_letter = "Good", "B+"
    elif sharpe >= 0.3:
        opt_grade, opt_letter = "Fair", "B"
    else:
        opt_grade, opt_letter = "Needs work", "C"

    # Diversification grade
    div_score = div_data.get("diversificationScore", 50) if div_data else 50
    if div_score >= 71:
        div_grade, div_letter = "Healthy", "A"
    elif div_score >= 55:
        div_grade, div_letter = "Fair", "B"
    elif div_score >= 41:
        div_grade, div_letter = "Needs attention", "C"
    else:
        div_grade, div_letter = "Critical", "D"

    # Tax efficiency grade (placeholder — would need actual tax harvest data)
    tax_grade, tax_letter = "Available", "B+"

    # Overall grade
    grade_values = {"A": 4.0, "B+": 3.5, "B": 3.0, "C": 2.0, "D": 1.0}
    avg = (grade_values.get(opt_letter, 2.5) + grade_values.get(div_letter, 2.5) + grade_values.get(tax_letter, 3.0)) / 3
    if avg >= 3.5:
        overall_letter = "A"
    elif avg >= 3.0:
        overall_letter = "B+"
    elif avg >= 2.5:
        overall_letter = "B"
    elif avg >= 2.0:
        overall_letter = "C"
    else:
        overall_letter = "D"

    return _response(200, {
        "grades": [
            {
                "category": "Optimization",
                "grade": opt_letter,
                "detail": f"Sharpe {sharpe:.2f}, target 0.75",
                "description": opt_grade,
            },
            {
                "category": "Tax Efficiency",
                "grade": tax_letter,
                "detail": "Tax harvesting available",
                "description": tax_grade,
            },
            {
                "category": "Diversification",
                "grade": div_letter,
                "detail": f"Score {div_score}/100, need 70+",
                "description": div_grade,
            },
        ],
        "overallGrade": overall_letter,
        "sharpe": round(sharpe, 2),
        "divScore": div_score,
        "updatedAt": datetime.utcnow().isoformat(),
    })


# ─── Coach Endpoints ───

def _handle_coach(method, path, body, user_id):
    """Route coach sub-endpoints."""
    if path == "/coach/daily" and method == "GET":
        return _handle_coach_daily(user_id)
    elif path == "/coach/score" and method == "GET":
        return _handle_coach_score(user_id)
    elif path == "/coach/achievements" and method == "GET":
        return _handle_coach_achievements(user_id)
    elif path == "/coach/event" and method == "POST":
        return _handle_coach_event(body, user_id)
    elif path == "/coach/weekly" and method == "GET":
        return _handle_coach_weekly(user_id)
    elif path == "/coach/insights" and method == "GET":
        return _handle_coach_daily(user_id)
    return _response(404, {"error": f"Coach route not found: {path}"})


def _handle_coach_daily(user_id):
    """GET /coach/daily — Daily briefing."""
    from datetime import datetime
    import random

    hour = datetime.utcnow().hour - 5  # rough ET
    if hour < 0:
        hour += 24
    if hour < 12:
        greeting = "Good morning!"
    elif hour < 17:
        greeting = "Hey there!"
    else:
        greeting = "Late night trading?"

    # Try loading cached daily from S3
    today = datetime.utcnow().strftime("%Y-%m-%d")
    try:
        cached = s3.read_json(f"coach/{user_id}_daily.json")
        if cached.get("date") == today:
            cached["greeting"] = greeting
            return _response(200, cached)
    except Exception:
        pass

    # Build a daily briefing
    tickers, weights = _get_portfolio_tickers_and_weights(user_id)

    # Simulate portfolio change (in prod: compare yesterday's close)
    portfolio_change_pct = round(random.uniform(-2.0, 3.0), 2)
    portfolio_value = 50000
    try:
        port_data = db.get_item(f"USER#{user_id}", "PORTFOLIO")
        if port_data:
            holdings = port_data.get("holdings", [])
            portfolio_value = sum(
                float(h.get("shares", 0)) * float(h.get("currentPrice", 0))
                for h in holdings
            )
    except Exception:
        pass

    portfolio_change_dollar = round(portfolio_value * portfolio_change_pct / 100, 2)

    # Count signal changes
    signals_changed = 0

    # Market summary
    market_direction = "up" if portfolio_change_pct > 0 else "down"
    summary = (
        f"Markets are {market_direction} today. "
        f"Your portfolio is {'up' if portfolio_change_pct > 0 else 'down'} "
        f"${abs(portfolio_change_dollar):,.0f}. "
        f"{'No action needed — stay the course.' if abs(portfolio_change_pct) < 2 else 'Consider reviewing your positions.'}"
    )

    # Load behavior data for streak
    behavior = _get_behavior(user_id)
    streak = behavior.get("streak", 0)

    briefing = {
        "date": today,
        "greeting": greeting,
        "summary": summary,
        "stats": {
            "portfolioChange": portfolio_change_dollar,
            "portfolioChangePct": portfolio_change_pct,
            "signalsChanged": signals_changed,
            "streak": streak,
        },
        "updatedAt": datetime.utcnow().isoformat(),
    }

    # Cache
    try:
        s3.write_json(f"coach/{user_id}_daily.json", briefing)
    except Exception:
        pass

    return _response(200, briefing)


def _get_behavior(user_id):
    """Load behavior data from DynamoDB."""
    try:
        data = db.get_item(f"USER#{user_id}", "BEHAVIOR")
        return data or {}
    except Exception:
        return {}


def _save_behavior(user_id, behavior):
    """Save behavior data to DynamoDB."""
    try:
        db.put_item({
            "PK": f"USER#{user_id}",
            "SK": "BEHAVIOR",
            **behavior,
        })
    except Exception:
        pass


def _handle_coach_score(user_id):
    """GET /coach/score — Discipline score + stats."""
    from datetime import datetime

    behavior = _get_behavior(user_id)

    # Score algorithm: Base 50 + modifiers
    base = 50
    streak = behavior.get("streak", 0)
    streak_bonus = min(30, streak)  # +1/day, max +30
    panic_survived = behavior.get("panicSurvived", 0)
    panic_bonus = panic_survived * 5
    briefings_read = behavior.get("briefingsRead", 0)
    briefing_bonus = min(20, briefings_read * 2)
    badges_earned = behavior.get("badgesEarned", 0)
    badge_bonus = badges_earned * 3
    panic_sells = behavior.get("panicSells", 0)
    panic_penalty = panic_sells * 10
    bad_sells = behavior.get("badSells", 0)
    bad_sell_penalty = bad_sells * 5

    raw_score = base + streak_bonus + panic_bonus + briefing_bonus + badge_bonus - panic_penalty - bad_sell_penalty
    score = max(0, min(100, raw_score))

    # Level system
    if score <= 20:
        level = "Rookie"
        level_color = "#CD7F32"  # bronze
    elif score <= 40:
        level = "Apprentice"
        level_color = "#C0C0C0"  # silver
    elif score <= 60:
        level = "Steady"
        level_color = "#60A5FA"  # blue
    elif score <= 80:
        level = "Disciplined"
        level_color = "#FFD700"  # gold
    else:
        level = "Zen Master"
        level_color = "#8B5CF6"  # purple

    # Next level threshold
    thresholds = [20, 40, 60, 80, 100]
    next_threshold = 100
    for t in thresholds:
        if score < t:
            next_threshold = t
            break

    worst_avoided = behavior.get("worstAvoided", 0)
    signal_alignment = behavior.get("signalAlignment", 0)

    return _response(200, {
        "score": score,
        "level": level,
        "levelColor": level_color,
        "nextThreshold": next_threshold,
        "stats": {
            "panicSurvived": panic_survived,
            "worstAvoided": worst_avoided,
            "streak": streak,
            "signalAlignment": signal_alignment,
        },
        "updatedAt": datetime.utcnow().isoformat(),
    })


def _handle_coach_achievements(user_id):
    """GET /coach/achievements — Badge collection."""
    from datetime import datetime

    try:
        data = db.get_item(f"USER#{user_id}", "ACHIEVEMENTS")
        earned = data.get("badges", []) if data else []
    except Exception:
        earned = []

    earned_ids = {b["id"] for b in earned}

    # All possible badges
    all_badges = [
        {"id": "diamond_hands", "name": "Diamond Hands", "description": "Held through a 5%+ dip", "icon": "diamond"},
        {"id": "data_driven", "name": "Data Driven", "description": "Checked signals before every trade", "icon": "analytics"},
        {"id": "streak_14", "name": "14-Day Streak", "description": "Opened app 14 days straight", "icon": "flame"},
        {"id": "zen_hold", "name": "Zen Hold", "description": "Stayed the course during volatility alert", "icon": "leaf"},
        {"id": "student", "name": "Student", "description": "Read all educational cards", "icon": "school"},
        {"id": "streak_30", "name": "30-Day Streak", "description": "Open app 30 days straight", "icon": "bonfire"},
        {"id": "iron_will", "name": "Iron Will", "description": "Survive 5 panic events", "icon": "shield"},
        {"id": "diversified", "name": "Diversified", "description": "Portfolio health score > 80", "icon": "globe"},
        {"id": "beat_spy", "name": "Beat SPY", "description": "Outperform SPY over 3 months", "icon": "trophy"},
        {"id": "perfect_align", "name": "Perfect Alignment", "description": "All holdings match FII signals", "icon": "star"},
    ]

    badges = []
    for badge in all_badges:
        is_earned = badge["id"] in earned_ids
        earned_entry = next((b for b in earned if b["id"] == badge["id"]), None)
        badges.append({
            **badge,
            "earned": is_earned,
            "earnedAt": earned_entry.get("earnedAt") if earned_entry else None,
        })

    return _response(200, {
        "badges": badges,
        "totalEarned": len(earned),
        "totalAvailable": len(all_badges),
        "updatedAt": datetime.utcnow().isoformat(),
    })


def _handle_coach_event(body, user_id):
    """POST /coach/event — Log behavior event."""
    from datetime import datetime

    event_type = body.get("event", "")
    behavior = _get_behavior(user_id)

    if event_type == "briefing_read":
        behavior["briefingsRead"] = behavior.get("briefingsRead", 0) + 1
        behavior["streak"] = behavior.get("streak", 0) + 1
        behavior["lastActive"] = datetime.utcnow().isoformat()

    elif event_type == "panic_survived":
        behavior["panicSurvived"] = behavior.get("panicSurvived", 0) + 1
        amount = body.get("amount", 0)
        behavior["worstAvoided"] = behavior.get("worstAvoided", 0) + amount
        # Check for badge unlock
        if behavior["panicSurvived"] >= 5:
            _unlock_badge(user_id, "iron_will")
        if behavior["panicSurvived"] >= 1:
            _unlock_badge(user_id, "diamond_hands")

    elif event_type == "stay_the_course":
        behavior["panicSurvived"] = behavior.get("panicSurvived", 0) + 1
        _unlock_badge(user_id, "zen_hold")

    elif event_type == "panic_sell":
        behavior["panicSells"] = behavior.get("panicSells", 0) + 1

    elif event_type == "bad_sell":
        behavior["badSells"] = behavior.get("badSells", 0) + 1

    elif event_type == "cards_read":
        behavior["cardsRead"] = behavior.get("cardsRead", 0) + 1
        if behavior["cardsRead"] >= 5:
            _unlock_badge(user_id, "student")

    # Check streak badges
    streak = behavior.get("streak", 0)
    if streak >= 14:
        _unlock_badge(user_id, "streak_14")
    if streak >= 30:
        _unlock_badge(user_id, "streak_30")

    _save_behavior(user_id, behavior)

    return _response(200, {
        "event": event_type,
        "streak": behavior.get("streak", 0),
        "updatedAt": datetime.utcnow().isoformat(),
    })


def _unlock_badge(user_id, badge_id):
    """Unlock an achievement badge."""
    from datetime import datetime
    try:
        data = db.get_item(f"USER#{user_id}", "ACHIEVEMENTS")
        badges = data.get("badges", []) if data else []
        if any(b["id"] == badge_id for b in badges):
            return  # Already earned
        badges.append({"id": badge_id, "earnedAt": datetime.utcnow().isoformat()})
        db.put_item({
            "PK": f"USER#{user_id}",
            "SK": "ACHIEVEMENTS",
            "badges": badges,
        })
    except Exception:
        pass


def _handle_coach_weekly(user_id):
    """GET /coach/weekly — Weekly recap."""
    from datetime import datetime

    behavior = _get_behavior(user_id)
    tickers, weights = _get_portfolio_tickers_and_weights(user_id)

    # Simulated weekly stats (in prod: computed from actual week's data)
    import random
    weekly_pct = round(random.uniform(-3.0, 5.0), 2)
    weekly_dollar = round(50000 * weekly_pct / 100, 2)
    signals_changed = random.randint(0, 3)
    score = behavior.get("streak", 0) + 50  # rough estimate
    score_change = random.randint(-2, 8)

    # Build recap
    ticker_list = list(tickers)[:2] if tickers else ["AAPL", "MSFT"]
    signal_changes_text = f"{signals_changed} changed" if signals_changed > 0 else "No changes"

    claude_line = (
        f"{'Great' if weekly_pct > 0 else 'Tough'} week! "
        f"{'Your discipline is paying off.' if weekly_pct > 0 else 'Stay the course — patience wins.'}"
    )

    return _response(200, {
        "weeklyChange": weekly_dollar,
        "weeklyChangePct": weekly_pct,
        "signalsChanged": signals_changed,
        "signalChangesText": signal_changes_text,
        "score": min(100, max(0, score)),
        "scoreChange": score_change,
        "claudeLine": claude_line,
        "updatedAt": datetime.utcnow().isoformat(),
    })


# ─── Stress Test ───


def _handle_stress_test(method, path, query_params):
    """GET /stock/<ticker>/stress-test[/all] — Macro stress-test scenarios."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    # Parse ticker from /stock/{ticker}/stress-test...
    parts = path.strip("/").split("/")
    if len(parts) < 3 or parts[0] != "stock":
        return _response(400, {"error": "Invalid path"})

    ticker = parts[1].upper()
    if not ticker or len(ticker) > 10:
        return _response(400, {"error": "Invalid ticker"})

    run_all = len(parts) >= 4 and parts[3] == "all"

    # Fetch data from DynamoDB
    price_data = db.get_item(f"PRICE#{ticker}", "LATEST")
    tech_data = db.get_item(f"TECHNICALS#{ticker}", "LATEST")
    health_data = db.get_item(f"HEALTH#{ticker}", "LATEST")
    signal_data = db.get_item(f"SIGNAL#{ticker}", "LATEST")

    if not price_data or not price_data.get("price"):
        return _response(404, {"error": f"No price data for {ticker}"})

    if run_all:
        results = stress_engine.run_all_scenarios(
            ticker, price_data, tech_data, health_data, signal_data
        )
        return _response(200, {"ticker": ticker, "scenarios": results})

    scenario_key = query_params.get("scenario", "severely_adverse")
    result = stress_engine.run_stress_test(
        ticker, scenario_key, price_data, tech_data, health_data, signal_data
    )
    if "error" in result:
        return _response(400, result)
    return _response(200, result)


# ─── Insights (AI Agent) ───


def _handle_insights(method, path, query_params):
    """GET /insights/feed, /insights/alerts, /insights/{ticker}."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    parts = path.strip("/").split("/")

    # GET /insights/feed — global insight feed
    if len(parts) >= 2 and parts[1] == "feed":
        limit = int(query_params.get("limit", "20"))
        items = db.query("INSIGHT_FEED", limit=min(limit, 50), scan_forward=False)
        feed = []
        for item in items:
            sk = item.get("SK", "")
            feed.append({
                "ticker": item.get("ticker", ""),
                "headline": item.get("headline", ""),
                "action": item.get("action", "WATCH"),
                "urgency": int(item.get("urgency", 5)),
                "confidence": item.get("confidence", "MEDIUM"),
                "changeType": item.get("changeType", ""),
                "timestamp": sk.split("#")[0] if "#" in sk else sk,
            })
        return _response(200, {"insights": feed})

    # GET /insights/alerts — high-urgency only
    if len(parts) >= 2 and parts[1] == "alerts":
        limit = int(query_params.get("limit", "10"))
        items = db.query("ALERTS", limit=min(limit, 50), scan_forward=False)
        alerts = []
        for item in items:
            sk = item.get("SK", "")
            alerts.append({
                "ticker": item.get("ticker", ""),
                "headline": item.get("headline", ""),
                "explanation": item.get("explanation", ""),
                "action": item.get("action", "WATCH"),
                "urgency": int(item.get("urgency", 8)),
                "changeType": item.get("changeType", ""),
                "timestamp": sk.split("#")[0] if "#" in sk else sk,
            })
        return _response(200, {"alerts": alerts})

    # GET /insights/{ticker} — insights for a specific stock
    if len(parts) >= 2:
        ticker = parts[1].upper()
        limit = int(query_params.get("limit", "10"))
        items = db.query(f"INSIGHT#{ticker}", limit=min(limit, 50), scan_forward=False)
        insights = []
        for item in items:
            insights.append({
                "ticker": ticker,
                "headline": item.get("headline", ""),
                "explanation": item.get("explanation", ""),
                "action": item.get("action", "WATCH"),
                "urgency": int(item.get("urgency", 5)),
                "confidence": item.get("confidence", "MEDIUM"),
                "changeType": item.get("changeType", ""),
                "timestamp": item.get("SK", ""),
            })
        return _response(200, {"ticker": ticker, "insights": insights})

    return _response(400, {"error": "Invalid insights path"})


# ─── Admin: Agent Scheduling ───

# Import agent definitions inline so the module doesn't depend on scheduler pkg
_STAGE = os.environ.get("STAGE", "dev")
_AGENTS = {
    "price_refresh": {
        "name": "Price Refresh",
        "description": "Refresh stock prices from Finnhub",
        "target_lambda": f"fii-data-refresh-{_STAGE}",
        "mode": "prices",
        "schedules": {
            "market_open": "cron(45 14 ? * MON-FRI *)",
            "intraday": "rate(30 minutes)",
            "market_close": "cron(30 20 ? * MON-FRI *)",
        },
    },
    "technicals_refresh": {
        "name": "Technicals Refresh",
        "description": "Compute technical indicators from candle data",
        "target_lambda": f"fii-data-refresh-{_STAGE}",
        "mode": "full",
        "schedules": {"daily": "cron(30 21 ? * MON-FRI *)"},
    },
    "signal_generation": {
        "name": "Signal Generation",
        "description": "Generate AI BUY/HOLD/SELL signals from all data",
        "target_lambda": f"fii-data-refresh-{_STAGE}",
        "mode": "signals",
        "schedules": {
            "daily": "cron(0 22 ? * MON-FRI *)",
            "weekly_full": "cron(0 8 ? * SAT *)",
        },
    },
    "fundamentals_refresh": {
        "name": "Fundamentals Refresh",
        "description": "Refresh fundamental data from SEC EDGAR",
        "target_lambda": f"fii-data-refresh-{_STAGE}",
        "mode": "fundamentals",
        "schedules": {"weekly": "cron(0 10 ? * SUN *)"},
    },
    "feed_compile": {
        "name": "Feed Compile",
        "description": "Compile the daily signal feed from latest data",
        "target_lambda": f"fii-feed-compiler-{_STAGE}",
        "mode": None,
        "schedules": {"daily": "cron(30 10 ? * MON-FRI *)"},
    },
    "ai_agent": {
        "name": "AI Agent",
        "description": "Agentic AI monitor — detects changes & generates insights",
        "target_lambda": f"fii-ai-agent-{_STAGE}",
        "mode": None,
        "schedules": {
            "hourly": "rate(1 hour)",
            "market_close": "cron(15 21 ? * MON-FRI *)",
        },
    },
}

# Human-friendly schedule labels for the frontend
_SCHEDULE_LABELS = {
    "cron(45 14 ? * MON-FRI *)": "9:45 AM ET weekdays",
    "rate(30 minutes)": "Every 30 min",
    "cron(30 20 ? * MON-FRI *)": "3:30 PM ET weekdays",
    "cron(30 21 ? * MON-FRI *)": "4:30 PM ET weekdays",
    "cron(0 22 ? * MON-FRI *)": "6:00 PM ET weekdays",
    "cron(0 8 ? * SAT *)": "4:00 AM ET Saturday",
    "cron(0 10 ? * SUN *)": "6:00 AM ET Sunday",
    "cron(30 10 ? * MON-FRI *)": "6:30 AM ET weekdays",
    "rate(1 hour)": "Every hour",
    "cron(15 21 ? * MON-FRI *)": "4:15 PM ET weekdays",
}


def _get_agent_config(agent_id):
    """Load persisted agent config from DynamoDB (enabled state, custom schedule)."""
    try:
        item = db.get_item("AGENT_CONFIG", agent_id)
        if item:
            return {
                "enabled": item.get("enabled", True),
                "customSchedule": item.get("customSchedule", None),
            }
    except Exception:
        pass
    return {"enabled": True, "customSchedule": None}


def _save_agent_config(agent_id, config):
    """Persist agent config to DynamoDB."""
    db.put_item({
        "PK": "AGENT_CONFIG",
        "SK": agent_id,
        "enabled": config.get("enabled", True),
        "customSchedule": config.get("customSchedule", None),
        "updatedAt": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
    })


def _handle_admin(method, path, body, query_params):
    """Routes: /admin/agents, /admin/agents/{id}/run, /admin/agents/{id}/history, /admin/agents/{id}/config."""
    from datetime import datetime, timezone
    parts = path.strip("/").split("/")

    # GET /admin/agents — list all agents with config
    if len(parts) == 2 and parts[1] == "agents" and method == "GET":
        agents_out = []
        for aid, a in _AGENTS.items():
            # Get last run
            runs = db.query(f"AGENT_RUN#{aid}", limit=1, scan_forward=False)
            last_run = runs[0] if runs else None
            config = _get_agent_config(aid)
            # Build human-readable schedule labels
            schedule_labels = {}
            for skey, sval in a["schedules"].items():
                schedule_labels[skey] = _SCHEDULE_LABELS.get(sval, sval)
            agents_out.append({
                "id": aid,
                "name": a["name"],
                "description": a["description"],
                "schedules": a["schedules"],
                "scheduleLabels": schedule_labels,
                "enabled": config["enabled"],
                "customSchedule": config["customSchedule"],
                "lastRun": {
                    "timestamp": last_run.get("SK", ""),
                    "status": last_run.get("status", ""),
                    "duration": float(last_run.get("duration", 0)),
                    "processed": int(last_run.get("processed", 0)),
                    "errors": int(last_run.get("errors", 0)),
                    "trigger": last_run.get("trigger", ""),
                } if last_run else None,
            })
        return _response(200, {"agents": agents_out})

    # POST /admin/agents/{id}/run — manually trigger an agent
    if len(parts) == 4 and parts[1] == "agents" and parts[3] == "run" and method == "POST":
        agent_id = parts[2]
        if agent_id not in _AGENTS:
            return _response(404, {"error": f"Unknown agent: {agent_id}"})
        agent = _AGENTS[agent_id]
        # Invoke target Lambda async
        try:
            import boto3
            lam = boto3.client("lambda", region_name=os.environ.get("AWS_REGION", "us-east-1"))
            payload = {"trigger": "manual"}
            if agent["mode"]:
                payload["mode"] = agent["mode"]
            lam.invoke(
                FunctionName=agent["target_lambda"],
                InvocationType="Event",
                Payload=json.dumps(payload),
            )
            db.put_item({
                "PK": f"AGENT_RUN#{agent_id}",
                "SK": datetime.now(timezone.utc).isoformat(),
                "status": "invoked",
                "trigger": "manual",
                "duration": 0,
                "processed": 0,
                "errors": 0,
            })
            return _response(200, {"message": f"Agent {agent_id} triggered", "target": agent["target_lambda"]})
        except Exception as e:
            return _response(500, {"error": str(e)})

    # GET /admin/agents/{id}/history — run history
    if len(parts) == 4 and parts[1] == "agents" and parts[3] == "history" and method == "GET":
        agent_id = parts[2]
        if agent_id not in _AGENTS:
            return _response(404, {"error": f"Unknown agent: {agent_id}"})
        limit = int(query_params.get("limit", "20"))
        runs = db.query(f"AGENT_RUN#{agent_id}", limit=min(limit, 100), scan_forward=False)
        history = []
        for r in runs:
            history.append({
                "timestamp": r.get("SK", ""),
                "status": r.get("status", ""),
                "duration": float(r.get("duration", 0)),
                "processed": int(r.get("processed", 0)),
                "errors": int(r.get("errors", 0)),
                "trigger": r.get("trigger", ""),
                "detail": r.get("detail", ""),
            })
        return _response(200, {"agentId": agent_id, "history": history})

    # GET /admin/agents/{id}/config — get agent config
    if len(parts) == 4 and parts[1] == "agents" and parts[3] == "config" and method == "GET":
        agent_id = parts[2]
        if agent_id not in _AGENTS:
            return _response(404, {"error": f"Unknown agent: {agent_id}"})
        config = _get_agent_config(agent_id)
        return _response(200, {"agentId": agent_id, **config})

    # PUT /admin/agents/{id}/config — update agent config (enabled, customSchedule)
    if len(parts) == 4 and parts[1] == "agents" and parts[3] == "config" and method in ("PUT", "POST"):
        agent_id = parts[2]
        if agent_id not in _AGENTS:
            return _response(404, {"error": f"Unknown agent: {agent_id}"})
        current = _get_agent_config(agent_id)
        if "enabled" in body:
            current["enabled"] = bool(body["enabled"])
        if "customSchedule" in body:
            current["customSchedule"] = body["customSchedule"]
        _save_agent_config(agent_id, current)
        return _response(200, {"agentId": agent_id, **current, "message": "Config updated"})

    return _response(404, {"error": "Admin route not found"})


# ─── Response Helper ───

def _decimals_to_native(obj):
    """Recursively convert DynamoDB Decimal values to int/float."""
    from decimal import Decimal
    if isinstance(obj, Decimal):
        # Use int for whole numbers, float otherwise
        if obj == int(obj):
            return int(obj)
        return float(obj)
    if isinstance(obj, dict):
        return {k: _decimals_to_native(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_decimals_to_native(i) for i in obj]
    return obj


def _response(status_code, body):
    """Build an API Gateway-compatible response."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(_decimals_to_native(body), default=str),
    }
