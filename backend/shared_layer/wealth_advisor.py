"""Wealth Advisor Engine — Smart guidance for the Strategy tab.

Provides 5 types of educational analysis based on the user's actual portfolio:
  1. analyze_holdings()      — Holdings analysis with risk/growth factors
  2. suggest_investments()   — Investment ideas based on portfolio gaps
  3. research_stock()        — Deep-dive research brief for a single stock
  4. get_tax_strategy()      — Tax optimization strategy
  5. get_events_watchlist()  — Key events calendar and watchlist
"""

import json
import logging
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

logger = logging.getLogger(__name__)

DISCLAIMER = "Educational analysis of publicly available data. Not a recommendation to buy or sell any security."
TAX_DISCLAIMER = "Tax education only. Consult a tax professional."

# S&P 500 sector weights (approximate current weights)
SP500_SECTOR_WEIGHTS = {
    "Technology": 32.0,
    "Healthcare": 12.0,
    "Financial Services": 13.0,
    "Consumer Cyclical": 10.0,
    "Communication Services": 9.0,
    "Industrials": 9.0,
    "Consumer Defensive": 6.0,
    "Energy": 4.0,
    "Utilities": 2.5,
    "Real Estate": 2.0,
    "Basic Materials": 2.5,
}

# Federal tax brackets for estimation
TAX_BRACKETS = {
    "22%": 0.22,
    "32%": 0.32,
    "37%": 0.37,
}

LONG_TERM_DAYS = 365

# 2026 FOMC meeting dates (hardcoded schedule)
FOMC_DATES_2026 = [
    "2026-01-27", "2026-01-28",
    "2026-03-17", "2026-03-18",
    "2026-05-05", "2026-05-06",
    "2026-06-16", "2026-06-17",
    "2026-07-28", "2026-07-29",
    "2026-09-15", "2026-09-16",
    "2026-10-27", "2026-10-28",
    "2026-12-15", "2026-12-16",
]

# Major macro data release dates (approximate recurring schedule)
MACRO_EVENTS_2026 = [
    {"date": "2026-03-12", "title": "CPI Report (February)", "type": "macro"},
    {"date": "2026-03-14", "title": "PPI Report (February)", "type": "macro"},
    {"date": "2026-04-04", "title": "Jobs Report (March)", "type": "macro"},
    {"date": "2026-04-10", "title": "CPI Report (March)", "type": "macro"},
    {"date": "2026-05-02", "title": "Jobs Report (April)", "type": "macro"},
    {"date": "2026-05-13", "title": "CPI Report (April)", "type": "macro"},
    {"date": "2026-06-05", "title": "Jobs Report (May)", "type": "macro"},
    {"date": "2026-06-11", "title": "CPI Report (May)", "type": "macro"},
]

# Cache TTLs
ANALYTICS_CACHE_TTL = 3600       # 1 hour
EVENTS_CACHE_TTL = 86400         # 24 hours


def _get_db():
    """Lazy import db module."""
    import db
    return db


def _get_finnhub():
    """Lazy import finnhub client."""
    try:
        import finnhub_client
        return finnhub_client
    except ImportError:
        return None


def _get_ticker_info(ticker: str) -> dict:
    """Look up company name and sector for a ticker from models."""
    try:
        from models import COMPANY_NAMES, STOCK_SECTORS
        return {
            "company": COMPANY_NAMES.get(ticker, ticker),
            "sector": STOCK_SECTORS.get(ticker, "Unknown"),
        }
    except ImportError:
        return {"company": ticker, "sector": "Unknown"}


def _load_holdings(user_id: str) -> list[dict]:
    """Load portfolio holdings from DynamoDB."""
    db = _get_db()
    record = db.get_item(f"USER#{user_id}", "PORTFOLIO")
    if not record or not record.get("holdings"):
        return []
    holdings_raw = record["holdings"]
    if isinstance(holdings_raw, str):
        holdings_raw = json.loads(holdings_raw)
    return holdings_raw


def _fetch_signal(ticker: str) -> dict:
    """Fetch signal data for a single ticker."""
    db = _get_db()
    item = db.get_item(f"SIGNAL#{ticker}", "LATEST")
    if not item:
        return {"compositeScore": 5.0, "signal": "Neutral", "score_drivers": []}
    return {
        "compositeScore": float(item.get("compositeScore", 5.0)),
        "signal": item.get("signal", "Neutral"),
        "companyName": item.get("companyName", ticker),
        "confidence": item.get("confidence", "MEDIUM"),
        "score_drivers": item.get("score_drivers", []),
        "reasoning": item.get("reasoning", ""),
        "insight": item.get("insight", ""),
    }


def _fetch_factor_summary(ticker: str) -> Optional[dict]:
    """Fetch factor summary for a ticker."""
    db = _get_db()
    return db.get_item(f"FACTOR_SUMMARY#{ticker}", "LATEST")


def _fetch_price(ticker: str) -> float:
    """Fetch current price from Finnhub or cached price."""
    finnhub = _get_finnhub()
    if finnhub:
        try:
            quote = finnhub.get_quote(ticker)
            if quote and quote.get("price", 0) > 0:
                return float(quote["price"])
        except Exception as e:
            logger.warning(f"[Advisor] Finnhub price fetch failed for {ticker}: {e}")

    # Fallback to cached price in DynamoDB
    db = _get_db()
    cached = db.get_item(f"PRICE#{ticker}", "LATEST")
    if cached and cached.get("price"):
        return float(cached["price"])
    return 0.0


