"""nba_api → normalized Orbit game rows (offline sync, no API key)."""

from __future__ import annotations

import re
from collections import defaultdict
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


def _row_from_record(
    raw: dict[str, Any],
    *,
    opponent: str,
    opponent_score: int,
) -> dict[str, Any] | None:
    team = (raw.get('TEAM_ABBREVIATION') or '').upper()
    game_date = (raw.get('GAME_DATE') or '')[:10]
    team_score = raw.get('PTS')
    if not team or not game_date or team_score is None:
        return None

    team_score = int(team_score)
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
        'opponentScore': int(opponent_score),
        'result': result,
    }
    errors = validate_game(row)
    return row if not errors else None


def normalize_nba_api_row(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Normalize a single team row (legacy path — prefer paired normalization)."""
    team = (raw.get('TEAM_ABBREVIATION') or '').upper()
    matchup = raw.get('MATCHUP') or ''
    parsed = _parse_matchup(matchup)
    if not parsed or not team:
        return None

    first, second = parsed
    if team != first and team != second:
        return None

    opponent = second if team == first else first
    return _row_from_record(raw, opponent=opponent, opponent_score=0)


def _normalize_game_pair(records: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    """Build two perspective rows from the paired nba_api records for one GAME_ID."""
    if len(records) != 2:
        return None

    a, b = records
    team_a = (a.get('TEAM_ABBREVIATION') or '').upper()
    team_b = (b.get('TEAM_ABBREVIATION') or '').upper()
    if not team_a or not team_b or team_a == team_b:
        return None

    score_a = a.get('PTS')
    score_b = b.get('PTS')
    if score_a is None or score_b is None:
        return None

    row_a = _row_from_record(a, opponent=team_b, opponent_score=int(score_b))
    row_b = _row_from_record(b, opponent=team_a, opponent_score=int(score_a))
    if not row_a or not row_b:
        return None
    if row_a['date'] != row_b['date']:
        return None
    return [row_a, row_b]


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

    by_game: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in frame.to_dict('records'):
        stats['rawGames'] += 1
        game_id = str(record.get('GAME_ID') or '')
        if not game_id:
            stats['skipped'] += 1
            continue
        by_game[game_id].append(record)

    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for game_records in by_game.values():
        pair = _normalize_game_pair(game_records)
        if not pair:
            stats['skipped'] += len(game_records)
            continue
        for row in pair:
            if row['id'] in seen_ids:
                stats['skipped'] += 1
                continue
            rows.append(row)
            seen_ids.add(row['id'])

    stats['rows'] = len(rows)
    return rows, stats
