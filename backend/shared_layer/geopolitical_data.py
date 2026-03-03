"""Geopolitical Risk Scoring for FII.

Downloads the Caldara-Iacoviello Geopolitical Risk (GPR) Index and
computes per-stock geopolitical exposure scores using revenue geography,
supply chain data, and trade restriction indicators.

Functions:
  - get_geopolitical_risk_index()            — Global GPR index + trend
  - compute_geopolitical_score(ticker, gpr)  — Stock-level geo risk (1-10)
"""

import csv
import io
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# GPR CSV URL (daily recent data from Caldara-Iacoviello)
GPR_CSV_URL = "https://www.matteoiacoviello.com/gpr_files/data_gpr_daily_recent.csv"

# Thresholds for GPR regime classification
GPR_THRESHOLDS = {
    "low": 80,
    "moderate": 120,
    "elevated": 200,
    # > 200 = "crisis"
}

# Cache for GPR data (24-hour TTL)
_gpr_cache: dict = {}
_gpr_cache_ts: float = 0.0
_CACHE_TTL = 24 * 60 * 60  # 24 hours

# Countries with elevated trade/geopolitical risk
HIGH_RISK_COUNTRIES = {"China", "Russia", "Iran", "North Korea"}
MODERATE_RISK_COUNTRIES = {"Taiwan", "India", "Brazil", "Mexico", "Turkey", "Saudi Arabia"}

# Sectors with elevated regulatory/trade risk exposure
TRADE_SENSITIVE_SECTORS = {
    "Technology", "Semiconductors", "Communication Services",
    "Industrials", "Energy", "Materials",
}

# Known supply chain concentration risks
TAIWAN_DEPENDENCY_COMPANIES = {
    "TSMC", "Taiwan Semiconductor", "ASE Technology",
    "MediaTek", "United Microelectronics",
}


def _classify_gpr(value: float) -> str:
    """Classify GPR value into regime label."""
    if value < GPR_THRESHOLDS["low"]:
        return "low"
    elif value < GPR_THRESHOLDS["moderate"]:
        return "moderate"
    elif value < GPR_THRESHOLDS["elevated"]:
        return "elevated"
    else:
        return "crisis"


def _compute_percentile(current: float, history: list[float]) -> int:
    """Compute percentile rank of current value vs history."""
    if not history:
        return 50
    below = sum(1 for v in history if v <= current)
    return round((below / len(history)) * 100)


