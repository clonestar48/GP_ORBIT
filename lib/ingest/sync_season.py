"""Single-season sync helpers shared by sync_games.py and sync_archive.py."""

from __future__ import annotations

from typing import Any

from .nba_api import SEASON_TYPE_PLAYOFFS, SEASON_TYPE_REGULAR, collect_nba_api_games
from .schema import build_games_document
from .seasons import (
    annotate_season_metadata,
    assess_season_completeness,
    nba_api_season_string,
)


def sync_nba_api_season(
    season_start_year: int,
    *,
    season_type: str = SEASON_TYPE_REGULAR,
) -> tuple[dict[str, Any], dict[str, Any], list[str], dict[str, int]]:
    """Fetch one NBA season via nba_api. Returns (document, season_report, errors, stats)."""
    from .validate import validate_games_batch

    nba_season = nba_api_season_string(season_start_year)
    rows, stats = collect_nba_api_games(season=nba_season, season_type=season_type)
    rows = annotate_season_metadata(
        rows,
        season_start_year=season_start_year,
        season_type=season_type,
    )
    season_report = assess_season_completeness(
        rows,
        season_start_year=season_start_year,
        season_type=season_type,
    )

    if season_type == SEASON_TYPE_PLAYOFFS:
        doc_label = f'NBA {nba_season} playoffs (nba_api)'
    else:
        doc_label = f'NBA {nba_season} regular season (nba_api)'

    document = build_games_document(
        rows,
        source='nba_api',
        label=doc_label,
        provider='nba_api',
    )
    document['seasonStartYear'] = season_start_year
    document['seasonType'] = season_type
    document['seasons'] = [season_report]
    validation_errors = validate_games_batch(rows)
    return document, season_report, validation_errors, stats
