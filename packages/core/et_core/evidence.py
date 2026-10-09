"""Evidence records: every number that reaches the UI must trace to one of these (AGENTS.md rule 3)."""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass
class Evidence:
    id: str
    kind: str  # api_payload | pdf_page | dataset | tile | constant | derived
    title: str
    publisher: str
    url: str
    retrieved_at: str
    sha256: str = ""
    local_path: str = ""
    page: int | None = None
    quote: str = ""
    license: str = ""
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def evidence_id(kind: str, *parts: Any) -> str:
    key = json.dumps([kind, *parts], sort_keys=True, default=str)
    return f"ev_{kind}_{hashlib.sha1(key.encode()).hexdigest()[:10]}"


class EvidenceLedger:
    """Collects evidence during a pipeline run; deduplicates by id."""

    def __init__(self) -> None:
        self.items: dict[str, Evidence] = {}

    def add(self, ev: Evidence) -> str:
        self.items[ev.id] = ev
        return ev.id

    def get(self, eid: str) -> Evidence | None:
        return self.items.get(eid)

    def to_list(self) -> list[dict[str, Any]]:
        return [e.to_dict() for e in self.items.values()]

    @classmethod
    def from_list(cls, rows: list[dict[str, Any]]) -> "EvidenceLedger":
        led = cls()
        for r in rows:
            led.add(Evidence(**r))
        return led
