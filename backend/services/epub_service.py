"""EPUB parsing and building utilities."""
from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path
from typing import Optional

import ebooklib
from bs4 import BeautifulSoup, Tag
from ebooklib import epub

log = logging.getLogger(__name__)


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


# ── Parsing ─────────────────────────────────────────────────────────────

class ParsedChapter:
    def __init__(self, index: int, title: str, text: str, html: str, file_name: str):
        self.index = index
        self.title = title
        self.text = text          # plain text for LLM
        self.html = html          # original HTML for faithful rebuild
        self.file_name = file_name


class ParsedBook:
    def __init__(self, title: str, author: str, language: str, chapters: list[ParsedChapter]):
        self.title = title
        self.author = author
        self.language = language
        self.chapters = chapters


def parse_epub(epub_path: str | Path) -> ParsedBook:
    book = epub.read_epub(str(epub_path), options={"ignore_ncx": True})

    title = book.get_metadata("DC", "title")
    title = title[0][0] if title else "Unknown"
    author = book.get_metadata("DC", "author")
    author = author[0][0] if author else "Unknown"
    language = book.get_metadata("DC", "language")
    language = language[0][0] if language else "en"

    chapters: list[ParsedChapter] = []
    idx = 0
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        html_bytes = item.get_content()
        soup = BeautifulSoup(html_bytes, "lxml")
        body = soup.find("body")
        if not body:
            continue
        text = _extract_text(body)
        if len(text.strip()) < 50:
            continue  # skip very short items (covers, blank pages, etc.)

        heading = _find_heading(body)
        chapter_title = heading or f"Chapter {idx + 1}"

        chapters.append(ParsedChapter(
            index=idx,
            title=chapter_title,
            text=text,
            html=html_bytes.decode("utf-8", errors="replace"),
            file_name=item.get_name(),
        ))
        idx += 1

    log.info("Parsed EPUB: %s by %s – %d chapters", title, author, len(chapters))
    return ParsedBook(title=title, author=author, language=language, chapters=chapters)


def _extract_text(element: Tag) -> str:
    texts = element.get_text(separator="\n", strip=True)
    return re.sub(r"\n{3,}", "\n\n", texts)


def _find_heading(body: Tag) -> Optional[str]:
    for tag in ("h1", "h2", "h3", "title"):
        h = body.find(tag)
        if h and h.get_text(strip=True):
            return h.get_text(strip=True)
    return None


# ── Building ────────────────────────────────────────────────────────────

def build_translated_epub(
    original_epub_path: str | Path,
    translations: dict[str, str],   # file_name -> translated HTML body text
    output_path: str | Path,
    bilingual_titles: dict[str, str] | None = None,
) -> Path:
    """Rebuild EPUB with translated text while preserving structure and styles."""
    book = epub.read_epub(str(original_epub_path), options={"ignore_ncx": True})
    bilingual_titles = bilingual_titles or {}

    # Collect old TOC titles before modifications (may be populated from nav.xhtml for EPUB3)
    old_toc_map = _collect_toc_titles(book.toc)

    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        fname = item.get_name()
        if fname not in translations:
            continue
        translated_text = translations[fname]
        original_html = item.get_content().decode("utf-8", errors="replace")
        bl_title = bilingual_titles.get(fname, "")
        new_html = _replace_body_text(original_html, translated_text, bilingual_title=bl_title)
        item.set_content(new_html.encode("utf-8"))

    # Rebuild full TOC from document items for proper NCX/Nav generation
    _rebuild_toc(book, bilingual_titles, old_toc_map)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    epub.write_epub(str(output_path), book)
    log.info("Built translated EPUB: %s", output_path)
    return output_path


def _collect_toc_titles(toc) -> dict[str, str]:
    """Flatten existing TOC into href -> title mapping, handling nested structures."""
    result: dict[str, str] = {}
    for entry in (toc or []):
        if isinstance(entry, epub.Link):
            href = (entry.href or "").split("#")[0]
            if href and entry.title:
                result[href] = entry.title
        elif isinstance(entry, tuple) and len(entry) == 2:
            _, children = entry
            if isinstance(children, (list, tuple)):
                result.update(_collect_toc_titles(children))
    return result


def _match_toc_title(fname: str, toc_map: dict[str, str]) -> str:
    """Fuzzy-match a file name against a TOC href map."""
    if fname in toc_map:
        return toc_map[fname]
    base = fname.split("/")[-1]
    for href, title in toc_map.items():
        if fname.endswith(href) or href.endswith(fname):
            return title
        if base == href.split("/")[-1]:
            return title
    return ""


def _get_spine_ordered_items(book: epub.EpubBook) -> list:
    """Get document items in spine reading order."""
    id_map = {}
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        id_map[item.get_id()] = item
        id_map[item.get_name()] = item

    ordered = []
    seen: set[str] = set()
    for spine_entry in (book.spine or []):
        item_ref = spine_entry[0] if isinstance(spine_entry, (tuple, list)) else spine_entry
        item = id_map.get(item_ref) if isinstance(item_ref, str) else item_ref
        if item and hasattr(item, "get_name") and item.get_name() not in seen:
            ordered.append(item)
            seen.add(item.get_name())

    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        if item.get_name() not in seen:
            ordered.append(item)
            seen.add(item.get_name())

    return ordered


