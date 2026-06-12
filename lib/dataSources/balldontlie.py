"""balldontlie historical stats fetcher.

Requires BALLDONTLIE_API_KEY (free tier). Returns raw provider responses.
Returns None when the provider is not configured — callers must treat the
data as unavailable, never substitute fabricated values.
"""

from __future__ import annotations

import os

from .http import get_json, iso_now

PROVIDER = 'balldontlie'
BASE = 'https://api.balldontlie.io/v1'


def fetch_recent_games(per_page: int = 25) -> dict | None:
    api_key = os.environ.get('BALLDONTLIE_API_KEY', '').strip()
    if not api_key:
        return None
    url = f'{BASE}/games?per_page={per_page}'
    raw = get_json(url, headers={'Authorization': api_key})
    return {
        'provider': PROVIDER,
        'endpoint': 'games',
        'fetchedAt': iso_now(),
        'raw': raw,
    }
