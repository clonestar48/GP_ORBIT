"""ESPN unofficial scoreboard fetcher (prototype scores provider).

Returns raw provider responses, no transformation.
"""

from __future__ import annotations

from .http import get_json, iso_now

PROVIDER = 'ESPN'
SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'


def fetch_nba_scoreboard() -> dict:
    """Today's NBA scoreboard (schedule, live, finals). Raises on network failure."""
    raw = get_json(SCOREBOARD_URL)
    return {
        'provider': PROVIDER,
        'endpoint': 'scoreboard',
        'fetchedAt': iso_now(),
        'raw': raw,
    }
