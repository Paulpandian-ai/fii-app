"""DynamoDB helper service for FII.

All operations target the single-table design using PK/SK keys.
"""

import os
from typing import Any, Optional

import boto3
from boto3.dynamodb.conditions import Key

_table_name = os.environ.get("TABLE_NAME", "fii-table-dev")
_dynamodb = boto3.resource("dynamodb")
_table = _dynamodb.Table(_table_name)


def table():
    """Return the underlying DynamoDB Table resource (for scans, etc.)."""
    return _table


def get_item(pk: str, sk: str) -> Optional[dict]:
    """Retrieve a single item by primary key."""
    response = _table.get_item(Key={"PK": pk, "SK": sk})
    return response.get("Item")


def put_item(item: dict) -> None:
    """Write a single item. Must include PK and SK."""
    _table.put_item(Item=item)


def query(
    pk: str,
    sk_begins_with: Optional[str] = None,
    index_name: Optional[str] = None,
    limit: Optional[int] = None,
    scan_forward: bool = True,
) -> list[dict]:
    """Query items by partition key with optional sort key prefix.

    Args:
        pk: Partition key value.
        sk_begins_with: Optional sort key prefix filter.
        index_name: Optional GSI name (e.g., "GSI1").
        limit: Max number of items to return.
        scan_forward: True for ascending, False for descending.
    """
    pk_attr = "GSI1PK" if index_name == "GSI1" else "PK"
    sk_attr = "GSI1SK" if index_name == "GSI1" else "SK"

    key_condition = Key(pk_attr).eq(pk)
    if sk_begins_with:
        key_condition = key_condition & Key(sk_attr).begins_with(sk_begins_with)

    kwargs: dict[str, Any] = {
        "KeyConditionExpression": key_condition,
        "ScanIndexForward": scan_forward,
    }
    if index_name:
        kwargs["IndexName"] = index_name
    if limit:
        kwargs["Limit"] = limit

    response = _table.query(**kwargs)
    return response.get("Items", [])


def update_item(pk: str, sk: str, updates: dict) -> None:
    """Update specific attributes on an existing item.

    Args:
        pk: Partition key value.
        sk: Sort key value.
        updates: Dict of attribute names to new values.
    """
    update_parts = []
    expression_values = {}
    expression_names = {}

    for i, (attr, value) in enumerate(updates.items()):
        placeholder = f":val{i}"
        name_placeholder = f"#attr{i}"
        update_parts.append(f"{name_placeholder} = {placeholder}")
        expression_values[placeholder] = value
        expression_names[name_placeholder] = attr

    _table.update_item(
        Key={"PK": pk, "SK": sk},
        UpdateExpression="SET " + ", ".join(update_parts),
        ExpressionAttributeValues=expression_values,
        ExpressionAttributeNames=expression_names,
    )


def delete_item(pk: str, sk: str) -> None:
    """Delete a single item by primary key."""
    _table.delete_item(Key={"PK": pk, "SK": sk})


def batch_get(keys: list[dict], batch_size: int = 100) -> list[dict]:
    """Batch get items by their primary keys with automatic chunking.

    DynamoDB limits BatchGetItem to 100 keys per request. This function
    automatically chunks larger key lists into multiple requests.

    Args:
        keys: List of dicts, each with "PK" and "SK".
        batch_size: Max keys per request (default 100, DynamoDB limit).
    """
    formatted_keys = [{"PK": k["PK"], "SK": k["SK"]} for k in keys]
    all_items = []

    for i in range(0, len(formatted_keys), batch_size):
        chunk = formatted_keys[i : i + batch_size]
        response = _dynamodb.batch_get_item(
            RequestItems={_table_name: {"Keys": chunk}}
        )
        all_items.extend(response.get("Responses", {}).get(_table_name, []))

        # Handle unprocessed keys (throttling / partial results)
        unprocessed = response.get("UnprocessedKeys", {})
        while unprocessed.get(_table_name):
            response = _dynamodb.batch_get_item(RequestItems=unprocessed)
            all_items.extend(
                response.get("Responses", {}).get(_table_name, [])
            )
            unprocessed = response.get("UnprocessedKeys", {})

    return all_items


def query_between(
    pk: str,
    sk_start: str,
    sk_end: str,
    index_name: Optional[str] = None,
    limit: Optional[int] = None,
    scan_forward: bool = True,
) -> list[dict]:
    """Query items by partition key with a sort key BETWEEN range.

    Args:
        pk: Partition key value.
        sk_start: Sort key range start (inclusive).
        sk_end: Sort key range end (inclusive).
        index_name: Optional GSI name (e.g., "GSI1").
        limit: Max number of items to return.
        scan_forward: True for ascending, False for descending.
    """
    pk_attr = "GSI1PK" if index_name == "GSI1" else "PK"
    sk_attr = "GSI1SK" if index_name == "GSI1" else "SK"

    key_condition = Key(pk_attr).eq(pk) & Key(sk_attr).between(sk_start, sk_end)

    kwargs: dict[str, Any] = {
        "KeyConditionExpression": key_condition,
        "ScanIndexForward": scan_forward,
    }
    if index_name:
        kwargs["IndexName"] = index_name
    if limit:
        kwargs["Limit"] = limit

    response = _table.query(**kwargs)
    return response.get("Items", [])
