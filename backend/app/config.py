import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    github_token: str = os.getenv("GITHUB_TOKEN", "")
    long_model: str = os.getenv("LONG_MODEL", "gemma-3-27b-it")
    short_model: str = os.getenv("SHORT_MODEL", "gemma-3-12b-it")
    fast_model: str = os.getenv("FAST_MODEL", "gemma-3n-e4b-it")
    gemini_timeout_s: int = int(os.getenv("GEMINI_TIMEOUT_S", "25"))
    cors_origins: list[str] = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if o.strip()
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