def _fetch_stress_data(ticker: str) -> dict:
    """Fetch stress test data for a ticker."""
    db = _get_db()
    item = db.get_item(f"STRESS#{ticker}", "LATEST")
    if not item:
        return {}
    return item


def _fetch_financial_metrics(ticker: str) -> dict:
    """Fetch financial health metrics for a ticker."""
    db = _get_db()
    item = db.get_item(f"HEALTH#{ticker}", "LATEST")
    if not item:
        return {}
    return item


def _classify_factors(factor_summary: Optional[dict]) -> tuple[list[str], list[str]]:
    """Extract risk factors and growth factors from factor summary."""
    risk_factors = []
    growth_factors = []

    if not factor_summary or "dimensions" not in factor_summary:
        return risk_factors, growth_factors

    dimensions = factor_summary["dimensions"]
    if isinstance(dimensions, str):
        try:
            dimensions = json.loads(dimensions)
        except (json.JSONDecodeError, TypeError):
            return risk_factors, growth_factors

    for dim_key, dim_data in dimensions.items():
        if not isinstance(dim_data, dict):
            continue
        score = float(dim_data.get("score", 5.0))
        summary = dim_data.get("summary", "")
        label = dim_data.get("score_label", "Neutral")

        dim_name = dim_key.replace("_", " ").title()

        if score < 4.5:
            risk_factors.append(f"{dim_name}: {summary}" if summary else f"{dim_name} impact: {score:.1f}")
        elif score > 6.0:
            growth_factors.append(f"{dim_name}: {summary}" if summary else f"{dim_name} tailwind: +{score:.1f}")

    return risk_factors, growth_factors


def _holding_verdict(score: float, pnl_pct: float) -> str:
    """Determine a simple verdict for a holding."""
    if score >= 7.0:
        return "strong"
    elif score >= 6.0:
        return "favorable"
    elif score >= 4.5:
        if pnl_pct < -10:
            return "moderate_risk"
        return "neutral"
    elif score >= 3.0:
        return "moderate_risk"
    else:
        return "high_risk"


def _cache_result(cache_key: str, result: dict, ttl: int) -> None:
    """Cache a computed result in DynamoDB with TTL."""
    try:
        db = _get_db()
        now = datetime.now(timezone.utc)
        item = {
            "PK": cache_key,
            "SK": "LATEST",
            "data": json.dumps(result, default=str),
            "cached_at": now.isoformat(),
            "ttl": int(now.timestamp()) + ttl,
        }
        db.put_item(item)
    except Exception as e:
        logger.warning(f"[Advisor] Cache write failed for {cache_key}: {e}")


def _get_cached(cache_key: str) -> Optional[dict]:
    """Retrieve a cached result if still valid."""
    try:
        db = _get_db()
        item = db.get_item(cache_key, "LATEST")
        if not item or "data" not in item:
            return None
        cached_at = item.get("cached_at", "")
        if cached_at:
            cached_time = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
            ttl_val = int(item.get("ttl", 0))
            if ttl_val > 0 and datetime.now(timezone.utc).timestamp() > ttl_val:
                return None
        return json.loads(item["data"])
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════
# FUNCTION 1: analyze_holdings
# ═══════════════════════════════════════════════════════════════

