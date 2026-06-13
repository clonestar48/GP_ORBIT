"""Performance dashboard data layer — local demo provider only for now."""

from __future__ import annotations

import os
import threading
import time
from pathlib import Path

from lib.performance.marquee import resolve_featured_matchup
from lib.performance.range import reference_date, reference_date_mode
from lib.performance.resolution import aggregate_points, resolve_profile
from lib.providers import get_provider

ROOT = Path(__file__).resolve().parent.parent
_lock = threading.Lock()
_meta_cache: dict = {'at': 0.0, 'payload': None}


def load_dotenv(root: Path) -> None:
    env_path = root / '.env'
    if not env_path.is_file():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _provider():
    return get_provider('local')


def _meta() -> dict:
    now = time.time()
    with _lock:
        if _meta_cache['payload'] and now - _meta_cache['at'] < 3600:
            return _meta_cache['payload']
        provider = _provider()
        provider.get_teams('NBA')
        payload = {
            'mode': 'demo',
            'source': provider.meta().get('source', 'demo'),
            'label': provider.meta().get('label', 'Historical performance demo data'),
            'cachedAt': provider.meta().get('cachedAt', int(now)),
            'provider': 'local',
            'referenceDate': reference_date().isoformat(),
            'referenceDateMode': reference_date_mode(),
        }
        _meta_cache['payload'] = payload
        _meta_cache['at'] = now
        return payload


def get_teams_payload(league: str = 'NBA') -> dict:
    provider = _provider()
    return {**_meta(), 'teams': provider.get_teams(league)}


def _apply_resolution(payload: dict, time_range: str) -> dict:
    profile = resolve_profile(time_range)
    resolution = profile.to_dict()

    series = payload.get('series')
    if isinstance(series, list):
        payload = {
            **payload,
            'series': [
                {
                    **entry,
                    'points': aggregate_points(entry.get('points') or [], profile),
                }
                for entry in series
            ],
        }
    elif isinstance(series, dict) and series.get('points') is not None:
        payload = {
            **payload,
            'series': {
                **series,
                'points': aggregate_points(series.get('points') or [], profile),
            },
        }
    elif payload.get('points') is not None and not payload.get('error'):
        payload = {
            **payload,
            'points': aggregate_points(payload.get('points') or [], profile),
        }

    return {**payload, 'resolution': resolution}


def get_performance_payload(
    team_id: str,
    time_range: str | None = 'week',
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    provider = _provider()
    series = provider.get_performance_series(team_id, time_range, start_date, end_date)
    games = provider.get_games_for_team(team_id, time_range, start_date, end_date)
    resolution_key = time_range or 'week'
    return _apply_resolution({**_meta(), 'series': series, 'games': games}, resolution_key)


def get_matchup_payload(
    team_a: str,
    team_b: str,
    time_range: str | None = 'week',
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    provider = _provider()
    matchup = provider.get_matchup_performance_series(
        team_a, team_b, time_range, start_date, end_date,
    )
    resolution_key = time_range or 'week'
    return _apply_resolution({**_meta(), **matchup}, resolution_key)


def get_marquee_payload(league: str = 'NBA') -> dict:
    provider = _provider()
    teams = provider.get_teams(league)
    team_ids = {t['id'].upper() for t in teams}
    from lib.providers.local import _cached_bundle  # noqa: PLC0415

    all_games, _, _ = _cached_bundle()
    league_upper = league.upper()
    league_games = [g for g in all_games if g.get('league', 'NBA').upper() == league_upper]
    featured = resolve_featured_matchup(league_games)
    if featured['teamA'] not in team_ids or featured['teamB'] not in team_ids:
        featured['teamA'] = 'BOS'
        featured['teamB'] = 'NYK'
    return {**_meta(), **featured}
