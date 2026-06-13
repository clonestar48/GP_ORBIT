"""balldontlie → normalized Orbit game rows (offline sync only)."""

from __future__ import annotations

from typing import Any

from lib.dataSources.http import get_json

from .schema import validate_game

BASE = 'https://api.balldontlie.io/v1'
PROVIDER = 'balldontlie'
FINAL_STATUSES = frozenset({'final', 'final/ot', 'final/2ot'})


def _team_abbrev(team: dict | None) -> str | None:
    if not team:
        return None
    return (team.get('abbreviation') or team.get('name') or '').upper() or None


def _slug_part(a: str, b: str) -> str:
    pair = sorted([a.lower(), b.lower()])
    return f'{pair[0]}-{pair[1]}'


def _row_id(game_id: int, date: str, home: str, away: str, team: str) -> str:
    slug = _slug_part(home, away)
    return f'{date[:10]}-{slug}-{int(game_id):04d}-{team}'


def normalize_balldontlie_game(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Map one balldontlie game to two perspective rows (home + visitor)."""
    if raw.get('postseason'):
        return []

    status = str(raw.get('status') or '').lower()
    if status and status not in FINAL_STATUSES:
        return []

    home = _team_abbrev(raw.get('home_team'))
    away = _team_abbrev(raw.get('visitor_team'))
    if not home or not away:
        return []

    home_score = raw.get('home_team_score')
    away_score = raw.get('visitor_team_score')
    if home_score is None or away_score is None:
        return []

    date = (raw.get('date') or '')[:10]
    if not date:
        return []

    game_id = int(raw.get('id') or 0)
    season = int(raw.get('season') or int(date[:4]))
    league = 'NBA'

    rows = [
        {
            'id': _row_id(game_id, date, home, away, home),
            'date': date,
            'season': season,
            'league': league,
            'team': home,
            'opponent': away,
            'teamScore': int(home_score),
            'opponentScore': int(away_score),
            'result': 'W' if home_score > away_score else 'L',
        },
        {
            'id': _row_id(game_id, date, home, away, away),
            'date': date,
            'season': season,
            'league': league,
            'team': away,
            'opponent': home,
            'teamScore': int(away_score),
            'opponentScore': int(home_score),
            'result': 'W' if away_score > home_score else 'L',
        },
    ]

    for row in rows:
        errors = validate_game(row)
        if errors:
            return []
    return rows


def fetch_games_page(
    api_key: str,
    *,
    cursor: int | None = None,
    per_page: int = 100,
    seasons: list[int] | None = None,
    postseason: bool | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    """Fetch one cursor page of raw games. Raises on network or auth failure."""
    params = [f'per_page={per_page}']
    if cursor is not None:
        params.append(f'cursor={cursor}')
    if seasons:
        params.extend(f'seasons[]={season}' for season in seasons)
    if postseason is not None:
        params.append(f'postseason={"true" if postseason else "false"}')
    if start_date:
        params.append(f'start_date={start_date}')
    if end_date:
        params.append(f'end_date={end_date}')
    url = f'{BASE}/games?{"&".join(params)}'
    raw = get_json(url, headers={'Authorization': api_key})
    return {
        'provider': PROVIDER,
        'endpoint': 'games',
        'cursor': cursor,
        'raw': raw,
    }


def collect_balldontlie_games(
    api_key: str,
    *,
    max_pages: int | None = 1,
    per_page: int = 100,
    seasons: list[int] | None = None,
    postseason: bool | None = False,
    start_date: str | None = None,
    end_date: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Paginate balldontlie (cursor-based) and return normalized rows plus sync stats."""
    rows: list[dict[str, Any]] = []
    stats = {'pages': 0, 'rawGames': 0, 'skipped': 0, 'rows': 0}
    cursor: int | None = None
    page_limit = max_pages if max_pages is not None else 10_000

    while stats['pages'] < page_limit:
        payload = fetch_games_page(
            api_key,
            cursor=cursor,
            per_page=per_page,
            seasons=seasons,
            postseason=postseason,
            start_date=start_date,
            end_date=end_date,
        )
        stats['pages'] += 1
        body = payload.get('raw') or {}
        batch = body.get('data') or []
        if not batch:
            break

        stats['rawGames'] += len(batch)
        for raw_game in batch:
            normalized = normalize_balldontlie_game(raw_game)
            if normalized:
                rows.extend(normalized)
            else:
                stats['skipped'] += 1

        meta = body.get('meta') or {}
        next_cursor = meta.get('next_cursor')
        if next_cursor is None:
            break
        cursor = int(next_cursor)

    stats['rows'] = len(rows)
    return rows, stats
