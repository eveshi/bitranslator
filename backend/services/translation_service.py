"""Chapter-by-chapter translation engine with context continuity."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from . import llm_service
from .epub_service import build_translated_epub
from .. import database as db
from ..config import settings

log = logging.getLogger(__name__)

TRANSLATION_SYSTEM = """\
You are a professional book translator translating from {source_lang} to {target_lang}. \
Follow the translation strategy and glossary strictly to ensure consistency across the entire book.

── Translation Strategy ──
{strategy_text}

── Terminology Glossary ──
{glossary_text}

── Guidelines ──
• Produce natural, fluent {target_lang} that reads as if originally written in {target_lang}.
• Maintain the author's narrative voice, tone, and style as described in the strategy.
• Use the glossary for all listed terms to ensure consistency.
• Preserve paragraph structure. Output ONLY the translated text, no commentary.
• Do NOT add translator notes, annotations, or explanations."""

TRANSLATION_USER = """\
{context_section}\
── Chapter to Translate: {chapter_title} ──

{chapter_text}"""


def _build_strategy_text(strategy: dict) -> str:
    parts = []
    if strategy.get("overall_approach"):
        parts.append(f"Approach: {strategy['overall_approach']}")
    if strategy.get("tone_and_style"):
        parts.append(f"Tone & Style: {strategy['tone_and_style']}")
    if strategy.get("cultural_adaptation"):
        parts.append(f"Cultural Adaptation: {strategy['cultural_adaptation']}")
    if strategy.get("special_considerations"):
        parts.append(f"Special Considerations: {strategy['special_considerations']}")
    if strategy.get("custom_instructions"):
        parts.append(f"Custom Instructions: {strategy['custom_instructions']}")

    names = strategy.get("character_names", [])
    if names:
        parts.append("Character Names:")
        for n in names:
            parts.append(f"  {n.get('original','')} → {n.get('translated','')} ({n.get('note','')})")

    return "\n".join(parts)


def _build_glossary_text(strategy: dict) -> str:
    glossary = strategy.get("glossary", [])
    if not glossary:
        return "(no glossary entries)"
    lines = []
    for g in glossary:
        lines.append(f"  {g.get('source','')} → {g.get('target','')}  [{g.get('context','')}]")
    return "\n".join(lines)


def _build_context_section(chapters: list[dict], current_index: int) -> str:
    """Build a context section from summaries of previous chapters."""
    prev = [ch for ch in chapters if ch["chapter_index"] < current_index and ch.get("summary")]
    if not prev:
        return ""
    lines = ["── Context from Previous Chapters ──\n"]
    for ch in prev[-5:]:  # last 5 chapters for manageable context
        lines.append(f"Chapter {ch['chapter_index'] + 1} ({ch['title']}): {ch['summary']}\n")
    lines.append("")
    return "\n".join(lines)


async def translate_chapter(
    project_id: str,
    chapter_id: str,
) -> str:
    """Translate a single chapter and return the translated text."""
    project = db.get_project(project_id)
    strategy = db.get_strategy(project_id)
    chapter = db.get_chapter(chapter_id)
    all_chapters = db.get_chapters(project_id)

    if not project or not strategy or not chapter:
        raise ValueError("Missing project, strategy, or chapter data")

    db.update_chapter(chapter_id, status="translating")

    system_prompt = TRANSLATION_SYSTEM.format(
        source_lang=project["source_language"],
        target_lang=project["target_language"],
        strategy_text=_build_strategy_text(strategy),
        glossary_text=_build_glossary_text(strategy),
    )

    context_section = _build_context_section(all_chapters, chapter["chapter_index"])

    # Split long chapters into chunks
    text = chapter["original_content"]
    max_chars = settings.max_chapter_chars
    if len(text) <= max_chars:
        chunks = [text]
    else:
        chunks = _split_text(text, max_chars)

    translated_parts = []
    for i, chunk in enumerate(chunks):
        chunk_label = chapter["title"]
        if len(chunks) > 1:
            chunk_label += f" (part {i + 1}/{len(chunks)})"

        user_prompt = TRANSLATION_USER.format(
            context_section=context_section,
            chapter_title=chunk_label,
            chapter_text=chunk,
        )

        translated = await llm_service.chat(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            for_translation=True,
            max_tokens=settings.llm_max_tokens,
        )
        translated_parts.append(translated)

    full_translation = "\n\n".join(translated_parts)
    db.update_chapter(chapter_id, translated_content=full_translation, status="translated")

    # Update summary for future context
    if not chapter.get("summary"):
        summary = await _summarize(chapter["title"], text)
        db.update_chapter(chapter_id, summary=summary)

    log.info("Translated chapter %d: %s (%d chars → %d chars)",
             chapter["chapter_index"], chapter["title"],
             len(text), len(full_translation))
    return full_translation


async def translate_sample(project_id: str) -> str:
    """Translate the first chapter as a sample."""
    chapters = db.get_chapters(project_id)
    if not chapters:
        raise ValueError("No chapters found")

    db.update_project(project_id, status="translating_sample")
    result = await translate_chapter(project_id, chapters[0]["id"])
    db.update_project(project_id, status="sample_ready")
    return result


async def translate_all(project_id: str) -> None:
    """Translate all untranslated chapters sequentially."""
    chapters = db.get_chapters(project_id)
    db.update_project(project_id, status="translating")

    for ch in chapters:
        if ch["status"] == "translated" and ch.get("translated_content"):
            continue
        try:
            await translate_chapter(project_id, ch["id"])
        except Exception as e:
            log.error("Failed to translate chapter %s: %s", ch["id"], e)
            db.update_chapter(ch["id"], status="pending")
            db.update_project(project_id, status="error",
                              error_message=f"Failed at chapter {ch['chapter_index'] + 1}: {e}")
            raise

    # Build the final EPUB
    project = db.get_project(project_id)
    chapters = db.get_chapters(project_id)
    translations = {}
    for ch in chapters:
        if ch.get("epub_file_name") and ch.get("translated_content"):
            translations[ch["epub_file_name"]] = ch["translated_content"]

    if translations and project.get("original_epub_path"):
        out_dir = settings.data_dir / project_id
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{project['name']}_translated.epub"
        build_translated_epub(project["original_epub_path"], translations, out_path)
        db.update_project(project_id, translated_epub_path=str(out_path), status="completed")
    else:
        db.update_project(project_id, status="completed")

    log.info("Full translation complete for project %s", project_id)


async def _summarize(title: str, text: str) -> str:
    if len(text) > 15000:
        text = text[:15000] + "\n[...]"
    return await llm_service.chat(
        system_prompt="Produce a concise 2-3 sentence summary of this chapter. Return only the summary.",
        user_prompt=f"Chapter: {title}\n\n{text}",
        max_tokens=300,
    )


def _split_text(text: str, max_chars: int) -> list[str]:
    """Split text at paragraph boundaries."""
    paragraphs = text.split("\n\n")
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for para in paragraphs:
        if current_len + len(para) > max_chars and current:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0
        current.append(para)
        current_len += len(para) + 2
    if current:
        chunks.append("\n\n".join(current))
    return chunks
