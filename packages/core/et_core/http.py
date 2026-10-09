"""Cached HTTP fetch. Raw responses are written to data/raw (and S3_RAW_BUCKET when configured) so demos
never depend on a flaky live API (AGENTS.md rule 4)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import httpx

from .config import settings
from .evidence import Evidence, evidence_id, now_iso, sha256_bytes

UA = "EnergyTruth/1.0 (+https://github.com/energy-truth; research; contact via repo)"
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"


class FetchResult:
    def __init__(self, path: Path, content: bytes, url: str, retrieved_at: str, from_cache: bool):
        self.path = path
        self.content = content
        self.url = url
        self.retrieved_at = retrieved_at
        self.from_cache = from_cache
        self.sha256 = sha256_bytes(content)

    def json(self) -> Any:
        return json.loads(self.content)

    def evidence(self, title: str, publisher: str, kind: str = "api_payload", license: str = "", **meta: Any) -> Evidence:
        return Evidence(
            id=evidence_id(kind, self.url, self.sha256[:16]),
            kind=kind,
            title=title,
            publisher=publisher,
            url=self.url,
            retrieved_at=self.retrieved_at,
            sha256=self.sha256,
            local_path=str(self.path.relative_to(settings.raw_dir.parent.parent)) if self.path.is_relative_to(settings.raw_dir.parent.parent) else str(self.path),
            license=license,
            meta=meta,
        )


def _meta_path(path: Path) -> Path:
    return path.with_suffix(path.suffix + ".meta.json")


def fetch(url: str, dest: Path, *, refresh: bool = False, browser: bool = False, timeout: float = 120, retries: int = 3) -> FetchResult:
    """Fetch `url` into `dest` unless already cached. Returns content + provenance."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    meta = _meta_path(dest)
    if dest.exists() and not refresh:
        if not meta.exists():  # file cached by hand (e.g. curl): record provenance once so it stays stable
            meta.write_text(json.dumps({"url": url, "retrieved_at": now_iso(), "sha256": sha256_bytes(dest.read_bytes()), "status": "cached"}))
        m = json.loads(meta.read_text())
        return FetchResult(dest, dest.read_bytes(), m.get("url", url), m.get("retrieved_at", ""), True)
    last: Exception | None = None
    for attempt in range(retries):
        try:
            r = httpx.get(url, headers={"User-Agent": BROWSER_UA if browser else UA}, timeout=timeout, follow_redirects=True)
            r.raise_for_status()
            dest.write_bytes(r.content)
            ts = now_iso()
            meta.write_text(json.dumps({"url": url, "retrieved_at": ts, "sha256": sha256_bytes(r.content), "status": r.status_code}))
            _mirror_to_s3(dest)
            return FetchResult(dest, r.content, url, ts, False)
        except Exception as e:  # network flake: back off and retry
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"fetch failed for {url}: {last}")


def _mirror_to_s3(path: Path) -> None:
    if not settings.s3_raw_bucket:
        return
    try:
        import boto3

        key = str(path.relative_to(settings.raw_dir))
        boto3.client("s3", region_name=settings.region).upload_file(str(path), settings.s3_raw_bucket, key)
    except Exception:
        pass  # local cache remains authoritative for the run; mirror failures are non-fatal
