"""Batch validation for normalized game rows (sync output)."""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from .schema import NORMALIZED_GAME_FIELDS, validate_game

NBA_TEAM_IDS = frozenset({
    'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
    'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
    'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
})


def validate_games_batch(
    games: list[dict[str, Any]],
    *,
    known_teams: set[str] | None = None,
) -> list[str]:
    """Return validation errors (empty when valid)."""
    errors: list[str] = []
    team_set = known_teams or set(NBA_TEAM_IDS)

    for row in games:
        errors.extend(validate_game(row))
        if row.get('team') not in team_set:
            errors.append(f'unknown team: {row.get("team")}')
        if row.get('opponent') not in team_set:
            errors.append(f'unknown opponent: {row.get("opponent")}')
        if row.get('team') == row.get('opponent'):
            errors.append(f'self matchup: {row.get("id")}')

    ids = [g['id'] for g in games]
    if len(ids) != len(set(ids)):
        dupes = [item for item, count in Counter(ids).items() if count > 1]
        errors.append(f'duplicate row ids ({len(dupes)}), e.g. {dupes[:3]}')

    by_base: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in games:
        base = row['id'].rsplit('-', 1)[0]
        by_base[base].append(row)

    game_count = len(by_base)
    for base, pair in by_base.items():
        if len(pair) != 2:
            errors.append(f'game {base} has {len(pair)} rows (expected 2)')
            continue
        a, b = pair
        if a['team'] == b['team']:
            errors.append(f'game {base} duplicate team perspective')
        if a['team'] != b['opponent'] or b['team'] != a['opponent']:
            errors.append(f'game {base} opponent mismatch')
        if a['teamScore'] != b['opponentScore'] or b['teamScore'] != a['opponentScore']:
            errors.append(f'game {base} score mismatch')
        if a['date'] != b['date'] or a['season'] != b['season']:
            errors.append(f'game {base} date/season mismatch')
        for row in pair:
            won = row['teamScore'] > row['opponentScore']
            if (row['result'] == 'W') != won:
                errors.append(f'game {base} result/score mismatch for {row["team"]}')

    if game_count and len(games) != game_count * 2:
        errors.append(f'expected {game_count * 2} rows for {game_count} games, got {len(games)}')

    return errors


def summarize_games(games: list[dict[str, Any]]) -> dict[str, Any]:
    """Human-readable stats for sync reporting."""
    teams = sorted({g['team'] for g in games})
    dates = sorted({g['date'][:10] for g in games})
    by_base = {g['id'].rsplit('-', 1)[0] for g in games}
    return {
        'games': len(by_base),
        'rows': len(games),
        'teams': len(teams),
        'teamList': teams,
        'dateStart': dates[0] if dates else None,
        'dateEnd': dates[-1] if dates else None,
    }