def analyze_holdings(holdings: list[dict], user_id: str) -> dict:
    """Analyze each holding in the user's portfolio for risk and growth.

    Args:
        holdings: List of holding dicts with ticker, shares, avgCost, companyName.
        user_id: User identifier for caching.

    Returns:
        Dict with holdings_analysis and portfolio_summary.
    """
    if not holdings:
        return {
            "holdings_analysis": [],
            "portfolio_summary": {
                "total_value": 0, "total_pnl": 0, "total_pnl_pct": 0,
                "strongest_holding": None, "weakest_holding": None,
                "biggest_risk": "No holdings to analyze",
                "biggest_opportunity": "Add holdings to get started",
            },
            "disclaimer": DISCLAIMER,
        }

    # Check cache
    cache_key = f"ADVISOR_HOLDINGS#{user_id}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    holdings_analysis = []

    def _analyze_one(h):
        ticker = h.get("ticker", "")
        shares = float(h.get("shares", 0))
        cost_basis = float(h.get("avgCost", 0))
        info = _get_ticker_info(ticker)

        # Parallel data fetches
        signal = _fetch_signal(ticker)
        factor_summary = _fetch_factor_summary(ticker)
        current_price = _fetch_price(ticker)

        # Compute P&L
        if current_price <= 0:
            current_price = cost_basis  # fallback
        total_value = current_price * shares
        pnl_dollars = (current_price - cost_basis) * shares
        pnl_percent = ((current_price - cost_basis) / cost_basis * 100) if cost_basis > 0 else 0

        # Extract risk/growth factors
        risk_factors, growth_factors = _classify_factors(factor_summary)

        # Stress impact estimates (simplified)
        fii_score = signal.get("compositeScore", 5.0)
        beta_estimate = 1.0 + (5.0 - fii_score) * 0.1  # rough beta proxy
        stress_moderate = round(-15 * beta_estimate)
        stress_severe = round(-50 * beta_estimate)

        verdict = _holding_verdict(fii_score, pnl_percent)

        return {
            "ticker": ticker,
            "company": info["company"],
            "sector": info["sector"],
            "shares": shares,
            "cost_basis": round(cost_basis, 2),
            "current_price": round(current_price, 2),
            "total_value": round(total_value, 2),
            "pnl_dollars": round(pnl_dollars, 2),
            "pnl_percent": round(pnl_percent, 1),
            "fii_score": round(fii_score, 1),
            "score_label": signal.get("signal", "Neutral"),
            "risk_factors": risk_factors[:3],
            "growth_factors": growth_factors[:3],
            "stress_impact": {
                "moderate": stress_moderate,
                "severe": stress_severe,
            },
            "holding_verdict": verdict,
        }

    # Fetch all holdings in parallel
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(_analyze_one, h): h for h in holdings}
        for future in as_completed(futures):
            try:
                result = future.result()
                holdings_analysis.append(result)
            except Exception as e:
                h = futures[future]
                logger.error(f"[Advisor] Error analyzing {h.get('ticker')}: {e}")

    # Sort by total value descending
    holdings_analysis.sort(key=lambda x: x["total_value"], reverse=True)

    # Compute portfolio summary
    total_value = sum(h["total_value"] for h in holdings_analysis)
    total_cost = sum(h["cost_basis"] * h["shares"] for h in holdings_analysis)
    total_pnl = sum(h["pnl_dollars"] for h in holdings_analysis)
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0

    # Add weight percentages
    for h in holdings_analysis:
        h["weight_pct"] = round(h["total_value"] / total_value * 100, 1) if total_value > 0 else 0

    # Find strongest/weakest
    strongest = max(holdings_analysis, key=lambda x: x["fii_score"]) if holdings_analysis else None
    weakest = min(holdings_analysis, key=lambda x: x["fii_score"]) if holdings_analysis else None

    # Sector concentration
    sector_weights = defaultdict(float)
    for h in holdings_analysis:
        sector_weights[h.get("sector", "Unknown")] += h["weight_pct"]
    top_sector = max(sector_weights.items(), key=lambda x: x[1]) if sector_weights else ("Unknown", 0)

    biggest_risk = f"{top_sector[1]:.0f}% concentrated in {top_sector[0]} sector" if top_sector[1] > 30 else "Portfolio is reasonably diversified across sectors"

    # Best opportunity
    if strongest:
        biggest_opp = f"{strongest['company']} ({strongest['ticker']}) scores {strongest['fii_score']} — strongest holding"
    else:
        biggest_opp = "Add more holdings to identify opportunities"

    result = {
        "holdings_analysis": holdings_analysis,
        "portfolio_summary": {
            "total_value": round(total_value, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round(total_pnl_pct, 1),
            "strongest_holding": {"ticker": strongest["ticker"], "score": strongest["fii_score"]} if strongest else None,
            "weakest_holding": {"ticker": weakest["ticker"], "score": weakest["fii_score"]} if weakest else None,
            "biggest_risk": biggest_risk,
            "biggest_opportunity": biggest_opp,
        },
        "disclaimer": DISCLAIMER,
    }

    _cache_result(cache_key, result, ANALYTICS_CACHE_TTL)
    return result


# ═══════════════════════════════════════════════════════════════
# FUNCTION 2: suggest_investments
# ═══════════════════════════════════════════════════════════════

def suggest_investments(holdings: list[dict], budget: float = 5000, risk_profile: str = "moderate") -> dict:
    """Suggest stocks that improve portfolio diversification.

    Args:
        holdings: List of holding dicts.
        budget: Investment budget in dollars.
        risk_profile: One of 'conservative', 'moderate', 'aggressive'.

    Returns:
        Dict with fill_gaps, reduce_concentration, upgrade_quality suggestions.
    """
    if not holdings:
        return {
            "budget": budget,
            "risk_profile": risk_profile,
            "suggestions": {"fill_gaps": [], "reduce_concentration": [], "upgrade_quality": []},
            "impact_if_followed": {},
            "disclaimer": DISCLAIMER,
        }

    # Compute current sector allocation
    current_sectors = defaultdict(float)
    portfolio_tickers = set()
    total_value = 0
    holding_scores = {}

    for h in holdings:
        ticker = h.get("ticker", "")
        shares = float(h.get("shares", 0))
        cost = float(h.get("avgCost", 0))
        value = shares * cost
        total_value += value
        info = _get_ticker_info(ticker)
        current_sectors[info["sector"]] += value
        portfolio_tickers.add(ticker)

    # Convert to percentages
    sector_pcts = {}
    for sector, val in current_sectors.items():
        sector_pcts[sector] = round(val / total_value * 100, 1) if total_value > 0 else 0

    # Identify gaps and overweights
    fill_gaps = []
    reduce_concentration = []

    for sector, sp500_weight in SP500_SECTOR_WEIGHTS.items():
        current_weight = sector_pcts.get(sector, 0)
        diff = current_weight - sp500_weight

        if current_weight == 0 or diff < -5:
            # Missing or significantly underweight sector
            fill_gaps.append({
                "sector": sector,
                "current_weight": current_weight,
                "sp500_weight": sp500_weight,
                "gap": round(sp500_weight - current_weight, 1),
            })
        elif diff > 10:
            # Significantly overweight
            reduce_concentration.append({
                "current_sector": sector,
                "current_weight": current_weight,
                "target_weight": sp500_weight,
                "overweight_by": round(diff, 1),
            })

    # Fetch signals for candidate stocks in underweight sectors
    try:
        from models import STOCK_UNIVERSE, STOCK_SECTORS, COMPANY_NAMES
    except ImportError:
        STOCK_UNIVERSE = []
        STOCK_SECTORS = {}
        COMPANY_NAMES = {}

    # Build sector -> ticker mapping from universe
    sector_to_tickers = defaultdict(list)
    for ticker in STOCK_UNIVERSE:
        sector = STOCK_SECTORS.get(ticker, "Unknown")
        if ticker not in portfolio_tickers:
            sector_to_tickers[sector].append(ticker)

    # Score threshold based on risk profile
    min_score = {"conservative": 6.5, "moderate": 6.0, "aggressive": 5.5}.get(risk_profile, 6.0)

    # Fetch signals for candidate sectors (parallel)
    gap_sectors = {g["sector"] for g in fill_gaps}
    overweight_sectors = {r["current_sector"] for r in reduce_concentration}
    candidate_sectors = gap_sectors | set(SP500_SECTOR_WEIGHTS.keys()) - overweight_sectors

    # Get top candidates per sector
    def _get_sector_candidates(sector: str, limit: int = 5) -> list[dict]:
        candidates = sector_to_tickers.get(sector, [])[:20]  # Check top 20 per sector
        if not candidates:
            return []

        db = _get_db()
        keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in candidates]
        items = db.batch_get(keys)

        scored = []
        for item in items:
            ticker = item.get("ticker", "")
            score = float(item.get("compositeScore", 0))
            if score >= min_score and ticker not in portfolio_tickers:
                price = _fetch_price(ticker)
                scored.append({
                    "ticker": ticker,
                    "company": COMPANY_NAMES.get(ticker, ticker),
                    "score": round(score, 1),
                    "label": item.get("signal", "Neutral"),
                    "price": round(price, 2) if price > 0 else None,
                    "shares_for_budget": int(budget / price) if price > 0 else 0,
                    "why": item.get("insight", f"FII score {score:.1f} in {sector}"),
                })
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:limit]

    # Fill gaps suggestions
    fill_gap_suggestions = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {}
        for gap in fill_gaps[:5]:
            future = executor.submit(_get_sector_candidates, gap["sector"], 3)
            futures[future] = gap
        for future in as_completed(futures):
            gap = futures[future]
            try:
                stocks = future.result()
                if stocks:
                    fill_gap_suggestions.append({
                        "sector": gap["sector"],
                        "reason": f"{gap['current_weight']}% exposure vs {gap['sp500_weight']}% S&P 500",
                        "stocks": stocks,
                    })
            except Exception as e:
                logger.warning(f"[Advisor] Error getting candidates for {gap['sector']}: {e}")

    # Reduce concentration suggestions
    concentration_suggestions = []
    for conc in reduce_concentration[:3]:
        # Find alternatives in other sectors
        alt_sectors = [s for s in SP500_SECTOR_WEIGHTS if s != conc["current_sector"]
                       and sector_pcts.get(s, 0) < SP500_SECTOR_WEIGHTS[s]]
        alternatives = []
        for alt_sector in alt_sectors[:3]:
            cands = _get_sector_candidates(alt_sector, 2)
            for c in cands:
                c["sector"] = alt_sector
                alternatives.append(c)
        if alternatives:
            concentration_suggestions.append({
                "current_sector": conc["current_sector"],
                "current_weight": conc["current_weight"],
                "target_weight": conc["target_weight"],
                "alternatives": alternatives[:3],
            })

    # Upgrade quality suggestions
    upgrade_suggestions = []
    # Find weakest holdings and suggest replacements
    holding_signals = {}
    db = _get_db()
    if holdings:
        keys = [{"PK": f"SIGNAL#{h['ticker']}", "SK": "LATEST"} for h in holdings]
        items = db.batch_get(keys)
        for item in items:
            t = item.get("ticker", "")
            holding_signals[t] = float(item.get("compositeScore", 5.0))

    weak_holdings = [(t, s) for t, s in holding_signals.items() if s < 4.5]
    weak_holdings.sort(key=lambda x: x[1])

    for weak_ticker, weak_score in weak_holdings[:3]:
        weak_info = _get_ticker_info(weak_ticker)
        better = _get_sector_candidates(weak_info["sector"], 3)
        if better:
            upgrade_suggestions.append({
                "current": {"ticker": weak_ticker, "score": round(weak_score, 1)},
                "better_options": [
                    {**b, "same_sector": True} for b in better
                ],
            })

    # Compute diversification impact
    current_diversification = _compute_diversification_score(sector_pcts)
    # Estimate improved diversification if gaps were filled
    improved_sectors = dict(sector_pcts)
    for gap in fill_gaps[:3]:
        improved_sectors[gap["sector"]] = improved_sectors.get(gap["sector"], 0) + gap["gap"] * 0.5
    improved_diversification = _compute_diversification_score(improved_sectors)

    result = {
        "budget": budget,
        "risk_profile": risk_profile,
        "suggestions": {
            "fill_gaps": fill_gap_suggestions,
            "reduce_concentration": concentration_suggestions,
            "upgrade_quality": upgrade_suggestions,
        },
        "impact_if_followed": {
            "diversification_before": current_diversification,
            "diversification_after": improved_diversification,
            "risk_reduction": f"Estimated {improved_diversification - current_diversification}% improvement in diversification score",
        },
        "disclaimer": DISCLAIMER,
    }

    return result


