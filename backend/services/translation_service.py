"""Chapter-by-chapter translation engine with context continuity."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path

from . import llm_service
from .epub_service import build_chapter_epub, build_translated_epub
from .name_data import is_known_name
from .. import database as db
from ..config import settings

log = logging.getLogger(__name__)

# Cancellation flags keyed by project_id
_cancel_flags: dict[str, bool] = {}

_TRANSLATION_SYSTEM_BASE = """\
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
• Do NOT stop early. Translate every single sentence until the end of the provided text.
• Do NOT include the chapter title, chapter header, or "part X/Y" markers in your output. \
Start directly with the translated body text. The chapter title line in the prompt is \
for internal tracking only.
• FOREIGN LANGUAGE PASSAGES: When the source text contains passages in a third language \
(e.g. Latin in a French novel, French in a German novel, Italian in an English novel), \
follow standard publishing convention: keep the foreign passage UNTRANSLATED in its \
original language, wrap it in *asterisks for italics* (e.g. *Cogito, ergo sum*), and \
immediately add a translation note in parentheses or brackets after it, e.g. \
*Veni, vidi, vici*（拉丁语：我来，我见，我征服）. If annotations are enabled, also \
include an entry in the annotations section explaining the phrase, its language, and \
its significance in context.
{output_rules}"""

_OUTPUT_RULES_PLAIN = \
    "• Output ONLY the translated text, no commentary, translator notes, or explanations."

_ANNOTATION_DENSITY = {
    "verbose": (
        "Be generous with annotations. Annotate most sentences that have any nuance, "
        "literary device, cultural reference, or translation choice worth explaining. "
        "Aim for 8-15 notes per text chunk. Think of a reader who wants to deeply "
        "understand every translation decision."
    ),
    "normal": (
        "Only annotate passages that are: long/complex sentences, idioms, culturally "
        "specific references, ambiguous phrases, or where the translation departs "
        "significantly from the literal meaning. Aim for 3-8 notes per text chunk — "
        "NOT every sentence."
    ),
    "minimal": (
        "Be very selective. Only annotate the most critical passages: major cultural "
        "references a reader would otherwise miss, significant translation departures, "
        "or truly ambiguous phrases. Aim for 1-3 notes per text chunk at most."
    ),
}

def _get_annotation_rules(density: str = "normal") -> str:
    density_instruction = _ANNOTATION_DENSITY.get(density, _ANNOTATION_DENSITY["normal"])
    return (
        "• Output the complete translated text first.\n"
        "• AFTER the COMPLETE translation, output a line containing EXACTLY: ===ANNOTATIONS===\n"
        "• Then output a JSON array of translator's notes for difficult/nuanced passages.\n"
        '  Each element: {{"src": "<short original excerpt ≤30 chars>", '
        '"tgt": "<corresponding translated excerpt ≤30 chars>", '
        '"note": "<explanation: why you translated it this way, literal meaning, '
        'cultural context, alternative readings, etc.>"}}\n'
        f"• {density_instruction}\n"
        "• The full translation MUST appear BEFORE the ===ANNOTATIONS=== line.\n"
        "• If nothing warrants annotation, output ===ANNOTATIONS=== followed by []."
    )

_OUTPUT_RULES_ANNOTATED = _get_annotation_rules("normal")

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


_ANNOTATION_SEPARATOR = "===ANNOTATIONS==="


def _build_system_prompt(project: dict, strategy: dict) -> str:
    enable_ann = strategy.get("enable_annotations", False)
    if enable_ann:
        density = strategy.get("annotation_density", "normal")
        output_rules = _get_annotation_rules(density)
    else:
        output_rules = _OUTPUT_RULES_PLAIN
    return _TRANSLATION_SYSTEM_BASE.format(
        source_lang=project["source_language"],
        target_lang=project["target_language"],
        strategy_text=_build_strategy_text(strategy),
        glossary_text=_build_glossary_text(strategy),
        output_rules=output_rules,
    )


def _strip_chunk_header(text: str, ch_title: str, chunk_idx: int, total_chunks: int) -> str:
    """Remove any leaked chapter/chunk header lines from the AI's output."""
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip()
        # Skip lines that are the "── Chapter to Translate: ... ──" header
        if stripped.startswith("──") and stripped.endswith("──"):
            continue
        # Skip lines that match the chunk label pattern: "title (part N/M)"
        if total_chunks > 1:
            part_marker = f"(part {chunk_idx + 1}/{total_chunks})"
            alt_marker = f"({chunk_idx + 1}/{total_chunks})"
            if part_marker in stripped or alt_marker in stripped:
                if len(stripped) < len(ch_title) + 30:
                    continue
        # Skip lines that are just the chapter title repeated
        if stripped == ch_title or stripped == f"── {ch_title} ──":
            continue
        cleaned.append(line)
    # Remove leading blank lines that result from stripping
    while cleaned and not cleaned[0].strip():
        cleaned.pop(0)
    return "\n".join(cleaned)


