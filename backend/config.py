from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_title: str = "BiTranslator"
    data_dir: Path = Path(__file__).resolve().parent.parent / "data"
    db_path: Path = Path(__file__).resolve().parent.parent / "data" / "bitranslator.db"

    llm_provider: str = "openai"  # "openai" or "ollama"
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o"
    llm_max_tokens: int = 4096
    llm_temperature: float = 0.3

    # Separate model for heavy translation work (can be cheaper)
    translation_model: str = ""  # Falls back to llm_model if empty

    # Chunk size for splitting long chapters (in characters)
    max_chapter_chars: int = 12000

    class Config:
        env_file = ".env"
        env_prefix = "BT_"

    @property
    def effective_translation_model(self) -> str:
        return self.translation_model or self.llm_model


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
