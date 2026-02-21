"""Chapter-by-chapter translation engine with context continuity."""
from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path

from . import llm_service
from .epub_service import build_chapter_epub, build_translated_epub
from .. import database as db
from ..config import settings

log = logging.getLogger(__name__)

# Cancellation flags keyed by project_id
_cancel_flags: dict[str, bool] = {}

TRANSLATION_SYSTEM = """\
You are a professional book translator translating from {source_lang} to {target_lang}. \
Follow the translation strategy and glossary strictly to ensure consistency across the entire book.

── Translation Strategy ──
{strategy_text}

── Terminology Glossary ──
{glossary_text}

── Guidelines ──
• Translate the COMPLETE text from start to finish. Do NOT skip, summarize, or abbreviate any part.
• Produce natural, fluent {target_lang} that reads as if originally written in {target_lang}.
• Maintain the author's narrative voice, tone, and style as described in the strategy.
• Use the glossary for all listed terms to ensure consistency.
• Preserve paragraph structure. Every paragraph in the source must appear in the translation.
• Output ONLY the translated text, no commentary, translator notes, or explanations.
• Do NOT stop early. Translate every single sentence until the end of the provided text."""

TRANSLATION_USER = """\
{context_section}\
── Chapter to Translate: {chapter_title} ──

{chapter_text}"""

CONTINUATION_SYSTEM = """\
You are continuing a translation that was cut off. The translator was translating from \
{source_lang} to {target_lang}. Pick up EXACTLY where the translation left off. \
Do NOT repeat any already-translated text. Do NOT add any commentary. \
Output ONLY the continuation of the translated text."""

CONTINUATION_USER = """\
The translation was cut off. Here is the end of what was already translated:

...{tail}

And here is the portion of the original text that still needs to be translated:

{remaining}

Continue the translation from where it stopped. Output ONLY the translated continuation."""


def _extract_translated_title(translated_text: str, original_title: str) -> str:
    """Extract the translated chapter title from the first line of translated text."""
    lines = translated_text.strip().split("\n")
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if len(stripped) < 120 and not stripped.endswith(("。", ".", "！", "!", "？", "?", "」", '"', "…")):
            return stripped
        break
    return ""


def _bilingual_title(original_title: str, translated_title: str) -> str:
    """Format a bilingual title for display: 'translated / original'."""
    if not translated_title or translated_title.strip() == original_title.strip():
        return original_title
    return f"{translated_title} / {original_title}"


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
    for ch in prev[-5:]:
        lines.append(f"Chapter {ch['chapter_index'] + 1} ({ch['title']}): {ch['summary']}\n")
    lines.append("")
    return "\n".join(lines)


def _get_output_dir(project: dict) -> Path:
    """Get the output directory for a project: output/{book_name}/"""
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', project["name"])[:80].strip()
    out_dir = settings.output_dir / safe_name
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir


def _chapter_epub_path(project: dict, chapter: dict) -> Path:
    """Get the EPUB path for a single chapter."""
    out_dir = _get_output_dir(project)
    idx = chapter["chapter_index"] + 1
    safe_title = re.sub(r'[<>:"/\\|?*]', '_', chapter["title"])[:60].strip()
    return out_dir / f"Ch{idx:03d}_{safe_title}.epub"


# ── Stop support ────────────────────────────────────────────────────────

def request_stop(project_id: str) -> None:
    _cancel_flags[project_id] = True


def _is_cancelled(project_id: str) -> bool:
    return _cancel_flags.get(project_id, False)


def _clear_cancel(project_id: str) -> None:
    _cancel_flags.pop(project_id, None)


# ── Core translation ────────────────────────────────────────────────────

async def _translate_chunk_with_continuation(
    system_prompt: str,
    user_prompt: str,
    source_text: str,
    project: dict,
) -> str:
    """Translate a chunk, auto-continuing if the LLM output is truncated."""
    result = await llm_service.chat_ext(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        for_translation=True,
    )
    translated = result.text

    if not result.truncated:
        return translated

    # Auto-continuation loop
    for attempt in range(settings.max_continuations):
        log.warning("Translation truncated (attempt %d/%d), continuing…",
                    attempt + 1, settings.max_continuations)

        tail = translated[-500:] if len(translated) > 500 else translated
        translated_ratio = len(translated) / max(len(source_text), 1)
        estimated_done = min(translated_ratio, 0.95)
        remaining_start = int(len(source_text) * estimated_done * 0.9)
        remaining = source_text[remaining_start:]

        cont_system = CONTINUATION_SYSTEM.format(
            source_lang=project["source_language"],
            target_lang=project["target_language"],
        )
        cont_user = CONTINUATION_USER.format(
            tail=tail,
            remaining=remaining,
        )

        cont_result = await llm_service.chat_ext(
            system_prompt=cont_system,
            user_prompt=cont_user,
            for_translation=True,
        )
        translated += "\n" + cont_result.text

        if not cont_result.truncated:
            break

    return translated


