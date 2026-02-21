"""API routes for book/project management."""
from __future__ import annotations

import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

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
