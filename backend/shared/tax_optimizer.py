"""Tax Optimization Education Module for FII.

Surfaces tax-saving opportunities for educational purposes without
providing personalized tax advice.

Functions:
  - detect_tax_loss_opportunities(holdings)  — Tax-loss harvesting detection
  - check_wash_sale_risk(ticker, recent_transactions) — Wash sale rule checker
  - compare_tax_lot_methods(ticker, shares_to_sell, lots) — Lot method comparison
  - get_tax_summary(holdings) — Annual tax summary overview
"""

import logging
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

TAX_DISCLAIMER = (
    "Tax information is educational only. Consult a qualified tax professional."
)

# Federal tax brackets for estimation
TAX_BRACKETS = {
    "bracket_22": 0.22,
    "bracket_32": 0.32,
    "bracket_37": 0.37,
}

# Long-term capital gains rates
LTCG_RATES = {
    "rate_0": 0.00,
    "rate_15": 0.15,
    "rate_20": 0.20,
}

LONG_TERM_DAYS = 365

# Substantially identical securities map for wash sale detection
SUBSTANTIALLY_IDENTICAL = {
    "VOO": ["SPY", "IVV", "SPLG"],
    "SPY": ["VOO", "IVV", "SPLG"],
    "IVV": ["VOO", "SPY", "SPLG"],
    "SPLG": ["VOO", "SPY", "IVV"],
    "QQQ": ["QQQM", "QQQE"],
    "QQQM": ["QQQ", "QQQE"],
    "VTI": ["ITOT", "SPTM"],
    "ITOT": ["VTI", "SPTM"],
    "SPTM": ["VTI", "ITOT"],
    "VTV": ["IWD", "SPYV"],
    "IWD": ["VTV", "SPYV"],
    "VUG": ["IWF", "SPYG"],
    "IWF": ["VUG", "SPYG"],
    "IWM": ["VTWO", "SCHA"],
    "VTWO": ["IWM", "SCHA"],
    "XLK": ["VGT", "IYW"],
    "VGT": ["XLK", "IYW"],
    "XLF": ["VFH", "IYF"],
    "VFH": ["XLF", "IYF"],
    "XLE": ["VDE", "IYE"],
    "VDE": ["XLE", "IYE"],
    "XLV": ["VHT", "IYH"],
    "VHT": ["XLV", "IYH"],
    "XLI": ["VIS", "IYJ"],
    "XLU": ["VPU", "IDU"],
    "XLRE": ["VNQ", "IYR"],
    "VNQ": ["XLRE", "IYR"],
    "XLP": ["VDC", "IYK"],
    "XLY": ["VCR", "IYC"],
    "XLC": ["VOX"],
    "VOX": ["XLC"],
    "DIA": ["UDOW"],
    "ARKK": ["ARKG", "ARKW"],
}


def _fetch_current_price(ticker: str) -> Optional[float]:
    """Fetch current price from Finnhub."""
    try:
        import finnhub_client
        quote = finnhub_client.get_quote(ticker)
        if quote and quote.get("price", 0) > 0:
            return float(quote["price"])
    except Exception as e:
        logger.warning(f"[Tax] Failed to fetch price for {ticker}: {e}")
    return None


def _parse_date(date_str: str) -> Optional[datetime]:
    """Parse a date string into a datetime object."""
    if not date_str:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ",
                "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            dt = datetime.strptime(date_str, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def _days_held(date_added: str) -> Optional[int]:
    """Compute days held from a dateAdded string."""
    dt = _parse_date(date_added)
    if dt is None:
        return None
    now = datetime.now(timezone.utc)
    return (now - dt).days


def _holding_period(days: Optional[int]) -> str:
    """Classify as short-term or long-term based on days held."""
    if days is None:
        return "unknown"
    return "long_term" if days >= LONG_TERM_DAYS else "short_term"


# ─── Part A: Tax-Loss Harvesting Detection ───


