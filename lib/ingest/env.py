"""Load .env for offline sync scripts (never required at runtime for the frontend)."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent


def load_dotenv(root: Path | None = None) -> None:
    env_path = (root or ROOT) / '.env'
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def balldontlie_api_key() -> str:
    return os.environ.get('BALLDONTLIE_API_KEY', '').strip()
