"""API routes for analysis, strategy, and translation workflows."""
from __future__ import annotations

import asyncio
import json
import logging

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException
from fastapi.responses import FileResponse

from .. import database as db
from ..models import (
    AnalysisOut, StrategyOut, StrategyUpdate, TranslationProgress,
    FeedbackRequest, LLMSettings, TranslateRangeRequest,
    AskAboutTranslationRequest, UpdateChapterTitleRequest, BatchUpdateTitlesRequest,
)
from ..config import settings
from ..services import analysis_service, strategy_service, translation_service, llm_service

log = logging.getLogger(__name__)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["translation"])


# ── LLM Settings ────────────────────────────────────────────────────────

@router.get("/settings/llm")
async def get_llm_settings():
    """Return current LLM settings (API key masked for security)."""
    from ..services.llm_service import _runtime
    from ..config import settings as cfg
    provider = _runtime.get("provider", cfg.llm_provider)
    api_key = _runtime.get("api_key") or cfg.llm_api_key
    base_url = _runtime.get("base_url", cfg.llm_base_url)
    model = _runtime.get("model", cfg.llm_model)
    translation_model = _runtime.get("translation_model") or cfg.effective_translation_model
    temperature = _runtime.get("temperature", cfg.llm_temperature)

    masked_key = ""
    if api_key:
        masked_key = api_key[:4] + "…" + api_key[-4:] if len(api_key) > 8 else "****"

    return {
        "provider": provider,
        "api_key_masked": masked_key,
        "api_key_set": bool(api_key),
        "base_url": base_url,
        "model": model,
        "translation_model": translation_model or "",
        "temperature": temperature,
    }


@router.post("/settings/llm")
async def update_llm_settings(s: LLMSettings):
    from ..services.llm_service import _runtime
    from ..config import settings as cfg
    # If api_key is "__KEEP__", preserve the existing key
    api_key = s.api_key
    if api_key == "__KEEP__":
        api_key = _runtime.get("api_key") or cfg.llm_api_key
    llm_service.configure(
        provider=s.provider,
        api_key=api_key,
        base_url=s.base_url,
        model=s.model,
        translation_model=s.translation_model,
        temperature=s.temperature,
    )
    return {"ok": True}


# ── Analysis ────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/analyze")
async def start_analysis(project_id: str, background_tasks: BackgroundTasks):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if p["status"] not in ("uploaded", "analyzed", "error"):
        raise HTTPException(400, f"Cannot analyze in status '{p['status']}'")

    background_tasks.add_task(_run_analysis, project_id)
    return {"ok": True, "message": "Analysis started"}


async def _run_analysis(project_id: str):
    try:
        await analysis_service.analyze_book(project_id)
    except Exception as e:
        log.exception("Analysis failed for %s", project_id)
        db.update_project(project_id, status="error", error_message=str(e))


@router.get("/projects/{project_id}/analysis", response_model=AnalysisOut)
async def get_analysis(project_id: str):
    a = db.get_analysis(project_id)
    if not a:
        raise HTTPException(404, "Analysis not available yet")
    return AnalysisOut(project_id=project_id, **{k: v for k, v in a.items() if k != "project_id"})


@router.post("/projects/{project_id}/analysis/refine")
async def refine_analysis(project_id: str, req: FeedbackRequest, background_tasks: BackgroundTasks):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if p["status"] not in ("analyzed", "strategy_generated", "sample_ready", "error"):
        raise HTTPException(400, f"Cannot refine analysis in status '{p['status']}'")

    db.update_project(project_id, status="analyzing")
    background_tasks.add_task(_run_refine_analysis, project_id, req.feedback)
    return {"ok": True, "message": "Refining analysis with your feedback"}


async def _run_refine_analysis(project_id: str, feedback: str):
    try:
        await analysis_service.refine_analysis(project_id, feedback)
    except Exception as e:
        log.exception("Analysis refinement failed for %s", project_id)
        db.update_project(project_id, status="error", error_message=str(e))


