"""nba_api → normalized Orbit game rows (offline sync, no API key)."""

from __future__ import annotations

import re
from typing import Any

from .balldontlie import _slug_part
from .schema import validate_game

PROVIDER = 'nba_api'
MATCHUP_RE = re.compile(r'^([A-Z]{2,3})\s+(?:@|vs\.)\s+([A-Z]{2,3})$')


def _season_start_year(game_date: str) -> int:
    year = int(game_date[:4])
    month = int(game_date[5:7])
    return year if month >= 10 else year - 1


def _parse_matchup(matchup: str) -> tuple[str, str] | None:
    match = MATCHUP_RE.match((matchup or '').strip())
    if not match:
        return None
    return match.group(1), match.group(2)


def _row_id_from_nba(game_id: str, game_date: str, team: str, opponent: str) -> str:
    numeric = int(re.sub(r'\D', '', game_id) or 0)
    slug = _slug_part(team, opponent)
    return f'{game_date[:10]}-{slug}-{numeric % 10000:04d}-{team}'


def normalize_nba_api_row(raw: dict[str, Any]) -> dict[str, Any] | None:
    team = (raw.get('TEAM_ABBREVIATION') or '').upper()
    matchup = raw.get('MATCHUP') or ''
    parsed = _parse_matchup(matchup)
    if not parsed or not team:
        return None

    first, second = parsed
    if team != first and team != second:
        return None

    opponent = second if team == first else first
    game_date = (raw.get('GAME_DATE') or '')[:10]
    if not game_date:
        return None

    team_score = raw.get('PTS')
    plus_minus = raw.get('PLUS_MINUS')
    if team_score is None or plus_minus is None:
        return None

    team_score = int(team_score)
    opponent_score = int(team_score) - int(plus_minus)
    result = 'W' if raw.get('WL') == 'W' else 'L'

    game_id = str(raw.get('GAME_ID') or '')
    row = {
        'id': _row_id_from_nba(game_id, game_date, team, opponent),
        'date': game_date,
        'season': _season_start_year(game_date),
        'league': 'NBA',
        'team': team,
        'opponent': opponent,
        'teamScore': team_score,
        'opponentScore': opponent_score,
        'result': result,
    }
    errors = validate_game(row)
    return row if not errors else None


def collect_nba_api_games(
    season: str = '2024-25',
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    try:
        from nba_api.stats.endpoints import leaguegamefinder
    except ImportError:
        raise SystemExit(
            'nba_api is not installed. Run: pip install nba_api',
        )

    finder = leaguegamefinder.LeagueGameFinder(
        season_nullable=season,
        season_type_nullable='Regular Season',
        league_id_nullable='00',
    )
    frame = finder.get_data_frames()[0]
    stats = {'rawGames': 0, 'skipped': 0, 'rows': 0, 'pages': 1}

    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for record in frame.to_dict('records'):
        stats['rawGames'] += 1
        normalized = normalize_nba_api_row(record)
        if normalized and normalized['id'] not in seen_ids:
            rows.append(normalized)
            seen_ids.add(normalized['id'])
        else:
            stats['skipped'] += 1

    stats['rows'] = len(rows)
    return rows, stats