def _rebuild_toc(book: epub.EpubBook,
                 bilingual_titles: dict[str, str],
                 old_toc_map: dict[str, str]) -> None:
    """Rebuild book.toc from document items so that NCX/Nav are correctly generated."""
    new_toc: list[epub.Link] = []
    idx = 0

    for item in _get_spine_ordered_items(book):
        if isinstance(item, epub.EpubNav):
            continue

        fname = item.get_name()
        html_bytes = item.get_content()
        soup = BeautifulSoup(html_bytes, "lxml")
        body = soup.find("body")
        body_text = body.get_text(strip=True) if body else ""

        if len(body_text) < 20:
            continue

        title = bilingual_titles.get(fname, "")
        if not title and body:
            title = _find_heading(body) or ""
        if not title:
            title = _match_toc_title(fname, old_toc_map)
        if not title:
            title = f"Chapter {idx + 1}"

        new_toc.append(epub.Link(fname, title, f"ch_{idx}_{_new_id()}"))
        idx += 1

    book.toc = new_toc
    log.info("Rebuilt EPUB TOC with %d entries", len(new_toc))

    # Ensure NCX and Nav items exist for proper TOC file generation
    has_ncx = any(isinstance(i, epub.EpubNcx) for i in book.get_items())
    has_nav = any(isinstance(i, epub.EpubNav) for i in book.get_items())
    if not has_ncx:
        book.add_item(epub.EpubNcx())
    if not has_nav:
        book.add_item(epub.EpubNav())


def build_chapter_epub(
    chapter_title: str,
    translated_text: str,
    output_path: str | Path,
    book_title: str = "",
) -> Path:
    """Build a minimal EPUB containing a single translated chapter."""
    book = epub.EpubBook()
    book.set_identifier(f"bitranslator-ch-{uuid.uuid4().hex[:8]}")
    book.set_title(f"{book_title} - {chapter_title}" if book_title else chapter_title)
    book.set_language("zh")

    html_body = _text_to_html_body(translated_text, chapter_title)

    style = epub.EpubItem(
        uid="style", file_name="style/default.css",
        media_type="text/css",
        content=_DEFAULT_CSS.encode("utf-8"),
    )
    book.add_item(style)

    chapter = epub.EpubHtml(title=chapter_title, file_name="chapter.xhtml", lang="zh")
    chapter.content = (
        f'<html><head><title>{_esc(chapter_title)}</title>'
        f'<link rel="stylesheet" href="style/default.css"/></head>'
        f"<body>{html_body}</body></html>"
    )
    chapter.add_item(style)
    book.add_item(chapter)
    book.spine = [chapter]
    book.toc = [epub.Link("chapter.xhtml", chapter_title, "ch1")]
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    epub.write_epub(str(output_path), book)
    log.info("Built chapter EPUB: %s", output_path)
    return output_path


_DEFAULT_CSS = """\
body { font-family: serif; line-height: 1.8; margin: 1em; }
h1 { font-size: 1.6em; margin: 1.2em 0 0.6em; text-align: center; }
h2 { font-size: 1.3em; margin: 1em 0 0.5em; }
h3 { font-size: 1.1em; margin: 0.8em 0 0.4em; }
p { text-indent: 2em; margin: 0.4em 0; }
.separator { text-align: center; margin: 1.5em 0; color: #888; }
"""


def _esc(text: str) -> str:
    """Escape text for safe HTML embedding."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _text_to_html_body(text: str, chapter_title: str = "") -> str:
    """Convert translated plain text to structured HTML with proper headings."""
    lines = text.split("\n\n")
    parts: list[str] = []
    title_added = False

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        # Detect separators (lines of only *, -, =, ~ etc.)
        if re.match(r'^[\s\*\-=~·•—]{3,}$', line):
            parts.append('<p class="separator">* * *</p>')
            continue

        # If the first paragraph matches or is very close to the chapter title, render as h1
        if not title_added:
            cleaned = re.sub(r'^(chapter|第)\s*\d+\s*[:：.、\s]*', '', line, flags=re.IGNORECASE).strip()
            cleaned_title = re.sub(r'^(chapter|第)\s*\d+\s*[:：.、\s]*', '', chapter_title, flags=re.IGNORECASE).strip()
            if (cleaned.lower() == cleaned_title.lower()
                    or line.strip().lower() == chapter_title.strip().lower()
                    or len(line) < 80 and _similarity(line, chapter_title) > 0.6):
                parts.append(f"<h1>{_esc(line)}</h1>")
                title_added = True
                continue
            # First line is not the title — inject the chapter title as h1
            parts.append(f"<h1>{_esc(chapter_title)}</h1>")
            title_added = True

        # Short standalone lines that look like sub-headings
        if len(line) < 60 and not line.endswith(('。', '.', '！', '!', '？', '?', '」', '"', '…')):
            if re.match(r'^(第.{1,6}[章节回部篇]|Chapter\s+\d|Part\s+\d|PART\s+\d|\d+\.)', line):
                parts.append(f"<h2>{_esc(line)}</h2>")
                continue

        parts.append(f"<p>{_esc(line)}</p>")

    if not title_added and chapter_title:
        parts.insert(0, f"<h1>{_esc(chapter_title)}</h1>")

    return "\n".join(parts)


def _similarity(a: str, b: str) -> float:
    """Quick character-overlap ratio for title matching."""
    if not a or not b:
        return 0.0
    sa, sb = set(a.lower()), set(b.lower())
    return len(sa & sb) / max(len(sa | sb), 1)


def _replace_body_text(original_html: str, translated_text: str,
                       bilingual_title: str = "") -> str:
    """Replace the body content of an HTML document with translated text,
    preserving structure with proper heading and paragraph tags."""
    soup = BeautifulSoup(original_html, "lxml")
    body = soup.find("body")
    if not body:
        return original_html

    original_heading = _find_heading(body)
    body.clear()

    title_for_html = bilingual_title or original_heading or ""
    html_body = _text_to_html_body(translated_text, title_for_html)
    fragment = BeautifulSoup(html_body, "html.parser")
    for child in list(fragment.children):
        body.append(child)

    return str(soup)