def _split_translation_and_annotations(text: str) -> tuple[str, str]:
    """Split AI response into (translation, annotations_json).
    If no separator found, returns (text, '')."""
    if _ANNOTATION_SEPARATOR in text:
        parts = text.split(_ANNOTATION_SEPARATOR, 1)
        return parts[0].strip(), parts[1].strip()
    return text.strip(), ""


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

    # Annotation rules
    annotations = []
    if strategy.get("annotate_terms"):
        annotations.append(
            "IMPORTANT – Original-text annotations for terms and place names:\n"
            "Only annotate terms/places that LACK a widely-accepted standard "
            "translation. On the FIRST occurrence in the ENTIRE text chunk you "
            "receive (not per-paragraph), append the original in parentheses.\n"
            "DO annotate: fictional place names, obscure locations, niche jargon, "
            "book titles without an official published translation, invented or "
            "author-specific terminology.\n"
            "DO NOT annotate: country names, major world cities, well-known "
            "fictional places with established translations (e.g. 霍格沃茨, "
            "纳尼亚), common scientific terms with standard translations "
            "(e.g. 化学实验室, 血红细胞, 脱氧核糖核酸).\n"
            "Example: 他来自格林德沃（Grindelwald），曾在日内瓦大学研读过暗物质理论"
            "（Dark Matter Theory）。  ← 'Grindelwald' (obscure village) is "
            "annotated; '日内瓦' (Geneva, well-known city) is not."
        )
    if strategy.get("annotate_names"):
        confirmed_pairs = []
        for n in strategy.get("character_names", []):
            if isinstance(n, dict) and n.get("original"):
                orig = n["original"]
                trans = n.get("translated") or n.get("target") or ""
                confirmed_pairs.append((orig, trans))
        exclude_note = ""
        if confirmed_pairs:
            name_list = ", ".join(
                f"{t}({o})" if t else o for o, t in confirmed_pairs
            )
            exclude_note = (
                f"\nCRITICAL: The following names have confirmed, fixed translations "
                f"in the glossary. NEVER add parenthetical original-language annotations "
                f"for them — their translations are already unified and consistent: "
                f"{name_list}.\n"
                f"Only annotate names that are NOT in this confirmed list."
            )
        annotations.append(
            "IMPORTANT – Original-text annotations for character names:\n"
            "For non-protagonist names, annotate ONLY the FIRST occurrence in "
            "the ENTIRE text chunk you receive (not per-paragraph).\n"
            "When multiple unfamiliar names appear in the same sentence, use "
            "your judgment: annotate only the 2-3 most important or recurring "
            "ones; skip names that appear only once in passing or are clearly "
            "minor (e.g. a waiter, a mentioned-once relative).\n"
            "Example: 默里（Murray）和汤普森（Thompson）走进了房间，侍者汉斯递上了菜单。"
            " ← Murray and Thompson are annotated; Hans (minor, one-off) is not."
            + exclude_note
        )
    if annotations:
        parts.append("\n── Annotation Rules ──")
        parts.extend(annotations)

    # Free-translation preference
    if strategy.get("free_translation"):
        parts.append(
            "\n── Translation Style Preference ──\n"
            "The reader prefers READABILITY over literal faithfulness. "
            "For long, complex, or multi-clause sentences: restructure them "
            "into shorter, clearer sentences in the target language rather than "
            "preserving the original sentence structure. "
            "Prioritize natural, easy-to-understand expression. "
            "It is acceptable to split one long sentence into two or three, "
            "reorder clauses, or paraphrase — as long as the meaning and tone "
            "are preserved. Avoid awkward literal translations that require the "
            "reader to re-read to understand."
        )

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


class _StopRequested(Exception):
    """Raised when user-requested stop is detected between chunks."""


# ── Chunk-level progress tracking (in-memory) ──────────────────────────

_chunk_progress: dict[str, dict] = {}


def get_chunk_progress(project_id: str) -> dict | None:
    return _chunk_progress.get(project_id)


def _set_chunk_progress(project_id: str, chapter_index: int, chapter_title: str,
                        chunk_done: int, chunk_total: int) -> None:
    _chunk_progress[project_id] = {
        "chapter_index": chapter_index,
        "chapter_title": chapter_title,
        "chunk_done": chunk_done,
        "chunk_total": chunk_total,
    }


