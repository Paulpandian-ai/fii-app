"""S3 helper service for FII.

All operations target the fii-data bucket.
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional

import boto3

_bucket_name = os.environ.get("BUCKET_NAME", "fii-data-dev")
_s3 = boto3.client("s3")


def read_json(key: str) -> Optional[dict]:
    """Read and parse a JSON file from S3.

    Args:
        key: S3 object key (e.g., "signals/NVDA/2024-01-15.json").

    Returns:
        Parsed JSON dict, or None if not found.
    """
    try:
        response = _s3.get_object(Bucket=_bucket_name, Key=key)
        content = response["Body"].read().decode("utf-8")
        return json.loads(content)
    except _s3.exceptions.NoSuchKey:
        return None


def write_json(key: str, data: dict) -> None:
    """Write a dict as JSON to S3.

    Args:
        key: S3 object key.
        data: Dict to serialize and store.
    """
    _s3.put_object(
        Bucket=_bucket_name,
        Key=key,
        Body=json.dumps(data, default=str),
        ContentType="application/json",
    )


def file_exists(key: str) -> bool:
    """Check if an object exists in S3."""
    try:
        _s3.head_object(Bucket=_bucket_name, Key=key)
        return True
    except _s3.exceptions.ClientError:
        return False


def get_file_age_hours(key: str) -> float:
    """Get the age of an S3 object in hours.

    Returns:
        Age in hours, or float('inf') if the file doesn't exist.
    """
    try:
        response = _s3.head_object(Bucket=_bucket_name, Key=key)
        last_modified = response["LastModified"]
        age = datetime.now(timezone.utc) - last_modified
        return age.total_seconds() / 3600
    except _s3.exceptions.ClientError:
        return float("inf")


def list_files(prefix: str) -> list[str]:
    """List all object keys under a prefix.

    Args:
        prefix: S3 key prefix (e.g., "signals/NVDA/").

    Returns:
        List of object keys.
    """
    paginator = _s3.get_paginator("list_objects_v2")
    keys = []

    for page in paginator.paginate(Bucket=_bucket_name, Prefix=prefix):
        for obj in page.get("Contents", []):
            keys.append(obj["Key"])

    return keys
