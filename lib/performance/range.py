"""Flexible date-range model — presets populate a shared range object."""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

RANGE_LABELS = {
    'today': 'Today',
    'week': 'Past Week',
    'month': 'Past Month',
    'season': 'Current Season',
    'all': 'All Time',
}

ROOT = Path(__file__).resolve().parent.parent.parent
_reference_lock = threading.Lock()
_archive_reference: date | None = None


def _ensure_env() -> None:
    from lib.ingest.env import load_dotenv

    load_dotenv(ROOT)


def reference_date_mode() -> str:
    """Return how preset ranges are anchored: explicit, auto, or live."""
    _ensure_env()
    raw = os.environ.get('ORBIT_REFERENCE_DATE', '').strip()
    if raw and raw.lower() != 'auto':
        return 'explicit'
    games_override = os.environ.get('ORBIT_GAMES_PATH', '').strip()
    if raw.lower() == 'auto' or games_override:
        return 'auto'
    return 'live'


def configure_reference_from_games(games: list[dict]) -> date | None:
    """Resolve ORBIT_REFERENCE_DATE=auto (or implicit auto) from archive max game date."""
    global _archive_reference
    if reference_date_mode() != 'auto':
        return None

    dates = [(g.get('date') or '')[:10] for g in games if g.get('date')]
    resolved: date | None = None
    if dates:
        resolved = date.fromisoformat(max(dates))

    with _reference_lock:
        _archive_reference = resolved
    return resolved


def reference_date() -> date:
    """Anchor for preset ranges — override via ORBIT_REFERENCE_DATE or archive auto-detect."""
    _ensure_env()
    mode = reference_date_mode()
    if mode == 'explicit':
        raw = os.environ.get('ORBIT_REFERENCE_DATE', '').strip()
        return date.fromisoformat(raw[:10])
    if mode == 'auto':
        with _reference_lock:
            if _archive_reference is not None:
                return _archive_reference
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