def _clear_chunk_progress(project_id: str) -> None:
    _chunk_progress.pop(project_id, None)


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
    feedback: str = "",
    strategy_overrides: dict | None = None,
) -> str:
    """Translate a single chapter, save per-chapter EPUB, return translated text."""
    project = db.get_project(project_id)
    strategy = db.get_strategy(project_id)
    chapter = db.get_chapter(chapter_id)
    all_chapters = db.get_chapters(project_id)

    if not project or not strategy or not chapter:
        raise ValueError("Missing project, strategy, or chapter data")

    # Apply per-chapter strategy overrides if provided
    if strategy_overrides:
        strategy = {**strategy, **strategy_overrides}

    db.update_chapter(chapter_id, status="translating")

    system_prompt = _build_system_prompt(project, strategy)
    if feedback:
        system_prompt += (
            "\n\n── User Feedback on Previous Translation ──\n"
            "The user was NOT satisfied with the previous translation of this chapter. "
            "Please pay special attention to the following feedback and adjust accordingly:\n"
            f"{feedback}\n"
        )
    enable_ann = strategy.get("enable_annotations", False)

    context_section = _build_context_section(all_chapters, chapter["chapter_index"])

    text = chapter["original_content"]
    max_chars = settings.max_chapter_chars
    if len(text) <= max_chars:
        chunks = [text]
    else:
        chunks = _split_text(text, max_chars)

    log.info("Translating chapter %d (%s): %d chars → %d chunk(s)",
             chapter["chapter_index"], chapter["title"], len(text), len(chunks))

    ch_idx = chapter["chapter_index"]
    ch_title = chapter["title"]
    _set_chunk_progress(project_id, ch_idx, ch_title, 0, len(chunks))

    async def _do_one_chunk(i: int, chunk: str) -> tuple[int, str, list]:
        """Translate a single chunk; returns (index, translated_text, annotations)."""
        chunk_label = ch_title
        if len(chunks) > 1:
            chunk_label += f" (part {i + 1}/{len(chunks)})"

        user_prompt = TRANSLATION_USER.format(
            context_section=context_section,
            chapter_title=chunk_label,
            chapter_text=chunk,
        )

        raw_result = await _translate_chunk_with_continuation(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            source_text=chunk,
            project=project,
        )

        ann_list = []
        if enable_ann:
            trans_text, ann_json = _split_translation_and_annotations(raw_result)
            if ann_json:
                try:
                    parsed = json.loads(ann_json)
                    if isinstance(parsed, list):
                        ann_list = parsed
                except json.JSONDecodeError:
                    log.warning("Failed to parse annotations JSON for chunk %d", i)
        else:
            trans_text = raw_result
        trans_text = _strip_chunk_header(trans_text, ch_title, i, len(chunks))
        return i, trans_text, ann_list

    translated_parts: list[str | None] = [None] * len(chunks)
    all_annotations = []
    done_count = 0
    concurrency = min(settings.parallel_chunks, len(chunks))

    batch_start = 0
    while batch_start < len(chunks):
        if _is_cancelled(project_id):
            filled = [p for p in translated_parts if p is not None]
            if filled:
                db.update_chapter(chapter_id, translated_content="\n\n".join(filled), status="pending")
            raise _StopRequested()

        batch_end = min(batch_start + concurrency, len(chunks))
        tasks = [_do_one_chunk(i, chunks[i]) for i in range(batch_start, batch_end)]
        results = await asyncio.gather(*tasks)

        for idx, trans_text, ann_list in results:
            translated_parts[idx] = trans_text
            all_annotations.extend(ann_list)
            done_count += 1

        partial = "\n\n".join(p for p in translated_parts if p is not None)
        db.update_chapter(chapter_id, translated_content=partial)
        _set_chunk_progress(project_id, ch_idx, ch_title, done_count, len(chunks))
        batch_start = batch_end

    full_translation = "\n\n".join(p for p in translated_parts if p)

    annotations_str = json.dumps(all_annotations, ensure_ascii=False) if all_annotations else ""
    translated_title = _extract_translated_title(full_translation, chapter["title"])
    # If extraction returned nothing, preserve the existing translated title
    if not translated_title and chapter.get("translated_title"):
        translated_title = chapter["translated_title"]

    cur_ver = (chapter.get("translation_version") or 0) + 1
    strategy_ver = strategy.get("version", 0)
    db.update_chapter(chapter_id, translated_content=full_translation, status="translated",
                      translated_title=translated_title, annotations=annotations_str,
                      translation_version=cur_ver, strategy_version_used=strategy_ver)

    db.save_translation_version(
        project_id, chapter_id, cur_ver,
        full_translation, translated_title, annotations_str,
        feedback=feedback, strategy_version=strategy_ver,
    )

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

    _update_name_map(project_id, text, full_translation)

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

    system_prompt = _build_system_prompt(project, strategy)
    enable_ann = strategy.get("enable_annotations", False)

    user_prompt = TRANSLATION_USER.format(
        context_section="",
        chapter_title=chapter["title"] + (" (sample excerpt)" if was_truncated else ""),
        chapter_text=sample_text,
    )

    raw_result = await _translate_chunk_with_continuation(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        source_text=sample_text,
        project=project,
    )

    if enable_ann:
        translated, ann_json = _split_translation_and_annotations(raw_result)
        annotations_str = ""
        if ann_json:
            try:
                parsed = json.loads(ann_json)
                if isinstance(parsed, list):
                    annotations_str = json.dumps(parsed, ensure_ascii=False)
            except json.JSONDecodeError:
                pass
        db.update_chapter(chapter["id"], annotations=annotations_str)
    else:
        translated = raw_result

    translated = _strip_chunk_header(translated, chapter["title"], 0, 1)
    translated_title = _extract_translated_title(translated, chapter["title"])
    if not translated_title and chapter.get("translated_title"):
        translated_title = chapter["translated_title"]

    cur_ver = (chapter.get("translation_version") or 0) + 1
    strategy_ver = strategy.get("version", 0)
    ann_str = annotations_str if enable_ann else ""
    db.update_chapter(chapter["id"], translated_content=translated, status="translated",
                      translated_title=translated_title,
                      translation_version=cur_ver, strategy_version_used=strategy_ver)
    db.save_translation_version(
        project_id, chapter["id"], cur_ver,
        translated, translated_title, ann_str,
        strategy_version=strategy_ver, is_sample=True,
    )
    db.update_project(project_id, status="sample_ready",
                      sample_chapter_index=idx)
    log.info("Sample translation v%d done (chapter %d): %d chars translated",
             cur_ver, idx + 1, len(translated))
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

    try:
        for ch in target_chapters:
            if _is_cancelled(project_id):
                raise _StopRequested()

            fresh = db.get_chapter(ch["id"])
            if fresh["status"] == "translated" and fresh.get("translated_content"):
                continue

            try:
                await translate_chapter(project_id, ch["id"])
            except _StopRequested:
                raise
            except Exception as e:
                log.error("Failed to translate chapter %s: %s", ch["id"], e)
                db.update_chapter(ch["id"], status="pending")
                db.update_project(project_id, status="error",
                                  error_message=f"Failed at chapter {ch['chapter_index'] + 1}: {e}")
                raise
    except _StopRequested:
        _clear_cancel(project_id)
        _clear_chunk_progress(project_id)
        db.update_project(project_id, status="stopped",
                          error_message="Translation stopped by user")
        log.info("Translation stopped by user for project %s", project_id)
        return

    _clear_chunk_progress(project_id)
    # Check if ALL chapters in the project are done
    refreshed = db.get_chapters(project_id)
    all_done = all(c["status"] == "translated" for c in refreshed)
    db.update_project(project_id, status="completed" if all_done else "stopped")
    log.info("Translation batch complete for project %s (all_done=%s)", project_id, all_done)


def _extract_names_from_text(text: str) -> dict[str, int]:
    """Extract character names from text using the known-names database.

    Finds capitalized words that match entries in the common first-name /
    surname lists for English, German, French, Spanish, Italian, Dutch,
    Scandinavian, and Russian.  Also detects multi-word name sequences
    (e.g. "Sherlock Holmes") where at least one component is a known name.

    Returns {name: occurrence_count}.
    """
    hits: dict[str, int] = {}

    # Single capitalized words that are known names
    for m in re.finditer(r'\b([A-ZÀ-Ý][a-zà-ÿ]+)\b', text):
        word = m.group(1)
        if is_known_name(word):
            hits[word] = hits.get(word, 0) + 1

    # Multi-word capitalized sequences where >=1 word is a known name
    for m in re.finditer(r'\b([A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+)+)\b', text):
        phrase = m.group(1)
        parts = phrase.split()
        if len(phrase) < 50 and any(is_known_name(p) for p in parts):
            hits[phrase] = hits.get(phrase, 0) + 1

    return hits


def _collect_names_to_track(project_id: str) -> list[dict]:
    """Collect all name entries from strategy + analysis + text extraction."""
    names: dict[str, str] = {}  # original -> preferred translation

    strategy = db.get_strategy(project_id)
    if strategy:
        for n in (strategy.get("character_names") or []):
            if isinstance(n, dict) and n.get("original"):
                names[n["original"]] = n.get("translated", "")
        for g in (strategy.get("glossary") or []):
            if isinstance(g, dict) and g.get("source"):
                names.setdefault(g["source"], g.get("target", ""))

    analysis = db.get_analysis(project_id)
    if analysis:
        for c in (analysis.get("characters") or []):
            if isinstance(c, dict) and c.get("name"):
                names.setdefault(c["name"], "")

    # Extract names from all chapter texts using known-names database
    chapters = db.get_chapters(project_id)
    all_text = " ".join((ch.get("original_content") or "") for ch in chapters)
    for candidate, count in _extract_names_from_text(all_text).items():
        names.setdefault(candidate, "")

    return [{"original": k, "translated": v} for k, v in names.items()]


# ── Phonetic matching utilities for CJK name discovery ─────────────────
_HAS_CJK_RE = re.compile(r'[\u4e00-\u9fff]')

