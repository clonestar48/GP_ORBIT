"""NBA season naming — start year → file label and output path."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

# Regular season: 30 teams × 82 games ÷ 2
REGULAR_SEASON_GAME_COUNT = 1230
REGULAR_SEASON_COMPLETE_THRESHOLD = 1200


def season_label(season_start_year: int) -> str:
    end = str(season_start_year + 1)[-2:]
    return f'{season_start_year}-{end}'


def season_output_path(season_start_year: int, root: Path | None = None) -> Path:
    """season-year 2024 → data/games-2025.json (ending calendar year of the season)."""
    base = root or ROOT
    return base / 'data' / f'games-{season_start_year + 1}.json'


def nba_api_season_string(season_start_year: int) -> str:
    return season_label(season_start_year)


def annotate_season_metadata(
    games: list[dict],
    *,
    season_start_year: int,
    season_type: str = 'Regular Season',
) -> list[dict]:
    label = season_label(season_start_year)
    out: list[dict] = []
    for row in games:
        enriched = {
            **row,
            'season': season_start_year,
            'seasonLabel': label,
            'seasonType': season_type,
        }
        out.append(enriched)
    return out


def assess_season_completeness(
    games: list[dict],
    *,
    season_start_year: int,
) -> dict:
    """Report whether a regular-season pull looks complete (no faking)."""
    from .validate import summarize_games

    summary = summarize_games(games)
    game_count = summary['games']
    complete = game_count >= REGULAR_SEASON_COMPLETE_THRESHOLD
    return {
        'seasonStartYear': season_start_year,
        'seasonLabel': season_label(season_start_year),
        'seasonType': 'Regular Season',
        'gameCount': game_count,
        'rowCount': summary['rows'],
        'dateStart': summary['dateStart'],
        'dateEnd': summary['dateEnd'],
        'teams': summary['teams'],
        'teamList': summary['teamList'],
        'expectedGames': REGULAR_SEASON_GAME_COUNT,
        'complete': complete,
        'warning': None if complete else (
            f'Only {game_count} games (expected ~{REGULAR_SEASON_GAME_COUNT} for a full regular season)'
        ),
    }
