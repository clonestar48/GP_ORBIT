"""Chart resolution profiles — shared contract for API and frontend rendering.

Raw game archives stay at game-level precision. Resolution governs how series
points are summarized for delivery/rendering at broader scopes.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Callable, Literal

ResolutionUnit = Literal['game', 'day', 'week', 'month', 'season']
TooltipMode = Literal['game', 'game-or-day', 'period', 'league-summary']
RangePreset = Literal['today', 'week', 'month', 'season', 'all', 'league']


@dataclass(frozen=True)
class ChartResolution:
    preset: str
    resolution: ResolutionUnit
    max_points_per_series: int
    show_markers: bool
    show_ghost_opponent: bool
    tooltip_mode: TooltipMode

    def to_dict(self) -> dict[str, Any]:
        return {
            'preset': self.preset,
            'resolution': self.resolution,
            'maxPointsPerSeries': self.max_points_per_series,
            'showMarkers': self.show_markers,
            'showGhostOpponent': self.show_ghost_opponent,
            'tooltipMode': self.tooltip_mode,
        }


RESOLUTION_BY_PRESET: dict[str, ChartResolution] = {
    'today': ChartResolution(
        preset='today',
        resolution='game',
        max_points_per_series=20,
        show_markers=True,
        show_ghost_opponent=True,
        tooltip_mode='game',
    ),
    'week': ChartResolution(
        preset='week',
        resolution='game',
        max_points_per_series=30,
        show_markers=True,
        show_ghost_opponent=False,
        tooltip_mode='game',
    ),
    'month': ChartResolution(
        preset='month',
        resolution='day',
        max_points_per_series=90,
        show_markers=True,
        show_ghost_opponent=False,
        tooltip_mode='game-or-day',
    ),
    'season': ChartResolution(
        preset='season',
        resolution='week',
        max_points_per_series=40,
        show_markers=False,
        show_ghost_opponent=False,
        tooltip_mode='period',
    ),
    'all': ChartResolution(
        preset='all',
        resolution='month',
        max_points_per_series=120,
        show_markers=False,
        show_ghost_opponent=False,
        tooltip_mode='period',
    ),
    'league': ChartResolution(
        preset='league',
        resolution='season',
        max_points_per_series=10,
        show_markers=False,
        show_ghost_opponent=False,
        tooltip_mode='league-summary',
    ),
}

DEFAULT_PRESET = 'week'
MAX_RENDER_POINTS_CEILING = 900


def resolve_profile(preset: str | None = None) -> ChartResolution:
    key = preset or DEFAULT_PRESET
    return RESOLUTION_BY_PRESET.get(key, RESOLUTION_BY_PRESET[DEFAULT_PRESET])


def is_dense_profile(profile: ChartResolution) -> bool:
    """Broader scopes use tighter marker spacing and simplified overlays."""
    return profile.resolution != 'game'


def profile_as_dict(preset: str | None = None) -> dict[str, Any]:
    return resolve_profile(preset).to_dict()


def _parse_point_date(value: str) -> date:
    return date.fromisoformat(value[:10])


def _is_game_point(point: dict[str, Any]) -> bool:
    return bool(point.get('gameId')) and not point.get('flatline')


def _dedupe_daily(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One point per calendar day; prefer game rows over flatlines."""
    by_date: dict[str, dict[str, Any]] = {}
    for point in sorted(points, key=lambda p: p.get('date', '')):
        key = (point.get('date') or '')[:10]
        if not key:
            continue
        prev = by_date.get(key)
        if not prev:
            by_date[key] = point
            continue
        if _is_game_point(point) and not _is_game_point(prev):
            by_date[key] = point
        elif _is_game_point(point) == _is_game_point(prev):
            by_date[key] = point
    return [by_date[k] for k in sorted(by_date.keys())]


