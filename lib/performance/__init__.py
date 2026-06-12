"""Performance series builders from historical game results."""

from .range import RANGE_LABELS, RangeQuery, resolve_range
from .series import (
    build_index_series,
    build_multi_team_series,
    build_win_pct_series,
)

__all__ = [
    'RANGE_LABELS',
    'RangeQuery',
    'resolve_range',
    'build_index_series',
    'build_multi_team_series',
    'build_win_pct_series',
]