def detect_tax_loss_opportunities(holdings: list[dict]) -> dict:
    """Detect tax-loss harvesting opportunities in the portfolio.

    For each position with cost basis, fetches current price and computes
    unrealized gain/loss, holding period classification, and estimated
    tax savings at common federal brackets.

    Args:
        holdings: List of holding dicts with keys:
            - ticker (str)
            - shares (float)
            - avgCost or cost_basis (float)
            - dateAdded (str, optional): ISO date string

    Returns:
        Dict with harvesting opportunities, threshold alerts, and totals.
    """
    if not holdings:
        return {
            "total_unrealized_losses": 0,
            "total_unrealized_gains": 0,
            "harvesting_opportunities": [],
            "long_term_threshold_alerts": [],
            "estimated_total_benefit": "$0",
            "disclaimer": TAX_DISCLAIMER,
        }

    # Fetch all current prices in parallel
    tickers = list({h["ticker"] for h in holdings})
    price_map = {}
    with ThreadPoolExecutor(max_workers=min(10, len(tickers))) as executor:
        futures = {executor.submit(_fetch_current_price, t): t for t in tickers}
        for future in as_completed(futures):
            t = futures[future]
            try:
                price_map[t] = future.result()
            except Exception:
                price_map[t] = None

    opportunities = []
    threshold_alerts = []
    total_unrealized_losses = 0.0
    total_unrealized_gains = 0.0

    for h in holdings:
        ticker = h["ticker"]
        shares = float(h.get("shares", 0))
        cost_basis = float(h.get("cost_basis", h.get("avgCost", 0)))
        date_added = h.get("dateAdded", "")

        if shares <= 0 or cost_basis <= 0:
            continue

        current_price = price_map.get(ticker)
        if current_price is None:
            current_price = cost_basis  # Fallback

        total_cost = shares * cost_basis
        current_value = shares * current_price
        unrealized_gl = current_value - total_cost

        days = _days_held(date_added)
        period = _holding_period(days)

        if unrealized_gl < 0:
            # This is a harvesting opportunity
            total_unrealized_losses += unrealized_gl
            loss_amount = abs(unrealized_gl)

            # Estimate tax savings at each bracket
            estimated_savings = {}
            for bracket_name, rate in TAX_BRACKETS.items():
                if period == "short_term":
                    savings = loss_amount * rate
                else:
                    # Long-term losses offset long-term gains at LTCG rates
                    savings = loss_amount * 0.15  # Assume 15% LTCG
                estimated_savings[bracket_name] = round(savings, 2)

            educational_note = (
                f"Selling could generate a ${loss_amount:,.0f} "
                f"{'short-term' if period == 'short_term' else 'long-term'} loss "
                f"that may offset capital gains. "
            )
            if period == "short_term":
                educational_note += (
                    "Short-term losses first offset short-term gains "
                    "(taxed as ordinary income)."
                )
            else:
                educational_note += (
                    "Long-term losses first offset long-term gains "
                    "(taxed at preferential rates of 0-20%)."
                )

            opportunities.append({
                "ticker": ticker,
                "shares": shares,
                "cost_basis": round(cost_basis, 2),
                "current_price": round(current_price, 2),
                "unrealized_loss": round(unrealized_gl, 2),
                "loss_pct": round((unrealized_gl / total_cost) * 100, 2),
                "holding_period": period,
                "days_held": days,
                "estimated_tax_savings": estimated_savings,
                "educational_note": educational_note,
            })
        else:
            total_unrealized_gains += unrealized_gl

        # Long-term threshold alerts: approaching 365-day mark
        if days is not None and 300 <= days < LONG_TERM_DAYS and unrealized_gl > 0:
            days_to_lt = LONG_TERM_DAYS - days
            threshold_alerts.append({
                "ticker": ticker,
                "days_held": days,
                "days_to_long_term": days_to_lt,
                "unrealized_gain": round(unrealized_gl, 2),
                "note": (
                    f"If held {days_to_lt} more days, gains taxed at "
                    f"long-term capital gains rates (0-20%) instead of "
                    f"ordinary income rates (up to 37%)."
                ),
            })

    # Sort opportunities by largest loss first
    opportunities.sort(key=lambda x: x["unrealized_loss"])

    # Compute estimated total benefit range
    total_loss = abs(total_unrealized_losses)
    low_benefit = total_loss * 0.22
    high_benefit = total_loss * 0.37
    if total_loss > 0:
        benefit_str = f"${low_benefit:,.0f} - ${high_benefit:,.0f}"
    else:
        benefit_str = "$0"

    return {
        "total_unrealized_losses": round(total_unrealized_losses, 2),
        "total_unrealized_gains": round(total_unrealized_gains, 2),
        "harvesting_opportunities": opportunities,
        "long_term_threshold_alerts": threshold_alerts,
        "estimated_total_benefit": benefit_str,
        "positions_analyzed": len(holdings),
        "disclaimer": TAX_DISCLAIMER,
    }


