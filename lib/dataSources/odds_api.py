"""The Odds API fetcher. Returns raw provider responses, no transformation."""

from __future__ import annotations

from .http import get_json, iso_now

PROVIDER = 'The Odds API'
NBA_SPORT_KEY = 'basketball_nba'
BASE = 'https://api.the-odds-api.com/v4'


def fetch_nba_odds(api_key: str) -> dict:
    """Current NBA lines (spreads, totals, h2h). Raises on network failure."""
    url = (
        f'{BASE}/sports/{NBA_SPORT_KEY}/odds/'
        f'?apiKey={api_key}&regions=us&markets=spreads,totals,h2h&oddsFormat=american'
    )
    raw = get_json(url)
    return {
        'provider': PROVIDER,
        'endpoint': 'odds',
        'fetchedAt': iso_now(),
        'raw': raw,
    }


def fetch_nba_scores(api_key: str, days_from: int = 3) -> dict:
    """Recent NBA scores from the same provider. Raises on network failure."""
    url = (
        f'{BASE}/sports/{NBA_SPORT_KEY}/scores/'
        f'?apiKey={api_key}&daysFrom={days_from}&dateFormat=iso'
    )
    raw = get_json(url)
    return {
        'provider': PROVIDER,
        'endpoint': 'scores',
        'fetchedAt': iso_now(),
        'raw': raw,
    }
