"""Calculated fields — derived ONLY from real source fields.

Every function returns None when the inputs are missing. Nothing here
invents, interpolates, or fills values.
"""

from __future__ import annotations


def implied_probability(american) -> float | None:
    """Implied win probability (%) from an American price."""
    if american is None:
        return None
    try:
        a = float(american)
    except (TypeError, ValueError):
        return None
    if a == 0:
        return None
    if a > 0:
        return round(100.0 / (a + 100.0) * 100.0, 1)
    return round((-a) / ((-a) + 100.0) * 100.0, 1)


def spread_movement(opening, current) -> float | None:
    """Current minus opening spread. None if either side is unknown."""
    if opening is None or current is None:
        return None
    try:
        return round(float(current) - float(opening), 1)
    except (TypeError, ValueError):
        return None


def final_margin(home_score, away_score) -> int | None:
    """Home margin of victory (negative = away won). None without both scores."""
    if home_score is None or away_score is None:
        return None
    try:
        return int(home_score) - int(away_score)
    except (TypeError, ValueError):
        return None


def line_result(closing_spread, margin) -> str | None:
    """Closing line vs final result. None unless both inputs are real."""
    if closing_spread is None or margin is None:
        return None
    try:
        delta = float(margin) + float(closing_spread)
    except (TypeError, ValueError):
        return None
    if delta > 0:
        return 'Home covered'
    if delta < 0:
        return 'Away covered'
    return 'Push'


def valid_history_points(history) -> list[dict]:
    """Snapshots usable for a line chart: real timestamp + real spread."""
    out = []
    for point in history or []:
        if not isinstance(point, dict):
            continue
        if point.get('ts') and point.get('spread') is not None:
            out.append(point)
    return out


def has_ohlc(history) -> bool:
    """True only if every snapshot carries genuine open/high/low/close fields."""
    points = history or []
    if not points:
        return False
    return all(
        isinstance(p, dict)
        and all(p.get(k) is not None for k in ('open', 'high', 'low', 'close'))
        for p in points
    )


def biggest_movement(events: list[dict]) -> list[dict]:
    """Rank events by absolute spread movement. Skips events without real movement."""
    rows = []
    for event in events:
        movement = event.get('spreadMovement')
        if movement is None:
            continue
        rows.append({
            'gameId': event.get('gameId'),
            'matchup': f"{event.get('awayTeam')} @ {event.get('homeTeam')}",
            'openingSpread': event.get('openingSpread'),
            'currentSpread': event.get('currentSpread'),
            'movement': movement,
            'source': event.get('source'),
            'dataConfidence': event.get('dataConfidence'),
        })
    rows.sort(key=lambda r: abs(r['movement']), reverse=True)
    return rows
