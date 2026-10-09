"""Environment-driven settings. Values come from .env (never hardcoded account IDs or keys)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _load_dotenv() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


_load_dotenv()


def env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


@dataclass(frozen=True)
class Settings:
    region: str = field(default_factory=lambda: env("AWS_REGION", "us-east-1"))
    # DATA_DIR lets Lambda point at /tmp (its only writable path); curated tables then come from S3
    raw_dir: Path = field(default_factory=lambda: Path(env("DATA_DIR", str(ROOT / "data"))) / "raw")
    curated_dir: Path = field(default_factory=lambda: Path(env("DATA_DIR", str(ROOT / "data"))) / "curated")
    reports_dir: Path = field(default_factory=lambda: Path(env("DATA_DIR", str(ROOT / "data"))) / "reports")
    s3_raw_bucket: str = field(default_factory=lambda: env("S3_RAW_BUCKET"))
    s3_curated_bucket: str = field(default_factory=lambda: env("S3_CURATED_BUCKET"))
    s3_reports_bucket: str = field(default_factory=lambda: env("S3_REPORTS_BUCKET"))
    ddb_prefix: str = field(default_factory=lambda: env("DDB_TABLE_PREFIX", "energytruth_"))
    bedrock_text_model: str = field(default_factory=lambda: env("BEDROCK_TEXT_MODEL_ID", "amazon.nova-pro-v1:0"))
    bedrock_fast_model: str = field(default_factory=lambda: env("BEDROCK_FAST_MODEL_ID", "amazon.nova-lite-v1:0"))
    bedrock_embed_model: str = field(default_factory=lambda: env("BEDROCK_EMBED_MODEL_ID", "amazon.titan-embed-text-v2:0"))
    chronos_endpoint: str = field(default_factory=lambda: env("CHRONOS_ENDPOINT_NAME"))
    chronos_horizon: int = field(default_factory=lambda: int(env("CHRONOS_HORIZON_MONTHS", "6")))
    cea_ef: float = field(default_factory=lambda: float(env("CEA_EF_TCO2_PER_MWH", "0.727")))
    cea_ef_version: str = field(default_factory=lambda: env("CEA_EF_VERSION", "V20_FY2023-24"))
    hitl_threshold: float = field(default_factory=lambda: float(env("HITL_ENTITY_THRESHOLD", "0.75")))
    demo_companies: tuple[str, ...] = field(
        default_factory=lambda: tuple(s.strip() for s in env("DEMO_COMPANIES", "NTPC,TATASTEEL,ULTRACEMCO,JSWSTEEL,ADANIPOWER").split(",") if s.strip())
    )
    firms_key: str = field(default_factory=lambda: env("FIRMS_MAP_KEY"))
    sns_topic_arn: str = field(default_factory=lambda: env("ALERTS_TOPIC_ARN"))
    climatetrace_api: str = field(default_factory=lambda: env("CLIMATETRACE_API", "https://api.climatetrace.org/v7"))
    gem_api: str = field(default_factory=lambda: env("GEM_API", "https://api.globalenergymonitor.org"))
    robbie_base: str = field(default_factory=lambda: env("ROBBIE_INDIA_BASE", "https://robbieandrew.github.io/india/data"))

    @property
    def aws_enabled(self) -> bool:
        """True when deployed resources are configured (Lambda or a filled .env)."""
        return bool(self.s3_curated_bucket)

    @property
    def bedrock_enabled(self) -> bool:
        return env("BEDROCK_ENABLED", "auto") == "true" or (env("BEDROCK_ENABLED", "auto") == "auto" and _has_aws_credentials())


def _has_aws_credentials() -> bool:
    if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return True
    try:
        import boto3

        return boto3.Session(profile_name=os.environ.get("AWS_PROFILE") or None).get_credentials() is not None
    except Exception:
        return False


settings = Settings()