# Characters commonly used in Chinese transliteration of foreign names.
# Comprehensive set (~600 chars) covering Xinhua conventions + common variants.
# Organized by category for maintainability.
_TRANSLIT_CHARS = frozenset(
    # ─── High-frequency transliteration syllables ───
    "阿巴贝布卡查达德迪多法菲弗盖格哈赫洪胡杰凯科克拉莱兰勒雷利里琳路卢"
    "马曼梅米莫默穆纳尼诺帕佩彼皮普奎瑞萨赛珊舍施斯索塔特蒂图瓦维沃西夏辛"
    "雅扬耶伊尤泽姆朗森伯罗瓜奥恩芬威丝尔亚安埃艾厄温叶基吉列日什茨捷宁夫"
    "洛林依戈齐兹希约谢波托奇舒库鲁苏旺加提拜顿登迈费芙肯连彭泰休寇崔修芭"
    "妮娅娜塞蕾黛沙丹瑟珀汀柯蒙乔迦若茜碧茉蓓佳柏桑亨福尔摩华玛丽琼瑰"
    # ─── Common syllables often missed ───
    "坦翰逊班甘坎坡垒培堡墨奈奥姆威娅姬孚宾寇密尤岑岚巴庞廷弥恺慕戈扎"
    "敖斐昂昆曼朱杜松柯梅桂棱欧沁沛泊泽浦涅淮渥漫潘焦熙牧琦瑰瓦畅盎祖"
    "禄穆笛纪翡聪腓艾荻莉莎莱莲菈菩葛蒂蔡裴褚覃赫赖迪逸郝鄂霍韦鲍黎"
    # ─── Traditional / literary transliteration chars ───
    "生翁耐聂萧蒲裘詹贡郎铎锡雁颜魏鸿仑伍伦佐佩侬俄傅儒凡凤刚劳勃勋博"
    "卓卫厉史吕哥唐嗣士娃孔宋寅尧巍康彤律悉惠戴拂摩敏旺易曹汉汤沙浑海烈"
    "爵珠琪琴珂珈瑙瑶璐璃嘉露蕊薇蔻绮翠茵荷苔芮蓉蕾纶缪罕门铁铭锐霖钟"
    "鑫韩鸿黛凰珍玲瑛甄"
    # ─── Characters for non-standard but common transliterations ───
    "保冈古可台吉司因尼思惠拂敦昌明杰根歌津满炎照瑟甫白石竹纯罗肖苗"
)

try:
    from pypinyin import lazy_pinyin, Style
    _HAS_PYPINYIN = True
except ImportError:
    _HAS_PYPINYIN = False


def _extract_cjk_name_candidates(text: str) -> dict[str, int]:
    """Extract likely transliterated name tokens from Chinese text.

    Scans for maximal consecutive runs of transliteration characters,
    which are very likely to be foreign name transliterations.
    """
    counts: dict[str, int] = {}
    i = 0
    n = len(text)
    while i < n:
        if text[i] in _TRANSLIT_CHARS:
            j = i + 1
            while j < n and text[j] in _TRANSLIT_CHARS:
                j += 1
            token = text[i:j]
            if 2 <= len(token) <= 8:
                counts[token] = counts.get(token, 0) + 1
            i = j
        else:
            i += 1
    return counts


def _phonetic_similarity(english_name: str, chinese_token: str) -> float:
    """Compute phonetic similarity between an English name and a Chinese token.

    Uses pypinyin to convert the Chinese token to pinyin, then compares
    using multiple phonetic heuristics. Returns 0.0-1.0.
    """
    if not _HAS_PYPINYIN:
        return 0.0

    pinyin_parts = lazy_pinyin(chinese_token, style=Style.NORMAL)
    pinyin_str = "".join(pinyin_parts).lower()
    eng = english_name.lower()

    if not pinyin_str or not eng:
        return 0.0

    # Chinese transliteration often maps English consonants to different
    # pinyin initials. Build equivalence groups rather than pairs.
    _equiv_groups = [
        {"l", "r", "n"},        # l/r/n interchange
        {"b", "p"},             # b/p
        {"d", "t"},             # d/t
        {"g", "k"},             # g/k
        {"v", "w", "f"},        # v/w/f (Watson→华sheng, Valerie→瓦)
        {"s", "z", "c", "x"},   # s/z/c/x (Sherlock→夏xia)
        {"sh", "x", "s"},       # sh/x (Sherlock→夏)
        {"h", "f", "hu"},       # h/f (Holmes→福fu)
        {"j", "zh", "g"},       # j/zh/g
    ]

    def _consonants_match(c1: str, c2: str) -> bool:
        if c1 == c2:
            return True
        for group in _equiv_groups:
            if c1 in group and c2 in group:
                return True
        return False

    # First consonant matching
    first_match = 1.0 if pinyin_str[0] == eng[0] else 0.0
    if first_match == 0.0:
        # Check first 1-2 chars of each
        for plen in (2, 1):
            for elen in (2, 1):
                if plen <= len(pinyin_str) and elen <= len(eng):
                    if _consonants_match(pinyin_str[:plen], eng[:elen]):
                        first_match = 0.7
                        break
            if first_match > 0:
                break

    # Longest common subsequence ratio (more robust than bag-of-chars)
    m, n = len(pinyin_str), len(eng)
    if m > 20 or n > 20:
        lcs_ratio = 0.0
    else:
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if pinyin_str[i-1] == eng[j-1]:
                    dp[i][j] = dp[i-1][j-1] + 1
                else:
                    dp[i][j] = max(dp[i-1][j], dp[i][j-1])
        lcs_ratio = dp[m][n] / max(m, n) if max(m, n) > 0 else 0.0

    return first_match * 0.5 + lcs_ratio * 0.5


# Matches: 1-8 CJK/Kana chars immediately before a parenthesised Latin name.
# Group 1 = translated name (CJK token), Group 2 = original name (Latin).
_ANNOTATION_RE = re.compile(
    r'([\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff]{1,8})'
    r'[（(]'
    r'([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-\'\.]{0,40})'
    r'[)）]'
)


def _extract_annotation_pairs(translated_text: str) -> dict[str, set[str]]:
    """Extract {original_name: {translated_variant, ...}} from parenthetical
    annotations like 默里（Murray） or 贝克街（Baker Street）."""
    pairs: dict[str, set[str]] = {}
    for m in _ANNOTATION_RE.finditer(translated_text):
        trans_name = m.group(1).strip()
        orig_name = m.group(2).strip()
        if orig_name and trans_name and len(trans_name) <= 8:
            pairs.setdefault(orig_name, set()).add(trans_name)
    return pairs


