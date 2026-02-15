#!/usr/bin/env python3
"""Seed script — Generate signals for the 15-stock FII universe.

Usage:
  # Via Lambda invocation (recommended — uses deployed infrastructure):
  python scripts/seed_signals.py --lambda

  # Via API endpoint (requires deployed API Gateway):
  python scripts/seed_signals.py --api --api-url https://xxx.execute-api.us-east-1.amazonaws.com/dev

  # Direct invocation (requires local AWS credentials + env vars):
  python scripts/seed_signals.py --direct

Environment variables (for --direct mode):
  TABLE_NAME       DynamoDB table name (default: fii-table)
  BUCKET_NAME      S3 bucket name (default: fii-data-dev)
  CLAUDE_API_KEY_ARN  Secrets Manager ARN for Claude API key
  FRED_API_KEY_ARN    Secrets Manager ARN for FRED API key
"""

import argparse
import json
import sys
import time

STOCK_UNIVERSE = [
    "NVDA", "AAPL", "MSFT", "AMD", "GOOGL",
    "AMZN", "META", "TSLA", "AVGO", "CRM",
    "NFLX", "JPM", "V", "UNH", "XOM",
]


def seed_via_lambda(stage="dev"):
    """Invoke the SignalEngine Lambda — one async invocation per stock."""
    import boto3

    client = boto3.client("lambda")
    function_name = f"fii-signal-engine-{stage}"

    print(f"Dispatching {function_name} for {len(STOCK_UNIVERSE)} stocks (async, one per stock)...")
    print(f"Tickers: {', '.join(STOCK_UNIVERSE)}")
    print()

    dispatched = 0
    errors = 0

    for ticker in STOCK_UNIVERSE:
        try:
            client.invoke(
                FunctionName=function_name,
                InvocationType="Event",
                Payload=json.dumps({"ticker": ticker}),
            )
            print(f"  {ticker:6s}  dispatched")
            dispatched += 1
        except Exception as e:
            print(f"  {ticker:6s}  FAILED: {e}")
            errors += 1

    print(f"\nDispatched: {dispatched}, Errors: {errors}")
    print("Signals will be generated asynchronously. Check DynamoDB/S3 for results.")


def seed_via_api(api_url):
    """Generate signals via the API endpoint."""
    import requests

    print(f"API URL: {api_url}")
    print(f"Generating signals for {len(STOCK_UNIVERSE)} stocks...")
    print()

    success = 0
    errors = 0

    for ticker in STOCK_UNIVERSE:
        print(f"  Generating {ticker}...", end=" ", flush=True)
        try:
            response = requests.post(
                f"{api_url}/signals/generate/{ticker}",
                timeout=300,
            )
            if response.status_code == 200:
                data = response.json()
                result = data.get("result", {})
                results_list = result.get("results", [])
                if results_list:
                    r = results_list[0]
                    print(f"score={r.get('score', '?')} signal={r.get('signal', '?')}")
                else:
                    print("OK")
                success += 1
            else:
                print(f"FAILED ({response.status_code})")
                errors += 1
        except Exception as e:
            print(f"ERROR: {e}")
            errors += 1

        # Brief delay between requests to avoid throttling
        time.sleep(1)

    print(f"\nCompleted: {success} success, {errors} errors")


def seed_direct():
    """Run signal engine directly (requires local environment setup)."""
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "functions", "signal_engine"))

    # Set default env vars if not present
    os.environ.setdefault("TABLE_NAME", "fii-table")
    os.environ.setdefault("BUCKET_NAME", "fii-data-dev")

    from handler import analyze_ticker

    print(f"Running direct analysis for {len(STOCK_UNIVERSE)} stocks...")
    print()

    success = 0
    errors = 0

    for ticker in STOCK_UNIVERSE:
        print(f"  Analyzing {ticker}...", end=" ", flush=True)
        try:
            result = analyze_ticker(ticker)
            print(
                f"score={result['compositeScore']:4.1f}  "
                f"signal={result['signal']}  "
                f"confidence={result['confidence']}"
            )
            success += 1
        except Exception as e:
            print(f"ERROR: {e}")
            errors += 1

    print(f"\nCompleted: {success} success, {errors} errors")


def main():
    parser = argparse.ArgumentParser(
        description="Seed FII signals for the 15-stock universe"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--lambda", dest="use_lambda", action="store_true",
                       help="Invoke SignalEngine Lambda directly")
    group.add_argument("--api", action="store_true",
                       help="Use API endpoint")
    group.add_argument("--direct", action="store_true",
                       help="Run signal engine directly (local)")

    parser.add_argument("--stage", default="dev",
                        help="AWS stage (default: dev)")
    parser.add_argument("--api-url", default=None,
                        help="API Gateway URL (required for --api)")

    args = parser.parse_args()

    if args.use_lambda:
        seed_via_lambda(args.stage)
    elif args.api:
        if not args.api_url:
            print("Error: --api-url is required when using --api mode")
            sys.exit(1)
        seed_via_api(args.api_url)
    elif args.direct:
        seed_direct()


if __name__ == "__main__":
    main()
