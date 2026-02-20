"""Unified LLM client supporting OpenAI-compatible APIs and Ollama."""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

from openai import AsyncOpenAI

from ..config import settings

log = logging.getLogger(__name__)

# Runtime-overridable settings (set via /api/settings endpoint)
_runtime: dict = {}


def configure(provider: str, api_key: str, base_url: str, model: str,
              translation_model: str = "", temperature: float = 0.3) -> None:
    _runtime.update(
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        model=model,
        translation_model=translation_model,
        temperature=temperature,
    )


def _get(key: str):
    return _runtime.get(key) or getattr(settings, f"llm_{key}" if f"llm_{key}" != "llm_translation_model" else key, "")


def _client() -> AsyncOpenAI:
    provider = _runtime.get("provider", settings.llm_provider)
    base_url = _runtime.get("base_url", settings.llm_base_url)
    api_key = _runtime.get("api_key", settings.llm_api_key)

    if provider == "ollama":
        base_url = base_url or "http://localhost:11434/v1"
        api_key = api_key or "ollama"
    elif provider == "gemini":
        base_url = base_url or "https://generativelanguage.googleapis.com/v1beta/openai/"

    return AsyncOpenAI(api_key=api_key, base_url=base_url)


def _model(for_translation: bool = False) -> str:
    if for_translation:
        m = _runtime.get("translation_model") or settings.effective_translation_model
        if m:
            return m
    return _runtime.get("model", settings.llm_model)


def _temperature() -> float:
    return _runtime.get("temperature", settings.llm_temperature)


async def chat(
    system_prompt: str,
    user_prompt: str,
    for_translation: bool = False,
    max_tokens: Optional[int] = None,
) -> str:
    client = _client()
    model = _model(for_translation=for_translation)
    temp = _temperature()
    max_tok = max_tokens or settings.llm_max_tokens

    log.info("LLM call  model=%s  sys_len=%d  user_len=%d", model, len(system_prompt), len(user_prompt))

    resp = await client.chat.completions.create(
        model=model,
        temperature=temp,
        max_tokens=max_tok,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    text = resp.choices[0].message.content or ""
    log.info("LLM response  len=%d  tokens_used=%s", len(text),
             resp.usage.total_tokens if resp.usage else "?")
    return text


async def chat_json(
    system_prompt: str,
    user_prompt: str,
    for_translation: bool = False,
    max_tokens: Optional[int] = None,
) -> dict:
    """Call LLM and parse the response as JSON, with fallback extraction."""
    raw = await chat(system_prompt, user_prompt, for_translation=for_translation,
                     max_tokens=max_tokens)
    return _extract_json(raw)


def _extract_json(text: str) -> dict:
    """Best-effort JSON extraction from LLM output."""
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try extracting from markdown code block
    m = re.search(r"```(?:json)?\s*\n([\s\S]*?)\n```", text)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # Last resort: find first { ... } block
    depth = 0
    start = None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    start = None
    # Return raw text wrapped in a dict
    return {"raw": text}