def _compute_diversification_score(sector_pcts: dict) -> int:
    """Compute a 0-100 diversification score based on sector weights."""
    if not sector_pcts:
        return 0
    total = sum(sector_pcts.values())
    if total == 0:
        return 0

    # HHI-based score
    hhi = sum((w / total * 100) ** 2 for w in sector_pcts.values())
    # Perfect diversification across 11 sectors = HHI of ~909
    # Single sector = HHI of 10000
    score = max(0, min(100, int(100 - (hhi - 900) / 91)))
    return score


# ═══════════════════════════════════════════════════════════════
# FUNCTION 3: research_stock
# ═══════════════════════════════════════════════════════════════

def research_stock(ticker: str, user_id: str = None) -> dict:
    """Deep-dive research brief for a single stock.

    Args:
        ticker: Stock ticker symbol.
        user_id: Optional user ID to check if stock is in portfolio.

    Returns:
        Comprehensive research dict with signal, factors, metrics, stress, peers.
    """
    ticker = ticker.upper()
    info = _get_ticker_info(ticker)

    # Check cache
    cache_key = f"ADVISOR_RESEARCH#{ticker}"
    cached = _get_cached(cache_key)
    if cached:
        # Add portfolio context if user_id provided
        if user_id:
            cached.update(_get_portfolio_context(ticker, user_id))
        return cached

    # Parallel data fetches
    with ThreadPoolExecutor(max_workers=6) as executor:
        signal_future = executor.submit(_fetch_signal, ticker)
        factor_future = executor.submit(_fetch_factor_summary, ticker)
        price_future = executor.submit(_fetch_price, ticker)
        stress_future = executor.submit(_fetch_stress_data, ticker)
        metrics_future = executor.submit(_fetch_financial_metrics, ticker)
        peers_future = executor.submit(_get_peer_comparison, ticker, info["sector"])

    signal = signal_future.result()
    factor_summary = factor_future.result()
    current_price = price_future.result()
    stress_data = stress_future.result()
    metrics_data = metrics_future.result()
    peers = peers_future.result()

    fii_score = signal.get("compositeScore", 5.0)
    score_label = signal.get("signal", "Neutral")

    # Extract factor scores
    factor_scores = {}
    if factor_summary and "dimensions" in factor_summary:
        dims = factor_summary["dimensions"]
        if isinstance(dims, str):
            try:
                dims = json.loads(dims)
            except (json.JSONDecodeError, TypeError):
                dims = {}
        for dim_key, dim_data in dims.items():
            if isinstance(dim_data, dict):
                factor_scores[dim_key] = {
                    "score": round(float(dim_data.get("score", 5.0)), 1),
                    "label": dim_data.get("score_label", "Neutral"),
                    "summary": dim_data.get("summary", ""),
                }

    # Classify bull/bear cases
    risk_factors, growth_factors = _classify_factors(factor_summary)
    bull_case = growth_factors if growth_factors else ["No strong positive factors identified"]
    bear_case = risk_factors if risk_factors else ["No significant risk factors identified"]

    # Key financial metrics
    key_metrics = _extract_key_metrics(metrics_data)

    # Stress scenarios
    stress_scenarios = _extract_stress_scenarios(stress_data)

    # Executive summary
    exec_summary = _generate_executive_summary(
        ticker, info["company"], fii_score, score_label, key_metrics, bull_case, bear_case
    )

    result = {
        "ticker": ticker,
        "company": info["company"],
        "sector": info["sector"],
        "price": round(current_price, 2),
        "fii_score": round(fii_score, 1),
        "score_label": score_label,
        "executive_summary": exec_summary,
        "bull_case": bull_case[:5],
        "bear_case": bear_case[:5],
        "factor_scores": factor_scores,
        "key_metrics": key_metrics,
        "stress_scenarios": stress_scenarios,
        "peers": peers,
        "disclaimer": DISCLAIMER,
    }

    # Add portfolio context
    if user_id:
        result.update(_get_portfolio_context(ticker, user_id))

    _cache_result(cache_key, result, ANALYTICS_CACHE_TTL)
    return result


