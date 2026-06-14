"""nba_api → normalized Orbit game rows (offline sync, no API key)."""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from .balldontlie import _slug_part
from .schema import validate_game

PROVIDER = 'nba_api'
SEASON_TYPE_REGULAR = 'Regular Season'
SEASON_TYPE_PLAYOFFS = 'Playoffs'
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


def _is_completed_team_row(raw: dict[str, Any]) -> bool:
    """Exclude scheduled or unplayed rows (including 'if necessary' games never held)."""
    if raw.get('PTS') is None or raw.get('WL') not in ('W', 'L'):
        return False
    minutes = raw.get('MIN')
    if minutes is not None and int(minutes) <= 0:
        return False
    return True


def fetch_playoff_series_by_game(season: str) -> dict[str, dict[str, Any]]:
    """Map GAME_ID → series metadata from CommonPlayoffSeries (played games only)."""
    try:
        from nba_api.stats.endpoints import commonplayoffseries
    except ImportError:
        raise SystemExit(
            'nba_api is not installed. Run: pip install nba_api',
        )

    frame = commonplayoffseries.CommonPlayoffSeries(season=season).get_data_frames()[0]
    out: dict[str, dict[str, Any]] = {}
    for record in frame.to_dict('records'):
        game_id = str(record.get('GAME_ID') or '')
        if not game_id:
            continue
        out[game_id] = {
            'seriesId': str(record.get('SERIES_ID') or ''),
            'seriesGameNumber': int(record.get('GAME_NUM') or 0),
        }
    return out


def _row_from_record(
    raw: dict[str, Any],
    *,
    opponent: str,
    opponent_score: int,
    series_meta: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    team = (raw.get('TEAM_ABBREVIATION') or '').upper()
    game_date = (raw.get('GAME_DATE') or '')[:10]
    team_score = raw.get('PTS')
    if not team or not game_date or team_score is None:
        return None

    team_score = int(team_score)
    result = 'W' if raw.get('WL') == 'W' else 'L'
    game_id = str(raw.get('GAME_ID') or '')
    row: dict[str, Any] = {
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
    if series_meta:
        row['seriesId'] = series_meta['seriesId']
        row['seriesGameNumber'] = series_meta['seriesGameNumber']
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


def _normalize_game_pair(
    records: list[dict[str, Any]],
    *,
    series_meta: dict[str, Any] | None = None,
) -> list[dict[str, Any]] | None:
    """Build two perspective rows from the paired nba_api records for one GAME_ID."""
    if len(records) != 2:
        return None

    a, b = records
    if not _is_completed_team_row(a) or not _is_completed_team_row(b):
        return None

    team_a = (a.get('TEAM_ABBREVIATION') or '').upper()
    team_b = (b.get('TEAM_ABBREVIATION') or '').upper()
    if not team_a or not team_b or team_a == team_b:
        return None

    score_a = a.get('PTS')
    score_b = b.get('PTS')
    if score_a is None or score_b is None:
        return None

    row_a = _row_from_record(
        a, opponent=team_b, opponent_score=int(score_b), series_meta=series_meta,
    )
    row_b = _row_from_record(
        b, opponent=team_a, opponent_score=int(score_a), series_meta=series_meta,
    )
    if not row_a or not row_b:
        return None
    if row_a['date'] != row_b['date']:
        return None
    return [row_a, row_b]


def collect_nba_api_games(
    season: str = '2024-25',
    *,
    season_type: str = SEASON_TYPE_REGULAR,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    try:
        from nba_api.stats.endpoints import leaguegamefinder
    except ImportError:
        raise SystemExit(
            'nba_api is not installed. Run: pip install nba_api',
        )

    series_by_game: dict[str, dict[str, Any]] = {}
    if season_type == SEASON_TYPE_PLAYOFFS:
        series_by_game = fetch_playoff_series_by_game(season)

    finder = leaguegamefinder.LeagueGameFinder(
        season_nullable=season,
        season_type_nullable=season_type,
        league_id_nullable='00',
    )
    frame = finder.get_data_frames()[0]
    stats: dict[str, int] = {
        'rawGames': 0,
        'skipped': 0,
        'rows': 0,
        'pages': 1,
        'seriesGames': len(series_by_game),
    }

    by_game: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in frame.to_dict('records'):
        stats['rawGames'] += 1
        if not _is_completed_team_row(record):
            stats['skipped'] += 1
            continue
        game_id = str(record.get('GAME_ID') or '')
        if not game_id:
            stats['skipped'] += 1
            continue
        by_game[game_id].append(record)

    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for game_id, game_records in by_game.items():
        series_meta = series_by_game.get(game_id)
        if season_type == SEASON_TYPE_PLAYOFFS and not series_meta:
            stats['skipped'] += len(game_records)
            continue
        pair = _normalize_game_pair(game_records, series_meta=series_meta)
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
