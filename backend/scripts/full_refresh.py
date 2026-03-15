"""
Full Data Refresh Script for FII Signal Engine
================================================
Triggers the signal engine Lambda in batch mode to score all 547 stocks.

Usage:
    python backend/scripts/full_refresh.py

PowerShell alternative (AWS CLI):
    See inline comments below or README for manual batch invocation.
"""

import boto3
import json
import time

lambda_client = boto3.client('lambda', region_name='us-east-1')

# Score in 6 parallel batches of ~92 stocks each
BATCH_SIZE = 92
TOTAL_STOCKS = 547

for i in range(0, TOTAL_STOCKS, BATCH_SIZE):
    payload = {
        "batch_start": i,
        "batch_size": BATCH_SIZE
    }
    print(f"Invoking batch {i}-{i+BATCH_SIZE}...")
    lambda_client.invoke(
        FunctionName='fii-signal-engine-dev',
        InvocationType='Event',  # async
        Payload=json.dumps(payload)
    )
    time.sleep(2)  # Brief delay between invocations

print(f"All {TOTAL_STOCKS // BATCH_SIZE + 1} batches launched.")
print("Monitor in CloudWatch. Expected completion: 10-15 minutes.")

# ---------------------------------------------------------------
# PowerShell Commands (manual invocation via AWS CLI)
# ---------------------------------------------------------------
#
# Option A: Run this Python script
#   python backend/scripts/full_refresh.py
#
# Option B: Manual invocation via AWS CLI (6 batches)
#
# Batch 1: stocks 0-91
#   '{"batch_start":0,"batch_size":92}' | Out-File -Encoding ascii batch1.json
#   aws lambda invoke --function-name fii-signal-engine-dev --cli-binary-format raw-in-base64-out --payload fileb://batch1.json --invocation-type Event out1.json
#
# Batch 2: stocks 92-183
#   '{"batch_start":92,"batch_size":92}' | Out-File -Encoding ascii batch2.json
#   aws lambda invoke --function-name fii-signal-engine-dev --cli-binary-format raw-in-base64-out --payload fileb://batch2.json --invocation-type Event out2.json
#
# Batch 3: stocks 184-275
#   '{"batch_start":184,"batch_size":92}' | Out-File -Encoding ascii batch3.json
#   aws lambda invoke --function-name fii-signal-engine-dev --cli-binary-format raw-in-base64-out --payload fileb://batch3.json --invocation-type Event out3.json
#
# Batch 4: stocks 276-367
#   '{"batch_start":276,"batch_size":92}' | Out-File -Encoding ascii batch4.json
#   aws lambda invoke --function-name fii-signal-engine-dev --cli-binary-format raw-in-base64-out --payload fileb://batch4.json --invocation-type Event out4.json
#
# Batch 5: stocks 368-459
#   '{"batch_start":368,"batch_size":92}' | Out-File -Encoding ascii batch5.json
#   aws lambda invoke --function-name fii-signal-engine-dev --cli-binary-format raw-in-base64-out --payload fileb://batch5.json --invocation-type Event out5.json
#
# Batch 6: stocks 460-547
#   '{"batch_start":460,"batch_size":92}' | Out-File -Encoding ascii batch6.json
#   aws lambda invoke --function-name fii-signal-engine-dev --cli-binary-format raw-in-base64-out --payload fileb://batch6.json --invocation-type Event out6.json
#
# After all batches complete, trigger financial metrics:
#   '{"compute_financials":true}' | Out-File -Encoding ascii fin.json
#   aws lambda invoke --function-name fii-feed-compiler-dev --cli-binary-format raw-in-base64-out --payload fileb://fin.json --invocation-type Event fin_out.json
#
# Check coverage:
#   Invoke-RestMethod "https://ix1rrsln51.execute-api.us-east-1.amazonaws.com/dev/admin/data-coverage"
