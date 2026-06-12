"""Normalize The Odds API responses into app events.

Only fields the provider actually returned are populated; everything
else stays None and is reported in missingFields.
"""

from __future__ import annotations

import time
from datetime import datetime

from .base import attach_provenance, blank_event

BOOKMAKER_PREF = ('draftkings', 'fanduel', 'betmgm', 'bovada', 'pointsbetus')


def _parse_iso_ts(value) -> float | None:
    """ISO-8601 string → epoch seconds, or None if unparseable."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp()
    except ValueError:
        return None


def _team_label(full_name: str | None) -> str | None:
    if not full_name:
        return None
    parts = full_name.strip().split()
    return parts[-1] if parts else full_name


def _pick_bookmaker(bookmakers: list) -> dict | None:
    by_key = {b.get('key'): b for b in bookmakers or [] if b.get('key')}
    for key in BOOKMAKER_PREF:
        if key in by_key:
            return by_key[key]
    return bookmakers[0] if bookmakers else None


def _extract_markets(bookmaker: dict, home_full: str, away_full: str) -> dict:
    out = {'spread': None, 'total': None, 'moneylineHome': None, 'moneylineAway': None}
    for market in bookmaker.get('markets', []):
        key = market.get('key')
        outcomes = market.get('outcomes', [])
        if key == 'spreads':
            for outcome in outcomes:
                if outcome.get('name') == home_full and outcome.get('point') is not None:
                    out['spread'] = outcome.get('point')
        elif key == 'totals':
            for outcome in outcomes:
                if (outcome.get('name') or '').lower() == 'over' and outcome.get('point') is not None:
                    out['total'] = outcome.get('point')
        elif key == 'h2h':
            for outcome in outcomes:
                if outcome.get('name') == home_full:
                    out['moneylineHome'] = outcome.get('price')
                elif outcome.get('name') == away_full:
                    out['moneylineAway'] = outcome.get('price')
    return out


def normalize_odds_events(fetch_result: dict) -> list[dict]:
    """Odds endpoint → upcoming app events. No scores, no history fabrication."""
    events = []
    for raw_event in fetch_result.get('raw') or []:
        home_full = raw_event.get('home_team')
        away_full = raw_event.get('away_team')
        event = blank_event()
        event['gameId'] = f"oddsapi-{raw_event.get('id')}"
        event['homeTeam'] = _team_label(home_full)
        event['awayTeam'] = _team_label(away_full)
        commence = raw_event.get('commence_time')
        event['startTime'] = commence
        event['rawStartTime'] = commence
        # The odds endpoint returns upcoming + in-play games. A past
        # commence_time means the game already started — never label it
        # 'upcoming' (ESPN status overrides on merge when available).
        commence_ts = _parse_iso_ts(commence)
        event['status'] = 'live' if commence_ts is not None and commence_ts <= time.time() else 'upcoming'

        source_ts = fetch_result.get('fetchedAt')
        bookmaker = _pick_bookmaker(raw_event.get('bookmakers'))
        if bookmaker:
            event.update(_extract_markets(bookmaker, home_full, away_full))
            source_ts = bookmaker.get('last_update') or source_ts
        event['currentSpread'] = event['spread']
        event['currentTotal'] = event['total']

        events.append(attach_provenance(event, source='api', provider='The Odds API', source_ts=source_ts))
    return events


def normalize_score_events(fetch_result: dict) -> list[dict]:
    """Scores endpoint → final app events with real scores only."""
    events = []
    for raw_event in fetch_result.get('raw') or []:
        if not raw_event.get('completed'):
            continue
        home_full = raw_event.get('home_team')
        away_full = raw_event.get('away_team')
        scores = {s.get('name'): s.get('score') for s in raw_event.get('scores') or []}

        def _score(name):
            value = scores.get(name)
            try:
                return int(value)
            except (TypeError, ValueError):
                return None

        event = blank_event()
        event['gameId'] = f"oddsapi-{raw_event.get('id')}"
        event['homeTeam'] = _team_label(home_full)
        event['awayTeam'] = _team_label(away_full)
        event['startTime'] = raw_event.get('commence_time')
        event['rawStartTime'] = raw_event.get('commence_time')
        event['status'] = 'final'
        event['homeScore'] = _score(home_full)
        event['awayScore'] = _score(away_full)

        source_ts = raw_event.get('last_update') or fetch_result.get('fetchedAt')
        events.append(attach_provenance(event, source='api', provider='The Odds API', source_ts=source_ts))
    return events
