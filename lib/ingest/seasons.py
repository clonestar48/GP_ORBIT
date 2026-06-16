"""NBA season naming — start year → file label and output path."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

# Regular season: 30 teams × 82 games ÷ 2
REGULAR_SEASON_GAME_COUNT = 1230
REGULAR_SEASON_COMPLETE_THRESHOLD = 1200

SEASON_TYPE_REGULAR = 'Regular Season'
SEASON_TYPE_PLAYOFFS = 'Playoffs'

# Full NBA postseason is typically 80–87 completed games (source-driven, not fixed).
PLAYOFF_SEASON_TYPICAL_GAME_COUNT = 84
PLAYOFF_SEASON_COMPLETE_THRESHOLD = 60


def season_label(season_start_year: int) -> str:
    end = str(season_start_year + 1)[-2:]
    return f'{season_start_year}-{end}'


def season_output_path(season_start_year: int, root: Path | None = None) -> Path:
    """season-year 2024 → data/games-2025.json (ending calendar year of the season)."""
    base = root or ROOT
    return base / 'data' / f'games-{season_start_year + 1}.json'


def playoffs_output_path(season_start_year: int, root: Path | None = None) -> Path:
    """season-year 2024 → data/games-2025-playoffs.json."""
    base = root or ROOT
    return base / 'data' / f'games-{season_start_year + 1}-playoffs.json'


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
    season_type: str = SEASON_TYPE_REGULAR,
) -> dict:
    """Report whether a season pull looks complete (no faking)."""
    from .validate import summarize_games

    summary = summarize_games(games)
    game_count = summary['games']
    if season_type == SEASON_TYPE_PLAYOFFS:
        return assess_playoff_completeness(
            games,
            season_start_year=season_start_year,
            summary=summary,
        )

    complete = game_count >= REGULAR_SEASON_COMPLETE_THRESHOLD
    return {
        'seasonStartYear': season_start_year,
        'seasonLabel': season_label(season_start_year),
        'seasonType': SEASON_TYPE_REGULAR,
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


def assess_playoff_completeness(
    games: list[dict],
    *,
    season_start_year: int,
    summary: dict | None = None,
) -> dict:
    """Report playoff pull completeness — counts vary by round length; never fabricate."""
    from .validate import summarize_games

    summary = summary or summarize_games(games)
    game_count = summary['games']
    complete = game_count >= PLAYOFF_SEASON_COMPLETE_THRESHOLD
    return {
        'seasonStartYear': season_start_year,
        'seasonLabel': season_label(season_start_year),
        'seasonType': SEASON_TYPE_PLAYOFFS,
        'gameCount': game_count,
        'rowCount': summary['rows'],
        'dateStart': summary['dateStart'],
        'dateEnd': summary['dateEnd'],
        'teams': summary['teams'],
        'teamList': summary['teamList'],
        'expectedGames': PLAYOFF_SEASON_TYPICAL_GAME_COUNT,
        'complete': complete,
        'warning': None if complete else (
            f'Only {game_count} playoff games (typical full postseason is ~{PLAYOFF_SEASON_TYPICAL_GAME_COUNT})'
        ),
    }
