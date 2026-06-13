#!/usr/bin/env python3
"""Generate synthetic NBA demo league data for Orbit performance UI stress-testing.

Creates normalized game rows (two per game) for all 30 NBA teams across multiple
regular seasons. Development data only — not historically accurate.

Usage:
  python3 scripts/generate_demo_league.py --dry-run
  python3 scripts/generate_demo_league.py --dry-run --seed 42 --seasons 10
  python3 scripts/generate_demo_league.py --seed 42 --seasons 10
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.ingest.schema import (  # noqa: E402
    NORMALIZED_GAME_FIELDS,
    validate_game,
)

DEFAULT_TEAMS_PATH = ROOT / 'data' / 'demo-teams.json'
DEFAULT_GAMES_PATH = ROOT / 'data' / 'demo-games.json'
GAMES_PER_TEAM = 82
LEAGUE = 'NBA'


def reference_date() -> date:
    return date.today()


def current_season_year(ref: date) -> int:
    """NBA season start year (Oct–Jun window)."""
    return ref.year if ref.month >= 10 else ref.year - 1


def _slug_part(a: str, b: str) -> str:
    pair = sorted([a.lower(), b.lower()])
    return f'{pair[0]}-{pair[1]}'


def _row_id(game_date: str, home: str, away: str, seq: int, team: str) -> str:
    slug = _slug_part(home, away)
    return f'{game_date}-{slug}-{seq:04d}-{team}'


def _season_calendar(season_year: int, ref: date) -> list[date]:
    """Regular-season slot dates: mid-Oct through mid-Apr (current season through ref)."""
    start = date(season_year, 10, 15)
    end = date(season_year + 1, 4, 15)
    if season_year == current_season_year(ref):
        end = max(end, ref)
    if end < start:
        return []
    days: list[date] = []
    cursor = start
    while cursor <= end:
        days.append(cursor)
        cursor += timedelta(days=1)
    return days


def _build_season_matchups(
    team_ids: list[str],
    games_per_team: int,
    rng: random.Random,
) -> list[tuple[str, str]]:
    """Round-based pairing so every team plays exactly ``games_per_team`` games."""
    matchups: list[tuple[str, str]] = []
    for _ in range(games_per_team):
        pool = list(team_ids)
        rng.shuffle(pool)
        paired: set[str] = set()
        for team in pool:
            if team in paired:
                continue
            opponents = [o for o in pool if o != team and o not in paired]
            if not opponents:
                continue
            opp = rng.choice(opponents)
            matchups.append((team, opp))
            paired.add(team)
            paired.add(opp)
    return matchups


def _generate_scores(rng: random.Random) -> tuple[int, int]:
    home = rng.randint(96, 128)
    away = rng.randint(96, 128)
    if home == away:
        home += rng.choice([-1, 1])
    return home, away


def _make_game_rows(
    game_date: date,
    season: int,
    home: str,
    away: str,
    seq: int,
    rng: random.Random,
) -> list[dict[str, Any]]:
    iso = game_date.isoformat()
    home_score, away_score = _generate_scores(rng)
    return [
        {
            'id': _row_id(iso, home, away, seq, home),
            'date': iso,
            'season': season,
            'league': LEAGUE,
            'team': home,
            'opponent': away,
            'teamScore': home_score,
            'opponentScore': away_score,
            'result': 'W' if home_score > away_score else 'L',
        },
        {
            'id': _row_id(iso, home, away, seq, away),
            'date': iso,
            'season': season,
            'league': LEAGUE,
            'team': away,
            'opponent': home,
            'teamScore': away_score,
            'opponentScore': home_score,
            'result': 'W' if away_score > home_score else 'L',
        },
    ]


def generate_season_games(
    team_ids: list[str],
    season_year: int,
    rng: random.Random,
    ref: date,
    games_per_team: int = GAMES_PER_TEAM,
) -> list[dict[str, Any]]:
    calendar = _season_calendar(season_year, ref)
    if not calendar:
        return []

    matchups = _build_season_matchups(team_ids, games_per_team, rng)

    total_games = len(matchups)
    day_slots: list[date] = []
    for idx in range(total_games):
        day_slots.append(calendar[(idx * len(calendar)) // total_games])

    rows: list[dict[str, Any]] = []
    seq_by_date: Counter[str] = Counter()
    for slot, (team_a, team_b) in zip(day_slots, matchups):
        home, away = (team_a, team_b) if rng.random() < 0.5 else (team_b, team_a)
        iso = slot.isoformat()
        seq_by_date[iso] += 1
        rows.extend(_make_game_rows(slot, season_year, home, away, seq_by_date[iso], rng))

    return rows


def load_teams(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise SystemExit(f'Teams file not found: {path}')
    doc = json.loads(path.read_text(encoding='utf-8'))
    teams = doc.get('teams', [])
    if not teams:
        raise SystemExit(f'No teams in {path}')
    return teams


def validate_teams(teams: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    ids = [t.get('id', '').upper() for t in teams]
    if len(ids) != len(set(ids)):
        errors.append('duplicate team ids')
    if len(teams) != 30:
        errors.append(f'expected 30 teams, found {len(teams)}')
    required = ('id', 'league', 'name', 'abbreviation', 'city', 'colors')
    for team in teams:
        for key in required:
            if key not in team:
                errors.append(f"team {team.get('id', '?')} missing field: {key}")
        if team.get('league', '').upper() != LEAGUE:
            errors.append(f"team {team.get('id')} league must be {LEAGUE}")
        if not team.get('colors', {}).get('primary'):
            errors.append(f"team {team.get('id')} missing colors.primary")
    return errors


def validate_demo_games(
    games: list[dict[str, Any]],
    team_ids: set[str],
    games_per_team: int,
    seasons: list[int],
) -> list[str]:
    errors: list[str] = []

    for row in games:
        errors.extend(validate_game(row))
        for key in NORMALIZED_GAME_FIELDS:
            if key not in row:
                continue
        if row['team'] not in team_ids:
            errors.append(f"unknown team in row: {row['team']}")
        if row['opponent'] not in team_ids:
            errors.append(f"unknown opponent in row: {row['opponent']}")
        if row['team'] == row['opponent']:
            errors.append(f"self matchup: {row['id']}")

    ids = [g['id'] for g in games]
    if len(ids) != len(set(ids)):
        dupes = [item for item, count in Counter(ids).items() if count > 1]
        errors.append(f'duplicate row ids ({len(dupes)}), e.g. {dupes[:3]}')

    by_base: dict[str, list[dict]] = defaultdict(list)
    for row in games:
        base = row['id'].rsplit('-', 1)[0]
        by_base[base].append(row)

    for base, pair in by_base.items():
        if len(pair) != 2:
            errors.append(f'game {base} has {len(pair)} rows (expected 2)')
            continue
        a, b = pair
        if a['team'] == b['team']:
            errors.append(f'game {base} duplicate team perspective')
        if a['team'] != b['opponent'] or b['team'] != a['opponent']:
            errors.append(f'game {base} opponent mismatch')
        if a['teamScore'] != b['opponentScore'] or b['teamScore'] != a['opponentScore']:
            errors.append(f'game {base} score mismatch')
        if a['date'] != b['date'] or a['season'] != b['season']:
            errors.append(f'game {base} date/season mismatch')
        for row in pair:
            won = row['teamScore'] > row['opponentScore']
            if (row['result'] == 'W') != won:
                errors.append(f"game {base} result/score mismatch for {row['team']}")

    per_team_season: Counter[tuple[str, int]] = Counter()
    for row in games:
        per_team_season[(row['team'], row['season'])] += 1

    for season in seasons:
        for tid in team_ids:
            count = per_team_season[(tid, season)]
            if count != games_per_team:
                errors.append(
                    f'{tid} season {season}: {count} games (expected {games_per_team})',
                )

    return errors


def build_games_document(games: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        'source': 'demo',
        'label': 'Historical performance demo data',
        'games': games,
    }


def build_teams_document(teams: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        'source': 'demo',
        'teams': teams,
    }


def generate_league(
    teams: list[dict[str, Any]],
    *,
    seasons: int,
    start_season: int | None,
    end_season: int | None,
    seed: int,
    games_per_team: int,
    ref: date,
) -> tuple[list[dict[str, Any]], list[int]]:
    rng = random.Random(seed)
    team_ids = sorted(t['id'].upper() for t in teams)

    if end_season is None:
        end_season = current_season_year(ref)
    if start_season is None:
        start_season = end_season - seasons + 1

    season_years = list(range(start_season, end_season + 1))
    if len(season_years) != seasons:
        raise SystemExit(
            f'Season span {start_season}–{end_season} is {len(season_years)} seasons, '
            f'expected {seasons}',
        )

    all_rows: list[dict[str, Any]] = []
    for season_year in season_years:
        all_rows.extend(
            generate_season_games(team_ids, season_year, rng, ref, games_per_team),
        )

    all_rows.sort(key=lambda r: (r['date'], r['id']))
    return all_rows, season_years


def _human_bytes(num: int) -> str:
    if num < 1024:
        return f'{num} B'
    if num < 1024 * 1024:
        return f'{num / 1024:.1f} KB'
    return f'{num / (1024 * 1024):.2f} MB'


def print_summary(
    *,
    teams: list[dict[str, Any]],
    games: list[dict[str, Any]],
    season_years: list[int],
    validation_errors: list[str],
    teams_path: Path,
    games_path: Path,
    dry_run: bool,
) -> None:
    unique_games = len({g['id'].rsplit('-', 1)[0] for g in games})
    dates = [g['date'] for g in games]
    teams_in_games = sorted({g['team'] for g in games})

    print('')
    print('=== Demo league generation summary ===')
    print(f'Mode:              {"dry-run (no files written)" if dry_run else "write"}')
    print(f'Teams:             {len(teams)} ({len(teams_in_games)} with games)')
    print(f'Seasons:           {season_years[0]}–{season_years[-1]} ({len(season_years)} seasons)')
    print(f'Game rows:         {len(games):,}')
    print(f'Unique games:      {unique_games:,}')
    print(f'Rows per team:     ~{len(games) // max(len(teams_in_games), 1):,}')
    if dates:
        print(f'Date span:         {min(dates)} → {max(dates)}')
    print(f'Teams file:        {teams_path.relative_to(ROOT)} ({_human_bytes(teams_path.stat().st_size) if teams_path.is_file() else "n/a"})')
    print(f'Games file:        {games_path.relative_to(ROOT)} ({_human_bytes(games_path.stat().st_size) if games_path.is_file() else "n/a"})')
    print(f'Validation:        {"PASS" if not validation_errors else f"FAIL ({len(validation_errors)} errors)"}')
    if validation_errors:
        print('First errors:')
        for err in validation_errors[:12]:
            print(f'  - {err}')
        if len(validation_errors) > 12:
            print(f'  … and {len(validation_errors) - 12} more')
    print('====================================')


def write_json(path: Path, document: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as fh:
        json.dump(document, fh, indent=2)
        fh.write('\n')


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Generate synthetic 30-team NBA demo league data.',
    )
    parser.add_argument(
        '--teams-input',
        type=Path,
        default=DEFAULT_TEAMS_PATH,
        help='Existing team metadata to preserve (default: data/demo-teams.json)',
    )
    parser.add_argument(
        '--teams-output',
        type=Path,
        default=DEFAULT_TEAMS_PATH,
        help='Teams output path (default: data/demo-teams.json)',
    )
    parser.add_argument(
        '--games-output',
        type=Path,
        default=DEFAULT_GAMES_PATH,
        help='Games output path (default: data/demo-games.json)',
    )
    parser.add_argument(
        '--seasons',
        type=int,
        default=10,
        help='Number of seasons to generate (default: 10)',
    )
    parser.add_argument(
        '--start-season',
        type=int,
        default=None,
        help='First season start year (default: end-season − seasons + 1)',
    )
    parser.add_argument(
        '--end-season',
        type=int,
        default=None,
        help='Last season start year (default: current NBA season)',
    )
    parser.add_argument(
        '--games-per-team',
        type=int,
        default=GAMES_PER_TEAM,
        help=f'Regular-season games per team per season (default: {GAMES_PER_TEAM})',
    )
    parser.add_argument(
        '--seed',
        type=int,
        default=42,
        help='RNG seed for reproducible schedules/scores (default: 42)',
    )
    parser.add_argument(
        '--reference-date',
        type=str,
        default=None,
        help='Override reference date YYYY-MM-DD (default: today)',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Validate and print summary without writing files',
    )
    parser.add_argument(
        '--skip-teams-write',
        action='store_true',
        help='Do not rewrite demo-teams.json (validate only)',
    )
    args = parser.parse_args()

    ref = date.fromisoformat(args.reference_date) if args.reference_date else reference_date()
    teams = load_teams(args.teams_input)
    team_errors = validate_teams(teams)
    if team_errors:
        raise SystemExit(
            'Team validation failed:\n  ' + '\n  '.join(team_errors[:10]),
        )

    games, season_years = generate_league(
        teams,
        seasons=args.seasons,
        start_season=args.start_season,
        end_season=args.end_season,
        seed=args.seed,
        games_per_team=args.games_per_team,
        ref=ref,
    )

    team_ids = {t['id'].upper() for t in teams}
    validation_errors = validate_demo_games(
        games,
        team_ids,
        args.games_per_team,
        season_years,
    )

    if validation_errors:
        print_summary(
            teams=teams,
            games=games,
            season_years=season_years,
            validation_errors=validation_errors,
            teams_path=args.teams_output,
            games_path=args.games_output,
            dry_run=args.dry_run,
        )
        raise SystemExit(1)

    if args.dry_run:
        print_summary(
            teams=teams,
            games=games,
            season_years=season_years,
            validation_errors=[],
            teams_path=args.teams_output,
            games_path=args.games_output,
            dry_run=True,
        )
        if games:
            print('\nSample row:')
            print(json.dumps(games[0], indent=2))
        return

    if not args.skip_teams_write:
        write_json(args.teams_output, build_teams_document(teams))

    write_json(args.games_output, build_games_document(games))

    print_summary(
        teams=teams,
        games=games,
        season_years=season_years,
        validation_errors=[],
        teams_path=args.teams_output,
        games_path=args.games_output,
        dry_run=False,
    )


if __name__ == '__main__':
    main()
