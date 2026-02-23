"""Book analysis: deep-read the book and extract structured understanding."""
from __future__ import annotations

import json
import logging
import re

from . import llm_service
from .. import database as db

log = logging.getLogger(__name__)

SUMMARY_SYSTEM = """\
You are a literary analyst helping a translator understand a book's writing style. \
Read the following chapter text and produce a brief analysis covering:
1. Content summary (2-3 sentences): key events and characters
2. Writing style observations (2-3 sentences): narrative voice, sentence structure, \
   tone, register (formal/informal), use of dialogue, descriptive techniques, \
   any distinctive prose patterns or literary devices

Return ONLY the analysis, no extra formatting."""

IDENTIFY_SYSTEM = """\
You are a literary expert. Given the book title and excerpt from the first chapter, \
identify the author, the language of the text, and provide basic metadata. \
Return a JSON object with:
- "author": string – the author's full name (best guess if not explicitly stated)
- "language": string – the language the book is written in (e.g. "English", "Deutsch", "Français", "日本語", "中文")
- "probable_genre": string – likely genre
- "era": string – approximate era/decade the book was written
- "keywords": list of strings – 3-5 key terms for researching this book

If you cannot determine the author, set "author" to "Unknown".
Return ONLY the JSON, no extra text."""

RESEARCH_SYSTEM = """\
You are a literary research assistant preparing background material for a book translator. \
Based on the book information and any web research results available to you, \
write a comprehensive research report. This report will be the PRIMARY source for \
understanding the book's content, characters, and context — the translator will only \
read a small sample of the actual text for writing style purposes.

Cover the following in detail:

1. **Author Background**: Biography, literary career, notable works, awards
2. **Author's Writing Style**: Characteristic narrative techniques, prose style, \
   use of language, literary devices, and how their style evolved over time
3. **Book Synopsis & Plot**: Detailed summary of the book's plot, major story arcs, \
   and how the narrative unfolds. Include spoilers — the translator needs full knowledge.
4. **Characters**: List ALL significant characters with their names, roles, relationships, \
   and character arcs. Be specific about name spellings in the original language.
5. **Key Terms & Vocabulary**: Domain-specific terms, recurring phrases, invented words, \
   jargon, or culturally specific expressions that appear throughout the book
6. **Setting & World**: Time period, locations, world-building details, \
   social structures, and any fictional elements that need consistent translation
7. **Themes & Motifs**: Major themes, recurring motifs, symbolism
8. **Cultural & Historical Context**: Cultural references, historical events, \
   social norms, and background knowledge a translator must understand
9. **Translation Considerations**: Known challenges in translating this author's work, \
   existing translations and their approaches, dialect or register issues
10. **Book Reception**: Critical reception, literary significance, reader expectations

Be factual and detailed. Cite specific examples where possible. \
If you cannot find reliable information on some aspects, say so clearly rather than fabricating. \
Write the report in English."""