def get_geopolitical_risk_index() -> dict:
    """Fetch the Caldara-Iacoviello Geopolitical Risk Index.

    Downloads the daily recent CSV, parses it, and returns the latest value
    with trend classification and historical percentile.

    Caches for 24 hours. Falls back to last cached value if download fails.

    Returns:
        Dict with global_gpr, gpr_trend, percentile_vs_history, date.
    """
    global _gpr_cache, _gpr_cache_ts

    # Check in-memory cache
    now = time.time()
    if _gpr_cache and (now - _gpr_cache_ts) < _CACHE_TTL:
        logger.info("[GPR] Returning cached GPR index")
        return _gpr_cache

    # Check DynamoDB cache
    try:
        import db
        cached = db.get_item("MACRO#GPR", "INDEX")
        if cached:
            cached_at = cached.get("cachedAt", "")
            if cached_at:
                cache_time = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                age_seconds = (datetime.now(timezone.utc) - cache_time).total_seconds()
                if age_seconds < _CACHE_TTL:
                    result = {
                        "global_gpr": float(cached.get("global_gpr", 100)),
                        "gpr_trend": cached.get("gpr_trend", "moderate"),
                        "percentile_vs_history": int(cached.get("percentile_vs_history", 50)),
                        "date": cached.get("date", ""),
                        "source": "cache",
                    }
                    _gpr_cache = result
                    _gpr_cache_ts = now
                    logger.info("[GPR] Returning DynamoDB-cached GPR index")
                    return result
    except Exception as e:
        logger.warning(f"[GPR] DynamoDB cache read failed: {e}")

    # Download fresh CSV
    try:
        resp = requests.get(GPR_CSV_URL, timeout=30)
        resp.raise_for_status()
        csv_text = resp.text
    except Exception as e:
        logger.error(f"[GPR] Failed to download GPR CSV: {e}")
        if _gpr_cache:
            logger.warning("[GPR] Returning stale cache with warning")
            _gpr_cache["stale"] = True
            _gpr_cache["stale_reason"] = f"Download failed: {e}"
            return _gpr_cache
        return {
            "global_gpr": 100.0,
            "gpr_trend": "moderate",
            "percentile_vs_history": 50,
            "date": "",
            "source": "default",
            "stale": True,
            "stale_reason": f"Download failed: {e}",
        }

    # Parse CSV
    try:
        reader = csv.DictReader(io.StringIO(csv_text))
        rows = list(reader)

        if not rows:
            raise ValueError("Empty CSV data")

        # Find the GPR column — varies by CSV version
        gpr_col = None
        for col_name in reader.fieldnames or []:
            col_lower = col_name.strip().lower()
            if col_lower in ("gpr", "gpr_global", "gpr_daily", "gprd"):
                gpr_col = col_name
                break

        if not gpr_col:
            # Fall back to second column (first is usually date)
            gpr_col = (reader.fieldnames or ["", ""])[1] if reader.fieldnames and len(reader.fieldnames) > 1 else None

        if not gpr_col:
            raise ValueError(f"Cannot identify GPR column in CSV. Columns: {reader.fieldnames}")

        # Extract date column
        date_col = None
        for col_name in reader.fieldnames or []:
            col_lower = col_name.strip().lower()
            if col_lower in ("date", "day", "observation_date"):
                date_col = col_name
                break
        if not date_col and reader.fieldnames:
            date_col = reader.fieldnames[0]

        # Parse all values for percentile calculation
        all_values = []
        latest_value = None
        latest_date = ""

        for row in rows:
            try:
                val = float(row[gpr_col].strip())
                all_values.append(val)
                latest_value = val
                if date_col:
                    latest_date = row[date_col].strip()
            except (ValueError, KeyError):
                continue

        if latest_value is None:
            raise ValueError("No valid GPR values found in CSV")

        # Compute trend and percentile
        trend = _classify_gpr(latest_value)
        percentile = _compute_percentile(latest_value, all_values)

        result = {
            "global_gpr": round(latest_value, 1),
            "gpr_trend": trend,
            "percentile_vs_history": percentile,
            "date": latest_date,
            "source": "caldara_iacoviello",
        }

        # Update caches
        _gpr_cache = result
        _gpr_cache_ts = now

        # Persist to DynamoDB
        try:
            import db
            from decimal import Decimal
            db.put_item({
                "PK": "MACRO#GPR",
                "SK": "INDEX",
                "global_gpr": Decimal(str(round(latest_value, 2))),
                "gpr_trend": trend,
                "percentile_vs_history": percentile,
                "date": latest_date,
                "cachedAt": datetime.now(timezone.utc).isoformat(),
                "source": "caldara_iacoviello",
            })
            logger.info("[GPR] Cached GPR index to DynamoDB")
        except Exception as e:
            logger.warning(f"[GPR] DynamoDB cache write failed: {e}")

        return result

    except Exception as e:
        logger.error(f"[GPR] Failed to parse GPR CSV: {e}")
        if _gpr_cache:
            _gpr_cache["stale"] = True
            return _gpr_cache
        return {
            "global_gpr": 100.0,
            "gpr_trend": "moderate",
            "percentile_vs_history": 50,
            "date": "",
            "source": "default",
            "stale": True,
            "stale_reason": str(e),
        }


# ─── Geopolitical Score Computation ───