def _get_peer_comparison(ticker: str, sector: str) -> list[dict]:
    """Get top 5 same-sector stocks with their scores."""
    try:
        from models import STOCK_SECTORS, COMPANY_NAMES
    except ImportError:
        return []

    same_sector = [t for t, s in STOCK_SECTORS.items() if s == sector and t != ticker][:15]
    if not same_sector:
        return []

    db = _get_db()
    keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in same_sector]
    items = db.batch_get(keys)

    peers = []
    for item in items:
        t = item.get("ticker", "")
        peers.append({
            "ticker": t,
            "company": COMPANY_NAMES.get(t, t),
            "score": round(float(item.get("compositeScore", 5.0)), 1),
            "signal": item.get("signal", "Neutral"),
        })

    peers.sort(key=lambda x: x["score"], reverse=True)
    return peers[:5]


def _extract_key_metrics(metrics_data: dict) -> dict:
    """Extract the most relevant financial metrics."""
    if not metrics_data:
        return {}

    metrics = metrics_data.get("metrics", metrics_data)
    if isinstance(metrics, str):
        try:
            metrics = json.loads(metrics)
        except (json.JSONDecodeError, TypeError):
            return {}

    key_fields = [
        "pe_ratio", "peRatio", "forward_pe", "forwardPE",
        "revenue_growth", "revenueGrowth",
        "net_margin", "netMargin", "profitMargin",
        "roe", "roeTTM", "returnOnEquity",
        "debt_to_equity", "debtToEquity",
        "beta",
        "dividend_yield", "dividendYield",
        "market_cap", "marketCap",
        "eps_growth", "epsGrowth",
        "free_cash_flow_margin", "fcfMargin",
    ]

    result = {}
    for field in key_fields:
        val = metrics.get(field)
        if val is not None:
            # Normalize field names to snake_case
            normalized = field.replace("TTM", "").lower()
            for camel_pair in [("pe", "pe"), ("roi", "roi")]:
                pass
            if isinstance(val, (int, float, Decimal)):
                result[normalized] = round(float(val), 2)

    return result


