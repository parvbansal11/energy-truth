"""One text-generation entry point for the whole app, with providers tried in order (LLM_PROVIDERS).

bedrock  Amazon Nova via Converse (primary on AWS, once the account's Bedrock quota is non-zero)
gemini   Google Gemini REST API (GEMINI_API_KEY, from .env or Secrets Manager `energy-truth/prod`)
ollama   a free open model served on the EC2 box itself (OLLAMA_URL / OLLAMA_MODEL)

Every caller keeps its own deterministic fallback, so `LLMUnavailable` is never fatal. A provider that fails is
skipped for COOLDOWN_S so a blocked Bedrock account does not add latency to every request.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

from .config import env, settings

COOLDOWN_S = 300
GEMINI_FALLBACK_MODELS = ("gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-flash-lite-latest")
_model_down: dict[str, float] = {}  # Gemini models out of free quota (429) are skipped for a while
_down: dict[str, float] = {}
_secret_cache: dict[str, str] | None = None


class LLMUnavailable(RuntimeError):
    pass


def _secret(key: str) -> str:
    """Value from the environment, else from the Secrets Manager JSON secret `energy-truth/prod`."""
    global _secret_cache
    if os.environ.get(key):
        return os.environ[key]
    if _secret_cache is None:
        _secret_cache = {}
        name = env("SECRETS_NAME", "energy-truth/prod")
        if settings.aws_enabled or os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or os.environ.get("ET_ON_EC2"):
            try:
                import boto3

                raw = boto3.client("secretsmanager", region_name=settings.region).get_secret_value(SecretId=name)["SecretString"]
                _secret_cache = json.loads(raw)
            except Exception:
                pass
    return _secret_cache.get(key, "")


def bedrock_usable() -> bool:
    """One-token probe (fails in <1 s on a zero-quota account), cached via the shared cooldown."""
    if not settings.bedrock_enabled or time.time() - _down.get("bedrock", 0) <= COOLDOWN_S:
        return False
    try:
        _bedrock("ping", None, 1, 0.0, False)
        return True
    except Exception:
        _down["bedrock"] = time.time()
        return False


def providers() -> list[str]:
    order = [p.strip() for p in env("LLM_PROVIDERS", "bedrock,gemini,ollama").split(",") if p.strip()]
    if "bedrock" in order and not settings.bedrock_enabled:
        order.remove("bedrock")
    if "gemini" in order and not _secret("GEMINI_API_KEY"):
        order.remove("gemini")
    return [p for p in order if p in _IMPL and time.time() - _down.get(p, 0) > COOLDOWN_S]


def _post(url: str, body: dict, headers: dict, timeout: float) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def _bedrock(prompt: str, system: str | None, max_tokens: int, temperature: float, json_mode: bool) -> tuple[str, str]:
    import boto3

    kw = {"system": [{"text": system}]} if system else {}
    r = boto3.client("bedrock-runtime", region_name=settings.region).converse(
        modelId=settings.bedrock_text_model, messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": max_tokens, "temperature": temperature}, **kw)
    return r["output"]["message"]["content"][0]["text"].strip(), f"bedrock:{settings.bedrock_text_model}"


def _gemini(prompt: str, system: str | None, max_tokens: int, temperature: float, json_mode: bool) -> tuple[str, str]:
    key = _secret("GEMINI_API_KEY")
    # thinking off: these are short, fully-specified tasks, and thinking tokens count against maxOutputTokens
    cfg: dict = {"temperature": temperature, "maxOutputTokens": max_tokens}
    if json_mode:
        cfg["responseMimeType"] = "application/json"
    body: dict = {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": cfg}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    last: Exception | None = None
    primary = env("GEMINI_MODEL", "gemini-3.5-flash")
    order = [m for m in dict.fromkeys([primary, *GEMINI_FALLBACK_MODELS]) if time.time() - _model_down.get(m, 0) > 600]
    for attempt, model in enumerate(order):
        if attempt:
            time.sleep(1)
        body["generationConfig"] = {**cfg, **({"thinkingConfig": {"thinkingBudget": 0}} if thinking_knob(model) else {})}
        try:
            r = _post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", body, {"x-goog-api-key": key}, 150)
            parts = r["candidates"][0]["content"].get("parts", [])
            text = "".join(p.get("text", "") for p in parts).strip()
            if text:
                return text, f"gemini:{model}"
            last = LLMUnavailable(f"{model} returned no text ({r['candidates'][0].get('finishReason')})")
        except urllib.error.HTTPError as e:  # 429/503 = busy or out of free quota: try the next model
            last = e
            if e.code in (404, 429):
                _model_down[model] = time.time()
            if e.code not in (400, 404, 429, 500, 503):
                break
    raise last or LLMUnavailable("gemini failed")


def thinking_knob(model: str) -> bool:
    """Models that accept thinkingConfig.thinkingBudget (the -lite aliases reject it except 3.1)."""
    return "lite" not in model or model.startswith("gemini-3.1")


def _ollama(prompt: str, system: str | None, max_tokens: int, temperature: float, json_mode: bool) -> tuple[str, str]:
    model = env("OLLAMA_MODEL", "qwen2.5:3b")
    msgs = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
    body = {"model": model, "messages": msgs, "stream": False, "options": {"temperature": temperature, "num_predict": max_tokens}}
    if json_mode:
        body["format"] = "json"
    r = _post(env("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/") + "/api/chat", body, {}, 180)
    return r["message"]["content"].strip(), f"ollama:{model}"


_IMPL = {"bedrock": _bedrock, "gemini": _gemini, "ollama": _ollama}


def complete(prompt: str, *, system: str | None = None, max_tokens: int = 800, temperature: float = 0.2,
             json_mode: bool = False, only: tuple[str, ...] | None = None) -> tuple[str, str]:
    """Return (text, engine) from the first provider that answers; raise LLMUnavailable if none does."""
    errors = []
    for p in providers():
        if only and p not in only:
            continue
        try:
            return _IMPL[p](prompt, system, max_tokens, temperature, json_mode)
        except Exception as e:
            # long cooldown only for hard failures (Bedrock "Operation not allowed", auth); busy/timeout = short
            busy = isinstance(e, (TimeoutError, urllib.error.URLError)) and getattr(e, "code", 503) in (429, 500, 503)
            _down[p] = time.time() - (COOLDOWN_S - 20 if busy else 0)
            errors.append(f"{p}: {type(e).__name__}: {str(e)[:120]}")
    raise LLMUnavailable("; ".join(errors) or "no AI provider configured")


def complete_json(prompt: str, **kw) -> tuple[dict, str]:
    text, engine = complete(prompt, json_mode=True, **kw)
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    return json.loads(text[text.find("{"): text.rfind("}") + 1]), engine


def status() -> dict:
    return {"providers": providers(), "cooling_down": [p for p, t in _down.items() if time.time() - t <= COOLDOWN_S]}
