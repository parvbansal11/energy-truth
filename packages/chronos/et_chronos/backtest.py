"""Rolling-origin backtest of Chronos-2 on All-India monthly coal generation (plan §6.5).

Protocol (reconstructed from the plan, because the original script was not supplied):
  target      monthly mean of daily "India: Coal" generation (MU/day) from Robbie Andrew's POSOCO_data.csv;
              edge months with <90% daily coverage dropped -> Dec-2018..Sep-2026 (94 months)
  origins     24 rolling origins, horizon H=6, forecasts cover May-2024..Sep-2026
  covariates  demand, RE, hydro (past-only) + month sin/cos (known future)
  models      seasonal naive (t-12), Chronos-2 univariate, Chronos-2 + energy covariates
  metrics     WQL at 0.1/0.5/0.9, median MAPE, 80% interval (q10..q90) coverage
"""
from __future__ import annotations

import argparse
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

QUANTILES = [0.1, 0.5, 0.9]
HORIZON = 6
N_ORIGINS = 24
POSOCO_URL = "https://robbieandrew.github.io/india/data/POSOCO_data.csv"
COLS = {"coal": "India: Coal", "demand": "India: EnergyMet", "res": "India: RES", "hydro": "India: Hydro"}


def monthly_frame(csv_path: Path, min_coverage: float = 0.9) -> pd.DataFrame:
    """Daily POSOCO -> monthly means (MU/day). Months whose coal coverage is below `min_coverage` are dropped."""
    df = pd.read_csv(csv_path, usecols=["yyyymmdd", *COLS.values()])
    df["date"] = pd.to_datetime(df["yyyymmdd"].astype(str), format="%Y%m%d")
    df = df.dropna(subset=[COLS["coal"]])
    g = df.groupby(df["date"].dt.to_period("M"))
    out = g[list(COLS.values())].mean().rename(columns={v: k for k, v in COLS.items()})
    out["n_days"] = g.size()
    out["coverage"] = out["n_days"] / [p.days_in_month for p in out.index]
    out = out[out["coverage"] >= min_coverage].copy()
    # keep the longest contiguous run so the series has no holes
    idx = out.index
    breaks = [i for i in range(1, len(idx)) if (idx[i] - idx[i - 1]).n != 1]
    start = breaks[-1] if breaks else 0
    out = out.iloc[start:]
    out["month_sin"] = np.sin(2 * np.pi * out.index.month / 12)
    out["month_cos"] = np.cos(2 * np.pi * out.index.month / 12)
    return out


def quantile_loss(y: np.ndarray, q_pred: np.ndarray, q: float) -> float:
    d = y - q_pred
    return float(np.sum(np.maximum(q * d, (q - 1) * d)))


def wql(y: np.ndarray, qpreds: dict[float, np.ndarray]) -> float:
    """Weighted quantile loss (GluonTS convention): mean over q of 2*sum(QL_q)/sum|y|."""
    denom = np.sum(np.abs(y))
    return float(np.mean([2 * quantile_loss(y, qpreds[q], q) / denom for q in QUANTILES]))


def _chronos_predict(pipeline, inputs, horizon):
    qs, _ = pipeline.predict_quantiles(inputs, prediction_length=horizon, quantile_levels=QUANTILES)
    return [q.squeeze(0).numpy() if q.ndim == 3 else q.numpy() for q in qs]  # each (H, nq)


