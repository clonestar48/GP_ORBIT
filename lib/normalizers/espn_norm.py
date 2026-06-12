"""Normalize ESPN scoreboard responses into app events.

ESPN supplies schedule, status, and scores — never lines. Line fields
stay None and appear in missingFields.
"""

from __future__ import annotations

from .base import attach_provenance, blank_event

_STATE_MAP = {'pre': 'upcoming', 'in': 'live', 'post': 'final'}


def _competitor(competition: dict, side: str) -> dict | None:
    for comp in competition.get('competitors', []):
        if comp.get('homeAway') == side:
            return comp
    return None


def _score(competitor: dict | None, state: str):
    if not competitor or state == 'pre':
        return None
    try:
        return int(competitor.get('score'))
    except (TypeError, ValueError):
        return None


def normalize_scoreboard(fetch_result: dict) -> list[dict]:
    events = []
    for raw_event in (fetch_result.get('raw') or {}).get('events', []):
        competitions = raw_event.get('competitions') or []
        if not competitions:
            continue
        competition = competitions[0]
        state = ((raw_event.get('status') or {}).get('type') or {}).get('state', 'pre')

        home = _competitor(competition, 'home')
        away = _competitor(competition, 'away')

        event = blank_event()
        event['gameId'] = f"espn-{raw_event.get('id')}"
        event['homeTeam'] = ((home or {}).get('team') or {}).get('shortDisplayName')
        event['awayTeam'] = ((away or {}).get('team') or {}).get('shortDisplayName')
        event['startTime'] = raw_event.get('date')
        event['rawStartTime'] = raw_event.get('date')
        event['status'] = _STATE_MAP.get(state, 'upcoming')
        event['homeScore'] = _score(home, state)
        event['awayScore'] = _score(away, state)

        events.append(attach_provenance(
            event,
            source='api',
            provider='ESPN',
            source_ts=fetch_result.get('fetchedAt'),
        ))
    return events
