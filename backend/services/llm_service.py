"""Unified LLM client supporting Google GenAI (Gemini), OpenAI-compatible APIs, and Ollama."""
from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Optional

from openai import AsyncOpenAI

from ..config import settings

log = logging.getLogger(__name__)


@dataclass
class ChatResult:
    """LLM response with metadata about completeness."""
    text: str
    truncated: bool = False  # True if the response hit the token limit

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


def _provider() -> str:
    return _runtime.get("provider", settings.llm_provider)


def _api_key() -> str:
    key = _runtime.get("api_key") or settings.llm_api_key
    if not key:
        key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY", "")
    return key


def _base_url() -> str:
    return _runtime.get("base_url", settings.llm_base_url)


def _model(for_translation: bool = False) -> str:
    if for_translation:
        m = _runtime.get("translation_model") or settings.effective_translation_model
        if m:
            return m
    return _runtime.get("model", settings.llm_model)


def _temperature() -> float:
    return _runtime.get("temperature", settings.llm_temperature)


# ── Gemini (native google-genai SDK) ────────────────────────────────────

async def _chat_gemini(
    system_prompt: str,
    user_prompt: str,
    for_translation: bool = False,
    max_tokens: Optional[int] = None,
) -> ChatResult:
    from google import genai
    from google.genai import types

    api_key = _api_key()
    client = genai.Client(api_key=api_key) if api_key else genai.Client()
    model = _model(for_translation=for_translation)
    max_tok = max_tokens or (settings.llm_translation_max_tokens if for_translation else settings.llm_max_tokens)

    log.info("Gemini call  model=%s  max_tok=%d  sys_len=%d  user_len=%d",
             model, max_tok, len(system_prompt), len(user_prompt))

    response = await client.aio.models.generate_content(
        model=model,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=_temperature(),
            max_output_tokens=max_tok,
        ),
    )
    text = response.text or ""
    truncated = False
    if response.candidates:
        reason = response.candidates[0].finish_reason
        # Gemini uses "MAX_TOKENS" when output was cut off
        truncated = str(reason).upper() in ("MAX_TOKENS", "FINISH_REASON_MAX_TOKENS", "2")
    log.info("Gemini response  len=%d  truncated=%s", len(text), truncated)
    return ChatResult(text=text, truncated=truncated)


# ── OpenAI-compatible (OpenAI, DeepSeek, Ollama, etc.) ──────────────────

def _openai_client() -> AsyncOpenAI:
    provider = _provider()
    base_url = _base_url()
    api_key = _api_key()

    if provider == "ollama":
        base_url = base_url or "http://localhost:11434/v1"
        api_key = api_key or "ollama"

    return AsyncOpenAI(api_key=api_key, base_url=base_url)


async def _chat_openai(
    system_prompt: str,
    user_prompt: str,
    for_translation: bool = False,
    max_tokens: Optional[int] = None,
) -> ChatResult:
    client = _openai_client()
    model = _model(for_translation=for_translation)
    max_tok = max_tokens or (settings.llm_translation_max_tokens if for_translation else settings.llm_max_tokens)

    log.info("OpenAI call  model=%s  max_tok=%d  sys_len=%d  user_len=%d",
             model, max_tok, len(system_prompt), len(user_prompt))

    resp = await client.chat.completions.create(
        model=model,
        temperature=_temperature(),
        max_tokens=max_tok,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    text = resp.choices[0].message.content or ""
    truncated = resp.choices[0].finish_reason == "length"
    log.info("OpenAI response  len=%d  truncated=%s  tokens_used=%s", len(text), truncated,
             resp.usage.total_tokens if resp.usage else "?")
    return ChatResult(text=text, truncated=truncated)


# ── Web Search Helpers ──────────────────────────────────────────────────

def _ddg_search(queries: list[str], max_results_per_query: int = 5) -> str:
    """Run DuckDuckGo text searches and return compiled results."""
    from duckduckgo_search import DDGS

    all_results: list[str] = []
    with DDGS() as ddgs:
        for query in queries:
            try:
                results = ddgs.text(query, max_results=max_results_per_query)
                for r in results:
                    title = r.get("title", "")
                    body = r.get("body", "")
                    url = r.get("href", "")
                    all_results.append(f"[{title}]({url})\n{body}")
            except Exception as exc:
                log.warning("DuckDuckGo search failed for '%s': %s", query, exc)
    return "\n\n---\n\n".join(all_results) if all_results else "(No search results found)"


async def _chat_gemini_with_search(
    system_prompt: str,
    user_prompt: str,
    max_tokens: Optional[int] = None,
) -> str:
    """Gemini call with Google Search grounding enabled."""
    from google import genai
    from google.genai import types

    api_key = _api_key()
    client = genai.Client(api_key=api_key) if api_key else genai.Client()
    model = _model(for_translation=False)
    max_tok = max_tokens or settings.llm_max_tokens

    log.info("Gemini+Search call  model=%s  sys_len=%d  user_len=%d",
             model, len(system_prompt), len(user_prompt))

    response = await client.aio.models.generate_content(
        model=model,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=_temperature(),
            max_output_tokens=max_tok,
            tools=[types.Tool(google_search=types.GoogleSearch())],
        ),
    )
    text = response.text or ""
    log.info("Gemini+Search response  len=%d", len(text))
    return text