def run(csv_path: Path, out_path: Path, model_id: str = "amazon/chronos-2") -> dict:
    from chronos import Chronos2Pipeline

    m = monthly_frame(csv_path)
    y = m["coal"].to_numpy(dtype=float)
    n = len(y)
    first_origin = n - HORIZON - N_ORIGINS + 1  # index of first forecast month for origin 0
    origins = list(range(first_origin, first_origin + N_ORIGINS))  # forecast starts at y[o]
    pipeline = Chronos2Pipeline.from_pretrained(model_id, device_map="cpu")

    uni_inputs, cov_inputs = [], []
    for o in origins:
        uni_inputs.append({"target": y[:o]})
        past = {k: m[k].to_numpy(dtype=float)[:o] for k in ["demand", "res", "hydro", "month_sin", "month_cos"]}
        fut = {k: m[k].to_numpy(dtype=float)[o:o + HORIZON] for k in ["month_sin", "month_cos"]}
        cov_inputs.append({"target": y[:o], "past_covariates": past, "future_covariates": fut})

    t0 = time.time()
    uni = _chronos_predict(pipeline, uni_inputs, HORIZON)
    cov = _chronos_predict(pipeline, cov_inputs, HORIZON)
    elapsed = time.time() - t0

    def collect(preds):
        ys, qd = [], {q: [] for q in QUANTILES}
        for o, p in zip(origins, preds):
            p = np.asarray(p).reshape(HORIZON, len(QUANTILES))
            ys.append(y[o:o + HORIZON])
            for j, q in enumerate(QUANTILES):
                qd[q].append(p[:, j])
        return np.concatenate(ys), {q: np.concatenate(v) for q, v in qd.items()}

    def metrics(yt, qd, interval=True):
        med = qd[0.5]
        res = {"wql": round(wql(yt, qd), 4), "median_mape_pct": round(float(np.mean(np.abs(med - yt) / np.abs(yt)) * 100), 2)}
        res["coverage_80_pct"] = round(float(np.mean((yt >= qd[0.1]) & (yt <= qd[0.9])) * 100), 1) if interval else None
        return res

    yt_u, qd_u = collect(uni)
    yt_c, qd_c = collect(cov)
    sn = np.concatenate([y[o - 12:o - 12 + HORIZON] for o in origins])
    res_sn = metrics(yt_u, {q: sn for q in QUANTILES}, interval=False)

    months = [str(p) for p in m.index]
    result = {
        "experiment": "chronos2_posoco_india_coal_monthly",
        "run_at": datetime.now(timezone.utc).isoformat(),
        "model_id": model_id,
        "data": {
            "source_url": POSOCO_URL,
            "sha256": hashlib.sha256(csv_path.read_bytes()).hexdigest(),
            "target": "India: Coal, monthly mean of daily generation (MU/day)",
            "n_months": n,
            "first_month": months[0],
            "last_month": months[-1],
        },
        "protocol": {
            "horizon": HORIZON,
            "n_origins": N_ORIGINS,
            "eval_window": [months[origins[0]], months[origins[-1] + HORIZON - 1]],
            "past_only_covariates": ["demand", "res", "hydro"],
            "known_future_covariates": ["month_sin", "month_cos"],
            "quantiles": QUANTILES,
        },
        "results": {
            "seasonal_naive": res_sn,
            "chronos2_univariate": metrics(yt_u, qd_u),
            "chronos2_covariates": metrics(yt_c, qd_c),
        },
        "inference_seconds": round(elapsed, 1),
        "series": {
            "months": months,
            "actual": [round(float(v), 2) for v in y],
            # last origin's covariate forecast, for the eval chart
            "origins": [
                {
                    "origin": months[o - 1],
                    "months": months[o:o + HORIZON],
                    "q10": [round(float(v), 2) for v in np.asarray(cp).reshape(HORIZON, 3)[:, 0]],
                    "q50": [round(float(v), 2) for v in np.asarray(cp).reshape(HORIZON, 3)[:, 1]],
                    "q90": [round(float(v), 2) for v in np.asarray(cp).reshape(HORIZON, 3)[:, 2]],
                    "q50_univariate": [round(float(v), 2) for v in np.asarray(up).reshape(HORIZON, 3)[:, 1]],
                    "seasonal_naive": [round(float(v), 2) for v in y[o - 12:o - 12 + HORIZON]],
                }
                for o, cp, up in zip(origins, cov, uni)
            ],
        },
    }
    r = result["results"]
    r["improvement_vs_seasonal_naive_pct"] = round((1 - r["chronos2_covariates"]["wql"] / res_sn["wql"]) * 100, 1)
    r["improvement_vs_univariate_pct"] = round((1 - r["chronos2_covariates"]["wql"] / r["chronos2_univariate"]["wql"]) * 100, 1)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=1))
    return result


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="data/raw/robbie/POSOCO_data.csv")
    ap.add_argument("--out", default="energy_truth_eval/chronos_backtest_posoco_result.json")
    a = ap.parse_args()
    r = run(Path(a.csv), Path(a.out))
    print(json.dumps({k: v for k, v in r.items() if k != "series"}, indent=1))
