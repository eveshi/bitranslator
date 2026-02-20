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
) -> Path:
    """Rebuild EPUB with translated text while preserving structure and styles."""
    book = epub.read_epub(str(original_epub_path), options={"ignore_ncx": True})

    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        fname = item.get_name()
        if fname not in translations:
            continue
        translated_text = translations[fname]
        original_html = item.get_content().decode("utf-8", errors="replace")
        new_html = _replace_body_text(original_html, translated_text)
        item.set_content(new_html.encode("utf-8"))

    # Update language metadata
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    epub.write_epub(str(output_path), book)
    log.info("Built translated EPUB: %s", output_path)
    return output_path


def _replace_body_text(original_html: str, translated_text: str) -> str:
    """Replace the body content of an HTML document with translated text."""
    soup = BeautifulSoup(original_html, "lxml")
    body = soup.find("body")
    if not body:
        return original_html

    body.clear()
    for paragraph in translated_text.split("\n\n"):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        p_tag = soup.new_tag("p")
        p_tag.string = paragraph
        body.append(p_tag)

    return str(soup)
