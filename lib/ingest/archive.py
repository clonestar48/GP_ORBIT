"""Merge and validate multi-season NBA game archives."""

from __future__ import annotations

import time
from collections import Counter, defaultdict
from typing import Any

from .schema import validate_game
from .seasons import REGULAR_SEASON_GAME_COUNT, season_label
from .validate import NBA_TEAM_IDS, summarize_games, validate_games_batch


def _game_base_id(row_id: str) -> str:
    return row_id.rsplit('-', 1)[0]


def merge_games_documents(
    documents: list[dict[str, Any]],
    *,
    source: str = 'nba_api',
    provider: str = 'nba_api',
) -> dict[str, Any]:
    """Merge season documents into one chronologically sorted archive."""
    by_row_id: dict[str, dict[str, Any]] = {}
    season_meta: list[dict[str, Any]] = []

    for doc in documents:
        games = doc.get('games') or []
        if not games:
            continue
        seasons_block = doc.get('seasons')
        if isinstance(seasons_block, list) and seasons_block:
            season_meta.extend(seasons_block)
        for row in games:
            by_row_id[row['id']] = row

    merged_games = sorted(by_row_id.values(), key=lambda g: (g['date'], g['id']))
    labels = sorted({m.get('seasonLabel') for m in season_meta if m.get('seasonLabel')})
    if not labels and merged_games:
        labels = sorted({season_label(g['season']) for g in merged_games if g.get('season') is not None})

    if len(labels) == 1:
        label = f'NBA {labels[0]} regular season ({provider})'
    elif labels:
        label = f'NBA multi-season archive ({labels[0]} through {labels[-1]}, {provider})'
    else:
        label = f'NBA multi-season archive ({provider})'

    return {
        'source': source,
        'label': label,
        'provider': provider,
        'syncedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'seasons': _dedupe_season_meta(season_meta, merged_games),
        'games': merged_games,
    }


def _dedupe_season_meta(
    season_meta: list[Any],
    games: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_year: dict[int, dict[str, Any]] = {}
    for entry in season_meta:
        if isinstance(entry, dict) and entry.get('seasonStartYear') is not None:
            by_year[int(entry['seasonStartYear'])] = entry
    if not by_year:
        counts: dict[int, int] = Counter()
        dates: dict[int, list[str]] = defaultdict(list)
        for row in games:
            year = row.get('season')
            if year is None:
                continue
            counts[int(year)] += 1
            dates[int(year)].append(row['date'][:10])
        for year, count in sorted(counts.items()):
            game_count = count // 2 if count else 0
            ds = sorted(set(dates[year]))
            by_year[year] = {
                'seasonStartYear': year,
                'seasonLabel': season_label(year),
                'seasonType': 'Regular Season',
                'gameCount': game_count,
                'dateStart': ds[0] if ds else None,
                'dateEnd': ds[-1] if ds else None,
                'complete': game_count >= REGULAR_SEASON_GAME_COUNT - 30,
            }
    return [by_year[k] for k in sorted(by_year.keys())]


def validate_archive(
    document: dict[str, Any],
    *,
    expected_teams: int = 30,
) -> dict[str, Any]:
    """Full archive validation report."""
    games = document.get('games') or []
    errors = validate_games_batch(games)
    summary = summarize_games(games)

    by_season: dict[int, int] = Counter()
    by_team: dict[str, int] = Counter()
    for row in games:
        if row.get('season') is not None:
            by_season[int(row['season'])] += 1
        by_team[row['team']] += 1

    season_games = {year: count // 2 for year, count in by_season.items()}
    team_games = dict(by_team)
    teams_with_games = len(team_games)
    min_team_games = min(team_games.values()) if team_games else 0
    max_team_games = max(team_games.values()) if team_games else 0

    bases = {_game_base_id(g['id']) for g in games}
    duplicate_rows = len(games) - len({g['id'] for g in games})

    return {
        'valid': not errors,
        'errors': errors,
        'summary': summary,
        'uniqueGames': len(bases),
        'duplicateRowIds': duplicate_rows,
        'teamsWithGames': teams_with_games,
        'expectedTeams': expected_teams,
        'allTeamsPresent': teams_with_games >= expected_teams and all(
            t in team_games for t in NBA_TEAM_IDS
        ),
        'gamesPerSeason': dict(sorted(season_games.items())),
        'teamGameCountRange': [min_team_games, max_team_games],
        'seasons': document.get('seasons') or [],
    }