def _get_revenue_geography(ticker: str) -> dict:
    """Extract revenue geography breakdown for a ticker.

    Tries yfinance first, then falls back to SEC EDGAR supply chain data
    for geographic concentration disclosures.

    Returns:
        Dict with country → percentage mappings and risk classification.
    """
    geo_data = {
        "us_pct": 0,
        "china_pct": 0,
        "europe_pct": 0,
        "emerging_pct": 0,
        "taiwan_pct": 0,
        "countries": {},
        "source": "unavailable",
    }

    # Try yfinance for geographic breakdown
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        # yfinance doesn't directly provide geo breakdown in .info
        # but we can check sector/country info
        info = stock.info or {}
        country = info.get("country", "United States")
        geo_data["headquarters"] = country
    except Exception as e:
        logger.debug(f"[GEO] yfinance lookup failed for {ticker}: {e}")

    # Try SEC EDGAR supply chain extraction for geographic data
    try:
        import edgar_data
        entities = edgar_data.extract_supply_chain_from_filing(ticker)
        if entities:
            for entity in entities:
                if entity.get("relationship") == "geographic_concentration":
                    country = entity.get("entity", "")
                    pct = entity.get("revenue_pct", 0) or 0
                    geo_data["countries"][country] = pct
                    geo_data["source"] = "sec_edgar"

                    # Classify into regions
                    if country.lower() in ("china", "hong kong"):
                        geo_data["china_pct"] += pct
                    elif country.lower() in ("taiwan",):
                        geo_data["taiwan_pct"] += pct
                    elif country.lower() in ("united states", "us", "usa"):
                        geo_data["us_pct"] += pct
                    elif country.lower() in (
                        "united kingdom", "uk", "germany", "france",
                        "netherlands", "ireland", "switzerland",
                    ):
                        geo_data["europe_pct"] += pct
                    else:
                        geo_data["emerging_pct"] += pct
    except Exception as e:
        logger.debug(f"[GEO] EDGAR supply chain extraction failed for {ticker}: {e}")

    return geo_data


def _get_supply_chain_geography(ticker: str) -> dict:
    """Assess supply chain geographic concentration risks.

    Checks for Taiwan/TSMC dependency, China manufacturing exposure,
    and other concentration risks from SEC filings.

    Returns:
        Dict with risk_level, countries, and details.
    """
    result = {
        "risk_level": "low",
        "taiwan_exposure": False,
        "china_manufacturing": False,
        "details": [],
        "source": "unavailable",
    }

    try:
        import edgar_data
        entities = edgar_data.extract_supply_chain_from_filing(ticker)
        if not entities:
            return result

        result["source"] = "sec_edgar"

        for entity in entities:
            name = (entity.get("entity") or "").lower()
            detail = (entity.get("detail") or "").lower()
            relationship = entity.get("relationship", "")

            # Check for Taiwan/TSMC dependency
            if any(tsmc.lower() in name for tsmc in TAIWAN_DEPENDENCY_COMPANIES):
                result["taiwan_exposure"] = True
                result["risk_level"] = "high"
                result["details"].append(
                    f"Critical supplier dependency on {entity.get('entity', 'Taiwan-based company')}"
                )

            # Check for Taiwan geographic concentration
            if relationship == "geographic_concentration" and "taiwan" in name.lower():
                result["taiwan_exposure"] = True
                result["details"].append(
                    f"Taiwan operations: {entity.get('detail', 'significant presence')}"
                )

            # Check for China manufacturing
            if relationship == "geographic_concentration" and "china" in name.lower():
                result["china_manufacturing"] = True
                result["details"].append(
                    f"China operations: {entity.get('detail', 'significant presence')}"
                )

            # Check for sole-source supplier risks in risky geographies
            if "sole" in detail and any(
                c in detail for c in ["china", "taiwan", "korea"]
            ):
                result["risk_level"] = "high"
                result["details"].append(
                    f"Sole-source supplier risk: {entity.get('detail', '')[:80]}"
                )

        # Upgrade risk level if China manufacturing is present
        if result["china_manufacturing"] and result["risk_level"] == "low":
            result["risk_level"] = "moderate"

    except Exception as e:
        logger.debug(f"[GEO] Supply chain geography check failed for {ticker}: {e}")

    return result