# ─── Part B: Wash Sale Tracker ───


def check_wash_sale_risk(
    ticker: str,
    recent_transactions: list[dict],
) -> dict:
    """Check for wash sale risk within the 61-day window.

    The IRS wash sale rule disallows a tax loss if a substantially
    identical security is purchased within 30 days before or after
    the sale at a loss.

    Args:
        ticker: The ticker being sold.
        recent_transactions: List of transaction dicts with keys:
            - ticker (str)
            - action (str): "buy" or "sell"
            - date (str): ISO date string
            - shares (float)
            - price (float)

    Returns:
        Dict with wash sale risk assessment.
    """
    if not recent_transactions:
        return {
            "ticker": ticker,
            "wash_sale_risk": False,
            "warnings": [],
            "educational_note": (
                "No recent transactions found to check against the "
                "61-day wash sale window."
            ),
            "disclaimer": TAX_DISCLAIMER,
        }

    # Build set of substantially identical securities
    identical = set(SUBSTANTIALLY_IDENTICAL.get(ticker, []))
    identical.add(ticker)

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=30)
    window_end = now + timedelta(days=30)

    warnings = []
    risk_found = False

    for txn in recent_transactions:
        txn_ticker = txn.get("ticker", "")
        txn_action = txn.get("action", "").lower()
        txn_date_str = txn.get("date", "")
        txn_date = _parse_date(txn_date_str)

        if txn_date is None:
            continue

        # Check if this is a buy of a substantially identical security
        if txn_ticker in identical and txn_action == "buy":
            if window_start <= txn_date <= window_end:
                risk_found = True
                days_from_now = (txn_date - now).days
                position = "before" if days_from_now < 0 else "after"
                warnings.append({
                    "type": "wash_sale_trigger",
                    "ticker": txn_ticker,
                    "date": txn_date_str,
                    "shares": txn.get("shares", 0),
                    "days_from_sale": abs(days_from_now),
                    "position": position,
                    "note": (
                        f"Purchase of {txn_ticker} on {txn_date_str} "
                        f"({abs(days_from_now)} days {position} potential sale) "
                        f"may trigger wash sale rule."
                    ),
                })

        # Check for same-ticker repurchase
        if txn_ticker == ticker and txn_action == "buy":
            if window_start <= txn_date <= window_end:
                # Already caught above, but add specific note
                pass

    educational_note = (
        "The IRS wash sale rule (Section 1091) disallows claiming a tax "
        "loss if you buy the same or a 'substantially identical' security "
        "within 30 days before or after the sale. This includes purchases "
        "in IRAs, spouse accounts, and related entities."
    )
    if risk_found:
        educational_note += (
            " WARNING: Potential wash sale detected. The disallowed loss "
            "is added to the cost basis of the replacement shares."
        )

    return {
        "ticker": ticker,
        "wash_sale_risk": risk_found,
        "substantially_identical_securities": sorted(identical),
        "wash_sale_window": {
            "start": window_start.strftime("%Y-%m-%d"),
            "end": window_end.strftime("%Y-%m-%d"),
        },
        "warnings": warnings,
        "educational_note": educational_note,
        "disclaimer": TAX_DISCLAIMER,
    }