ANALYSIS_SYSTEM = """\
You are an expert literary analyst and translation consultant.

You have TWO information sources with DIFFERENT roles:
1. **CHAPTER SAMPLES** – A small excerpt from the opening of the book. \
   Use this PRIMARILY to analyze the author's actual writing style: sentence structure, \
   narrative voice, tone, register, dialogue patterns, descriptive techniques, prose rhythm.
2. **ONLINE RESEARCH** – Comprehensive research about the author and book. \
   Use this as the PRIMARY source for: genre, themes, characters, setting, \
   key terms, cultural context, and translation challenges.

IMPORTANT: The user's target language is {target_lang}. \
For every text field, provide BOTH an English version and a {target_lang} version, \
formatted as "English text / {target_lang} text".

Return your analysis as a JSON object with exactly these keys:

From ONLINE RESEARCH (primary source):
- "genre": string – genre and subgenre (bilingual)
- "themes": list of strings – ALL major themes and motifs across the full book (bilingual)
- "characters": list of objects with {{"name": str, "description": str}} – \
ALL significant characters from the entire book (name in original, description bilingual)
- "setting": string – time period, locations, world-building, cultural context (bilingual)
- "key_terms": list of objects with {{"term": str, "explanation": str}} – \
ALL domain-specific terms, recurring phrases, invented words, culturally-specific expressions \
from the entire book (term in original, explanation bilingual). Be comprehensive.
- "cultural_notes": string – cultural references, historical background, social context (bilingual)
- "author_info": string – author background relevant to translation (bilingual)
- "translation_notes": string – known translation challenges and recommendations (bilingual)

From CHAPTER SAMPLES (primary source):
- "writing_style": string – DETAILED analysis of the actual prose style observed in the text: \
narrative voice, sentence length/complexity, tone, register (formal/informal/mixed), \
use of dialogue vs narration, descriptive techniques, literary devices, paragraph structure, \
pacing, any distinctive prose patterns. This is the MOST IMPORTANT field — it directly \
determines how the translation should read. Be very specific with examples from the text. (bilingual)

Every field must have substantive content. Do NOT leave any field empty.

CRITICAL: Return ONLY a valid JSON object. No markdown formatting, no ```json``` code fences, \
no explanatory text before or after the JSON. The response must start with {{ and end with }}."""


async def _identify_book(project_name: str, first_chapter_text: str,
                         epub_author: str = "") -> dict:
    """Use LLM to identify the author and key metadata from the book."""
    excerpt = first_chapter_text[:5000]
    hint = ""
    if epub_author and epub_author.lower() not in ("unknown", ""):
        hint = f"\nEPUB Metadata Author: {epub_author}\n"
    raw = await llm_service.chat(
        system_prompt=IDENTIFY_SYSTEM,
        user_prompt=f"Book Title: {project_name}\n{hint}\nFirst Chapter Excerpt:\n{excerpt}",
        max_tokens=500,
    )
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        data = json.loads(m.group(0)) if m else {}

    author = data.get("author", "Unknown")
    if (not author or author == "Unknown") and epub_author and epub_author.lower() != "unknown":
        author = epub_author

    return {
        "author": author,
        "language": data.get("language", ""),
        "probable_genre": data.get("probable_genre", ""),
        "era": data.get("era", ""),
        "keywords": data.get("keywords", []),
    }


async def _research_book(
    book_title: str,
    author: str,
    genre: str,
    era: str,
    keywords: list[str],
    source_language: str,
    target_language: str,
) -> str:
    """Perform online research about the book and author."""
    search_queries = [
        f'"{author}" writing style literary analysis',
        f'"{book_title}" {author} book review analysis',
        f'"{author}" biography literary career',
    ]
    if keywords:
        search_queries.append(f'"{book_title}" {" ".join(keywords[:3])}')

    user_prompt = (
        f"Book Title: {book_title}\n"
        f"Author: {author}\n"
        f"Probable Genre: {genre}\n"
        f"Era: {era}\n"
        f"Source Language: {source_language}\n"
        f"Target Language: {target_language}\n"
        f"Keywords: {', '.join(keywords)}\n\n"
        "Please research this author and book thoroughly, then write a comprehensive "
        "research report following the format in your instructions. "
        "Search for information about the author's writing style, this specific book, "
        "and any existing translations or translation challenges."
    )

    research = await llm_service.chat_with_search(
        system_prompt=RESEARCH_SYSTEM,
        user_prompt=user_prompt,
        search_queries=search_queries,
        max_tokens=4096,
    )
    return research