def _check_trade_restrictions(ticker: str) -> dict:
    """Check if company has trade restriction exposure.

    Currently uses sector-based heuristics. A production system would
    check against the BIS Entity List API.

    Returns:
        Dict with exposure level and details.
    """
    result = {
        "exposure": "none",
        "details": [],
        "source": "sector_heuristic",
    }

    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        info = stock.info or {}
        sector = info.get("sector", "")
        industry = info.get("industry", "")
    except Exception:
        try:
            import finnhub_client
            profile = finnhub_client.get_company_profile(ticker)
            sector = profile.get("finnhubIndustry", "") if profile else ""
            industry = sector
        except Exception:
            sector = ""
            industry = ""

    # CFIUS-scrutiny sectors
    cfius_sectors = {"Semiconductors", "Aerospace & Defense", "Telecommunications",
                     "Biotechnology", "Nuclear", "Critical Minerals"}
    if any(s.lower() in (industry or "").lower() for s in cfius_sectors):
        result["exposure"] = "moderate"
        result["details"].append(
            f"Industry ({industry}) subject to CFIUS foreign investment scrutiny"
        )

    # Trade-sensitive sectors
    if sector in TRADE_SENSITIVE_SECTORS:
        if result["exposure"] == "none":
            result["exposure"] = "low"
        result["details"].append(
            f"Sector ({sector}) has exposure to trade policy changes"
        )

    return result


