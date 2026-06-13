"""Local JSON provider — reads demo historical data, no live API calls."""

from __future__ import annotations

import json
import os
import threading
import time
from datetime import date
from pathlib import Path

from lib.performance.range import RangeQuery, configure_reference_from_games, resolve_range
from lib.performance.series import build_index_series, build_multi_team_series, build_win_pct_series

from .base import SportsDataProvider

ROOT = Path(__file__).resolve().parent.parent.parent
GAMES_PATH = ROOT / 'data' / 'demo-games.json'
TEAMS_PATH = ROOT / 'data' / 'demo-teams.json'
CACHE_TTL = 3600

_lock = threading.Lock()
_cache: dict = {'games': None, 'teams': None, 'at': 0.0, 'meta': None}


def _resolve_games_path() -> Path:
    override = os.environ.get('ORBIT_GAMES_PATH', '').strip()
    if not override:
        return GAMES_PATH
    path = Path(override)
    if not path.is_absolute():
        path = ROOT / path
    return path


def _load_env() -> None:
    from lib.ingest.env import load_dotenv

    load_dotenv(ROOT)


def _load(path: Path) -> dict:
    with path.open(encoding='utf-8') as fh:
        return json.load(fh)


def _cached_bundle() -> tuple[list[dict], list[dict], dict]:
    now = time.time()
    with _lock:
        if _cache['games'] is not None and now - _cache['at'] < CACHE_TTL:
            return _cache['games'], _cache['teams'], _cache['meta']
        _load_env()
        games_path = _resolve_games_path()
        games_doc = _load(games_path)
        teams_doc = _load(TEAMS_PATH)
        games = games_doc.get('games', [])
        teams = teams_doc.get('teams', [])
        configure_reference_from_games(games)
        using_override = games_path != GAMES_PATH
        meta = {
            'source': games_doc.get('source', 'demo' if not using_override else 'synced'),
            'label': games_doc.get('label', 'Historical performance demo data'),
            'cachedAt': int(now),
            'gamesPath': str(games_path.relative_to(ROOT)) if games_path.is_relative_to(ROOT) else str(games_path),
        }
        _cache['games'] = games
        _cache['teams'] = teams
        _cache['meta'] = meta
        _cache['at'] = now
        return games, teams, meta


def _coerce_range(
    time_range: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    teams: list[str] | None = None,
    mode: str = 'franchise',
    metric: str = 'winPct',
) -> RangeQuery:
    return resolve_range(
        preset=time_range,
        start_date=start_date,
        end_date=end_date,
        teams=teams,
        mode=mode,
        metric=metric,
    )


class LocalProvider(SportsDataProvider):
    def get_teams(self, league: str = 'NBA') -> list[dict]:
        _, teams, _ = _cached_bundle()
        league_upper = league.upper()
        return [t for t in teams if t.get('league', '').upper() == league_upper]

    def _team_games(self, team_id: str) -> list[dict]:
        games, _, _ = _cached_bundle()
        tid = team_id.upper()
        return sorted(
            [g for g in games if g.get('team', '').upper() == tid],
            key=lambda g: g['date'],
        )

    def get_games_for_team(
        self,
        team_id: str,
        time_range: str = 'week',
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict]:
        rq = _coerce_range(time_range, start_date, end_date, [team_id])
        all_games = self._team_games(team_id)
        return [
            g for g in all_games
            if rq.start_date <= date.fromisoformat(g['date'][:10]) <= rq.end_date
        ]

    def _team_meta(self, team_id: str) -> dict | None:
        teams = self.get_teams()
        tid = team_id.upper()
        return next((t for t in teams if t['id'].upper() == tid), None)

    def get_performance_series(
        self,
        team_id: str,
        time_range: str = 'week',
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict:
        team = self._team_meta(team_id)
        if not team:
            return {'error': f'Unknown team: {team_id}', 'hasGames': False, 'points': []}
        rq = _coerce_range(time_range, start_date, end_date, [team_id], 'franchise', 'winPct')
        all_games = self._team_games(team_id)
        series = build_win_pct_series(all_games, rq)
        return {
            'teamId': team['id'],
            'teamName': team['name'],
            'color': team.get('colors', {}).get('primary', '#5da396'),
            **series,
        }

    def get_matchup_performance_series(
        self,
        team_a_id: str,
        team_b_id: str,
        time_range: str = 'week',
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict:
        team_a = self._team_meta(team_a_id)
        team_b = self._team_meta(team_b_id)
        if not team_a or not team_b:
            missing = [tid for tid, t in [(team_a_id, team_a), (team_b_id, team_b)] if not t]
            return {
                'error': f'Unknown team(s): {", ".join(missing)}',
                'series': [],
                'hasGames': False,
            }

        rq = _coerce_range(
            time_range, start_date, end_date, [team_a_id, team_b_id], 'matchup', 'index',
        )
        series_a = build_index_series(self._team_games(team_a_id), rq)
        series_b = build_index_series(self._team_games(team_b_id), rq)

        return {
            **rq.to_dict(),
            'hasGames': series_a['hasGames'] or series_b['hasGames'],
            'series': [
                {
                    'teamId': team_a['id'],
                    'teamName': team_a['name'],
                    'color': team_a.get('colors', {}).get('primary', '#5da396'),
                    'points': series_a['points'],
                    'gameCount': series_a['gameCount'],
                },
                {
                    'teamId': team_b['id'],
                    'teamName': team_b['name'],
                    'color': team_b.get('colors', {}).get('primary', '#5da396'),
                    'points': series_b['points'],
                    'gameCount': series_b['gameCount'],
                },
            ],
        }

    def get_league_performance_series(
        self,
        league: str = 'NBA',
        time_range: str = 'week',
        metric: str = 'winPct',
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict]:
        """Future league-wide mode — returns one series per team."""
        rq = _coerce_range(time_range, start_date, end_date, mode='league', metric=metric)
        team_games = {t['id']: self._team_games(t['id']) for t in self.get_teams(league)}
        return build_multi_team_series(team_games, rq, metric)

    def meta(self) -> dict:
        _, _, meta = _cached_bundle()
        return meta