def _cap_points(points: list[dict[str, Any]], max_points: int) -> list[dict[str, Any]]:
    if max_points <= 0 or len(points) <= max_points:
        return points
    if max_points == 1:
        return [points[-1]]
    last = len(points) - 1
    step = last / (max_points - 1)
    indices = sorted({int(round(i * step)) for i in range(max_points)})
    return [points[i] for i in indices]


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _week_end(d: date) -> date:
    return _week_start(d) + timedelta(days=6)


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def _month_end(d: date) -> date:
    if d.month == 12:
        return date(d.year, 12, 31)
    return date(d.year, d.month + 1, 1) - timedelta(days=1)


def _season_start(d: date) -> date:
    if d.month >= 10:
        return date(d.year, 10, 1)
    return date(d.year - 1, 10, 1)


def _season_end(d: date) -> date:
    start = _season_start(d)
    return date(start.year + 1, 9, 30)


def _period_point(
    bucket: list[dict[str, Any]],
    *,
    period_start: date,
    period_end: date,
    resolution: ResolutionUnit,
) -> dict[str, Any]:
    ordered = sorted(bucket, key=lambda p: p.get('date', ''))
    first = ordered[0]
    last = ordered[-1]
    last_date = _parse_point_date(last['date'])
    effective_end = min(period_end, last_date)
    start_value = float(first.get('previousValue', first.get('value', 0)))
    end_value = float(last.get('value', start_value))
    games = [p for p in ordered if _is_game_point(p)]
    wins = sum(1 for p in games if p.get('result') == 'W')
    losses = len(games) - wins
    return {
        'date': effective_end.isoformat(),
        'value': round(end_value, 2),
        'previousValue': round(start_value, 2),
        'movementAmount': round(end_value - start_value, 2),
        'periodStart': period_start.isoformat(),
        'periodEnd': effective_end.isoformat(),
        'resolution': resolution,
        'gamesInPeriod': len(games),
        'winsInPeriod': wins,
        'lossesInPeriod': losses,
        'aggregated': True,
        'movementReason': (
            f'{len(games)} game{"s" if len(games) != 1 else ""} '
            f'({wins}-{losses}) in period'
        ),
    }


def _bucket_points(
    points: list[dict[str, Any]],
    *,
    resolution: ResolutionUnit,
    period_start_for: Callable[[date], date],
    period_end_for: Callable[[date], date],
) -> list[dict[str, Any]]:
    daily = _dedupe_daily(points)
    if not daily:
        return []

    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    bounds: dict[str, tuple[date, date]] = {}
    for point in daily:
        d = _parse_point_date(point['date'])
        start = period_start_for(d)
        key = start.isoformat()
        buckets[key].append(point)
        bounds[key] = (start, period_end_for(d))

    out: list[dict[str, Any]] = []
    for key in sorted(buckets.keys()):
        start, end = bounds[key]
        out.append(
            _period_point(
                buckets[key],
                period_start=start,
                period_end=end,
                resolution=resolution,
            )
        )
    return out


def aggregate_points(
    points: list[dict[str, Any]],
    profile: ChartResolution,
) -> list[dict[str, Any]]:
    """Summarize raw daily/game series for API delivery at the profile resolution."""
    if not points:
        return []

    resolution = profile.resolution
    cap = profile.max_points_per_series

    if resolution == 'game':
        return list(points)

    if resolution == 'day':
        return _cap_points(_dedupe_daily(points), cap)

    if resolution == 'week':
        aggregated = _bucket_points(
            points,
            resolution='week',
            period_start_for=_week_start,
            period_end_for=_week_end,
        )
    elif resolution == 'month':
        aggregated = _bucket_points(
            points,
            resolution='month',
            period_start_for=_month_start,
            period_end_for=_month_end,
        )
    elif resolution == 'season':
        aggregated = _bucket_points(
            points,
            resolution='season',
            period_start_for=_season_start,
            period_end_for=_season_end,
        )
    else:
        aggregated = list(points)

    return _cap_points(aggregated, cap)