def compute_geopolitical_score(ticker: str, gpr_data: dict) -> dict:
    """Score a stock's geopolitical exposure on a 1-10 scale.

    Higher score = lower geopolitical risk (more favorable).

    Factors assessed:
      a) Revenue geography — China/emerging market exposure
      b) Supply chain geography — Taiwan/TSMC concentration, China manufacturing
      c) Trade restriction exposure — Entity List, CFIUS scrutiny
      d) Global GPR level — amplifies/dampens stock-specific risk

    Scoring:
      - Low risk + low GPR = 8-10
      - Moderate risk OR elevated GPR = 5-7
      - High risk AND elevated GPR = 1-4

    Args:
        ticker: Stock ticker symbol.
        gpr_data: Output from get_geopolitical_risk_index().

    Returns:
        Dict with score (1-10) and scored components with rationales.
    """
    components = []
    raw_deductions = 0.0  # Start at 10, deduct for risks
    base_score = 10.0

    # a) Revenue Geography
    geo = _get_revenue_geography(ticker)
    geo_score = 0.0
    geo_rationale = "Geographic revenue data unavailable; assuming moderate exposure"

    china_pct = geo.get("china_pct", 0)
    emerging_pct = geo.get("emerging_pct", 0)
    taiwan_pct = geo.get("taiwan_pct", 0)

    if geo.get("source") != "unavailable":
        if china_pct > 30:
            geo_score = -2.0
            geo_rationale = f"{china_pct}% revenue from China; severely exposed to tariff escalation and trade restrictions"
        elif china_pct > 15:
            geo_score = -1.0
            geo_rationale = f"{china_pct}% revenue from China; moderate trade war exposure"
        elif china_pct > 5:
            geo_score = -0.5
            geo_rationale = f"{china_pct}% revenue from China; limited but present trade exposure"
        elif emerging_pct > 20:
            geo_score = -0.5
            geo_rationale = f"{emerging_pct}% revenue from emerging markets; currency and political risk"
        else:
            geo_score = 0.0
            geo_rationale = f"Revenue primarily from stable markets; limited geographic risk"
    else:
        geo_score = -0.5  # Unknown = slight negative assumption

    source_label = f"FY 10-K Geographic Revenue Breakdown" if geo.get("source") == "sec_edgar" else "Estimated"

    raw_deductions += geo_score
    components.append({
        "factor": "revenue_geography",
        "score": geo_score,
        "rationale": geo_rationale,
        "source": source_label,
    })

    # b) Supply Chain Geography
    supply = _get_supply_chain_geography(ticker)
    supply_score = 0.0
    supply_rationale = "Supply chain geography data unavailable"

    if supply.get("source") != "unavailable":
        if supply.get("taiwan_exposure"):
            supply_score = -1.5
            supply_rationale = "Critical supplier concentrated in Taiwan; exposed to cross-strait tensions"
        elif supply.get("china_manufacturing"):
            supply_score = -1.0
            supply_rationale = "Manufacturing operations in China; tariff and disruption exposure"
        elif supply.get("risk_level") == "moderate":
            supply_score = -0.5
            supply_rationale = "Some supply chain exposure to geopolitically sensitive regions"
        else:
            supply_score = 0.0
            supply_rationale = "Supply chain does not show significant geographic concentration risk"
    else:
        supply_score = -0.3  # Unknown = slight negative assumption

    if supply.get("details"):
        supply_rationale += f". {supply['details'][0]}"

    raw_deductions += supply_score
    components.append({
        "factor": "supply_chain_geography",
        "score": supply_score,
        "rationale": supply_rationale[:200],
        "source": "SEC EDGAR supply chain disclosure" if supply.get("source") == "sec_edgar" else "Heuristic",
    })

    # c) Trade Restrictions
    trade = _check_trade_restrictions(ticker)
    trade_score = 0.0
    trade_rationale = "No identified trade restriction exposure"

    if trade.get("exposure") == "severe":
        trade_score = -2.0
        trade_rationale = "Company or key suppliers on trade restriction lists"
    elif trade.get("exposure") == "moderate":
        trade_score = -1.0
        trade_rationale = trade.get("details", ["CFIUS scrutiny sector"])[0]
    elif trade.get("exposure") == "low":
        trade_score = -0.5
        trade_rationale = trade.get("details", ["Trade-sensitive sector"])[0]

    raw_deductions += trade_score
    components.append({
        "factor": "trade_restrictions",
        "score": trade_score,
        "rationale": trade_rationale,
        "source": "BIS Entity List review / sector analysis",
    })

    # d) Global GPR Level
    gpr_value = gpr_data.get("global_gpr", 100)
    gpr_trend = gpr_data.get("gpr_trend", "moderate")
    gpr_percentile = gpr_data.get("percentile_vs_history", 50)
    gpr_score = 0.0
    gpr_rationale = "GPR data unavailable"

    if gpr_trend == "low":
        gpr_score = 0.5
        gpr_rationale = f"Global geopolitical risk index at {gpr_value} (low); benign environment"
    elif gpr_trend == "moderate":
        gpr_score = 0.0
        gpr_rationale = f"Global geopolitical risk index at {gpr_value} (moderate); typical risk levels"
    elif gpr_trend == "elevated":
        gpr_score = -0.5
        gpr_rationale = f"Global geopolitical risk index at {gpr_value} (elevated vs historical median)"
    elif gpr_trend == "crisis":
        gpr_score = -1.5
        gpr_rationale = f"Global geopolitical risk index at {gpr_value} (crisis level); extreme caution warranted"

    raw_deductions += gpr_score
    components.append({
        "factor": "global_gpr",
        "score": gpr_score,
        "rationale": gpr_rationale,
        "source": "Caldara-Iacoviello GPR Index",
    })

    # Compute final score: base 10 + deductions, clamped to 1-10
    # raw_deductions range: -7 to +0.5
    final_score = base_score + raw_deductions
    final_score = round(max(1.0, min(10.0, final_score)), 1)

    return {
        "score": final_score,
        "components": components,
        "ticker": ticker,
        "gpr_value": gpr_value,
        "gpr_trend": gpr_trend,
    }