def _strip_annotations(text: str) -> str:
    """Remove parenthetical original-language annotations so that the raw
    original names inside parentheses are not counted as translation variants."""
    return _ANNOTATION_RE.sub(lambda m: m.group(1), text)


def _is_valid_translation(text: str) -> bool:
    """Reject strings that are clearly not a name translation."""
    if not text or len(text) > 20:
        return False
    if "\n" in text or "。" in text or "," in text or "." in text:
        return False
    return True


def _anno_name_matches(anno_orig: str, target_name: str) -> bool:
    """Check if an annotation's original name matches the target name.
    Requires exact match (case-insensitive) or that the annotation is one
    of the space-separated parts of a multi-word target name."""
    if anno_orig.lower() == target_name.lower():
        return True
    # "Murray" in annotation matches target "Murray Donovan"
    target_parts = target_name.lower().split()
    if len(target_parts) >= 2 and anno_orig.lower() in target_parts:
        return True
    # "John Smith" in annotation matches target "John Smith"
    anno_parts = anno_orig.lower().split()
    if len(anno_parts) >= 2 and anno_parts == target_parts:
        return True
    return False


def _scan_translation_variants(
    original_name: str,
    translated_text: str,
    known_translations: list[str],
) -> dict[str, int]:
    """Find all translation variants for a name in translated text.

    Uses parenthetical annotations, known translations, and original-name
    retention detection.  Parenthetical original-language text is stripped
    before counting to avoid inflating variant stats.
    """
    variants: dict[str, int] = {}

    anno_pairs = _extract_annotation_pairs(translated_text)
    for anno_orig, trans_set in anno_pairs.items():
        if _anno_name_matches(anno_orig, original_name):
            for tname in trans_set:
                if _is_valid_translation(tname):
                    variants[tname] = variants.get(tname, 0) + 1

    clean_text = _strip_annotations(translated_text)

    for trans in known_translations:
        if trans and _is_valid_translation(trans) and trans in clean_text:
            variants[trans] = max(variants.get(trans, 0), clean_text.count(trans))

    if original_name in clean_text:
        cnt = clean_text.count(original_name)
        if cnt > 0:
            variants[original_name] = max(variants.get(original_name, 0), cnt)

    return variants


def _collect_names_quick(project_id: str, original_text: str) -> list[dict]:
    """Fast version for per-chapter updates: strategy/analysis names + names from this chapter."""
    names: dict[str, str] = {}

    strategy = db.get_strategy(project_id)
    if strategy:
        for n in (strategy.get("character_names") or []):
            if isinstance(n, dict) and n.get("original"):
                names[n["original"]] = n.get("translated", "")
        for g in (strategy.get("glossary") or []):
            if isinstance(g, dict) and g.get("source"):
                names.setdefault(g["source"], g.get("target", ""))

    analysis = db.get_analysis(project_id)
    if analysis:
        for c in (analysis.get("characters") or []):
            if isinstance(c, dict) and c.get("name"):
                names.setdefault(c["name"], "")

    # Extract from this chapter only (fast) using known-names database
    for candidate in _extract_names_from_text(original_text):
        names.setdefault(candidate, "")

    return [{"original": k, "translated": v} for k, v in names.items()]


def _update_name_map(project_id: str, original_text: str, translated_text: str) -> None:
    """Scan original/translated text for character names and update name_map."""
    names_to_track = _collect_names_quick(project_id, original_text)
    if not names_to_track:
        return

    project = db.get_project(project_id)
    existing_raw = project.get("name_map", "") if project else ""
    try:
        name_map = json.loads(existing_raw) if existing_raw else {}
    except (json.JSONDecodeError, TypeError):
        name_map = {}

    for entry in names_to_track:
        orig = entry["original"]
        count_in_orig = original_text.count(orig)
        if count_in_orig == 0:
            continue

        if orig not in name_map:
            name_map[orig] = {"total": 0, "translations": {}}

        name_map[orig]["total"] += count_in_orig

        known_trans = [entry.get("translated", "")]
        known_trans += list(name_map[orig].get("translations", {}).keys())
        variants = _scan_translation_variants(orig, translated_text, known_trans)
        for trans, cnt in variants.items():
            name_map[orig]["translations"][trans] = (
                name_map[orig]["translations"].get(trans, 0) + cnt
            )

    db.update_project(project_id, name_map=json.dumps(name_map, ensure_ascii=False))


def _precompute_chapter(args: tuple) -> dict:
    """Pre-compute expensive per-chapter data once (runs in thread pool)."""
    idx, orig, trans, is_cjk = args
    anno_pairs = _extract_annotation_pairs(trans)
    clean = _strip_annotations(trans)
    cjk_candidates = _extract_cjk_name_candidates(trans) if is_cjk else {}
    return {
        "idx": idx,
        "orig": orig,
        "clean": clean,
        "anno_pairs": anno_pairs,
        "cjk_candidates": cjk_candidates,
    }


def _scan_variants_fast(
    original_name: str,
    clean_text: str,
    anno_pairs: dict[str, set[str]],
    known_translations: list[str],
) -> dict[str, int]:
    """Fast variant scan using pre-computed annotation pairs and stripped text."""
    variants: dict[str, int] = {}

    for anno_orig, trans_set in anno_pairs.items():
        if _anno_name_matches(anno_orig, original_name):
            for tname in trans_set:
                if _is_valid_translation(tname):
                    variants[tname] = variants.get(tname, 0) + 1

    for trans in known_translations:
        if trans and _is_valid_translation(trans) and trans in clean_text:
            variants[trans] = max(variants.get(trans, 0), clean_text.count(trans))

    if original_name in clean_text:
        cnt = clean_text.count(original_name)
        if cnt > 0:
            variants[original_name] = max(variants.get(original_name, 0), cnt)

    return variants


