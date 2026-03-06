"""End-to-end pipeline test for FII signal engine.

Tests the complete pipeline for 5 stocks: NVDA, AAPL, MSFT, DELL, MSTR.
Validates DynamoDB records + API endpoint responses.

Run as a Lambda or standalone script (NOT pytest).

Usage:
    python test_pipeline_e2e.py                # Run against live DynamoDB
    python test_pipeline_e2e.py --json          # Output JSON report
"""

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

# Ensure shared layer is importable
sys.path.insert(0, "/opt/python")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "functions", "api_handler"))

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

TEST_TICKERS = ["NVDA", "AAPL", "MSFT", "DELL", "MSTR"]

DIMENSIONS = [
    "supply_chain_upstream",
    "supply_chain_downstream",
    "geopolitical",
    "monetary",
    "correlations",
    "risk_performance",
]


def _safe_float(val, default=None):
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _parse_json(val):
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    return val


class PipelineTestRunner:
    """Runs end-to-end pipeline checks and collects results."""

    def __init__(self, db_module=None, api_handler=None):
        self.db = db_module
        self.api_handler = api_handler
        self.results = {}
        self.start_time = None

    def _check(self, ticker: str, check_name: str, passed: bool, detail: str = ""):
        key = f"{ticker}/{check_name}"
        self.results[key] = {
            "ticker": ticker,
            "check": check_name,
            "passed": passed,
            "detail": detail,
        }
        status = "PASS" if passed else "FAIL"
        logger.info(f"  [{status}] {ticker}: {check_name}" + (f" — {detail}" if detail else ""))

    def _call_api(self, path: str, method: str = "GET", query_params: dict = None):
        """Simulate an API call through the handler."""
        if not self.api_handler:
            return None

        event = {
            "httpMethod": method,
            "path": path,
            "queryStringParameters": query_params or {},
            "headers": {},
            "body": None,
        }
        try:
            response = self.api_handler(event, None)
            status = response.get("statusCode", 500)
            body = response.get("body", "{}")
            if isinstance(body, str):
                body = json.loads(body)
            return {"status": status, "body": body}
        except Exception as e:
            return {"status": 500, "body": {"error": str(e)}}

    # ── Check 1: SIGNAL# record ──

    def check_signal_record(self, ticker: str):
        """Verify SIGNAL#LATEST record exists and has valid fields."""
        item = self.db.get_item(f"SIGNAL#{ticker}", "LATEST")
        if not item:
            self._check(ticker, "signal_exists", False, "No SIGNAL#LATEST record")
            return

        self._check(ticker, "signal_exists", True)

        # compositeScore
        cs = _safe_float(item.get("compositeScore"))
        self._check(
            ticker, "signal_composite_score",
            cs is not None and 1.0 <= cs <= 10.0,
            f"compositeScore={cs}",
        )

        # score_label
        label = item.get("score_label", "")
        self._check(
            ticker, "signal_score_label",
            label in ("Strong", "Favorable", "Neutral", "Weak", "Caution"),
            f"score_label='{label}'",
        )

    # ── Check 2: score_drivers ──

    def check_score_drivers(self, ticker: str):
        """Verify score_drivers has >= 2 non-empty entries."""
        item = self.db.get_item(f"SIGNAL#{ticker}", "LATEST")
        if not item:
            self._check(ticker, "score_drivers", False, "No signal record")
            return

        drivers = _parse_json(item.get("score_drivers", "[]"))
        if not isinstance(drivers, list):
            self._check(ticker, "score_drivers", False, "Not a list")
            return

        non_empty = [d for d in drivers if isinstance(d, dict) and d.get("factor")]
        self._check(
            ticker, "score_drivers",
            len(non_empty) >= 2,
            f"{len(non_empty)} non-empty drivers",
        )

    # ── Check 3: factor_percentiles ──

    def check_factor_percentiles(self, ticker: str):
        """Verify factor_percentiles has 6 dimensions with varied values."""
        item = self.db.get_item(f"SIGNAL#{ticker}", "LATEST")
        if not item:
            self._check(ticker, "factor_percentiles", False, "No signal record")
            return

        fp = _parse_json(item.get("factor_percentiles", "{}"))
        if not isinstance(fp, dict):
            self._check(ticker, "factor_percentiles", False, "Not a dict")
            return

        has_all = all(dim in fp for dim in DIMENSIONS)
        values = [_safe_float(fp.get(dim, 0)) for dim in DIMENSIONS]
        varied = len(set(values)) > 1

        self._check(
            ticker, "factor_percentiles_complete",
            has_all,
            f"{sum(1 for d in DIMENSIONS if d in fp)}/6 dimensions",
        )
        self._check(
            ticker, "factor_percentiles_varied",
            varied,
            f"unique values: {len(set(values))}",
        )

    # ── Check 4: FACTOR_DETAIL records ──

    def check_factor_details(self, ticker: str):
        """Verify FACTOR_DETAIL records exist for all 6 dimensions with findings."""
        found = 0
        with_findings = 0

        for dimension in DIMENSIONS:
            items = self.db.query(
                pk=f"FACTOR#{ticker.upper()}",
                sk_begins_with=f"{dimension}#",
                limit=1,
                scan_forward=False,
            )

            if items:
                found += 1
                detail = items[0]
                findings = detail.get("findings", [])
                if isinstance(findings, list) and len(findings) > 0:
                    # Check that findings have sources
                    sourced = sum(1 for f in findings if isinstance(f, dict) and f.get("source"))
                    if sourced > 0:
                        with_findings += 1

        self._check(
            ticker, "factor_details_exist",
            found == 6,
            f"{found}/6 dimensions have FACTOR_DETAIL records",
        )
        self._check(
            ticker, "factor_details_with_findings",
            with_findings >= 4,
            f"{with_findings}/6 dimensions have sourced findings",
        )

    # ── Check 5: FINANCIALS record ──

    def check_financials(self, ticker: str):
        """Verify FINANCIALS#LATEST has metrics across categories."""
        item = self.db.get_item(f"FINANCIALS#{ticker}", "LATEST")
        if not item:
            self._check(ticker, "financials_exists", False, "No FINANCIALS#LATEST record")
            return

        self._check(ticker, "financials_exists", True)

        # Count non-null metric fields (exclude PK, SK, metadata)
        metadata_keys = {"PK", "SK", "ticker", "computed_at", "last_updated", "TTL", "sector", "sector_stats", "metrics"}
        metrics = item.get("metrics", item)
        if isinstance(metrics, dict):
            metric_count = sum(
                1 for k, v in metrics.items()
                if k not in metadata_keys and v is not None
            )
        else:
            metric_count = 0

        self._check(
            ticker, "financials_metric_count",
            metric_count >= 20,
            f"{metric_count} non-null metrics",
        )

    # ── Check 6: STRESS record ──

    def check_stress(self, ticker: str):
        """Verify STRESS#LATEST has 4 scenarios with dollar amounts."""
        item = self.db.get_item(f"STRESS#{ticker}", "LATEST")
        if not item:
            self._check(ticker, "stress_exists", False, "No STRESS#LATEST record")
            return

        self._check(ticker, "stress_exists", True)

        scenarios = item.get("scenarios", [])
        if isinstance(scenarios, str):
            try:
                scenarios = json.loads(scenarios)
            except (json.JSONDecodeError, TypeError):
                scenarios = []

        scenario_count = len(scenarios) if isinstance(scenarios, list) else 0
        has_dollar = 0
        if isinstance(scenarios, list):
            for s in scenarios:
                if isinstance(s, dict) and (
                    s.get("dollarImpact") is not None
                    or s.get("dollar_impact") is not None
                    or s.get("portfolioImpact") is not None
                ):
                    has_dollar += 1

        self._check(
            ticker, "stress_scenario_count",
            scenario_count >= 4,
            f"{scenario_count} scenarios",
        )
        self._check(
            ticker, "stress_dollar_amounts",
            has_dollar >= 2,
            f"{has_dollar} scenarios with dollar amounts",
        )

    # ── Check 7: API endpoint responses ──

    def check_api_endpoints(self, ticker: str):
        """Test API endpoints return valid responses."""
        if not self.api_handler:
            self._check(ticker, "api_signal", False, "No API handler available")
            return

        # GET /signals/{ticker}
        resp = self._call_api(f"/signals/{ticker}")
        if resp:
            self._check(
                ticker, "api_signal",
                resp["status"] == 200 and resp["body"].get("ticker") == ticker,
                f"status={resp['status']}",
            )

        # GET /stocks/{ticker}/factors
        resp = self._call_api(f"/stocks/{ticker}/factors")
        if resp:
            body = resp["body"]
            dims = body.get("dimensions", {})
            self._check(
                ticker, "api_factors",
                resp["status"] == 200 and len(dims) >= 5,
                f"status={resp['status']}, {len(dims)} dimensions",
            )

        # GET /stocks/{ticker}/factors/supply_chain_upstream
        resp = self._call_api(f"/stocks/{ticker}/factors/supply_chain_upstream")
        if resp:
            body = resp["body"]
            findings = body.get("findings", [])
            self._check(
                ticker, "api_factor_detail",
                resp["status"] == 200 and len(findings) >= 1,
                f"status={resp['status']}, {len(findings)} findings",
            )

        # GET /stocks/{ticker}/financials
        resp = self._call_api(f"/stocks/{ticker}/financials")
        if resp:
            self._check(
                ticker, "api_financials",
                resp["status"] == 200,
                f"status={resp['status']}",
            )

        # GET /stock/{ticker}/stress-test/all
        resp = self._call_api(f"/stock/{ticker}/stress-test/all")
        if resp:
            body = resp["body"]
            scenarios = body.get("scenarios", [])
            self._check(
                ticker, "api_stress",
                resp["status"] == 200 and len(scenarios) >= 2,
                f"status={resp['status']}, {len(scenarios)} scenarios",
            )

    # ── Run all checks ──

    def run(self) -> dict:
        """Run full E2E pipeline test for all test tickers."""
        self.start_time = time.time()
        logger.info("=" * 60)
        logger.info("FII Pipeline End-to-End Test")
        logger.info(f"Tickers: {', '.join(TEST_TICKERS)}")
        logger.info(f"Started: {datetime.now(timezone.utc).isoformat()}")
        logger.info("=" * 60)

        for ticker in TEST_TICKERS:
            logger.info(f"\n── {ticker} ──")
            self.check_signal_record(ticker)
            self.check_score_drivers(ticker)
            self.check_factor_percentiles(ticker)
            self.check_factor_details(ticker)
            self.check_financials(ticker)
            self.check_stress(ticker)
            self.check_api_endpoints(ticker)

        elapsed = time.time() - self.start_time
        return self._build_report(elapsed)

    def _build_report(self, elapsed: float) -> dict:
        """Build the final test report."""
        passed = sum(1 for r in self.results.values() if r["passed"])
        failed = sum(1 for r in self.results.values() if not r["passed"])
        total = len(self.results)

        # Per-ticker summary
        ticker_summaries = {}
        for ticker in TEST_TICKERS:
            ticker_results = {k: v for k, v in self.results.items() if v["ticker"] == ticker}
            ticker_passed = sum(1 for r in ticker_results.values() if r["passed"])
            ticker_total = len(ticker_results)
            ticker_summaries[ticker] = {
                "passed": ticker_passed,
                "failed": ticker_total - ticker_passed,
                "total": ticker_total,
                "pass_rate": round(100 * ticker_passed / max(ticker_total, 1), 1),
            }

        failures = [
            {"key": k, **v}
            for k, v in self.results.items()
            if not v["passed"]
        ]

        report = {
            "test": "pipeline_e2e",
            "run_at": datetime.now(timezone.utc).isoformat(),
            "elapsed_seconds": round(elapsed, 2),
            "summary": {
                "passed": passed,
                "failed": failed,
                "total": total,
                "pass_rate": round(100 * passed / max(total, 1), 1),
            },
            "tickers": ticker_summaries,
            "failures": failures,
            "all_results": list(self.results.values()),
        }

        logger.info("\n" + "=" * 60)
        logger.info("RESULTS SUMMARY")
        logger.info(f"  Total:  {total}")
        logger.info(f"  Passed: {passed}")
        logger.info(f"  Failed: {failed}")
        logger.info(f"  Rate:   {report['summary']['pass_rate']}%")
        logger.info(f"  Time:   {elapsed:.2f}s")

        if failures:
            logger.info("\nFAILURES:")
            for f in failures:
                logger.info(f"  {f['key']}: {f.get('detail', '')}")

        logger.info("=" * 60)

        return report