# ─── Part C: Tax Lot Optimizer ───


def compare_tax_lot_methods(
    ticker: str,
    shares_to_sell: float,
    lots: list[dict],
) -> dict:
    """Compare tax impact under different lot selection methods.

    Methods compared:
      - FIFO (First In, First Out): Sell oldest lots first
      - LIFO (Last In, First Out): Sell newest lots first
      - HIFO (Highest In, First Out): Sell highest cost lots first
      - Tax-Optimized: Minimize current-year tax liability

    Args:
        ticker: Stock ticker.
        shares_to_sell: Number of shares to sell.
        lots: List of tax lot dicts with keys:
            - shares (float)
            - cost_basis (float): Per-share cost
            - date_acquired (str): ISO date
            - lot_id (str, optional)

    Returns:
        Dict comparing tax impact across all methods.
    """
    if not lots or shares_to_sell <= 0:
        return {
            "ticker": ticker,
            "error": "No lots provided or invalid share count",
            "disclaimer": TAX_DISCLAIMER,
        }

    # Fetch current price
    current_price = _fetch_current_price(ticker)
    if current_price is None:
        # Try to estimate from lots
        if lots:
            current_price = float(lots[0].get("cost_basis", 100))
        else:
            return {
                "ticker": ticker,
                "error": "Unable to fetch current price",
                "disclaimer": TAX_DISCLAIMER,
            }

    total_available = sum(float(lot.get("shares", 0)) for lot in lots)
    if shares_to_sell > total_available:
        return {
            "ticker": ticker,
            "error": f"Requested {shares_to_sell} shares but only {total_available} available",
            "disclaimer": TAX_DISCLAIMER,
        }

    # Enrich lots with computed fields
    enriched_lots = []
    for i, lot in enumerate(lots):
        lot_shares = float(lot.get("shares", 0))
        lot_cost = float(lot.get("cost_basis", 0))
        date_acq = lot.get("date_acquired", "")
        days = _days_held(date_acq)
        period = _holding_period(days)

        enriched_lots.append({
            "lot_id": lot.get("lot_id", f"lot_{i + 1}"),
            "shares": lot_shares,
            "cost_basis": lot_cost,
            "date_acquired": date_acq,
            "days_held": days,
            "holding_period": period,
            "unrealized_per_share": round(current_price - lot_cost, 2),
        })

    methods = {}

    # FIFO: sort by date ascending (oldest first)
    fifo_lots = sorted(enriched_lots, key=lambda x: x.get("days_held") or 9999, reverse=True)
    methods["FIFO"] = _compute_lot_tax(fifo_lots, shares_to_sell, current_price, "First In, First Out")

    # LIFO: sort by date descending (newest first)
    lifo_lots = sorted(enriched_lots, key=lambda x: x.get("days_held") or 0, reverse=False)
    methods["LIFO"] = _compute_lot_tax(lifo_lots, shares_to_sell, current_price, "Last In, First Out")

    # HIFO: sort by cost basis descending (highest cost first)
    hifo_lots = sorted(enriched_lots, key=lambda x: x["cost_basis"], reverse=True)
    methods["HIFO"] = _compute_lot_tax(hifo_lots, shares_to_sell, current_price, "Highest In, First Out")

    # Tax-Optimized: minimize tax
    # Strategy: sell losses first (short-term losses most valuable),
    # then long-term gains (lower rate), then short-term gains last
    def tax_priority(lot):
        gain = current_price - lot["cost_basis"]
        period = lot["holding_period"]
        if gain < 0 and period == "short_term":
            return 0  # Best: short-term loss
        elif gain < 0 and period == "long_term":
            return 1  # Good: long-term loss
        elif gain >= 0 and period == "long_term":
            return 2  # OK: long-term gain (lower rate)
        else:
            return 3  # Worst: short-term gain (highest rate)

    optimized_lots = sorted(enriched_lots, key=tax_priority)
    methods["Tax-Optimized"] = _compute_lot_tax(
        optimized_lots, shares_to_sell, current_price, "Minimize Tax Liability"
    )

    # Find best method
    best_method = min(methods.items(), key=lambda x: x[1]["estimated_tax"])
    worst_method = max(methods.items(), key=lambda x: x[1]["estimated_tax"])
    savings = worst_method[1]["estimated_tax"] - best_method[1]["estimated_tax"]

    return {
        "ticker": ticker,
        "current_price": round(current_price, 2),
        "shares_to_sell": shares_to_sell,
        "total_proceeds": round(shares_to_sell * current_price, 2),
        "methods": methods,
        "recommendation": {
            "best_method": best_method[0],
            "worst_method": worst_method[0],
            "potential_savings": round(savings, 2),
            "note": (
                f"Using {best_method[0]} instead of {worst_method[0]} "
                f"could save approximately ${savings:,.0f} in estimated taxes."
                if savings > 0 else "All methods produce similar tax outcomes."
            ),
        },
        "available_lots": enriched_lots,
        "disclaimer": TAX_DISCLAIMER,
    }


