"""Shared provenance envelope for normalized events.

Every event carries:
  source: "demo" | "api" | "stored"
  sourceProvider: provider name or None
  sourceTimestamp: ISO string or None
  dataConfidence: "demo" | "live" | "partial" | "unavailable"
  missingFields: list of core fields that are absent
"""

from __future__ import annotations

UPCOMING_CORE = ('homeTeam', 'awayTeam', 'startTime', 'spread', 'total', 'moneylineHome', 'moneylineAway')
FINAL_CORE = ('homeTeam', 'awayTeam', 'startTime', 'homeScore', 'awayScore')

EVENT_FIELDS = (
    'gameId', 'league', 'homeTeam', 'awayTeam', 'startTime', 'status',
    'homeScore', 'awayScore',
    'spread', 'total', 'moneylineHome', 'moneylineAway',
    'openingSpread', 'currentSpread', 'openingTotal', 'currentTotal',
    'closingSpread', 'closingTotal',
    'lineHistory',
)


def blank_event() -> dict:
    event = {field: None for field in EVENT_FIELDS}
    event['league'] = 'nba'
    event['lineHistory'] = []
    return event


def attach_provenance(event: dict, *, source: str, provider: str | None, source_ts: str | None) -> dict:
    core = FINAL_CORE if event.get('status') == 'final' else UPCOMING_CORE
    missing = [field for field in core if event.get(field) is None]

    if source == 'demo':
        confidence = 'demo'
    elif len(missing) >= len(core):
        confidence = 'unavailable'
    elif missing:
        confidence = 'partial'
    else:
        confidence = 'live'

    event['source'] = source
    event['sourceProvider'] = provider
    event['sourceTimestamp'] = source_ts
    event['dataConfidence'] = confidence
    event['missingFields'] = missing
    return event
