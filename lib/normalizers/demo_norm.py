"""Normalize /data/demo JSON into app events, always labeled source=demo.

Demo data is fabricated for layout testing only. The provenance envelope
guarantees the UI shows a DEMO DATA badge on every card.
"""

from __future__ import annotations

import json
from pathlib import Path

from .base import attach_provenance, blank_event

DEMO_DIR = Path(__file__).resolve().parent.parent.parent / 'data' / 'demo'


def _load(name: str, default):
    path = DEMO_DIR / name
    if not path.is_file():
        return default
    try:
        with path.open(encoding='utf-8') as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError):
        return default


def _apply_market(event: dict, market: dict | None) -> None:
    if not market:
        return
    event['spread'] = market.get('currentSpread', market.get('spread'))
    event['total'] = market.get('currentTotal', market.get('total'))
    event['moneylineHome'] = market.get('moneylineHome')
    event['moneylineAway'] = market.get('moneylineAway')
    event['openingSpread'] = market.get('openingSpread')
    event['currentSpread'] = market.get('currentSpread', market.get('spread'))
    event['openingTotal'] = market.get('openingTotal')
    event['currentTotal'] = market.get('currentTotal', market.get('total'))
    event['lineHistory'] = market.get('lineHistory', [])


def demo_upcoming_events() -> list[dict]:
    games_payload = _load('games.json', {'games': []})
    odds_payload = _load('odds.json', {'markets': {}})
    markets = odds_payload.get('markets', {})
    updated = odds_payload.get('updatedAt') or games_payload.get('updatedAt')

    events = []
    for game in games_payload.get('games', []):
        event = blank_event()
        for key in ('gameId', 'homeTeam', 'awayTeam', 'startTime', 'status', 'homeScore', 'awayScore'):
            event[key] = game.get(key)
        event['rawStartTime'] = game.get('startTime')
        _apply_market(event, markets.get(game.get('gameId')))
        events.append(attach_provenance(event, source='demo', provider='manual', source_ts=updated))
    return events


def demo_history_events() -> list[dict]:
    payload = _load('history.json', {'games': []})
    updated = payload.get('updatedAt')

    events = []
    for game in payload.get('games', []):
        event = blank_event()
        for key in (
            'gameId', 'homeTeam', 'awayTeam', 'startTime', 'status',
            'homeScore', 'awayScore', 'spread', 'total',
            'moneylineHome', 'moneylineAway',
            'openingSpread', 'closingSpread', 'openingTotal', 'closingTotal',
        ):
            event[key] = game.get(key)
        event['rawStartTime'] = game.get('startTime')
        event['currentSpread'] = game.get('closingSpread', game.get('spread'))
        event['currentTotal'] = game.get('closingTotal', game.get('total'))
        event['lineHistory'] = game.get('lineHistory', [])
        events.append(attach_provenance(event, source='demo', provider='manual', source_ts=updated))
    return events