async def chat_with_search(
    system_prompt: str,
    user_prompt: str,
    search_queries: list[str] | None = None,
    max_tokens: Optional[int] = None,
) -> str:
    """LLM call enhanced with web search.

    - Gemini: uses native Google Search grounding (search_queries ignored).
    - Others: runs DuckDuckGo searches first, prepends results to the prompt.
    """
    import asyncio

    if _provider() == "gemini":
        return await _chat_gemini_with_search(system_prompt, user_prompt, max_tokens=max_tokens)

    search_context = ""
    if search_queries:
        log.info("Running DuckDuckGo searches: %s", search_queries)
        search_context = await asyncio.to_thread(_ddg_search, search_queries)

    augmented_prompt = user_prompt
    if search_context:
        augmented_prompt = (
            "=== WEB RESEARCH RESULTS ===\n\n"
            f"{search_context}\n\n"
            "=== END OF WEB RESEARCH ===\n\n"
            f"{user_prompt}"
        )

    result = await _chat_openai(system_prompt, augmented_prompt, max_tokens=max_tokens)
    return result.text


# ── Public API ──────────────────────────────────────────────────────────

async def chat(
    system_prompt: str,
    user_prompt: str,
    for_translation: bool = False,
    max_tokens: Optional[int] = None,
) -> str:
    """Simple chat returning only the text. For translation use chat_ext()."""
    result = await chat_ext(system_prompt, user_prompt,
                            for_translation=for_translation, max_tokens=max_tokens)
    return result.text


async def chat_ext(
    system_prompt: str,
    user_prompt: str,
    for_translation: bool = False,
    max_tokens: Optional[int] = None,
) -> ChatResult:
    """Chat returning full result including truncation status."""
    if _provider() == "gemini":
        return await _chat_gemini(system_prompt, user_prompt,
                                  for_translation=for_translation, max_tokens=max_tokens)
    return await _chat_openai(system_prompt, user_prompt,
                              for_translation=for_translation, max_tokens=max_tokens)


async def chat_json(
    system_prompt: str,
    user_prompt: str,
    for_translation: bool = False,
    max_tokens: Optional[int] = None,
    required_keys: list[str] | None = None,
) -> dict:
    """Call LLM and parse the response as JSON, with fallback extraction and retry."""
    raw = await chat(system_prompt, user_prompt, for_translation=for_translation,
                     max_tokens=max_tokens)
    result = _extract_json(raw)

    # Check if extraction actually got meaningful data
    if required_keys and not any(k in result for k in required_keys):
        log.warning("JSON extraction failed (no required keys found). Raw length=%d. Retrying…", len(raw))
        log.debug("Raw LLM output (first 500 chars): %s", raw[:500])
        # Retry with explicit JSON instruction
        retry_prompt = (
            "Your previous response could not be parsed as JSON. "
            "Please respond with ONLY a valid JSON object, no markdown formatting, "
            "no ```json``` code fences, no explanatory text. Just the raw JSON.\n\n"
            f"Original request:\n{user_prompt}"
        )
        raw2 = await chat(system_prompt, retry_prompt, for_translation=for_translation,
                          max_tokens=max_tokens)
        result2 = _extract_json(raw2)
        if any(k in result2 for k in required_keys):
            return result2
        log.error("JSON retry also failed. Returning partial result.")
        # Store the raw text so the user can at least see something
        result2["raw_analysis"] = raw
        return result2

    return result


def _extract_json(text: str) -> dict:
    """Best-effort JSON extraction from LLM output."""
    text = text.strip()
    # Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Markdown code fence: ```json ... ``` or ``` ... ```
    m = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", text)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Find the outermost { ... } block
    depth = 0
    start = None
    last_valid = None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    parsed = json.loads(text[start : i + 1])
                    if last_valid is None or len(parsed) > len(last_valid):
                        last_valid = parsed
                except json.JSONDecodeError:
                    pass
                start = None
    if last_valid:
        return last_valid
    return {"raw": text}