async def analyze_book(project_id: str) -> dict:
    """Run full book analysis: research, summarize opening chapters, then produce holistic analysis."""
    from ..config import settings

    project = db.get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    chapters = db.get_chapters(project_id)
    if not chapters:
        raise ValueError("No chapters found")

    db.update_project(project_id, status="analyzing")

    # Read EPUB metadata author as a hint
    epub_author = ""
    epub_path = project.get("original_epub_path", "")
    if epub_path:
        try:
            from ebooklib import epub as _epub
            _book = _epub.read_epub(epub_path, options={"ignore_ncx": True})
            _meta = _book.get_metadata("DC", "author")
            epub_author = _meta[0][0] if _meta else ""
        except Exception:
            pass

    # Phase 1: Identify book & author, then do online research
    log.info("Phase 1: Identifying book and researching author for project %s", project_id)
    first_text = chapters[0]["original_content"] if chapters else ""
    book_meta = await _identify_book(project["name"], first_text, epub_author=epub_author)
    log.info("  Identified author: %s, language: %s, genre: %s",
             book_meta["author"], book_meta["language"], book_meta["probable_genre"])

    # Auto-detect source language if not manually set
    if book_meta["language"] and (not project["source_language"] or project["source_language"] == "auto"):
        db.update_project(project_id, source_language=book_meta["language"])
        project["source_language"] = book_meta["language"]
        log.info("  Auto-detected source language: %s", book_meta["language"])

    research_report = await _research_book(
        book_title=project["name"],
        author=book_meta["author"],
        genre=book_meta["probable_genre"],
        era=book_meta["era"],
        keywords=book_meta["keywords"],
        source_language=project["source_language"],
        target_language=project["target_language"],
    )
    log.info("  Research report complete (%d chars)", len(research_report))

    # Phase 2: Summarize chapters within the word budget
    word_budget = settings.analysis_max_words
    total_words = sum(len((ch.get("original_content") or "").split()) for ch in chapters)
    words_used = 0
    summarized_count = 0

    log.info("Phase 2: Book has %d chapters, %d total words (budget: %d words)",
             len(chapters), total_words, word_budget)

    summaries: dict[int, str] = {}  # chapter_index -> summary
    for ch in chapters:
        ch_words = len((ch.get("original_content") or "").split())
        if words_used >= word_budget:
            break
        text = ch["original_content"]
        if len(text) > 15000:
            text = text[:15000] + "\n\n[... chapter continues ...]"
        summary = await llm_service.chat(
            system_prompt=SUMMARY_SYSTEM,
            user_prompt=f"Chapter: {ch['title']}\n\n{text}",
            max_tokens=500,
        )
        summaries[ch["chapter_index"]] = summary
        db.update_chapter(ch["id"], summary=summary)
        words_used += ch_words
        summarized_count += 1
        log.info("  Summarized chapter %d: %s (%d words, total %d/%d)",
                 ch["chapter_index"], ch["title"], ch_words, words_used, word_budget)

    skipped_count = len(chapters) - summarized_count
    if skipped_count > 0:
        log.info("  Skipped %d chapters (word budget reached). Using titles + research for coverage.",
                 skipped_count)

    # Phase 3: Holistic analysis
    # Structure: research FIRST (primary content source), then chapter samples (writing style)
    book_overview = (
        f"Book Title: {project['name']}\n"
        f"Author: {book_meta['author']}\n"
        f"Source Language: {project['source_language']}\n"
        f"Target Language: {project['target_language']}\n"
        f"Total Chapters: {len(chapters)} · Total Words: ~{total_words}\n\n"
        f"=== FULL TABLE OF CONTENTS ===\n\n"
    )
    for ch in chapters:
        book_overview += f"  {ch['chapter_index'] + 1}. {ch['title']}\n"

    book_overview += (
        f"\n=== ONLINE RESEARCH (use for: genre, themes, characters, setting, "
        f"key terms, cultural notes, translation challenges) ===\n\n"
        f"{research_report}\n\n"
        f"=== CHAPTER SAMPLES — WRITING STYLE REFERENCE "
        f"(first {summarized_count} chapter(s), ~{words_used} words) ===\n"
        f"Use these to analyze the author's ACTUAL writing style, tone, and prose patterns.\n\n"
    )
    for ch in chapters:
        idx = ch["chapter_index"]
        if idx in summaries:
            book_overview += f"--- Chapter {idx + 1}: {ch['title']} ---\n{summaries[idx]}\n\n"

    log.info("Phase 3: Running holistic analysis for project %s", project_id)
    system_prompt = ANALYSIS_SYSTEM.format(target_lang=project["target_language"])
    analysis_data = await llm_service.chat_json(
        system_prompt=system_prompt,
        user_prompt=book_overview,
        max_tokens=8192,
        required_keys=["genre", "writing_style", "characters", "themes"],
    )
    # Warn if analysis came back mostly empty
    if "raw" in analysis_data and not analysis_data.get("genre"):
        log.warning("Analysis returned raw text instead of structured JSON. "
                    "First 500 chars: %s", str(analysis_data.get("raw", ""))[:500])

    analysis_data["raw_analysis"] = str(analysis_data)
    analysis_data["author"] = book_meta["author"]
    analysis_data["research_report"] = research_report

    db.save_analysis(project_id, analysis_data)
    db.update_project(project_id, status="analyzed")
    log.info("Analysis complete for project %s (%d/%d chapters summarized)",
             project_id, summarized_count, len(chapters))
    return analysis_data