def _compute_lot_tax(
    ordered_lots: list[dict],
    shares_to_sell: float,
    current_price: float,
    description: str,
) -> dict:
    """Compute estimated tax for selling shares in the given lot order."""
    remaining = shares_to_sell
    total_gain = 0.0
    st_gain = 0.0
    lt_gain = 0.0
    st_loss = 0.0
    lt_loss = 0.0
    lots_used = []

    for lot in ordered_lots:
        if remaining <= 0:
            break

        sell_shares = min(remaining, lot["shares"])
        gain = sell_shares * (current_price - lot["cost_basis"])

        lots_used.append({
            "lot_id": lot["lot_id"],
            "shares_sold": sell_shares,
            "cost_basis": lot["cost_basis"],
            "gain_loss": round(gain, 2),
            "holding_period": lot["holding_period"],
        })

        total_gain += gain
        if lot["holding_period"] == "short_term":
            if gain >= 0:
                st_gain += gain
            else:
                st_loss += gain
        else:
            if gain >= 0:
                lt_gain += gain
            else:
                lt_loss += gain

        remaining -= sell_shares

    # Estimate tax using middle bracket (32%) for short-term, 15% for long-term
    st_tax = (st_gain + st_loss) * 0.32  # Net short-term at 32%
    lt_tax = (lt_gain + lt_loss) * 0.15  # Net long-term at 15%
    estimated_tax = max(0, st_tax) + max(0, lt_tax)

    return {
        "description": description,
        "total_gain_loss": round(total_gain, 2),
        "short_term_gain": round(st_gain, 2),
        "short_term_loss": round(st_loss, 2),
        "long_term_gain": round(lt_gain, 2),
        "long_term_loss": round(lt_loss, 2),
        "estimated_tax": round(estimated_tax, 2),
        "effective_rate": round(
            (estimated_tax / total_gain * 100) if total_gain > 0 else 0, 2
        ),
        "lots_used": lots_used,
    }


# ─── Tax Summary ───


