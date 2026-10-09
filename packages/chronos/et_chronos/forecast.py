"""Chronos-2 inference: local CPU by default; SageMaker JumpStart endpoint when CHRONOS_ENDPOINT_NAME is set
(deployed only behind deployChronos=true after approval, AGENTS.md §2.2). Payload shape follows plan §6.3."""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
import pandas as pd

from et_core.config import settings

QUANTILES = [0.1, 0.5, 0.9]
MODEL_ID = "amazon/chronos-2"


@dataclass
class Forecast:
    months: list[str]
    q10: list[float]
    q50: list[float]
    q90: list[float]
    backend: str

    @property
    def sigma(self) -> list[float]:
        """Gaussian-ish scale per month: (q90 - q10) / 2.56 (plan §6.3)."""
        return [(b - a) / 2.5631 for a, b in zip(self.q10, self.q90)]

    def to_dict(self) -> dict:
        return {"months": self.months, "q10": self.q10, "q50": self.q50, "q90": self.q90, "backend": self.backend}


@lru_cache(maxsize=1)
def _local_pipeline():
    from chronos import Chronos2Pipeline

    return Chronos2Pipeline.from_pretrained(MODEL_ID, device_map="cpu")


def _to_list(a) -> list[float]:
    return [round(float(v), 6) for v in np.asarray(a).ravel()]


def predict(items: list[dict], horizon: int) -> list[np.ndarray]:
    """items: [{target: (T,) or (V,T), past_covariates: {...}, future_covariates: {...}}] -> list of (V?,H,3)."""
    if settings.chronos_endpoint:
        return _predict_sagemaker(items, horizon)
    qs, _ = _local_pipeline().predict_quantiles(items, prediction_length=horizon, quantile_levels=QUANTILES)
    return [q.numpy() for q in qs]


def _predict_sagemaker(items: list[dict], horizon: int) -> list[np.ndarray]:
    import boto3

    payload = {
        "inputs": [
            {
                "target": np.asarray(it["target"]).tolist(),
                **({"past_covariates": {k: np.asarray(v).tolist() for k, v in it["past_covariates"].items()}} if it.get("past_covariates") else {}),
                **({"future_covariates": {k: np.asarray(v).tolist() for k, v in it["future_covariates"].items()}} if it.get("future_covariates") else {}),
            }
            for it in items
        ],
        "parameters": {"prediction_length": horizon, "quantile_levels": QUANTILES, "batch_size": 64},
    }
    rt = boto3.client("sagemaker-runtime", region_name=settings.region)
    r = rt.invoke_endpoint(EndpointName=settings.chronos_endpoint, ContentType="application/json", Body=json.dumps(payload))
    out = json.loads(r["Body"].read())["predictions"]
    return [np.stack([np.asarray(p[str(q)]) for q in QUANTILES], axis=-1) for p in out]


def backend_name() -> str:
    return f"sagemaker:{settings.chronos_endpoint}" if settings.chronos_endpoint else f"local-cpu:{MODEL_ID}"


def forecast_one(target: pd.Series, past_cov: pd.DataFrame | None, fut_cov: pd.DataFrame | None, horizon: int) -> Forecast:
    item: dict = {"target": target.to_numpy(dtype=float)}
    if past_cov is not None:
        cols = [c for c in past_cov.columns if c != "observed"]
        item["past_covariates"] = {c: past_cov.loc[target.index, c].to_numpy(dtype=float) for c in cols}
        if fut_cov is not None:
            item["future_covariates"] = {c: fut_cov[c].to_numpy(dtype=float) for c in ["month_sin", "month_cos", *[c for c in cols if c in fut_cov and c not in ("month_sin", "month_cos")]]}
    q = np.asarray(predict([item], horizon)[0]).reshape(horizon, 3)
    months = [str(p) for p in pd.period_range(target.index[-1] + 1, periods=horizon, freq="M")]
    return Forecast(months, _to_list(q[:, 0]), _to_list(q[:, 1]), _to_list(q[:, 2]), backend_name())


def forecast_multivariate(targets: pd.DataFrame, horizon: int) -> dict[str, Forecast]:
    """T4: joint forecast of several plants (rows share information across variates)."""
    arr = targets.T.to_numpy(dtype=float)  # (V, T)
    q = np.asarray(predict([{"target": arr}], horizon)[0])  # (V, H, 3)
    months = [str(p) for p in pd.period_range(targets.index[-1] + 1, periods=horizon, freq="M")]
    return {col: Forecast(months, _to_list(q[i, :, 0]), _to_list(q[i, :, 1]), _to_list(q[i, :, 2]), backend_name() + ":multivariate") for i, col in enumerate(targets.columns)}
