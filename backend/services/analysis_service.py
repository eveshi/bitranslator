"""Book analysis: deep-read the book and extract structured understanding."""
from __future__ import annotations

import logging

from . import llm_service
from .. import database as db

log = logging.getLogger(__name__)

SUMMARY_SYSTEM = """\
You are a literary analyst. Read the following chapter text and produce a concise summary \
(3-5 sentences) capturing the key events, characters involved, and any important details. \
Return ONLY the summary text, no extra formatting."""

ANALYSIS_SYSTEM = """\
You are an expert literary analyst and translation consultant. \
You have been given a book's metadata and chapter-by-chapter summaries. \
Produce a comprehensive analysis to guide a professional translator.

Return your analysis as a JSON object with exactly these keys:
- "genre": string – the genre and subgenre
- "themes": list of strings – major themes and motifs
- "characters": list of objects with {"name": str, "description": str} – all significant characters
- "writing_style": string – narrative voice, tone, register, literary devices
- "setting": string – time period, locations, cultural context
- "key_terms": list of objects with {"term": str, "explanation": str} – domain-specific terms, \
recurring phrases, idioms that need consistent translation
- "cultural_notes": string – cultural references and context that a translator should know

Be thorough and specific. This analysis will directly inform the translation strategy."""


async def analyze_book(project_id: str) -> dict:
    """Run full book analysis: summarize each chapter, then produce holistic analysis."""
    project = db.get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    chapters = db.get_chapters(project_id)
    if not chapters:
        raise ValueError("No chapters found")

    db.update_project(project_id, status="analyzing")

    # Phase 1: Summarize each chapter
    log.info("Summarizing %d chapters for project %s", len(chapters), project_id)
    summaries: list[str] = []
    for ch in chapters:
        text = ch["original_content"]
        if len(text) > 15000:
            text = text[:15000] + "\n\n[... chapter continues ...]"
        summary = await llm_service.chat(
            system_prompt=SUMMARY_SYSTEM,
            user_prompt=f"Chapter: {ch['title']}\n\n{text}",
            max_tokens=500,
        )
        summaries.append(summary)
        db.update_chapter(ch["id"], summary=summary)
        log.info("  Summarized chapter %d: %s", ch["chapter_index"], ch["title"])

    # Phase 2: Holistic analysis
    book_overview = (
        f"Book Title: {project['name']}\n"
        f"Source Language: {project['source_language']}\n"
        f"Target Language: {project['target_language']}\n"
        f"Number of Chapters: {len(chapters)}\n\n"
    )
    for i, (ch, s) in enumerate(zip(chapters, summaries)):
        book_overview += f"--- Chapter {i + 1}: {ch['title']} ---\n{s}\n\n"

    log.info("Running holistic analysis for project %s", project_id)
    analysis_data = await llm_service.chat_json(
        system_prompt=ANALYSIS_SYSTEM,
        user_prompt=book_overview,
        max_tokens=4096,
    )
    analysis_data["raw_analysis"] = str(analysis_data)

    db.save_analysis(project_id, analysis_data)
    db.update_project(project_id, status="analyzed")
    log.info("Analysis complete for project %s", project_id)
    return analysis_data
