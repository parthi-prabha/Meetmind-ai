"""Configuration. Secrets are read from environment variables only (optionally via a local .env file)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = "llama-3.3-70b-versatile"
MAX_TRANSCRIPT_CHARS = 40000
_PLACEHOLDER_KEYS = {"", "your_groq_api_key", "changeme"}


def load_env(path=None):
    """Tiny .env loader (no dependency). Real environment variables win over the file."""
    p = Path(path) if path else BASE_DIR / ".env"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()


def groq_api_key():
    key = os.environ.get("GROQ_API_KEY", "").strip()
    return None if key in _PLACEHOLDER_KEYS else key


def groq_model():
    return os.environ.get("GROQ_MODEL", "").strip() or DEFAULT_MODEL


def db_path():
    return os.environ.get("MEETMIND_DB") or str(BASE_DIR / "meetmind.db")
