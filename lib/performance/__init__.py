"""Performance series builders from historical game results."""

from .range import RANGE_LABELS, RangeQuery, resolve_range
from .resolution import ChartResolution, aggregate_points, resolve_profile
from .series import (
    build_index_series,
    build_multi_team_series,
    build_win_pct_series,
)

__all__ = [
    'RANGE_LABELS',
    'RangeQuery',
    'resolve_range',
    'ChartResolution',
    'aggregate_points',
    'resolve_profile',
    'build_index_series',
    'build_multi_team_series',
    'build_win_pct_series',
]
