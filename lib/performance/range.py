"""Flexible date-range model — presets populate a shared range object."""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

RANGE_LABELS = {
    'today': 'Latest',
    'week': 'Week',
    'month': 'Month',
    'season': 'Season',
    'all': 'Archive',
    'series': 'Series',
}

# Hero stat block — honest scope labels (not tied to game-log row cap).
STAT_SCOPE_LABELS = {
    'today': 'Latest',
    'week': 'This week',
    'month': 'This month',
    'season': 'Current Season',
    'all': 'Loaded archive',
    'matchup': 'Head-to-head',
}

FRANCHISE_RANGE_PRESETS = ('today', 'week', 'month', 'season', 'all')
MATCHUP_RANGE_PRESETS = ('season', 'all')


def normalize_matchup_preset(preset: str | None) -> str | None:
    """Map legacy presets to Season — Series reserved for playoff/tournament UX."""
    if not preset or preset in ('matchup', 'series'):
        return 'season'
    return preset

ROOT = Path(__file__).resolve().parent.parent.parent
_reference_lock = threading.Lock()
_archive_reference: date | None = None


def _ensure_env() -> None:
    from lib.ingest.env import load_dotenv

    load_dotenv(ROOT)


def _explicit_reference_from_env() -> date | None:
    raw = os.environ.get('ORBIT_REFERENCE_DATE', '').strip()
    if not raw or raw.lower() == 'auto':
        return None
    return date.fromisoformat(raw[:10])


def reference_date_mode() -> str:
    """Return how preset ranges are anchored: explicit, auto, or live."""
    _ensure_env()
    if _explicit_reference_from_env() is not None:
        return 'explicit'
    with _reference_lock:
        if _archive_reference is not None:
            return 'auto'
    return 'live'


def configure_reference_from_games(games: list[dict]) -> date | None:
    """Anchor presets to the latest game date in the loaded archive."""
    global _archive_reference
    dates = [(g.get('date') or '')[:10] for g in games if g.get('date')]
    resolved: date | None = None
    if dates:
        resolved = date.fromisoformat(max(dates))

    with _reference_lock:
        _archive_reference = resolved
    return resolved


def reference_date() -> date:
    """Anchor for preset ranges — archive max date unless ORBIT_REFERENCE_DATE is explicit."""
    _ensure_env()
    explicit = _explicit_reference_from_env()
    with _reference_lock:
        archive = _archive_reference
    if explicit is not None:
        if archive is not None and explicit > archive:
            return archive
        return explicit
    if archive is not None:
        return archive
    return datetime.now(timezone.utc).date()


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


def preset_dates(preset: str, reference: date | None = None) -> tuple[date, date]:
    ref = reference or reference_date()
    if preset == 'today':
        return ref, ref
    if preset == 'week':
        return ref - timedelta(days=6), ref
    if preset == 'month':
        return ref - timedelta(days=29), ref
    if preset == 'season':
        start_year = ref.year if ref.month >= 10 else ref.year - 1
        return date(start_year, 10, 1), ref
    if preset == 'all':
        return date(1900, 1, 1), ref
    if preset in ('matchup', 'series'):
        # Head-to-head lens — date window resolved by direct meetings, not calendar math.
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
    """Build a range from explicit ISO dates or a preset key."""
    if start_date and end_date:
        return RangeQuery(
            date.fromisoformat(start_date[:10]),
            date.fromisoformat(end_date[:10]),
            teams,
            mode,
            metric,
            None,
        )
    if preset:
        start, end = preset_dates(preset, reference)
        return RangeQuery(start, end, teams, mode, metric, preset)
    start, end = preset_dates('week', reference)
    return RangeQuery(start, end, teams, mode, metric, 'week')