def _extract_stress_scenarios(stress_data: dict) -> dict:
    """Extract stress test results into a clean format."""
    if not stress_data:
        return {}

    scenarios = stress_data.get("scenarios", [])
    if isinstance(scenarios, str):
        try:
            scenarios = json.loads(scenarios)
        except (json.JSONDecodeError, TypeError):
            return {}

    result = {}
    if isinstance(scenarios, list):
        for s in scenarios:
            if isinstance(s, dict):
                label = s.get("id", s.get("label", "unknown"))
                result[label] = {
                    "impact_pct": round(float(s.get("estimated_impact", s.get("impact_pct", 0))), 1),
                    "recovery": s.get("recovery_estimate", "Unknown"),
                    "risk_level": s.get("risk_level", "MODERATE"),
                }
    elif isinstance(scenarios, dict):
        for label, s in scenarios.items():
            if isinstance(s, dict):
                result[label] = {
                    "impact_pct": round(float(s.get("estimated_impact", s.get("impact_pct", 0))), 1),
                    "recovery": s.get("recovery_estimate", "Unknown"),
                    "risk_level": s.get("risk_level", "MODERATE"),
                }

    return result


def _generate_executive_summary(
    ticker: str, company: str, score: float, label: str,
    metrics: dict, bull_case: list, bear_case: list
) -> str:
    """Generate a concise 2-sentence executive summary."""
    # Build summary based on available data
    pe_str = ""
    pe = metrics.get("pe_ratio") or metrics.get("peratio")
    if pe:
        pe_str = f" trading at {pe}x earnings"

    if score >= 7.0:
        tone = f"{company} ({ticker}) scores {score:.1f} ({label}){pe_str}, reflecting strong fundamentals."
    elif score >= 5.5:
        tone = f"{company} ({ticker}) scores {score:.1f} ({label}){pe_str}, with a balanced risk-reward profile."
    elif score >= 4.0:
        tone = f"{company} ({ticker}) scores {score:.1f} ({label}){pe_str}, showing some headwinds."
    else:
        tone = f"{company} ({ticker}) scores {score:.1f} ({label}){pe_str}, facing significant challenges."

    # Add key point
    if bull_case and bull_case[0] != "No strong positive factors identified":
        second = f"Key upside: {bull_case[0]}."
    elif bear_case and bear_case[0] != "No significant risk factors identified":
        second = f"Key risk: {bear_case[0]}."
    else:
        second = "Monitor for factor changes that may shift the outlook."

    return f"{tone} {second}"


def _get_portfolio_context(ticker: str, user_id: str) -> dict:
    """Check if a stock is in the user's portfolio and return context."""
    holdings = _load_holdings(user_id)
    for h in holdings:
        if h.get("ticker") == ticker:
            shares = float(h.get("shares", 0))
            cost = float(h.get("avgCost", 0))
            total_cost = sum(
                float(x.get("shares", 0)) * float(x.get("avgCost", 0))
                for x in holdings
            ) or 1
            weight = (shares * cost) / total_cost * 100
            return {
                "in_portfolio": True,
                "portfolio_shares": shares,
                "portfolio_cost_basis": cost,
                "portfolio_weight": round(weight, 1),
            }
    return {"in_portfolio": False}


# ═══════════════════════════════════════════════════════════════
# FUNCTION 4: get_tax_strategy
# ═══════════════════════════════════════════════════════════════