# ── Strategy ────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/strategy/generate")
async def generate_strategy(project_id: str, background_tasks: BackgroundTasks):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if p["status"] not in ("analyzed", "generating_strategy", "strategy_generated", "sample_ready", "error"):
        raise HTTPException(400, f"Cannot generate strategy in status '{p['status']}'")

    db.update_project(project_id, status="generating_strategy")
    background_tasks.add_task(_run_strategy, project_id)
    return {"ok": True, "message": "Strategy generation started"}


async def _run_strategy(project_id: str):
    try:
        await strategy_service.generate_strategy(project_id)
    except Exception as e:
        log.exception("Strategy generation failed for %s", project_id)
        db.update_project(project_id, status="error", error_message=str(e))


@router.get("/projects/{project_id}/strategy", response_model=StrategyOut)
async def get_strategy(project_id: str):
    s = db.get_strategy(project_id)
    if not s:
        raise HTTPException(404, "Strategy not available yet")
    return StrategyOut(project_id=project_id, **{k: v for k, v in s.items() if k != "project_id"})


@router.put("/projects/{project_id}/strategy")
async def update_strategy(project_id: str, update: StrategyUpdate):
    s = db.get_strategy(project_id)
    if not s:
        raise HTTPException(404, "Strategy not found")
    fields = {k: v for k, v in update.model_dump().items() if v is not None}
    if fields:
        db.save_strategy(project_id, {**s, **fields})
    return {"ok": True}


@router.post("/projects/{project_id}/strategy/refine")
async def refine_strategy(project_id: str, req: FeedbackRequest, background_tasks: BackgroundTasks):
    db.update_project(project_id, status="generating_strategy")
    background_tasks.add_task(_run_refine_strategy, project_id, req.feedback)
    return {"ok": True, "message": "Refining strategy with your feedback"}


async def _run_refine_strategy(project_id: str, feedback: str):
    try:
        await strategy_service.regenerate_strategy(project_id, feedback)
    except Exception as e:
        log.exception("Strategy refinement failed for %s", project_id)
        db.update_project(project_id, status="error", error_message=str(e))


# ── Sample Translation ──────────────────────────────────────────────────

@router.post("/projects/{project_id}/translate/sample")
async def translate_sample(
    project_id: str,
    background_tasks: BackgroundTasks,
    chapter_index: Optional[int] = Body(default=None, embed=True),
):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if p["status"] not in ("strategy_generated", "sample_ready", "error"):
        raise HTTPException(400, f"Cannot translate sample in status '{p['status']}'")

    background_tasks.add_task(_run_sample, project_id, chapter_index)
    return {"ok": True, "message": "Sample translation started"}


async def _run_sample(project_id: str, chapter_index: int | None = None):
    try:
        await translation_service.translate_sample(project_id, chapter_index=chapter_index)
    except Exception as e:
        log.exception("Sample translation failed for %s", project_id)
        db.update_project(project_id, status="error", error_message=str(e))


# ── Full Translation ────────────────────────────────────────────────────

@router.post("/projects/{project_id}/translate/all")
async def translate_all(
    project_id: str,
    background_tasks: BackgroundTasks,
    req: Optional[TranslateRangeRequest] = Body(default=None),
):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if p["status"] not in ("sample_ready", "strategy_generated", "stopped", "completed", "error"):
        raise HTTPException(400, f"Cannot start full translation in status '{p['status']}'")

    start = req.start_chapter if req else 0
    end = req.end_chapter if req else -1
    log.info("translate_all  project=%s  chapters %d–%d", project_id, start, end)
    background_tasks.add_task(_run_all, project_id, start, end)
    return {"ok": True, "message": "Translation started"}


async def _run_all(project_id: str, start_chapter: int = 0, end_chapter: int = -1):
    try:
        await translation_service.translate_all(project_id, start_chapter, end_chapter)
    except Exception as e:
        log.exception("Full translation failed for %s", project_id)
        db.update_project(project_id, status="error", error_message=str(e))