async def translate_chapter(
    project_id: str,
    chapter_id: str,
) -> str:
    """Translate a single chapter, save per-chapter EPUB, return translated text."""
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

    text = chapter["original_content"]
    max_chars = settings.max_chapter_chars
    if len(text) <= max_chars:
        chunks = [text]
    else:
        chunks = _split_text(text, max_chars)

    log.info("Translating chapter %d (%s): %d chars → %d chunk(s)",
             chapter["chapter_index"], chapter["title"], len(text), len(chunks))

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

        translated = await _translate_chunk_with_continuation(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            source_text=chunk,
            project=project,
        )
        translated_parts.append(translated)

        # Save progress incrementally so we don't lose work
        partial = "\n\n".join(translated_parts)
        db.update_chapter(chapter_id, translated_content=partial)

    full_translation = "\n\n".join(translated_parts)

    translated_title = _extract_translated_title(full_translation, chapter["title"])
    db.update_chapter(chapter_id, translated_content=full_translation, status="translated",
                      translated_title=translated_title)

    display_title = _bilingual_title(chapter["title"], translated_title)
    epub_path = _chapter_epub_path(project, chapter)
    build_chapter_epub(
        chapter_title=display_title,
        translated_text=full_translation,
        output_path=epub_path,
        book_title=project["name"],
    )

    if not chapter.get("summary"):
        summary = await _summarize(chapter["title"], text)
        db.update_chapter(chapter_id, summary=summary)

    log.info("Translated chapter %d: %s → %s (%d chars translated)",
             chapter["chapter_index"], chapter["title"], epub_path.name, len(full_translation))
    return full_translation


def _truncate_to_words(text: str, max_words: int) -> tuple[str, bool]:
    """Truncate text to approximately max_words. Returns (text, was_truncated)."""
    words = text.split()
    if len(words) <= max_words:
        return text, False
    # Cut at word boundary, then find the last paragraph break for a clean cutoff
    truncated = " ".join(words[:max_words])
    last_para = truncated.rfind("\n\n")
    if last_para > len(truncated) * 0.7:
        truncated = truncated[:last_para]
    return truncated, True


async def translate_sample(project_id: str, chapter_index: int | None = None) -> str:
    """Translate the first ~N words of a chapter as a sample preview.

    If chapter_index is None, defaults to chapter 0.
    """
    project = db.get_project(project_id)
    chapters = db.get_chapters(project_id)
    strategy = db.get_strategy(project_id)
    if not chapters or not project or not strategy:
        raise ValueError("No chapters or strategy found")

    db.update_project(project_id, status="translating_sample")

    idx = chapter_index if chapter_index is not None else 0
    chapter = next((ch for ch in chapters if ch["chapter_index"] == idx), None)
    if chapter is None:
        raise ValueError(f"Chapter index {idx} not found")

    original_text = chapter["original_content"]
    sample_text, was_truncated = _truncate_to_words(original_text, settings.sample_max_words)

    if was_truncated:
        log.info("Sample: using first ~%d words of chapter %d (%d total words)",
                 settings.sample_max_words, idx + 1, len(original_text.split()))

    system_prompt = TRANSLATION_SYSTEM.format(
        source_lang=project["source_language"],
        target_lang=project["target_language"],
        strategy_text=_build_strategy_text(strategy),
        glossary_text=_build_glossary_text(strategy),
    )

    user_prompt = TRANSLATION_USER.format(
        context_section="",
        chapter_title=chapter["title"] + (" (sample excerpt)" if was_truncated else ""),
        chapter_text=sample_text,
    )

    translated = await _translate_chunk_with_continuation(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        source_text=sample_text,
        project=project,
    )

    translated_title = _extract_translated_title(translated, chapter["title"])
    db.update_chapter(chapter["id"], translated_content=translated, status="translated",
                      translated_title=translated_title)
    db.update_project(project_id, status="sample_ready",
                      sample_chapter_index=idx)
    log.info("Sample translation done (chapter %d): %d chars translated", idx + 1, len(translated))
    return translated


