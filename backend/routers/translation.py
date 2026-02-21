"""API routes for analysis, strategy, and translation workflows."""
from __future__ import annotations

import asyncio
import logging

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException
from fastapi.responses import FileResponse

from .. import database as db
from ..models import (
    AnalysisOut, StrategyOut, StrategyUpdate, TranslationProgress,
    FeedbackRequest, LLMSettings, TranslateRangeRequest,
)
from ..config import settings
from ..services import analysis_service, strategy_service, translation_service, llm_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["translation"])


# ── LLM Settings ────────────────────────────────────────────────────────

@router.post("/settings/llm")
async def update_llm_settings(s: LLMSettings):
    llm_service.configure(
        provider=s.provider,
        api_key=s.api_key,
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
