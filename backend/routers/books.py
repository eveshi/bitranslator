"""API routes for book/project management."""
from __future__ import annotations

import json
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse

from .. import database as db
from ..config import settings
from ..models import ProjectOut, ChapterOut
from ..services.epub_service import parse_epub

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects():
    projects = db.list_projects()
    result = []
    for p in projects:
        chapters = db.get_chapters(p["id"])
        translated = sum(1 for c in chapters if c["status"] == "translated")
        result.append(ProjectOut(
            id=p["id"],
            name=p["name"],
            source_language=p["source_language"],
            target_language=p["target_language"],
            status=p["status"],
            chapter_count=len(chapters),
            translated_count=translated,
            sample_chapter_index=p.get("sample_chapter_index") or 0,
            created_at=p["created_at"],
            error_message=p.get("error_message"),
        ))
    return result


@router.post("", response_model=ProjectOut)
async def create_project(
    file: UploadFile = File(...),
    source_language: str = Form("English"),
    target_language: str = Form("简体中文"),
):
    if not file.filename or not file.filename.lower().endswith(".epub"):
        raise HTTPException(400, "Please upload an EPUB file")

    project_id = uuid.uuid4().hex[:12]
    proj_dir = settings.data_dir / project_id
    proj_dir.mkdir(parents=True, exist_ok=True)
    epub_path = proj_dir / file.filename
    with open(epub_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    parsed = parse_epub(epub_path)

    now = datetime.now(timezone.utc).isoformat()
    db.create_project(
        project_id=project_id,
        name=parsed.title,
        source_lang=source_language,
        target_lang=target_language,
        epub_path=str(epub_path),
        now=now,
    )

    chapter_rows = []
    for ch in parsed.chapters:
        chapter_rows.append({
            "id": uuid.uuid4().hex[:12],
            "project_id": project_id,
            "chapter_index": ch.index,
            "title": ch.title,
            "original_content": ch.text,
            "epub_file_name": ch.file_name,
            "chapter_type": ch.chapter_type,
            "body_number": ch.body_number,
        })
    db.insert_chapters(chapter_rows)

    chapters = db.get_chapters(project_id)
    return ProjectOut(
        id=project_id,
        name=parsed.title,
        source_language=source_language,
        target_language=target_language,
        status="uploaded",
        chapter_count=len(chapters),
        translated_count=0,
        created_at=now,
    )


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    chapters = db.get_chapters(project_id)
    translated = sum(1 for c in chapters if c["status"] == "translated")
    return ProjectOut(
        id=p["id"],
        name=p["name"],
        source_language=p["source_language"],
        target_language=p["target_language"],
        status=p["status"],
        chapter_count=len(chapters),
        translated_count=translated,
        sample_chapter_index=p.get("sample_chapter_index") or 0,
        created_at=p["created_at"],
        error_message=p.get("error_message"),
    )


@router.patch("/{project_id}")
async def update_project_settings(project_id: str, body: dict):
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    allowed = {"source_language", "target_language", "name"}
    updates = {k: v for k, v in body.items() if k in allowed and isinstance(v, str)}
    if updates:
        db.update_project(project_id, **updates)
    return {"ok": True}


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    import logging
    log = logging.getLogger(__name__)

    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    proj_dir = settings.data_dir / project_id
    if proj_dir.exists():
        try:
            shutil.rmtree(proj_dir, ignore_errors=True)
        except Exception as e:
            log.warning("Could not fully remove project dir %s: %s", proj_dir, e)
    db.delete_project(project_id)
    return {"ok": True}


@router.get("/{project_id}/chapters", response_model=list[ChapterOut])
async def list_chapters(project_id: str):
    chapters = db.get_chapters(project_id)
    return [
        ChapterOut(
            id=c["id"],
            project_id=c["project_id"],
            chapter_index=c["chapter_index"],
            title=c["title"],
            translated_title=c.get("translated_title") or "",
            chapter_type=c.get("chapter_type") or "chapter",
            body_number=c.get("body_number"),
            status=c["status"],
            original_length=len(c.get("original_content") or ""),
            translated_length=len(c.get("translated_content") or ""),
        )
        for c in chapters
    ]


@router.get("/{project_id}/chapters/{chapter_id}/original")
async def get_chapter_original(project_id: str, chapter_id: str):
    ch = db.get_chapter(chapter_id)
    if not ch or ch["project_id"] != project_id:
        raise HTTPException(404, "Chapter not found")
    return {"text": ch["original_content"]}


@router.get("/{project_id}/chapters/{chapter_id}/translation")
async def get_chapter_translation(project_id: str, chapter_id: str):
    ch = db.get_chapter(chapter_id)
    if not ch or ch["project_id"] != project_id:
        raise HTTPException(404, "Chapter not found")
    return {"text": ch.get("translated_content") or ""}


@router.get("/{project_id}/chapters/{chapter_id}/highlights")
async def get_chapter_highlights(project_id: str, chapter_id: str):
    ch = db.get_chapter(chapter_id)
    if not ch or ch["project_id"] != project_id:
        raise HTTPException(404, "Chapter not found")
    raw = ch.get("highlights") or "[]"
    try:
        return {"highlights": json.loads(raw)}
    except (json.JSONDecodeError, TypeError):
        return {"highlights": []}


@router.put("/{project_id}/chapters/{chapter_id}/highlights")
async def save_chapter_highlights(project_id: str, chapter_id: str, body: dict):
    ch = db.get_chapter(chapter_id)
    if not ch or ch["project_id"] != project_id:
        raise HTTPException(404, "Chapter not found")
    highlights = body.get("highlights", [])
    db.update_chapter(chapter_id, highlights=json.dumps(highlights, ensure_ascii=False))
    return {"ok": True}


@router.get("/{project_id}/chapters/{chapter_id}/annotations")
async def get_chapter_annotations(project_id: str, chapter_id: str):
    ch = db.get_chapter(chapter_id)
    if not ch or ch["project_id"] != project_id:
        raise HTTPException(404, "Chapter not found")
    raw = ch.get("annotations") or "[]"
    try:
        return {"annotations": json.loads(raw)}
    except (json.JSONDecodeError, TypeError):
        return {"annotations": []}


# ── Project export / import ────────────────────────────────────────────

_EXPORT_VERSION = 1

@router.get("/{project_id}/export")
async def export_project(project_id: str, include_highlights: bool = True):
    """Export all project data as a single JSON file."""
    p = db.get_project(project_id)
    if not p:
        raise HTTPException(404, "Project not found")

    chapters = db.get_chapters(project_id)
    analysis = db.get_analysis(project_id)
    strategy = db.get_strategy(project_id)

    chapters_out = []
    for ch in chapters:
        entry = {
            "chapter_index": ch["chapter_index"],
            "title": ch["title"],
            "translated_title": ch.get("translated_title") or "",
            "chapter_type": ch.get("chapter_type") or "chapter",
            "body_number": ch.get("body_number"),
            "original_content": ch.get("original_content") or "",
            "translated_content": ch.get("translated_content") or "",
            "annotations": ch.get("annotations") or "",
            "status": ch["status"],
            "epub_file_name": ch.get("epub_file_name") or "",
            "summary": ch.get("summary") or "",
        }
        if include_highlights:
            entry["highlights"] = ch.get("highlights") or ""
        chapters_out.append(entry)

    qa_records = db.get_qa_history(project_id) if hasattr(db, "get_qa_history") else []

    bundle = {
        "export_version": _EXPORT_VERSION,
        "project": {
            "name": p["name"],
            "source_language": p["source_language"],
            "target_language": p["target_language"],
            "status": p["status"],
            "name_map": p.get("name_map") or "",
            "created_at": p["created_at"],
        },
        "analysis": analysis or {},
        "strategy": strategy or {},
        "chapters": chapters_out,
        "qa_history": qa_records,
    }

    safe_name = p["name"].replace('"', "").replace("/", "_").replace("\\", "_")[:60]
    tmp = tempfile.NamedTemporaryFile(
        delete=False, suffix=".json", prefix=f"bitranslator_{safe_name}_"
    )
    tmp.write(json.dumps(bundle, ensure_ascii=False, indent=2).encode("utf-8"))
    tmp.close()
    return FileResponse(
        path=tmp.name,
        media_type="application/json",
        filename=f"{safe_name}_project.json",
    )


@router.post("/import")
async def import_project(file: UploadFile = File(...)):
    """Import a project from a previously exported JSON file."""
    if not file.filename or not file.filename.lower().endswith(".json"):
        raise HTTPException(400, "Please upload a .json export file")

    raw = await file.read()
    try:
        bundle = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON file")

    if "project" not in bundle or "chapters" not in bundle:
        raise HTTPException(400, "Invalid export format: missing project or chapters")

    proj_data = bundle["project"]
    project_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    proj_dir = settings.data_dir / project_id
    proj_dir.mkdir(parents=True, exist_ok=True)

    db.create_project(
        project_id=project_id,
        name=proj_data.get("name", "Imported Project"),
        source_lang=proj_data.get("source_language", "English"),
        target_lang=proj_data.get("target_language", "简体中文"),
        epub_path="",
        now=now,
    )

    best_status = proj_data.get("status", "uploaded")
    if best_status not in ("uploaded",):
        db.update_project(project_id, status=best_status)

    if proj_data.get("name_map"):
        db.update_project(project_id, name_map=proj_data["name_map"])

    ch_records = []
    for ch in bundle.get("chapters", []):
        ch_id = uuid.uuid4().hex[:12]
        ch_records.append({
            "id": ch_id,
            "project_id": project_id,
            "chapter_index": ch["chapter_index"],
            "title": ch.get("title", ""),
            "original_content": ch.get("original_content", ""),
            "chapter_type": ch.get("chapter_type", "chapter"),
            "body_number": ch.get("body_number"),
            "epub_file_name": ch.get("epub_file_name", ""),
        })
    if ch_records:
        db.insert_chapters(ch_records)

    for i, ch in enumerate(bundle.get("chapters", [])):
        updates = {}
        if ch.get("translated_content"):
            updates["translated_content"] = ch["translated_content"]
            updates["status"] = ch.get("status", "translated")
        if ch.get("translated_title"):
            updates["translated_title"] = ch["translated_title"]
        if ch.get("annotations"):
            updates["annotations"] = ch["annotations"]
        if ch.get("summary"):
            updates["summary"] = ch["summary"]
        if ch.get("highlights"):
            updates["highlights"] = ch["highlights"]
        if updates:
            db.update_chapter(ch_records[i]["id"], **updates)

    analysis = bundle.get("analysis")
    if analysis and isinstance(analysis, dict) and any(analysis.values()):
        clean = {k: v for k, v in analysis.items() if k != "project_id"}
        db.save_analysis(project_id, clean)

    strategy = bundle.get("strategy")
    if strategy and isinstance(strategy, dict) and any(strategy.values()):
        clean = {k: v for k, v in strategy.items() if k != "project_id"}
        db.save_strategy(project_id, clean)

    for qa in bundle.get("qa_history", []):
        if hasattr(db, "save_qa"):
            db.save_qa(project_id, qa.get("chapter_id", ""),
                       qa.get("question", ""), qa.get("answer", ""))

    return {"ok": True, "project_id": project_id}
