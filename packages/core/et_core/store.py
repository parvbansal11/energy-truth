"""Curated-data store.

Locally, curated tables are JSON documents under data/curated/. When deployed (S3_CURATED_BUCKET set),
the same documents are read from S3 and table rows are mirrored to DynamoDB (plan §9.1)."""
from __future__ import annotations

import json
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import settings

TABLES = ["Company", "Asset", "Ownership", "Disclosure", "Estimate", "ForecastRun", "AgentRun", "Alert"]


class Store:
    def __init__(self, root: Path | None = None):
        self.root = root or settings.curated_dir

    # ---- documents -------------------------------------------------------
    def write(self, name: str, doc: Any, compact: bool = False) -> Path:
        self.root.mkdir(parents=True, exist_ok=True)
        p = self.root / f"{name}.json"
        p.write_text(json.dumps(doc, default=str, separators=(",", ":")) if compact else json.dumps(doc, indent=1, default=str))
        if settings.s3_curated_bucket:
            try:
                import boto3

                boto3.client("s3", region_name=settings.region).put_object(
                    Bucket=settings.s3_curated_bucket, Key=f"curated/{name}.json", Body=p.read_bytes(), ContentType="application/json"
                )
            except Exception:
                pass
        _read_cached.cache_clear()
        return p

    def read(self, name: str, default: Any = None) -> Any:
        try:
            return _read_cached(str(self.root), name)
        except FileNotFoundError:
            return default

    # ---- DynamoDB mirror -------------------------------------------------
    def put_rows(self, table: str, rows: list[dict[str, Any]], pk: str, sk: str) -> int:
        """Mirror rows to DynamoDB table `<prefix><table>` with generic pk/sk keys. No-op locally."""
        if not settings.aws_enabled:
            return 0
        import boto3

        t = boto3.resource("dynamodb", region_name=settings.region).Table(f"{settings.ddb_prefix}{table}")
        with t.batch_writer(overwrite_by_pkeys=["pk", "sk"]) as bw:
            for r in rows:
                item = json.loads(json.dumps(r, default=str), parse_float=Decimal)
                item["pk"], item["sk"] = str(r[pk]), str(r[sk]) if sk in r else "#"
                bw.put_item(Item=item)
        return len(rows)


@lru_cache(maxsize=64)
def _read_cached(root: str, name: str) -> Any:
    p = Path(root) / f"{name}.json"
    if p.exists():
        return json.loads(p.read_text())
    if settings.s3_curated_bucket:
        import boto3

        obj = boto3.client("s3", region_name=settings.region).get_object(Bucket=settings.s3_curated_bucket, Key=f"curated/{name}.json")
        return json.loads(obj["Body"].read())
    raise FileNotFoundError(p)


store = Store()
