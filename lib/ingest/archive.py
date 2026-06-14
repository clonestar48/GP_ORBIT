"""Merge and validate multi-season NBA game archives."""

from __future__ import annotations

import time
from collections import Counter, defaultdict
from typing import Any

from .seasons import (
    REGULAR_SEASON_GAME_COUNT,
    SEASON_TYPE_PLAYOFFS,
    SEASON_TYPE_REGULAR,
    season_label,
)
from .validate import NBA_TEAM_IDS, summarize_games, validate_games_batch


def _game_base_id(row_id: str) -> str:
    return row_id.rsplit('-', 1)[0]


def _season_meta_key(entry: dict[str, Any]) -> tuple[int, str]:
    return (
        int(entry['seasonStartYear']),
        entry.get('seasonType') or SEASON_TYPE_REGULAR,
    )


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

    has_playoffs = any(
        (m.get('seasonType') or SEASON_TYPE_REGULAR) == SEASON_TYPE_PLAYOFFS
        for m in season_meta
    ) or any(g.get('seasonType') == SEASON_TYPE_PLAYOFFS for g in merged_games)
    has_regular = any(
        (m.get('seasonType') or SEASON_TYPE_REGULAR) == SEASON_TYPE_REGULAR
        for m in season_meta
    ) or any(
        g.get('seasonType') in (None, SEASON_TYPE_REGULAR) for g in merged_games
    )
    scope = 'regular + playoffs' if has_regular and has_playoffs else (
        'playoffs' if has_playoffs else 'regular season'
    )

    if len(labels) == 1:
        label = f'NBA {labels[0]} {scope} ({provider})'
    elif labels:
        label = f'NBA multi-season archive ({labels[0]} through {labels[-1]}, {scope}, {provider})'
    else:
        label = f'NBA multi-season archive ({scope}, {provider})'

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
    by_key: dict[tuple[int, str], dict[str, Any]] = {}
    for entry in season_meta:
        if isinstance(entry, dict) and entry.get('seasonStartYear') is not None:
            by_key[_season_meta_key(entry)] = entry
    if not by_key:
        counts: dict[tuple[int, str], int] = Counter()
        dates: dict[tuple[int, str], list[str]] = defaultdict(list)
        for row in games:
            year = row.get('season')
            if year is None:
                continue
            season_type = row.get('seasonType') or SEASON_TYPE_REGULAR
            key = (int(year), season_type)
            counts[key] += 1
            dates[key].append(row['date'][:10])
        for key, count in sorted(counts.items()):
            year, season_type = key
            game_count = count // 2 if count else 0
            ds = sorted(set(dates[key]))
            expected = (
                REGULAR_SEASON_GAME_COUNT
                if season_type == SEASON_TYPE_REGULAR
                else None
            )
            by_key[key] = {
                'seasonStartYear': year,
                'seasonLabel': season_label(year),
                'seasonType': season_type,
                'gameCount': game_count,
                'dateStart': ds[0] if ds else None,
                'dateEnd': ds[-1] if ds else None,
                'complete': (
                    game_count >= REGULAR_SEASON_GAME_COUNT - 30
                    if season_type == SEASON_TYPE_REGULAR
                    else game_count >= 60
                ),
                **({'expectedGames': expected} if expected else {}),
            }
    return [by_key[k] for k in sorted(by_key.keys())]


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
    by_season_type: dict[str, int] = Counter()
    by_team: dict[str, int] = Counter()
    playoff_dates: list[str] = []
    regular_dates: list[str] = []

    for row in games:
        if row.get('season') is not None:
            by_season[int(row['season'])] += 1
        season_type = row.get('seasonType') or SEASON_TYPE_REGULAR
        by_season_type[season_type] += 1
        by_team[row['team']] += 1
        date = row['date'][:10]
        if season_type == SEASON_TYPE_PLAYOFFS:
            playoff_dates.append(date)
        else:
            regular_dates.append(date)

    season_games = {year: count // 2 for year, count in by_season.items()}
    season_type_games = {k: v // 2 for k, v in by_season_type.items()}
    team_games = dict(by_team)
    teams_with_games = len(team_games)
    min_team_games = min(team_games.values()) if team_games else 0
    max_team_games = max(team_games.values()) if team_games else 0

    bases = {_game_base_id(g['id']) for g in games}
    duplicate_rows = len(games) - len({g['id'] for g in games})

    games_per_season_type: dict[str, dict[int, int]] = defaultdict(dict)
    for row in games:
        year = row.get('season')
        if year is None:
            continue
        season_type = row.get('seasonType') or SEASON_TYPE_REGULAR
        bucket = games_per_season_type[season_type]
        bucket[int(year)] = bucket.get(int(year), 0) + 1
    games_per_season_type = {
        st: {y: c // 2 for y, c in sorted(years.items())}
        for st, years in games_per_season_type.items()
    }

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
        'gamesPerSeasonByType': games_per_season_type,
        'regularSeasonGames': season_type_games.get(SEASON_TYPE_REGULAR, 0),
        'playoffGames': season_type_games.get(SEASON_TYPE_PLAYOFFS, 0),
        'latestPlayoffDate': max(playoff_dates) if playoff_dates else None,
        'regularDateSpan': [
            min(regular_dates) if regular_dates else None,
            max(regular_dates) if regular_dates else None,
        ],
        'playoffDateSpan': [
            min(playoff_dates) if playoff_dates else None,
            max(playoff_dates) if playoff_dates else None,
        ],
        'teamGameCountRange': [min_team_games, max_team_games],
        'seasons': document.get('seasons') or [],
    }