_NAME_VERIFY_SYSTEM = """\
You are a multilingual name translation expert.

I extracted the following capitalized words from a {source_lang} book (novel / \
non-fiction).  They MIGHT be character names, but some could be common nouns, \
place names, or other non-name words that happened to appear capitalized.

Your task for EACH word:
1. Decide: is this word commonly used as a **person's first name, surname, \
or nickname** in {source_lang} or other European languages?
   - Words like "Ray", "Rose", "Grace", "Hunter" ARE names even though they \
also have other meanings — mark them is_name: true.
   - Words like "Chapter", "Nothing", "Laboratory", "University" are obviously \
NOT names — mark them is_name: false.
   - Place names (e.g. "London", "Stanford"), organization names, and generic \
titles (e.g. "Doctor", "Professor") should be is_name: false.
2. If is_name is true, list ALL common {target_lang} translations of this name.
   Include every variant you know (e.g. "Rachel" → ["蕾切尔", "拉结", "瑞秋"]).

Return a JSON array: [{{"name": "<EXACT original>", "is_name": true/false, \
"translations": ["t1", "t2"]}}]
Return the "name" field with EXACT original spelling. For is_name: false, \
set translations to [].
ONLY output the JSON array."""

_NAME_BATCH_SIZE = 50

# ── Name-scan progress tracking (in-memory) ────────────────────────────

_name_scan_status: dict[str, dict] = {}


def get_name_scan_status(project_id: str) -> dict | None:
    return _name_scan_status.get(project_id)


def _set_name_scan_status(project_id: str, phase: str, detail: str = "",
                          done: int = 0, total: int = 0, finished: bool = False,
                          name_map: dict | None = None) -> None:
    _name_scan_status[project_id] = {
        "phase": phase, "detail": detail,
        "done": done, "total": total,
        "finished": finished, "name_map": name_map,
    }


def _clear_name_scan_status(project_id: str) -> None:
    _name_scan_status.pop(project_id, None)


async def _ai_verify_names(
    names: list[str], source_lang: str, target_lang: str,
    project_id: str = "",
) -> dict[str, list[str]]:
    """Ask AI to provide translation variants for candidate names.
    Returns {original_name: [translation_variant, ...]}."""
    result: dict[str, list[str]] = {}
    # Build a case-insensitive lookup so we can map AI's response back
    name_lookup: dict[str, str] = {n.lower().strip(): n for n in names}

    total_batches = (len(names) + _NAME_BATCH_SIZE - 1) // _NAME_BATCH_SIZE
    for batch_idx, i in enumerate(range(0, len(names), _NAME_BATCH_SIZE)):
        batch = names[i:i + _NAME_BATCH_SIZE]
        if project_id:
            _set_name_scan_status(project_id, "ai_verify",
                                  f"AI batch {batch_idx + 1}/{total_batches}",
                                  batch_idx, total_batches)
        prompt = "Names:\n" + "\n".join(f"- {n}" for n in batch)
        try:
            resp = await llm_service.chat_json(
                system_prompt=_NAME_VERIFY_SYSTEM.format(
                    source_lang=source_lang, target_lang=target_lang),
                user_prompt=prompt,
                max_tokens=4096,
            )
            entries = resp if isinstance(resp, list) else resp.get("names", resp.get("result", []))
            for entry in entries:
                if not isinstance(entry, dict) or not entry.get("name"):
                    continue
                if not entry.get("is_name", True):
                    continue
                trans = entry.get("translations", [])
                if not isinstance(trans, list) or not trans:
                    continue
                clean_trans = [t for t in trans if isinstance(t, str) and t.strip()]
                if not clean_trans:
                    continue
                ai_name = entry["name"].strip()
                canonical = name_lookup.get(ai_name.lower(), ai_name)
                result[canonical] = clean_trans
        except Exception as e:
            log.warning("AI name verification batch failed: %s", e)
    return result


async def rescan_all_names(project_id: str) -> dict:
    """Re-scan all translated chapters to rebuild the name map.

    Phase 1: Extract candidate names from original text.
    Phase 2: Ask AI to verify which are real names and get translation variants.
    Phase 3: Pre-compute per-chapter annotation pairs + stripped text.
    Phase 4: For each verified name, count occurrences in original text and
             search all AI-suggested translations + annotation-discovered
             translations in the translated text.
    """
    from concurrent.futures import ThreadPoolExecutor

    project = db.get_project(project_id)
    source_lang = project.get("source_language", "English") if project else "English"
    target_lang = project.get("target_language", "Chinese") if project else "Chinese"

    chapters = db.get_chapters(project_id)
    paired = []
    for ch in chapters:
        orig = ch.get("original_content") or ""
        trans = ch.get("translated_content") or ""
        if orig and trans:
            paired.append((orig, trans))

    if not paired:
        log.info("No translated chapters for project %s", project_id)
        return {}

    # ── Phase 1: collect candidate names ─────────────────────────────
    all_orig_text = " ".join(orig for orig, _ in paired)
    raw_names = _extract_names_from_text(all_orig_text)

    # Also include names from strategy / analysis
    strategy_names: dict[str, str] = {}
    strategy = db.get_strategy(project_id)
    if strategy:
        for n in (strategy.get("character_names") or []):
            if isinstance(n, dict) and n.get("original"):
                strategy_names[n["original"]] = n.get("translated", "")
    analysis = db.get_analysis(project_id)
    if analysis:
        for c in (analysis.get("characters") or []):
            if isinstance(c, dict) and c.get("name"):
                strategy_names.setdefault(c["name"], "")

    # Merge: only keep names appearing > 1 time, plus all strategy names
    candidate_names = list(strategy_names.keys())
    for name, count in raw_names.items():
        if count > 1 and name not in strategy_names:
            candidate_names.append(name)

    if not candidate_names:
        log.info("No candidate names for project %s", project_id)
        _set_name_scan_status(project_id, "done", finished=True, name_map={})
        return {}

    _set_name_scan_status(project_id, "extracting",
                          f"Found {len(candidate_names)} candidates",
                          done=0, total=len(candidate_names))
    log.info("Phase 2: asking AI to verify %d candidate names", len(candidate_names))

    # ── Phase 2: AI verification + translation variants ──────────────
    ai_translations = await _ai_verify_names(
        candidate_names, source_lang, target_lang, project_id=project_id)

    # Keep names confirmed by AI + all strategy/analysis names (trusted sources)
    verified_names: dict[str, list[str]] = {}
    for name in candidate_names:
        trans_list = ai_translations.get(name, [])
        if name in strategy_names:
            # Always keep strategy/analysis names regardless of AI verdict
            preferred = strategy_names[name]
            if preferred and preferred not in trans_list:
                trans_list.insert(0, preferred)
            verified_names[name] = trans_list
        elif name in ai_translations:
            verified_names[name] = trans_list

    log.info("AI verified %d names out of %d candidates", len(verified_names), len(candidate_names))
    _set_name_scan_status(project_id, "searching",
                          f"Searching {len(verified_names)} names across {len(paired)} chapters",
                          done=0, total=len(verified_names))

    # ── Phase 3: pre-compute chapter data in parallel ────────────────
    is_cjk = bool(_HAS_CJK_RE.search(paired[0][1][:500]))
    tasks = [(i, orig, trans, is_cjk) for i, (orig, trans) in enumerate(paired)]
    with ThreadPoolExecutor(max_workers=min(8, len(tasks))) as pool:
        precomputed = list(pool.map(_precompute_chapter, tasks))
    precomputed.sort(key=lambda d: d["idx"])

    # ── Phase 4: local search with AI-provided translations ──────────
    name_map: dict = {}
    search_idx = 0

    for orig_name, ai_trans_list in verified_names.items():
        search_idx += 1
        if search_idx % 20 == 0:
            _set_name_scan_status(project_id, "searching", orig_name,
                                  done=search_idx, total=len(verified_names))
        total = 0
        all_translations: dict[str, int] = {}

        for pc in precomputed:
            count_in_orig = pc["orig"].count(orig_name)
            total += count_in_orig

            # Search annotation-extracted translations
            for anno_orig, trans_set in pc["anno_pairs"].items():
                if _anno_name_matches(anno_orig, orig_name):
                    for tname in trans_set:
                        if _is_valid_translation(tname):
                            all_translations[tname] = all_translations.get(tname, 0) + 1

            # Search AI-suggested translations in cleaned text
            for trans_candidate in ai_trans_list:
                if trans_candidate and trans_candidate in pc["clean"]:
                    cnt = pc["clean"].count(trans_candidate)
                    all_translations[trans_candidate] = (
                        all_translations.get(trans_candidate, 0) + cnt)

            # Check if original name retained in translation
            if orig_name in pc["clean"]:
                cnt = pc["clean"].count(orig_name)
                all_translations[orig_name] = (
                    all_translations.get(orig_name, 0) + cnt)

        if total > 1:
            name_map[orig_name] = {"total": total, "translations": all_translations}

    db.update_project(project_id, name_map=json.dumps(name_map, ensure_ascii=False))
    log.info("Rescanned names for project %s: %d names found", project_id, len(name_map))
    _set_name_scan_status(project_id, "done", finished=True, name_map=name_map)
    return name_map


