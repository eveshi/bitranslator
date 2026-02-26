from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Enums ───────────────────────────────────────────────────────────────

class ProjectStatus(str, Enum):
    UPLOADED = "uploaded"
    ANALYZING = "analyzing"
    ANALYZED = "analyzed"
    GENERATING_STRATEGY = "generating_strategy"
    STRATEGY_GENERATED = "strategy_generated"
    TRANSLATING_SAMPLE = "translating_sample"
    SAMPLE_READY = "sample_ready"
    TRANSLATING = "translating"
    STOPPED = "stopped"
    COMPLETED = "completed"
    ERROR = "error"


class ChapterStatus(str, Enum):
    PENDING = "pending"
    TRANSLATING = "translating"
    TRANSLATED = "translated"
    REVIEWED = "reviewed"


# ── API Request / Response Models ───────────────────────────────────────

class ProjectCreate(BaseModel):
    source_language: str = "English"
    target_language: str = "简体中文"


class LLMSettings(BaseModel):
    provider: str = "openai"
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o"
    translation_model: str = ""
    temperature: float = 0.3


class ProjectOut(BaseModel):
    id: str
    name: str
    source_language: str
    target_language: str
    status: str
    chapter_count: int = 0
    translated_count: int = 0
    sample_chapter_index: int = 0
    created_at: str
    error_message: Optional[str] = None


class ChapterOut(BaseModel):
    id: str
    project_id: str
    chapter_index: int
    title: str
    translated_title: str = ""
    chapter_type: str = "chapter"  # "chapter", "frontmatter", "backmatter", "part"
    body_number: Optional[int] = None
    status: str
    original_length: int = 0
    translated_length: int = 0
    translation_version: int = 0
    strategy_version_used: int = 0


class AnalysisOut(BaseModel):
    project_id: str
    genre: str = ""
    themes: list[str] = []
    characters: list[dict] = []
    writing_style: str = ""
    setting: str = ""
    key_terms: list[dict] = []
    cultural_notes: str = ""
    author: str = ""
    author_info: str = ""
    translation_notes: str = ""
    research_report: str = ""
    raw_analysis: str = ""


class StrategyOut(BaseModel):
    project_id: str
    overall_approach: str = ""
    tone_and_style: str = ""
    character_names: list[dict] = []
    glossary: list[dict] = []
    cultural_adaptation: str = ""
    special_considerations: str = ""
    custom_instructions: str = ""
    annotate_terms: bool = False
    annotate_names: bool = False
    free_translation: bool = False
    enable_annotations: bool = False
    annotation_density: str = "normal"
    raw_strategy: str = ""
    version: int = 0


class StrategyUpdate(BaseModel):
    overall_approach: Optional[str] = None
    tone_and_style: Optional[str] = None
    character_names: Optional[list[dict]] = None
    glossary: Optional[list[dict]] = None
    cultural_adaptation: Optional[str] = None
    special_considerations: Optional[str] = None
    custom_instructions: Optional[str] = None
    annotate_terms: Optional[bool] = None
    annotate_names: Optional[bool] = None
    free_translation: Optional[bool] = None
    enable_annotations: Optional[bool] = None


class TranslationProgress(BaseModel):
    project_id: str
    status: str
    total_chapters: int
    translated_chapters: int
    current_chapter: Optional[str] = None
    current_chapter_index: Optional[int] = None
    chunk_done: int = 0
    chunk_total: int = 0


class FeedbackRequest(BaseModel):
    feedback: str


class RetranslateFeedbackRequest(BaseModel):
    feedback: str = ""
    update_strategy: bool = True
    strategy_overrides: dict = {}


class TranslateRangeRequest(BaseModel):
    start_chapter: int = 0    # 0-based chapter index, inclusive
    end_chapter: int = -1     # 0-based chapter index, inclusive; -1 = last chapter


class AskAboutTranslationRequest(BaseModel):
    question: str
    selected_original: str = ""
    selected_translation: str = ""
    chapter_id: str = ""


class UpdateChapterTitleRequest(BaseModel):
    title: str


class ChapterTitleInfo(BaseModel):
    title: str = ""
    translated_title: str = ""
    chapter_type: str = "chapter"

class BatchUpdateTitlesRequest(BaseModel):
    titles: dict[str, ChapterTitleInfo]  # chapter_id -> title info


class StrategyVersionOut(BaseModel):
    id: int
    version: int
    feedback: str = ""
    created_at: str = ""


class TranslationVersionOut(BaseModel):
    id: int
    version: int
    translated_title: str = ""
    feedback: str = ""
    strategy_version: int = 0
    is_sample: bool = False
    created_at: str = ""
    content_length: int = 0


class StrategyTemplateCreate(BaseModel):
    name: str
    description: str = ""


class StrategyTemplateOut(BaseModel):
    id: str
    name: str
    description: str = ""
    source_language: str = ""
    target_language: str = ""
    genre: str = ""
    created_at: str = ""