# ── Progress ────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/progress", response_model=TranslationProgress)
async def get_progress(project_id: str):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    chapters = db.get_chapters(project_id)
    translated = sum(1 for c in chapters if c["status"] == "translated")
    current = next((c["title"] for c in chapters if c["status"] == "translating"), None)
    return TranslationProgress(
        project_id=project_id,
        status=p["status"],
        total_chapters=len(chapters),
        translated_chapters=translated,
        current_chapter=current,
    )


# ── Download ────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/chapters/{chapter_id}/retranslate")
async def retranslate_chapter(project_id: str, chapter_id: str, background_tasks: BackgroundTasks):
    p = db.get_project(project_id)
    ch = db.get_chapter(chapter_id)
    if not p or not ch or ch["project_id"] != project_id:
        raise HTTPException(404, "Chapter not found")
    s = db.get_strategy(project_id)
    if not s:
        raise HTTPException(400, "No translation strategy found")

    background_tasks.add_task(_run_retranslate_chapter, project_id, chapter_id)
    return {"ok": True, "message": f"Re-translating chapter: {ch['title']}"}


async def _run_retranslate_chapter(project_id: str, chapter_id: str):
    try:
        db.update_chapter(chapter_id, status="translating", translated_content="")
        await translation_service.translate_chapter(project_id, chapter_id)
    except Exception as e:
        log.exception("Re-translation failed for chapter %s", chapter_id)
        db.update_chapter(chapter_id, status="pending")


@router.post("/projects/{project_id}/translate/stop")
async def stop_translation(project_id: str):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    translation_service.request_stop(project_id)
    return {"ok": True, "message": "Stop requested"}


# ── Chapter Files ───────────────────────────────────────────────────────

@router.get("/projects/{project_id}/chapter-files")
async def list_chapter_files(project_id: str):
    files = translation_service.get_chapter_files(project_id)
    return {"chapters": files}


@router.get("/projects/{project_id}/chapters/{chapter_id}/download")
async def download_chapter_epub(project_id: str, chapter_id: str):
    p = db.get_project(project_id)
    ch = db.get_chapter(chapter_id)
    if not p or not ch or ch["project_id"] != project_id:
        raise HTTPException(404, "Chapter not found")
    import re
    from pathlib import Path
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', p["name"])[:80].strip()
    out_dir = settings.output_dir / safe_name
    idx = ch["chapter_index"] + 1
    safe_title = re.sub(r'[<>:"/\\|?*]', '_', ch["title"])[:60].strip()
    path = out_dir / f"Ch{idx:03d}_{safe_title}.epub"
    if not path.exists():
        raise HTTPException(404, "Chapter EPUB not found on disk")
    return FileResponse(
        path=str(path),
        media_type="application/epub+zip",
        filename=path.name,
    )


# ── Combine & Download ─────────────────────────────────────────────────

@router.post("/projects/{project_id}/combine")
async def combine_chapters(project_id: str):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    result = translation_service.combine_all_chapters(project_id)
    if not result:
        raise HTTPException(400, "No translated chapters to combine")
    return {"ok": True, "path": str(result)}


@router.get("/projects/{project_id}/download")
async def download_epub(project_id: str):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not p.get("translated_epub_path"):
        raise HTTPException(400, "Translated EPUB not available yet")
    from pathlib import Path
    path = Path(p["translated_epub_path"])
    if not path.exists():
        raise HTTPException(404, "Translated file not found on disk")
    return FileResponse(
        path=str(path),
        media_type="application/epub+zip",
        filename=path.name,
    )


# ── AI Q&A about translation ───────────────────────────────────────────

_QA_SYSTEM = """\
You are a helpful translation consultant. The user is reading "{book_title}" by {author}, \
translated from {source_lang} to {target_lang}.
You have access to the full translation strategy, book analysis, and research that were used \
to guide this translation. When the user questions a translation choice, explain the reasoning \
based on the strategy, glossary, cultural context, and research findings.
If web search results are available, use them to supplement your answer.
Answer concisely. Respond in {target_lang}."""

