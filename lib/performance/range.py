"""Flexible date-range model — presets populate a shared range object."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

RANGE_LABELS = {
    'today': 'Today',
    'week': 'Past Week',
    'month': 'Past Month',
    '10y': 'Past 10 Years',
    'all': 'All Time',
}


@dataclass
class RangeQuery:
    start_date: date
    end_date: date
    teams: list[str] | None = None
    mode: str = 'franchise'
    metric: str = 'winPct'
    preset: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            'startDate': self.start_date.isoformat(),
            'endDate': self.end_date.isoformat(),
            'teams': self.teams or [],
            'mode': self.mode,
            'metric': self.metric,
            'preset': self.preset,
            'rangeLabel': RANGE_LABELS.get(self.preset or '', self.preset or 'Custom'),
        }


def reference_date() -> date:
    return datetime.now(timezone.utc).date()


def preset_dates(preset: str, reference: date | None = None) -> tuple[date, date]:
    ref = reference or reference_date()
    if preset == 'today':
        return ref, ref
    if preset == 'week':
        return ref - timedelta(days=6), ref
    if preset == 'month':
        return ref - timedelta(days=29), ref
    if preset == '10y':
        return ref.replace(year=ref.year - 10), ref
    if preset == 'all':
        return date(1900, 1, 1), ref
    raise ValueError(f'Unknown preset: {preset}')


def resolve_range(
    preset: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    teams: list[str] | None = None,
    mode: str = 'franchise',
    metric: str = 'winPct',
    reference: date | None = None,
) -> RangeQuery:
    """Build a range from a preset key or explicit ISO dates."""
    if preset:
        start, end = preset_dates(preset, reference)
        return RangeQuery(start, end, teams, mode, metric, preset)
    if start_date and end_date:
        return RangeQuery(
            date.fromisoformat(start_date[:10]),
            date.fromisoformat(end_date[:10]),
            teams,
            mode,
            metric,
            None,
        )
    start, end = preset_dates('week', reference)
    return RangeQuery(start, end, teams, mode, metric, 'week')