def combine_all_chapters(
    project_id: str,
    include_annotations: bool = False,
    ann_placement: str = "end",
    include_highlights: bool = False,
    include_qa: bool = False,
) -> Path | None:
    """Combine all translated chapters into a single EPUB with optional appendices."""
    project = db.get_project(project_id)
    chapters = db.get_chapters(project_id)

    if not project or not project.get("original_epub_path"):
        return None

    translations = {}
    bilingual_titles = {}
    per_chapter_annotations: dict[str, list] = {}

    for ch in chapters:
        fname = ch.get("epub_file_name")
        if not fname:
            continue
        tt = ch.get("translated_title") or ""
        bilingual_titles[fname] = _bilingual_title(ch["title"], tt)
        if ch.get("translated_content"):
            content = ch["translated_content"]
            # Inline annotations after each chapter
            if include_annotations and ann_placement == "chapter":
                raw_ann = ch.get("annotations") or ""
                if raw_ann:
                    try:
                        anns = json.loads(raw_ann)
                        if isinstance(anns, list) and anns:
                            ann_html = _format_annotations_inline(anns)
                            content += ann_html
                    except (json.JSONDecodeError, TypeError):
                        pass
            # Inline highlights after each chapter
            if include_highlights:
                raw_hl = ch.get("highlights") or ""
                if raw_hl:
                    try:
                        hls = json.loads(raw_hl)
                        if isinstance(hls, list) and hls:
                            content += _format_highlights_inline(hls)
                    except (json.JSONDecodeError, TypeError):
                        pass
            translations[fname] = content

            # Collect for end-of-book appendix
            if include_annotations and ann_placement == "end":
                raw_ann = ch.get("annotations") or ""
                if raw_ann:
                    try:
                        anns = json.loads(raw_ann)
                        if isinstance(anns, list) and anns:
                            title = ch.get("translated_title") or ch.get("title", "")
                            per_chapter_annotations[title] = anns
                    except (json.JSONDecodeError, TypeError):
                        pass

    if not translations:
        return None

    # Build appendix text to inject at end
    appendix_parts = []
    if include_annotations and ann_placement == "end" and per_chapter_annotations:
        appendix_parts.append(_format_annotations_appendix(per_chapter_annotations))
    if include_qa:
        qa_all = db.get_qa_history(project_id)
        if qa_all:
            ch_map = {ch["id"]: ch for ch in chapters}
            appendix_parts.append(_format_qa_appendix(qa_all, ch_map))

    out_dir = _get_output_dir(project)
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', project["name"])[:80].strip()
    out_path = out_dir / f"{safe_name}_complete.epub"
    build_translated_epub(project["original_epub_path"], translations, out_path,
                          bilingual_titles=bilingual_titles,
                          appendix_html="\n".join(appendix_parts) if appendix_parts else "")
    db.update_project(project_id, translated_epub_path=str(out_path))
    log.info("Combined EPUB: %s", out_path)
    return out_path


def _format_annotations_inline(anns: list) -> str:
    """Format annotations as HTML to append after a chapter's translation."""
    html = '\n<hr style="margin:2em 0 1em"/>\n<h3>Translator\'s Notes / 翻译附注</h3>\n<ol>\n'
    for a in anns:
        src = a.get("src", "")
        tgt = a.get("tgt", "")
        note = a.get("note", "")
        html += f'<li><em>{_esc_html(src)}</em>'
        if tgt:
            html += f' → {_esc_html(tgt)}'
        if note:
            html += f'<br/>{_esc_html(note)}'
        html += '</li>\n'
    html += '</ol>\n'
    return html


def _format_highlights_inline(hls: list) -> str:
    """Format highlights as HTML to append after a chapter's translation."""
    html = '\n<hr style="margin:2em 0 1em"/>\n<h3>Highlights & Notes / 划线笔记</h3>\n<ol>\n'
    for h in hls:
        text = h.get("text", "")
        note = h.get("note", "")
        html += f'<li>"{_esc_html(text)}"'
        if note:
            html += f'<br/><em>{_esc_html(note)}</em>'
        html += '</li>\n'
    html += '</ol>\n'
    return html