_QA_CONTEXT_WORDS = 300


def _extract_nearby_context(full_text: str, selected: str, window: int = _QA_CONTEXT_WORDS) -> str:
    """Extract a small window of text around the selected portion."""
    if not full_text or not selected:
        return ""
    pos = full_text.find(selected[:60])
    if pos < 0:
        pos = full_text.find(selected[:30])
    if pos < 0:
        return ""
    words = full_text.split()
    char_count = 0
    start_word = 0
    for i, w in enumerate(words):
        char_count += len(w) + 1
        if char_count >= pos:
            start_word = max(0, i - window // 4)
            break
    end_word = min(len(words), start_word + window)
    return " ".join(words[start_word:end_word])


@router.post("/projects/{project_id}/ask")
async def ask_about_translation(project_id: str, req: AskAboutTranslationRequest):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    strategy = db.get_strategy(project_id)
    analysis = db.get_analysis(project_id)

    book_author = (analysis or {}).get("author", "") or "Unknown"

    context_parts = []
    if req.chapter_id:
        ch = db.get_chapter(req.chapter_id)
        if ch:
            context_parts.append(f"Chapter: {ch.get('title', '')}")

            if req.selected_original and ch.get("original_content"):
                nearby = _extract_nearby_context(ch["original_content"], req.selected_original)
                if nearby:
                    context_parts.append(f"Nearby original context: …{nearby}…")
            if req.selected_translation and ch.get("translated_content"):
                nearby = _extract_nearby_context(ch["translated_content"], req.selected_translation)
                if nearby:
                    context_parts.append(f"Nearby translated context: …{nearby}…")

    if req.selected_original:
        context_parts.append(f"Selected original: {req.selected_original[:500]}")
    if req.selected_translation:
        context_parts.append(f"Selected translation: {req.selected_translation[:500]}")

    # Include analysis background (trimmed)
    if analysis:
        ana_parts = []
        for key in ("genre", "writing_style", "themes", "cultural_notes", "translation_notes"):
            val = analysis.get(key, "")
            if val:
                ana_parts.append(f"{key}: {val[:200]}")
        characters = analysis.get("characters", "")
        if characters:
            ana_parts.append(f"characters: {characters[:300]}")
        research = analysis.get("research_report", "")
        if research:
            ana_parts.append(f"research summary: {research[:500]}")
        if ana_parts:
            context_parts.append("=== Book Analysis ===\n" + "\n".join(ana_parts))

    # Include full translation strategy
    if strategy:
        strat_parts = []
        for key in ("overall_approach", "tone_voice", "cultural_adaptation", "names_places"):
            val = strategy.get(key, "")
            if val:
                strat_parts.append(f"{key}: {val}")
        glossary = strategy.get("glossary", [])
        if glossary:
            terms = "; ".join(f"{g.get('source','')}→{g.get('target','')}" for g in glossary[:30])
            strat_parts.append(f"glossary: {terms}")
        constraints = strategy.get("constraints", "")
        if constraints:
            strat_parts.append(f"constraints: {constraints}")
        if strat_parts:
            context_parts.append("=== Translation Strategy ===\n" + "\n".join(strat_parts))

    system = _QA_SYSTEM.format(
        book_title=p.get("name", "Unknown"),
        author=book_author,
        source_lang=p["source_language"],
        target_lang=p["target_language"],
    )
    user_prompt = "\n".join(context_parts) + f"\n\nQuestion: {req.question}"

    answer = await llm_service.chat_with_search(
        system_prompt=system,
        user_prompt=user_prompt,
        max_tokens=8192,
    )
    return {"answer": answer}


# ── Chapter title management ───────────────────────────────────────────

_TITLE_TRANSLATE_SYSTEM = """\
You are a professional translator. Translate chapter titles from {source_lang} to {target_lang}.

IMPORTANT: Return ONLY a pure JSON array. No markdown, no explanation, no code fences.

Each element must be an object with exactly two keys:
  "index": the integer index from the input
  "translated_title": the translated title string

Translate naturally and idiomatically. Keep proper nouns recognisable.

Example output format:
[{{"index": 0, "translated_title": "..."}}, {{"index": 1, "translated_title": "..."}}]"""

def _parse_title_result(result) -> dict[int, str]:
    """Parse title translation result from either a list or dict."""
    translated_map: dict[int, str] = {}
    if isinstance(result, list):
        for item in result:
            if not isinstance(item, dict):
                continue
            idx = item.get("index")
            tt = item.get("translated_title", "")
            if idx is not None and tt:
                try:
                    translated_map[int(idx)] = str(tt)
                except (ValueError, TypeError):
                    pass
    elif isinstance(result, dict):
        for key, val in result.items():
            try:
                k = int(key)
            except (ValueError, TypeError):
                continue
            if isinstance(val, str):
                translated_map[k] = val
            elif isinstance(val, dict):
                tt = val.get("translated_title", "")
                if tt:
                    translated_map[k] = str(tt)
    return translated_map


_TITLE_BATCH_SIZE = 5


async def _translate_title_batch(
    system: str, titles: list[tuple[int, str]],
) -> dict[int, str]:
    """Translate a single batch of titles. Returns {index: translated_title}."""
    lines = [f"{idx}: {title}" for idx, title in titles]
    user_prompt = "Translate these chapter titles:\n" + "\n".join(lines)

    result = await llm_service.chat_json(
        system_prompt=system,
        user_prompt=user_prompt,
        max_tokens=16384,
    )
    parsed = _parse_title_result(result)
    if parsed:
        return parsed

    log.warning("Title batch parse failed, retrying with plain chat…")
    raw_text = await llm_service.chat(
        system_prompt=system,
        user_prompt=user_prompt,
        max_tokens=16384,
    )
    try:
        result2 = json.loads(raw_text.strip().strip("`").strip())
        return _parse_title_result(result2)
    except (json.JSONDecodeError, ValueError):
        return {}


@router.post("/projects/{project_id}/chapters/translate-titles")
async def translate_titles(project_id: str):
    """Translate all chapter titles in batches of _TITLE_BATCH_SIZE."""
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    chapters = db.get_chapters(project_id)
    if not chapters:
        raise HTTPException(400, "No chapters found")

    system = _TITLE_TRANSLATE_SYSTEM.format(
        source_lang=p["source_language"],
        target_lang=p["target_language"],
    )

    all_titles = [(ch["chapter_index"], ch["title"]) for ch in chapters]
    batches = [all_titles[i:i + _TITLE_BATCH_SIZE]
               for i in range(0, len(all_titles), _TITLE_BATCH_SIZE)]

    log.info("Title translation: %d chapters in %d batches", len(chapters), len(batches))

    translated_map: dict[int, str] = {}
    for batch_num, batch in enumerate(batches, 1):
        log.info("Translating title batch %d/%d (%d titles)", batch_num, len(batches), len(batch))
        batch_result = await _translate_title_batch(system, batch)
        translated_map.update(batch_result)

    if not translated_map:
        raise HTTPException(500, "AI returned no usable translations. Please try again.")

    updated = 0
    for ch in chapters:
        tt = translated_map.get(ch["chapter_index"], "")
        if tt:
            db.update_chapter(ch["id"], translated_title=tt)
            updated += 1

    return {"ok": True, "updated": updated, "titles": translated_map}


@router.patch("/projects/{project_id}/chapters/{chapter_id}/title")
async def update_chapter_title(project_id: str, chapter_id: str, req: UpdateChapterTitleRequest):
    ch = db.get_chapter(chapter_id)
    if not ch or ch["project_id"] != project_id:
        raise HTTPException(404, "Chapter not found")
    db.update_chapter(chapter_id, title=req.title)
    return {"ok": True}


@router.put("/projects/{project_id}/chapters/titles")
async def batch_update_titles(project_id: str, req: BatchUpdateTitlesRequest):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    for chapter_id, info in req.titles.items():
        ch = db.get_chapter(chapter_id)
        if ch and ch["project_id"] == project_id:
            db.update_chapter(
                chapter_id,
                title=info.title,
                translated_title=info.translated_title,
                chapter_type=info.chapter_type,
            )
    # Recalculate body numbers after type changes
    _recalc_body_numbers(project_id)
    return {"ok": True, "updated": len(req.titles)}


def _recalc_body_numbers(project_id: str) -> None:
    """Recalculate body_number for all chapters based on current types and titles."""
    from ..services.epub_service import _extract_number, _CHAP_NUM_RES, _PART_NUM_RES
    chapters = db.get_chapters(project_id)
    if not chapters:
        return

    has_parts = any(c.get("chapter_type") == "part" for c in chapters)

    # Detect mode from existing title numbers
    last_part_idx = -1
    detections = []
    for i, c in enumerate(chapters):
        if c.get("chapter_type") == "part":
            last_part_idx = i
        elif c.get("chapter_type") == "chapter":
            num = _extract_number(c["title"], _CHAP_NUM_RES)
            detections.append((i, num, last_part_idx))

    mode = "continuous"
    if has_parts and len(detections) >= 2:
        prev_num, prev_part = None, -1
        for _, num, pidx in detections:
            if (num is not None and prev_num is not None
                    and pidx > prev_part and pidx >= 0 and num <= prev_num):
                mode = "per_part"
                break
            if num is not None:
                prev_num, prev_part = num, pidx

    part_num = ch_num = 0
    for c in chapters:
        ctype = c.get("chapter_type", "chapter")
        if ctype == "part":
            part_num += 1
            detected = _extract_number(c["title"], _PART_NUM_RES)
            bn = detected if detected is not None else part_num
            if mode == "per_part":
                ch_num = 0
        elif ctype == "chapter":
            detected = _extract_number(c["title"], _CHAP_NUM_RES)
            if detected is not None:
                ch_num = detected
            else:
                ch_num += 1
            bn = ch_num
        else:
            bn = None
        db.update_chapter(c["id"], body_number=bn)


# ── Name map & unification ────────────────────────────────────────────

@router.get("/projects/{project_id}/name-map")
async def get_name_map(project_id: str):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    raw = p.get("name_map", "")
    try:
        name_map = json.loads(raw) if raw else {}
    except (json.JSONDecodeError, TypeError):
        name_map = {}
    return {"name_map": name_map}


@router.post("/projects/{project_id}/rescan-names")
async def rescan_names(project_id: str):
    """Re-scan all translated chapters to rebuild the name map from scratch."""
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    name_map = translation_service.rescan_all_names(project_id)
    return {"ok": True, "name_map": name_map, "count": len(name_map)}


@router.post("/projects/{project_id}/unify-name")
async def unify_name(project_id: str, body: dict = Body(...)):
    """Find-and-replace a name variant across all translated chapters."""
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")

    find_text = body.get("find", "").strip()
    replace_text = body.get("replace", "").strip()
    if not find_text or not replace_text or find_text == replace_text:
        raise HTTPException(400, "Invalid find/replace values")

    chapters = db.get_chapters(project_id)
    total_replaced = 0
    for ch in chapters:
        content = ch.get("translated_content") or ""
        if find_text not in content:
            continue
        count = content.count(find_text)
        new_content = content.replace(find_text, replace_text)
        db.update_chapter(ch["id"], translated_content=new_content)
        total_replaced += count

    # Update name_map: merge the old variant count into the new one
    raw = p.get("name_map", "")
    try:
        name_map = json.loads(raw) if raw else {}
    except (json.JSONDecodeError, TypeError):
        name_map = {}

    for orig, data in name_map.items():
        trans = data.get("translations", {})
        if find_text in trans:
            old_count = trans.pop(find_text)
            trans[replace_text] = trans.get(replace_text, 0) + old_count
    db.update_project(project_id, name_map=json.dumps(name_map, ensure_ascii=False))

    return {"ok": True, "replaced": total_replaced}
