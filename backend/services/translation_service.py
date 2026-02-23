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
        protagonist_names = []
        for n in strategy.get("character_names", []):
            if isinstance(n, dict) and n.get("original"):
                protagonist_names.append(n["original"])
        exclude_note = ""
        if protagonist_names:
            exclude_note = (
                f"\nThe following protagonist names are already fixed in the "
                f"translation strategy and must NOT be annotated: "
                f"{', '.join(protagonist_names)}."
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

    ch_idx = chapter["chapter_index"]
    ch_title = chapter["title"]
    _set_chunk_progress(project_id, ch_idx, ch_title, 0, len(chunks))

    translated_parts = []
    for i, chunk in enumerate(chunks):
        # Check cancellation between chunks so stop takes effect mid-chapter
        if _is_cancelled(project_id):
            if translated_parts:
                partial = "\n\n".join(translated_parts)
                db.update_chapter(chapter_id, translated_content=partial, status="pending")
            raise _StopRequested()

        chunk_label = ch_title
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
        _set_chunk_progress(project_id, ch_idx, ch_title, i + 1, len(chunks))

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


def _scan_translation_variants(
    original_name: str,
    translated_text: str,
    known_translations: list[str],
) -> dict[str, int]:
    """Find all translation variants for a name in translated text.

    Uses known translations and original-name retention detection.
    """
    variants: dict[str, int] = {}

    for trans in known_translations:
        if trans and trans in translated_text:
            variants[trans] = translated_text.count(trans)

    if original_name in translated_text:
        cnt = translated_text.count(original_name)
        if cnt > 0:
            variants[original_name] = variants.get(original_name, 0) + cnt

    parts = original_name.split()
    if len(parts) >= 2:
        for part in parts:
            if len(part) >= 3 and part in translated_text:
                cnt = translated_text.count(part)
                if cnt > 0:
                    variants[part] = variants.get(part, 0) + cnt

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


def rescan_all_names(project_id: str) -> dict:
    """Re-scan all translated chapters to rebuild the name map from scratch.

    Uses three methods to find translations:
    1. Known translations from strategy / analysis
    2. Original name retained in translated text
    3. Chapter-level frequency correlation: if a name appears N times in
       chapter X's original text, find CJK tokens in chapter X's translation
       that have a similar frequency pattern across all chapters.
    """
    names_to_track = _collect_names_to_track(project_id)
    chapters = db.get_chapters(project_id)

    # Only consider chapters with both original and translated content
    paired = []
    for ch in chapters:
        orig = ch.get("original_content") or ""
        trans = ch.get("translated_content") or ""
        if orig and trans:
            paired.append((orig, trans))

    if not paired:
        log.info("No translated chapters for project %s", project_id)
        return {}

    # Detect if target language is CJK
    is_cjk = bool(_HAS_CJK_RE.search(paired[0][1][:500]))

    # Pre-compute CJK name candidates per chapter (for correlation)
    # candidate_vectors[token] = [count_in_ch0, count_in_ch1, ...]
    candidate_vectors: dict[str, list[int]] = {}
    if is_cjk:
        for idx, (_, trans) in enumerate(paired):
            ch_candidates = _extract_cjk_name_candidates(trans)
            for token, cnt in ch_candidates.items():
                if token not in candidate_vectors:
                    candidate_vectors[token] = [0] * len(paired)
                candidate_vectors[token][idx] = cnt

    name_map: dict = {}

    for entry in names_to_track:
        orig_name = entry["original"]
        total = 0
        all_translations: dict[str, int] = {}

        # Build this name's per-chapter frequency vector
        name_vector: list[int] = []
        for orig_text, trans_text in paired:
            count_in_orig = orig_text.count(orig_name)
            name_vector.append(count_in_orig)
            total += count_in_orig

            # Methods 1 & 2: known translations + original name retention
            known_trans = [entry.get("translated", "")]
            known_trans += list(all_translations.keys())
            variants = _scan_translation_variants(orig_name, trans_text, known_trans)
            for t_name, cnt in variants.items():
                all_translations[t_name] = all_translations.get(t_name, 0) + cnt

        # Method 3: chapter-level frequency correlation + phonetic matching
        if is_cjk and total > 0:
            name_chapters = {i for i, c in enumerate(name_vector) if c > 0}
            if name_chapters:
                best_candidates: list[tuple[str, float, int]] = []

                for token, tvec in candidate_vectors.items():
                    if token in all_translations:
                        continue
                    token_chapters = {i for i, c in enumerate(tvec) if c > 0}
                    if not token_chapters:
                        continue

                    intersection = len(name_chapters & token_chapters)
                    if intersection == 0:
                        continue

                    recall = intersection / len(name_chapters)
                    precision = intersection / len(token_chapters)
                    cooccurrence_score = (recall + precision) / 2

                    # Phonetic similarity as boost
                    phon_score = _phonetic_similarity(orig_name, token)

                    # Combined score: co-occurrence is primary, phonetics is bonus
                    combined = cooccurrence_score * 0.6 + phon_score * 0.4

                    token_total = sum(tvec)
                    if combined >= 0.35 and intersection >= 1:
                        best_candidates.append((token, combined, token_total))

                # Take top candidates (avoid adding too many false positives)
                best_candidates.sort(key=lambda x: x[1], reverse=True)
                for token, score, cnt in best_candidates[:3]:
                    if token not in all_translations:
                        all_translations[token] = cnt

        if total > 0 or all_translations:
            name_map[orig_name] = {"total": total, "translations": all_translations}

    db.update_project(project_id, name_map=json.dumps(name_map, ensure_ascii=False))
    log.info("Rescanned names for project %s: %d names found", project_id, len(name_map))
    return name_map


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
