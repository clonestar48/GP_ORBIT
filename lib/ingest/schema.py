"""Normalized game schema — matches data/demo-games.json (one row per team per game)."""

from __future__ import annotations

import time
from typing import Any

NORMALIZED_GAME_FIELDS = (
    'id',
    'date',
    'season',
    'league',
    'team',
    'opponent',
    'teamScore',
    'opponentScore',
    'result',
)

GAMES_DOCUMENT_FIELDS = (
    'source',
    'label',
    'provider',
    'syncedAt',
    'games',
)

VALID_RESULTS = frozenset({'W', 'L'})


def validate_game(row: dict[str, Any]) -> list[str]:
    """Return a list of validation errors (empty when valid)."""
    errors: list[str] = []
    for key in NORMALIZED_GAME_FIELDS:
        if key not in row:
            errors.append(f'missing field: {key}')
    if row.get('result') not in VALID_RESULTS:
        errors.append(f"invalid result: {row.get('result')!r}")
    for score_key in ('teamScore', 'opponentScore'):
        value = row.get(score_key)
        if value is not None and not isinstance(value, int):
            errors.append(f'{score_key} must be an integer')
    date = row.get('date')
    if isinstance(date, str) and len(date) < 10:
        errors.append(f'invalid date: {date!r}')
    return errors


def build_games_document(
    games: list[dict[str, Any]],
    *,
    source: str,
    label: str,
    provider: str,
) -> dict[str, Any]:
    """Wrap normalized rows in the top-level document written to data/games.json."""
    invalid = [err for game in games for err in validate_game(game)]
    if invalid:
        sample = invalid[:5]
        raise ValueError(f'{len(invalid)} validation error(s): {"; ".join(sample)}')

    return {
        'source': source,
        'label': label,
        'provider': provider,
        'syncedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'games': games,
    }
