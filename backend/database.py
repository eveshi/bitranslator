from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Optional

from .config import settings

DB_PATH = settings.db_path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_language TEXT NOT NULL DEFAULT 'English',
    target_language TEXT NOT NULL DEFAULT '简体中文',
    original_epub_path TEXT,
    translated_epub_path TEXT,
    status TEXT NOT NULL DEFAULT 'uploaded',
    error_message TEXT,
    sample_chapter_index INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_index INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    translated_title TEXT DEFAULT '',
    chapter_type TEXT NOT NULL DEFAULT 'chapter',
    body_number INTEGER,
    original_content TEXT NOT NULL DEFAULT '',
    translated_content TEXT,
    summary TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    epub_file_name TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analyses (
    project_id TEXT PRIMARY KEY,
    genre TEXT DEFAULT '',
    themes TEXT DEFAULT '[]',
    characters TEXT DEFAULT '[]',
    writing_style TEXT DEFAULT '',
    setting TEXT DEFAULT '',
    key_terms TEXT DEFAULT '[]',
    cultural_notes TEXT DEFAULT '',
    author TEXT DEFAULT '',
    author_info TEXT DEFAULT '',
    translation_notes TEXT DEFAULT '',
    research_report TEXT DEFAULT '',
    raw_analysis TEXT DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS strategies (
    project_id TEXT PRIMARY KEY,
    overall_approach TEXT DEFAULT '',
    tone_and_style TEXT DEFAULT '',
    character_names TEXT DEFAULT '[]',
    glossary TEXT DEFAULT '[]',
    cultural_adaptation TEXT DEFAULT '',
    special_considerations TEXT DEFAULT '',
    custom_instructions TEXT DEFAULT '',
    raw_strategy TEXT DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
"""


_MIGRATIONS = [
    "ALTER TABLE analyses ADD COLUMN author TEXT DEFAULT ''",
    "ALTER TABLE analyses ADD COLUMN author_info TEXT DEFAULT ''",
    "ALTER TABLE analyses ADD COLUMN translation_notes TEXT DEFAULT ''",
    "ALTER TABLE analyses ADD COLUMN research_report TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN sample_chapter_index INTEGER DEFAULT 0",
    "ALTER TABLE chapters ADD COLUMN translated_title TEXT DEFAULT ''",
    "ALTER TABLE chapters ADD COLUMN chapter_type TEXT NOT NULL DEFAULT 'chapter'",
    "ALTER TABLE projects ADD COLUMN name_map TEXT DEFAULT ''",
    "ALTER TABLE chapters ADD COLUMN body_number INTEGER",
    "ALTER TABLE strategies ADD COLUMN annotate_terms INTEGER DEFAULT 0",
    "ALTER TABLE strategies ADD COLUMN annotate_names INTEGER DEFAULT 0",
]


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript(_SCHEMA)
        for sql in _MIGRATIONS:
            try:
                conn.execute(sql)
            except sqlite3.OperationalError:
                pass  # column already exists


@contextmanager
def _connect():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _json_loads(val: str | None) -> Any:
    if not val:
        return []
    try:
        return json.loads(val)
    except json.JSONDecodeError:
        return []


# ── Project CRUD ────────────────────────────────────────────────────────

def create_project(project_id: str, name: str, source_lang: str, target_lang: str,
                   epub_path: str, now: str) -> dict:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO projects (id, name, source_language, target_language, "
            "original_epub_path, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
            (project_id, name, source_lang, target_lang, epub_path, "uploaded", now, now),
        )
    return get_project(project_id)


def get_project(project_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    return dict(row) if row else None


def list_projects() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM projects ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def update_project(project_id: str, **kwargs) -> None:
    from datetime import datetime, timezone
    kwargs["updated_at"] = datetime.now(timezone.utc).isoformat()
    sets = ", ".join(f"{k}=?" for k in kwargs)
    vals = list(kwargs.values()) + [project_id]
    with _connect() as conn:
        conn.execute(f"UPDATE projects SET {sets} WHERE id=?", vals)


def delete_project(project_id: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM chapters WHERE project_id=?", (project_id,))
        conn.execute("DELETE FROM analyses WHERE project_id=?", (project_id,))
        conn.execute("DELETE FROM strategies WHERE project_id=?", (project_id,))
        conn.execute("DELETE FROM projects WHERE id=?", (project_id,))


# ── Chapter CRUD ────────────────────────────────────────────────────────

def insert_chapters(chapters: list[dict]) -> None:
    with _connect() as conn:
        conn.executemany(
            "INSERT INTO chapters (id, project_id, chapter_index, title, "
            "original_content, status, epub_file_name, chapter_type, body_number) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            [(c["id"], c["project_id"], c["chapter_index"], c["title"],
              c["original_content"], "pending", c.get("epub_file_name", ""),
              c.get("chapter_type", "chapter"), c.get("body_number"))
             for c in chapters],
        )


def get_chapters(project_id: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM chapters WHERE project_id=? ORDER BY chapter_index",
            (project_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_chapter(chapter_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM chapters WHERE id=?", (chapter_id,)).fetchone()
    return dict(row) if row else None


def update_chapter(chapter_id: str, **kwargs) -> None:
    sets = ", ".join(f"{k}=?" for k in kwargs)
    vals = list(kwargs.values()) + [chapter_id]
    with _connect() as conn:
        conn.execute(f"UPDATE chapters SET {sets} WHERE id=?", vals)


# ── Analysis CRUD ───────────────────────────────────────────────────────

def save_analysis(project_id: str, data: dict) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO analyses "
            "(project_id, genre, themes, characters, writing_style, setting, "
            "key_terms, cultural_notes, author, author_info, translation_notes, "
            "research_report, raw_analysis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                project_id,
                data.get("genre", ""),
                json.dumps(data.get("themes", []), ensure_ascii=False),
                json.dumps(data.get("characters", []), ensure_ascii=False),
                data.get("writing_style", ""),
                data.get("setting", ""),
                json.dumps(data.get("key_terms", []), ensure_ascii=False),
                data.get("cultural_notes", ""),
                data.get("author", ""),
                data.get("author_info", ""),
                data.get("translation_notes", ""),
                data.get("research_report", ""),
                data.get("raw_analysis", ""),
            ),
        )


def get_analysis(project_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM analyses WHERE project_id=?", (project_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    for key in ("themes", "characters", "key_terms"):
        d[key] = _json_loads(d.get(key))
    return d


# ── Strategy CRUD ───────────────────────────────────────────────────────

def save_strategy(project_id: str, data: dict) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO strategies "
            "(project_id, overall_approach, tone_and_style, character_names, glossary, "
            "cultural_adaptation, special_considerations, custom_instructions, raw_strategy, "
            "annotate_terms, annotate_names) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                project_id,
                data.get("overall_approach", ""),
                data.get("tone_and_style", ""),
                json.dumps(data.get("character_names", []), ensure_ascii=False),
                json.dumps(data.get("glossary", []), ensure_ascii=False),
                data.get("cultural_adaptation", ""),
                data.get("special_considerations", ""),
                data.get("custom_instructions", ""),
                data.get("raw_strategy", ""),
                1 if data.get("annotate_terms") else 0,
                1 if data.get("annotate_names") else 0,
            ),
        )


def get_strategy(project_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM strategies WHERE project_id=?", (project_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    for key in ("character_names", "glossary"):
        d[key] = _json_loads(d.get(key))
    d["annotate_terms"] = bool(d.get("annotate_terms", 0))
    d["annotate_names"] = bool(d.get("annotate_names", 0))
    return d


def update_strategy(project_id: str, **kwargs) -> None:
    for key in ("character_names", "glossary"):
        if key in kwargs and isinstance(kwargs[key], (list, dict)):
            kwargs[key] = json.dumps(kwargs[key], ensure_ascii=False)
    sets = ", ".join(f"{k}=?" for k in kwargs)
    vals = list(kwargs.values()) + [project_id]
    with _connect() as conn:
        conn.execute(f"UPDATE strategies SET {sets} WHERE project_id=?", vals)