def _format_annotations_appendix(per_chapter: dict[str, list]) -> str:
    """Format all annotations as a book-end appendix."""
    html = '<h2>Translator\'s Notes / 翻译附注</h2>\n'
    for title, anns in per_chapter.items():
        html += f'<h3>{_esc_html(title)}</h3>\n<ol>\n'
        for a in anns:
            src = a.get("src", "")
            tgt = a.get("tgt", "")
            note = a.get("note", "")
            html += f'<li><em>{_esc_html(src)}</em>'
            if tgt:
                html += f' → {_esc_html(tgt)}'
            if note:
                html += f'<br/>{_esc_html(note)}'
            html += '</li>\n'
        html += '</ol>\n'
    return html


def _format_qa_appendix(qa_all: list, ch_map: dict) -> str:
    """Format all Q&A as a book-end appendix."""
    html = '<h2>Q&A / 问答记录</h2>\n'
    by_ch: dict[str, list] = {}
    for qa in qa_all:
        cid = qa.get("chapter_id", "general")
        by_ch.setdefault(cid, []).append(qa)
    for cid, qas in by_ch.items():
        ch = ch_map.get(cid)
        title = (ch.get("translated_title") or ch.get("title", "")) if ch else "General"
        html += f'<h3>{_esc_html(title)}</h3>\n'
        for qa in qas:
            q = qa.get("question", "")
            a = qa.get("answer", "")
            html += f'<p><strong>Q:</strong> {_esc_html(q)}</p>\n'
            html += f'<p><strong>A:</strong> {_esc_html(a)}</p>\n<hr/>\n'
    return html


def _esc_html(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_annotations_book(project_id: str) -> Path | None:
    """Build an EPUB containing all translator's annotations."""
    from .epub_service import build_annotations_epub

    project = db.get_project(project_id)
    chapters = db.get_chapters(project_id)
    if not project or not chapters:
        return None

    chapters_data = []
    for ch in chapters:
        raw_ann = ch.get("annotations") or ""
        if not raw_ann:
            continue
        try:
            annotations = json.loads(raw_ann)
        except (json.JSONDecodeError, TypeError):
            continue
        if not annotations:
            continue
        title = ch.get("translated_title") or ch.get("title", f"Chapter {ch['chapter_index'] + 1}")
        chapters_data.append({"title": title, "annotations": annotations})

    if not chapters_data:
        return None

    out_dir = _get_output_dir(project)
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', project["name"])[:80].strip()
    out_path = out_dir / f"{safe_name}_annotations.epub"
    return build_annotations_epub(chapters_data, out_path, book_title=project["name"])


def _collect_highlights(project_id: str) -> tuple[dict | None, list[dict], list[tuple[str, list]]]:
    """Return (project, chapters, [(title, highlights_list), ...])."""
    project = db.get_project(project_id)
    chapters = db.get_chapters(project_id)
    if not project or not chapters:
        return None, [], []
    result = []
    for ch in chapters:
        raw = ch.get("highlights") or ""
        if not raw:
            continue
        try:
            highlights = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
        if not highlights:
            continue
        title = ch.get("translated_title") or ch.get("title", f"Chapter {ch['chapter_index'] + 1}")
        result.append((title, highlights))
    return project, chapters, result


def build_highlights_markdown(project_id: str) -> Path | None:
    """Build a Markdown file containing all user highlights and notes."""
    project, _, hl_data = _collect_highlights(project_id)
    if not project or not hl_data:
        return None

    lines = [f"# {project['name']} — Highlights & Notes\n"]
    for title, highlights in hl_data:
        lines.append(f"\n## {title}\n")
        for i, h in enumerate(highlights, 1):
            text = h.get("text", "")
            note = h.get("note", "")
            lines.append(f"**{i}.** > {text}")
            if note:
                lines.append(f"   *{note}*")
            lines.append("")

    out_dir = _get_output_dir(project)
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', project["name"])[:80].strip()
    out_path = out_dir / f"{safe_name}_highlights.md"
    out_path.write_text("\n".join(lines), encoding="utf-8")
    log.info("Built highlights Markdown: %s", out_path)
    return out_path


def build_highlights_book(project_id: str) -> Path | None:
    """Build an EPUB containing all user highlights and notes."""
    from .epub_service import build_annotations_epub

    project = db.get_project(project_id)
    chapters = db.get_chapters(project_id)
    if not project or not chapters:
        return None

    chapters_data = []
    for ch in chapters:
        raw = ch.get("highlights") or ""
        if not raw:
            continue
        try:
            highlights = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
        if not highlights:
            continue
        title = ch.get("translated_title") or ch.get("title", f"Chapter {ch['chapter_index'] + 1}")
        annotations = []
        for h in highlights:
            annotations.append({
                "src": h.get("text", "")[:80],
                "tgt": "",
                "note": h.get("note", "") or "(highlight)",
            })
        chapters_data.append({"title": title, "annotations": annotations})

    if not chapters_data:
        return None

    out_dir = _get_output_dir(project)
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', project["name"])[:80].strip()
    out_path = out_dir / f"{safe_name}_highlights.epub"
    return build_annotations_epub(chapters_data, out_path, book_title=f"{project['name']} Highlights & Notes")


def build_qa_book(project_id: str) -> Path | None:
    """Build an EPUB containing all Q&A conversations."""
    from .epub_service import build_annotations_epub

    project = db.get_project(project_id)
    chapters = db.get_chapters(project_id)
    qa_all = db.get_qa_history(project_id)
    if not project or not qa_all:
        return None

    ch_map = {ch["id"]: ch for ch in chapters}
    by_chapter: dict[str, list] = {}
    for qa in qa_all:
        cid = qa.get("chapter_id", "general")
        by_chapter.setdefault(cid, []).append(qa)

    chapters_data = []
    for cid, qas in by_chapter.items():
        ch = ch_map.get(cid)
        title = (ch.get("translated_title") or ch.get("title", "")) if ch else "General"
        annotations = []
        for qa in qas:
            annotations.append({
                "src": qa.get("question", "")[:80],
                "tgt": "",
                "note": qa.get("answer", ""),
            })
        chapters_data.append({"title": f"Q&A: {title}", "annotations": annotations})

    if not chapters_data:
        return None

    out_dir = _get_output_dir(project)
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', project["name"])[:80].strip()
    out_path = out_dir / f"{safe_name}_qa.epub"
    return build_annotations_epub(chapters_data, out_path, book_title=f"{project['name']} Q&A")


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
