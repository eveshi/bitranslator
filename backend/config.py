from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_title: str = "BiTranslator"
    data_dir: Path = Path(__file__).resolve().parent.parent / "data"
    output_dir: Path = Path(__file__).resolve().parent.parent / "output"
    db_path: Path = Path(__file__).resolve().parent.parent / "data" / "bitranslator.db"

    llm_provider: str = "gemini"  # "openai", "gemini", or "ollama"
    llm_api_key: str = ""
    llm_base_url: str = ""  # Only needed for OpenAI-compatible providers
    llm_model: str = "gemini-2.5-pro"
    llm_max_tokens: int = 8192
    llm_translation_max_tokens: int = 65536  # Gemini supports up to 65k; GPT-4o up to 16k
    llm_temperature: float = 0.3

    # Separate model for heavy translation work (can be cheaper)
    translation_model: str = ""  # Falls back to llm_model if empty

    # Chunk size for splitting long chapters (in characters).
    # Each chunk must be small enough so its translation fits within
    # llm_translation_max_tokens. ~4000 chars ≈ 1000-1500 source tokens,
    # which typically translates to 1500-3000 output tokens — safe margin.
    max_chapter_chars: int = 6000

    # Max continuation attempts when LLM output is truncated
    max_continuations: int = 5

    # Max words for sample translation (first chapter excerpt)
    sample_max_words: int = 3000

    # Max words to read for writing style analysis (only first N words are
    # summarized; background/terms/characters come from online research)
    analysis_max_words: int = 15000

    class Config:
        env_file = ".env"
        env_prefix = "BT_"

    @property
    def effective_translation_model(self) -> str:
        return self.translation_model or self.llm_model


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.output_dir.mkdir(parents=True, exist_ok=True)