def get_tax_strategy(holdings: list[dict], user_id: str) -> dict:
    """Tax optimization strategy for the portfolio.

    Args:
        holdings: List of holding dicts.
        user_id: User identifier for caching.

    Returns:
        Dict with tax_summary, actionable_items, year_end_planning.
    """
    if not holdings:
        return {
            "tax_summary": {
                "total_unrealized_gains": 0, "total_unrealized_losses": 0,
                "net_position": 0, "harvestable_losses": 0,
                "estimated_tax_savings_range": "$0",
            },
            "actionable_items": [],
            "year_end_planning": {},
            "disclaimer": TAX_DISCLAIMER,
        }

    # Check cache
    cache_key = f"ADVISOR_TAX#{user_id}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    now = datetime.now(timezone.utc)
    total_gains = 0
    total_losses = 0
    short_term_gains = 0
    long_term_gains = 0
    harvestable_losses = 0
    actionable_items = []

    def _analyze_tax_holding(h):
        ticker = h.get("ticker", "")
        shares = float(h.get("shares", 0))
        cost_basis = float(h.get("avgCost", 0))
        date_added = h.get("dateAdded", "")

        current_price = _fetch_price(ticker)
        if current_price <= 0:
            current_price = cost_basis

        unrealized = (current_price - cost_basis) * shares
        unrealized_pct = ((current_price - cost_basis) / cost_basis * 100) if cost_basis > 0 else 0

        # Determine holding period
        days_held = 0
        is_long_term = False
        if date_added:
            try:
                added_dt = datetime.fromisoformat(date_added.replace("Z", "+00:00"))
                days_held = (now - added_dt).days
                is_long_term = days_held >= LONG_TERM_DAYS
            except (ValueError, TypeError):
                days_held = 0

        holding_period = "long_term" if is_long_term else "short_term"
        days_to_long_term = max(0, LONG_TERM_DAYS - days_held) if not is_long_term else 0

        return {
            "ticker": ticker,
            "shares": shares,
            "cost_basis": cost_basis,
            "current_price": round(current_price, 2),
            "unrealized": round(unrealized, 2),
            "unrealized_pct": round(unrealized_pct, 1),
            "days_held": days_held,
            "holding_period": holding_period,
            "is_long_term": is_long_term,
            "days_to_long_term": days_to_long_term,
        }

    # Analyze all holdings in parallel
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_analyze_tax_holding, h) for h in holdings]
        analyzed = []
        for future in as_completed(futures):
            try:
                analyzed.append(future.result())
            except Exception as e:
                logger.warning(f"[Advisor] Tax analysis error: {e}")

    for item in analyzed:
        unrealized = item["unrealized"]
        if unrealized > 0:
            total_gains += unrealized
            if item["is_long_term"]:
                long_term_gains += unrealized
            else:
                short_term_gains += unrealized
        else:
            total_losses += unrealized
            harvestable_losses += abs(unrealized)

        # Generate actionable items
        if unrealized < -100:  # Meaningful loss
            tax_savings = {}
            for bracket_name, rate in TAX_BRACKETS.items():
                tax_savings[bracket_name] = round(abs(unrealized) * rate, 2)

            actionable_items.append({
                "type": "harvest_loss",
                "ticker": item["ticker"],
                "loss": round(unrealized, 2),
                "holding_period": item["holding_period"],
                "days_held": item["days_held"],
                "tax_bracket_savings": tax_savings,
                "explanation": (
                    f"This position has a ${abs(unrealized):,.0f} unrealized loss. "
                    f"Realizing this loss could offset gains or up to $3,000 of ordinary income."
                ),
            })
        elif not item["is_long_term"] and item["days_to_long_term"] <= 90 and unrealized > 100:
            # Close to long-term threshold
            potential_savings = round(unrealized * 0.17, 2)  # Diff between ST and LT rates
            actionable_items.append({
                "type": "hold_for_long_term",
                "ticker": item["ticker"],
                "days_to_long_term": item["days_to_long_term"],
                "unrealized_gain": round(unrealized, 2),
                "potential_savings": potential_savings,
                "explanation": (
                    f"{item['days_to_long_term']} days until this gain qualifies for long-term "
                    f"rates (0-20%) vs short-term (up to 37%). Potential savings: ~${potential_savings:,.0f}."
                ),
            })

    # Sort actionable items: losses first (biggest), then hold-for-LT (soonest)
    actionable_items.sort(key=lambda x: (
        0 if x["type"] == "harvest_loss" else 1,
        x.get("loss", 0),
        x.get("days_to_long_term", 999),
    ))

    # Estimated tax savings range
    min_savings = round(harvestable_losses * 0.22, 2)
    max_savings = round(harvestable_losses * 0.37, 2)

    net_position = total_gains + total_losses  # total_losses is negative

    result = {
        "tax_summary": {
            "total_unrealized_gains": round(total_gains, 2),
            "total_unrealized_losses": round(total_losses, 2),
            "net_position": round(net_position, 2),
            "short_term_gains": round(short_term_gains, 2),
            "long_term_gains": round(long_term_gains, 2),
            "harvestable_losses": round(harvestable_losses, 2),
            "estimated_tax_savings_range": f"${min_savings:,.0f} - ${max_savings:,.0f}" if harvestable_losses > 0 else "$0",
        },
        "actionable_items": actionable_items,
        "year_end_planning": {
            "remaining_loss_allowance": 3000,
            "suggestion": (
                f"You can offset up to $3,000 of ordinary income with capital losses. "
                f"You have ${harvestable_losses:,.0f} in harvestable losses."
            ) if harvestable_losses > 0 else "No harvestable losses identified at this time.",
        },
        "disclaimer": TAX_DISCLAIMER,
    }

    _cache_result(cache_key, result, ANALYTICS_CACHE_TTL)
    return result