async def translate_all(
    project_id: str,
    start_chapter: int = 0,
    end_chapter: int = -1,
) -> None:
    """Translate chapters in the given range (0-based inclusive). -1 means last chapter."""
    _clear_cancel(project_id)
    project = db.get_project(project_id)
    all_chapters = db.get_chapters(project_id)
    db.update_project(project_id, status="translating")

    if end_chapter < 0:
        end_chapter = len(all_chapters) - 1
    end_chapter = min(end_chapter, len(all_chapters) - 1)
    start_chapter = max(start_chapter, 0)

    target_chapters = [ch for ch in all_chapters if start_chapter <= ch["chapter_index"] <= end_chapter]
    log.info("Translating chapters %d–%d (%d chapters) for project %s",
             start_chapter + 1, end_chapter + 1, len(target_chapters), project_id)

    # Reset the sample chapter if it only has a partial excerpt
    sample_idx = project.get("sample_chapter_index") or 0
    sample_ch = next((ch for ch in target_chapters if ch["chapter_index"] == sample_idx), None)
    if sample_ch and sample_ch["status"] == "translated":
        original_words = len((sample_ch.get("original_content") or "").split())
        translated_words = len((sample_ch.get("translated_content") or "").split())
        if original_words > 0:
            completeness = translated_words / original_words
            if completeness < 0.8:
                log.info("Chapter %d appears to be a sample excerpt (%.0f%% complete), resetting",
                         sample_ch["chapter_index"] + 1, completeness * 100)
                db.update_chapter(sample_ch["id"], status="pending", translated_content="")

    for ch in target_chapters:
        if _is_cancelled(project_id):
            _clear_cancel(project_id)
            db.update_project(project_id, status="stopped",
                              error_message="Translation stopped by user")
            log.info("Translation stopped by user for project %s at chapter %d",
                     project_id, ch["chapter_index"])
            return

        fresh = db.get_chapter(ch["id"])
        if fresh["status"] == "translated" and fresh.get("translated_content"):
            continue

        try:
            await translate_chapter(project_id, ch["id"])
        except Exception as e:
            log.error("Failed to translate chapter %s: %s", ch["id"], e)
            db.update_chapter(ch["id"], status="pending")
            db.update_project(project_id, status="error",
                              error_message=f"Failed at chapter {ch['chapter_index'] + 1}: {e}")
            raise

    # Check if ALL chapters in the project are done
    refreshed = db.get_chapters(project_id)
    all_done = all(c["status"] == "translated" for c in refreshed)
    db.update_project(project_id, status="completed" if all_done else "stopped")
    log.info("Translation batch complete for project %s (all_done=%s)", project_id, all_done)


def combine_all_chapters(project_id: str) -> Path | None:
    """Combine all translated chapters into a single EPUB."""
    project = db.get_project(project_id)
    chapters = db.get_chapters(project_id)

    if not project or not project.get("original_epub_path"):
        return None

    translations = {}
    bilingual_titles = {}
    for ch in chapters:
        fname = ch.get("epub_file_name")
        if not fname:
            continue
        tt = ch.get("translated_title") or ""
        bilingual_titles[fname] = _bilingual_title(ch["title"], tt)
        if ch.get("translated_content"):
            translations[fname] = ch["translated_content"]

    if not translations:
        return None

    out_dir = _get_output_dir(project)
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', project["name"])[:80].strip()
    out_path = out_dir / f"{safe_name}_complete.epub"
    build_translated_epub(project["original_epub_path"], translations, out_path,
                          bilingual_titles=bilingual_titles)
    db.update_project(project_id, translated_epub_path=str(out_path))
    log.info("Combined EPUB: %s", out_path)
    return out_path


def get_chapter_files(project_id: str) -> list[dict]:
    """List per-chapter EPUB files that exist on disk."""
    project = db.get_project(project_id)
    chapters = db.get_chapters(project_id)
    if not project:
        return []

    files = []
    for ch in chapters:
        path = _chapter_epub_path(project, ch)
        files.append({
            "chapter_id": ch["id"],
            "chapter_index": ch["chapter_index"],
            "title": ch["title"],
            "status": ch["status"],
            "file_exists": path.exists(),
            "file_name": path.name,
        })
    return files


async def _summarize(title: str, text: str) -> str:
    if len(text) > 15000:
        text = text[:15000] + "\n[...]"
    return await llm_service.chat(
        system_prompt="Produce a concise 2-3 sentence summary of this chapter. Return only the summary.",
        user_prompt=f"Chapter: {title}\n\n{text}",
        max_tokens=300,
    )


def _split_text(text: str, max_chars: int) -> list[str]:
    """Split text at paragraph boundaries, keeping scene/dialogue together where possible."""
    paragraphs = text.split("\n\n")
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for para in paragraphs:
        para_len = len(para) + 2
        if current_len + para_len > max_chars and current:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0
        # If a single paragraph exceeds max_chars, split it by sentences
        if len(para) > max_chars:
            if current:
                chunks.append("\n\n".join(current))
                current = []
                current_len = 0
            sentences = re.split(r'(?<=[.!?。！？])\s+', para)
            sent_buf: list[str] = []
            sent_len = 0
            for sent in sentences:
                if sent_len + len(sent) > max_chars and sent_buf:
                    chunks.append(" ".join(sent_buf))
                    sent_buf = []
                    sent_len = 0
                sent_buf.append(sent)
                sent_len += len(sent) + 1
            if sent_buf:
                current.append(" ".join(sent_buf))
                current_len = sent_len
        else:
            current.append(para)
            current_len += para_len
    if current:
        chunks.append("\n\n".join(current))
    return chunks
