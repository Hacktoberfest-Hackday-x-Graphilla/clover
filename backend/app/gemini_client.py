"""Gemini API (generativelanguage) thin wrapper with model routing + fallback."""

from __future__ import annotations

import httpx

from .config import get_settings

BASE = "https://generativelanguage.googleapis.com/v1beta/models"


async def generate(model: str, system: str, user: str, api_key: str,
                  temperature: float = 0.3, timeout_s: int | None = None) -> str:
    s = get_settings()
    key = api_key or s.gemini_api_key
    if not key:
        raise ValueError("Missing Gemini API key (pass gemini_key per-request or set GEMINI_API_KEY)")
    url = f"{BASE}/{model}:generateContent?key={key}"
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"parts": [{"text": user}]}],
        "generationConfig": {"temperature": temperature},
    }
    async with httpx.AsyncClient(timeout=timeout_s or s.gemini_timeout_s) as c:
        r = await c.post(url, json=body)
        r.raise_for_status()
        data = r.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise RuntimeError(f"Unexpected Gemini response: {str(data)[:300]}")


async def generate_short(system: str, user: str, api_key: str, **kw) -> tuple[str, str]:
    """Returns (text, model_used). Falls back SHORT->FAST once on transport/5xx/timeout."""
    s = get_settings()
    try:
        return await generate(s.short_model, system, user, api_key, **kw), s.short_model
    except (httpx.HTTPError, RuntimeError, ValueError) as e:
        msg = str(e)
        if "Missing Gemini" in msg:
            raise
        fb = await generate(s.fast_model, system, user, api_key, **kw)
        return fb + "\n<!-- fast-fallback -->", s.fast_model + " (fallback)"