# ═══════════════════════════════════════════════════════════════
# FUNCTION 5: get_events_watchlist
# ═══════════════════════════════════════════════════════════════

def get_events_watchlist(holdings: list[dict], days_ahead: int = 30) -> dict:
    """Key events to watch for portfolio holdings.

    Args:
        holdings: List of holding dicts.
        days_ahead: Number of days to look ahead (default 30).

    Returns:
        Dict with upcoming_events and weekly_calendar.
    """
    now = datetime.now(timezone.utc)
    end_date = now + timedelta(days=days_ahead)
    now_str = now.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    events = []

    # 1. Fed meeting dates
    for date_str in FOMC_DATES_2026:
        if now_str <= date_str <= end_str:
            # Only add the decision day (second day of each 2-day meeting)
            idx = FOMC_DATES_2026.index(date_str)
            if idx % 2 == 1:  # Decision days are at odd indices
                impact_tickers = []
                for h in holdings:
                    info = _get_ticker_info(h.get("ticker", ""))
                    if info["sector"] in ("Technology", "Real Estate", "Utilities"):
                        impact_tickers.append(h["ticker"])

                impact_msg = "Affects all holdings"
                if impact_tickers:
                    impact_msg += f" — rate-sensitive stocks {', '.join(impact_tickers[:3])} more impacted"

                events.append({
                    "date": date_str,
                    "type": "fed_meeting",
                    "title": "FOMC Rate Decision",
                    "impact": impact_msg,
                    "priority": "high",
                })

    # 2. Macro data releases
    for macro in MACRO_EVENTS_2026:
        if now_str <= macro["date"] <= end_str:
            events.append({
                "date": macro["date"],
                "type": "macro",
                "title": macro["title"],
                "impact": "Key economic indicator affecting market sentiment",
                "priority": "medium",
            })

    # 3. Earnings dates from Finnhub
    finnhub = _get_finnhub()
    if finnhub and holdings:
        tickers = [h.get("ticker", "") for h in holdings]
        for ticker in tickers:
            try:
                earnings = finnhub.get_earnings(ticker)
                if earnings and isinstance(earnings, list):
                    # Look for upcoming earnings based on pattern
                    # Finnhub returns historical — we estimate next based on cadence
                    if len(earnings) >= 2:
                        last = earnings[0]
                        prev = earnings[1]
                        last_period = last.get("period", "")
                        if last_period:
                            try:
                                last_dt = datetime.strptime(last_period, "%Y-%m-%d")
                                # Estimate next earnings ~90 days after last
                                next_est = last_dt + timedelta(days=90)
                                next_str = next_est.strftime("%Y-%m-%d")
                                if now_str <= next_str <= end_str:
                                    surprise = last.get("surprisePercent", 0)
                                    surprise_str = f"Last surprise: {surprise}%." if surprise else ""
                                    events.append({
                                        "date": next_str,
                                        "type": "earnings",
                                        "title": f"{ticker} Earnings (est.)",
                                        "ticker": ticker,
                                        "impact": f"Estimated earnings date. {surprise_str}",
                                        "priority": "high",
                                    })
                            except (ValueError, TypeError):
                                pass
            except Exception as e:
                logger.warning(f"[Advisor] Earnings fetch failed for {ticker}: {e}")

    # 4. Score changes — check for significant recent changes
    if holdings:
        db = _get_db()
        for h in holdings:
            ticker = h.get("ticker", "")
            try:
                # Check for score history
                signals = db.query(
                    pk=f"SIGNAL#{ticker}",
                    limit=2,
                    scan_forward=False,
                )
                if len(signals) >= 2:
                    current_score = float(signals[0].get("compositeScore", 5.0))
                    prev_score = float(signals[1].get("compositeScore", 5.0))
                    change = current_score - prev_score

                    if abs(change) >= 1.0:
                        direction = "Improved" if change > 0 else "Declined"
                        events.append({
                            "date": now_str,
                            "type": "score_change",
                            "title": f"{ticker} Factor Score {direction}",
                            "ticker": ticker,
                            "impact": f"Score changed from {prev_score:.1f} to {current_score:.1f} — {'positive' if change > 0 else 'negative'} shift",
                            "priority": "high" if abs(change) >= 2.0 else "medium",
                        })
            except Exception as e:
                logger.warning(f"[Advisor] Score history check failed for {ticker}: {e}")

    # Sort by date, then priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    events.sort(key=lambda x: (x["date"], priority_order.get(x.get("priority", "low"), 2)))

    # Build weekly calendar
    this_week_end = now + timedelta(days=(6 - now.weekday()))
    next_week_end = this_week_end + timedelta(days=7)

    this_week = [e for e in events if e["date"] <= this_week_end.strftime("%Y-%m-%d")]
    next_week = [e for e in events
                 if this_week_end.strftime("%Y-%m-%d") < e["date"] <= next_week_end.strftime("%Y-%m-%d")]

    result = {
        "upcoming_events": events,
        "weekly_calendar": {
            "this_week": this_week,
            "next_week": next_week,
        },
        "disclaimer": DISCLAIMER,
    }

    return result