# ── Lambda handler ──

def lambda_handler(event, context):
    """Lambda entry point for E2E pipeline test."""
    import db

    api_handler_fn = None
    try:
        from handler import lambda_handler as api_handler_fn
    except ImportError:
        logger.warning("API handler not available — skipping API endpoint tests")

    runner = PipelineTestRunner(db_module=db, api_handler=api_handler_fn)
    report = runner.run()

    # Store report in DynamoDB
    try:
        db.put_item({
            "PK": f"E2E_TEST#{report['run_at'][:10]}",
            "SK": report["run_at"],
            "test": "pipeline_e2e",
            "summary": report["summary"],
            "tickers": report["tickers"],
            "failure_count": report["summary"]["failed"],
            "pass_rate": str(report["summary"]["pass_rate"]),
        })
    except Exception as e:
        logger.warning(f"Failed to store E2E report: {e}")

    return {
        "statusCode": 200,
        "body": json.dumps(report, default=str),
    }


# ── CLI entry point ──

if __name__ == "__main__":
    import db

    api_handler_fn = None
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "functions", "api_handler"))
        from handler import lambda_handler as api_handler_fn
    except ImportError:
        logger.warning("API handler not importable — skipping API tests")

    runner = PipelineTestRunner(db_module=db, api_handler=api_handler_fn)
    report = runner.run()

    if "--json" in sys.argv:
        print(json.dumps(report, indent=2, default=str))
    else:
        sys.exit(0 if report["summary"]["failed"] == 0 else 1)