async def refine_analysis(project_id: str, feedback: str) -> dict:
    """Re-run the holistic analysis step incorporating user corrections.

    Reuses the existing research report and chapter summaries to avoid
    re-doing expensive LLM calls, but feeds them along with the user's
    corrections into a fresh analysis pass.
    """
    project = db.get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")
    chapters = db.get_chapters(project_id)
    if not chapters:
        raise ValueError("No chapters found")
    existing = db.get_analysis(project_id)
    if not existing:
        raise ValueError("No existing analysis — run full analysis first")

    db.update_project(project_id, status="analyzing")

    research_report = existing.get("research_report", "")
    author = existing.get("author", "Unknown")

    total_words = sum(len((ch.get("original_content") or "").split()) for ch in chapters)

    summaries: dict[int, str] = {}
    for ch in chapters:
        if ch.get("summary"):
            summaries[ch["chapter_index"]] = ch["summary"]
    summarized_count = len(summaries)

    book_overview = (
        f"Book Title: {project['name']}\n"
        f"Author: {author}\n"
        f"Source Language: {project['source_language']}\n"
        f"Target Language: {project['target_language']}\n"
        f"Total Chapters: {len(chapters)} · Total Words: ~{total_words}\n\n"
        f"=== FULL TABLE OF CONTENTS ===\n\n"
    )
    for ch in chapters:
        book_overview += f"  {ch['chapter_index'] + 1}. {ch['title']}\n"

    book_overview += (
        f"\n=== ONLINE RESEARCH ===\n\n{research_report}\n\n"
        f"=== CHAPTER SAMPLES — WRITING STYLE REFERENCE "
        f"({summarized_count} chapter(s)) ===\n\n"
    )
    for ch in chapters:
        idx = ch["chapter_index"]
        if idx in summaries:
            book_overview += f"--- Chapter {idx + 1}: {ch['title']} ---\n{summaries[idx]}\n\n"

    book_overview += (
        f"\n=== USER CORRECTIONS & FEEDBACK ===\n"
        f"The user reviewed the previous analysis and provided the following corrections. "
        f"These MUST be incorporated into the new analysis. If the user says a character name "
        f"or term is wrong, use the user's version instead.\n\n"
        f"{feedback}\n"
    )

    system_prompt = ANALYSIS_SYSTEM.format(target_lang=project["target_language"])
    analysis_data = await llm_service.chat_json(
        system_prompt=system_prompt,
        user_prompt=book_overview,
        max_tokens=8192,
        required_keys=["genre", "writing_style", "characters", "themes"],
    )

    if "raw" in analysis_data and not analysis_data.get("genre"):
        log.warning("Refined analysis returned raw text instead of structured JSON.")

    analysis_data["raw_analysis"] = str(analysis_data)
    analysis_data["author"] = author
    analysis_data["research_report"] = research_report

    db.save_analysis(project_id, analysis_data)
    db.update_project(project_id, status="analyzed")
    log.info("Refined analysis complete for project %s", project_id)
    return analysis_data