def get_tax_summary(holdings: list[dict]) -> dict:
    """Generate annual tax summary overview for the portfolio.

    Args:
        holdings: List of holding dicts (same format as other functions).

    Returns:
        Dict with categorized gains/losses and educational guidance.
    """
    if not holdings:
        return {
            "short_term": {"gains": 0, "losses": 0, "net": 0},
            "long_term": {"gains": 0, "losses": 0, "net": 0},
            "total_net": 0,
            "loss_carryforward_note": None,
            "disclaimer": TAX_DISCLAIMER,
        }

    # Fetch prices in parallel
    tickers = list({h["ticker"] for h in holdings})
    price_map = {}
    with ThreadPoolExecutor(max_workers=min(10, len(tickers))) as executor:
        futures = {executor.submit(_fetch_current_price, t): t for t in tickers}
        for future in as_completed(futures):
            t = futures[future]
            try:
                price_map[t] = future.result()
            except Exception:
                price_map[t] = None

    st_gains = 0.0
    st_losses = 0.0
    lt_gains = 0.0
    lt_losses = 0.0
    positions = []

    for h in holdings:
        ticker = h["ticker"]
        shares = float(h.get("shares", 0))
        cost_basis = float(h.get("cost_basis", h.get("avgCost", 0)))
        date_added = h.get("dateAdded", "")

        if shares <= 0 or cost_basis <= 0:
            continue

        current_price = price_map.get(ticker, cost_basis)
        if current_price is None:
            current_price = cost_basis

        unrealized = shares * (current_price - cost_basis)
        days = _days_held(date_added)
        period = _holding_period(days)

        if period == "short_term":
            if unrealized >= 0:
                st_gains += unrealized
            else:
                st_losses += unrealized
        else:
            if unrealized >= 0:
                lt_gains += unrealized
            else:
                lt_losses += unrealized

        positions.append({
            "ticker": ticker,
            "unrealized": round(unrealized, 2),
            "holding_period": period,
            "days_held": days,
        })

    st_net = st_gains + st_losses
    lt_net = lt_gains + lt_losses
    total_net = st_net + lt_net

    # Estimated tax impact
    st_tax = st_net * 0.32 if st_net > 0 else 0  # 32% bracket estimate
    lt_tax = lt_net * 0.15 if lt_net > 0 else 0  # 15% LTCG estimate
    estimated_tax = max(0, st_tax) + max(0, lt_tax)

    # Loss carryforward note
    loss_note = None
    net_loss = st_net + lt_net
    if net_loss < 0:
        deductible = min(abs(net_loss), 3000)
        carryforward = abs(net_loss) - deductible
        loss_note = (
            f"Net capital losses of ${abs(net_loss):,.0f} detected. "
            f"Up to $3,000 can be deducted against ordinary income per year. "
        )
        if carryforward > 0:
            loss_note += (
                f"Remaining ${carryforward:,.0f} can be carried forward "
                f"to future tax years indefinitely."
            )

    # Tax optimization tips
    tips = []
    if st_gains > 1000:
        tips.append(
            "Consider holding short-term gain positions longer to qualify "
            "for lower long-term capital gains rates."
        )
    if st_losses < -500:
        tips.append(
            "Short-term losses can offset short-term gains first, "
            "potentially saving at your marginal tax rate."
        )
    if lt_losses < -500 and lt_gains > 0:
        tips.append(
            "Long-term losses can offset long-term gains, "
            "reducing tax at the LTCG rate."
        )
    if not tips:
        tips.append(
            "Review your portfolio regularly to identify tax-saving opportunities."
        )

    return {
        "short_term": {
            "gains": round(st_gains, 2),
            "losses": round(st_losses, 2),
            "net": round(st_net, 2),
            "estimated_tax_rate": "22-37% (ordinary income)",
        },
        "long_term": {
            "gains": round(lt_gains, 2),
            "losses": round(lt_losses, 2),
            "net": round(lt_net, 2),
            "estimated_tax_rate": "0-20% (preferential)",
        },
        "total_net": round(total_net, 2),
        "estimated_tax_liability": round(estimated_tax, 2),
        "loss_carryforward_note": loss_note,
        "positions": sorted(positions, key=lambda x: x["unrealized"]),
        "tips": tips,
        "disclaimer": TAX_DISCLAIMER,
    }
