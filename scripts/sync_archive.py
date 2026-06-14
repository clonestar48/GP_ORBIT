#!/usr/bin/env python3
"""Sync multiple NBA seasons + merge into data/games-archive.json.

Usage:
  python3 scripts/sync_archive.py --dry-run --season-years 2021 2022 2023 2024 2025
  python3 scripts/sync_archive.py --provider nba_api --season-years 2021 2022 2023 2024 2025
  python3 scripts/sync_archive.py --skip-existing --include-playoffs --season-years 2021 2022 2023 2024 2025

Each season-year is the NBA season *start* year:
  2021 → 2021-22 → data/games-2022.json + data/games-2022-playoffs.json
  2024 → 2024-25 → data/games-2025.json + data/games-2025-playoffs.json
  2025 → 2025-26 → data/games-2026.json + data/games-2026-playoffs.json

Requires: pip install nba_api
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.ingest.archive import merge_games_documents, validate_archive  # noqa: E402
from lib.ingest.env import load_dotenv  # noqa: E402
from lib.ingest.nba_api import SEASON_TYPE_PLAYOFFS, SEASON_TYPE_REGULAR  # noqa: E402
from lib.ingest.seasons import playoffs_output_path, season_output_path  # noqa: E402
from lib.ingest.sync_season import sync_nba_api_season  # noqa: E402

DEFAULT_ARCHIVE = ROOT / 'data' / 'games-archive.json'
DEFAULT_SEASON_YEARS = [2021, 2022, 2023, 2024, 2025]


def _format_bytes(size: int) -> str:
    if size < 1024:
        return f'{size} B'
    if size < 1024 * 1024:
        return f'{size / 1024:.1f} KB'
    return f'{size / (1024 * 1024):.2f} MB'


def _print_season_report(report: dict) -> None:
    label = report.get('seasonLabel', '?')
    season_type = report.get('seasonType', SEASON_TYPE_REGULAR)
    print(f'  {label} ({season_type}): {report.get("gameCount", 0)} games · '
          f'{report.get("dateStart")} → {report.get("dateEnd")} · '
          f'{report.get("teams", 0)} teams', end='')
    if report.get('complete'):
        print(' · complete')
    else:
        print(f' · INCOMPLETE — {report.get("warning")}')


def _print_archive_report(document: dict, validation: dict, archive_path: Path) -> None:
    summary = validation['summary']
    print('\n=== Combined archive ===')
    print(f'Path:      {archive_path.relative_to(ROOT)}')
    print(f'Label:     {document.get("label")}')
    print(f'Games:     {summary["games"]} '
          f'(regular {validation.get("regularSeasonGames", 0)} · '
          f'playoffs {validation.get("playoffGames", 0)})')
    print(f'Rows:      {summary["rows"]}')
    print(f'Date span: {summary["dateStart"]} → {summary["dateEnd"]}')
    print(f'Regular:   {validation.get("regularDateSpan", [None, None])[0]} → '
          f'{validation.get("regularDateSpan", [None, None])[1]}')
    print(f'Playoffs:  {validation.get("playoffDateSpan", [None, None])[0]} → '
          f'{validation.get("playoffDateSpan", [None, None])[1]}')
    print(f'Latest playoff date: {validation.get("latestPlayoffDate") or "—"}')
    print(f'Teams:     {summary["teams"]}')
    print(f'Seasons:   {len(document.get("seasons") or [])}')
    print('Per season block:')
    for s in document.get('seasons') or []:
        _print_season_report(s)
    print(f'Games/season breakdown: {validation.get("gamesPerSeason")}')
    print(f'By season type: {validation.get("gamesPerSeasonByType")}')
    print(f'Team game counts: {validation.get("teamGameCountRange")} (min–max per team)')
    print(f'Duplicate row IDs: {validation.get("duplicateRowIds", 0)}')
    print(f'All 30 teams: {"yes" if validation.get("allTeamsPresent") else "no"}')
    print(f'Validation: {"OK" if validation.get("valid") else "FAILED"}')
    if validation.get('errors'):
        for err in validation['errors'][:8]:
            print(f'  - {err}')
    if archive_path.is_file():
        print(f'File size: {_format_bytes(archive_path.stat().st_size)}')


def _load_or_sync_season(
    *,
    season_year: int,
    season_type: str,
    out_path: Path,
    skip_existing: bool,
    dry_run: bool,
    warnings: list[str],
) -> dict | None:
    tag = season_type.lower()
    print(f'\n--- Season {season_year} ({tag}) → {out_path.relative_to(ROOT)} ---')

    if skip_existing and out_path.is_file():
        print('  Loading existing file (--skip-existing)')
        with out_path.open(encoding='utf-8') as fh:
            doc = json.load(fh)
        for s in doc.get('seasons') or []:
            if s.get('warning'):
                warnings.append(f'{s.get("seasonLabel")} ({s.get("seasonType")}): {s["warning"]}')
        return doc

    document, season_report, validation_errors, stats = sync_nba_api_season(
        season_year,
        season_type=season_type,
    )
    _print_season_report(season_report)
    if stats.get('seriesGames') is not None and season_type == SEASON_TYPE_PLAYOFFS:
        print(f'  Series index: {stats.get("seriesGames", 0)} games · skipped {stats.get("skipped", 0)} raw rows')

    if validation_errors:
        msg = (
            f'{season_report["seasonLabel"]} ({season_report["seasonType"]}): '
            f'{len(validation_errors)} validation error(s)'
        )
        warnings.append(msg)
        print(f'  Validation FAILED ({len(validation_errors)} errors)')
        for err in validation_errors[:5]:
            print(f'    - {err}')
        if not dry_run:
            raise SystemExit(f'Validation failed for {season_report["seasonLabel"]} ({season_type})')

    if season_report.get('warning'):
        warnings.append(
            f'{season_report["seasonLabel"]} ({season_report["seasonType"]}): {season_report["warning"]}',
        )

    if not dry_run:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open('w', encoding='utf-8') as fh:
            json.dump(document, fh, indent=2)
            fh.write('\n')
        print(f'  Wrote {out_path.relative_to(ROOT)} ({_format_bytes(out_path.stat().st_size)})')

    return document


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Sync multiple NBA seasons and merge into games-archive.json',
    )
    parser.add_argument(
        '--provider',
        choices=('nba_api',),
        default='nba_api',
        help='Ingest source (default: nba_api)',
    )
    parser.add_argument(
        '--season-years',
        nargs='+',
        type=int,
        default=DEFAULT_SEASON_YEARS,
        metavar='YEAR',
        help='Season start years (default: 2021 2022 2023 2024 2025)',
    )
    parser.add_argument(
        '--archive-output',
        type=Path,
        default=DEFAULT_ARCHIVE,
        help=f'Combined archive path (default: {DEFAULT_ARCHIVE.relative_to(ROOT)})',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Fetch and validate without writing files',
    )
    parser.add_argument(
        '--skip-existing',
        action='store_true',
        help='Load existing season files instead of re-fetching when present',
    )
    parser.add_argument(
        '--include-playoffs',
        action=argparse.BooleanOptionalAction,
        default=True,
        help='Sync playoff archives alongside regular season (default: on)',
    )
    parser.add_argument(
        '--playoffs-only',
        action='store_true',
        help='Only sync playoff files (never re-fetch regular season)',
    )
    args = parser.parse_args()

    load_dotenv(ROOT)
    season_years = sorted(set(args.season_years))
    documents: list[dict] = []
    warnings: list[str] = []

    print(f'Syncing {len(season_years)} season(s): {", ".join(str(y) for y in season_years)}')
    if args.include_playoffs:
        print('Including playoff archives (separate files per season)')

    if args.provider != 'nba_api':
        raise SystemExit('Only nba_api is supported for multi-season archive sync.')

    for season_year in season_years:
        if not args.playoffs_only:
            regular_path = season_output_path(season_year, ROOT)
            regular_doc = _load_or_sync_season(
                season_year=season_year,
                season_type=SEASON_TYPE_REGULAR,
                out_path=regular_path,
                skip_existing=args.skip_existing,
                dry_run=args.dry_run,
                warnings=warnings,
            )
            if regular_doc:
                documents.append(regular_doc)

        if args.include_playoffs:
            playoff_path = playoffs_output_path(season_year, ROOT)
            playoff_doc = _load_or_sync_season(
                season_year=season_year,
                season_type=SEASON_TYPE_PLAYOFFS,
                out_path=playoff_path,
                skip_existing=args.skip_existing,
                dry_run=args.dry_run,
                warnings=warnings,
            )
            if playoff_doc:
                documents.append(playoff_doc)

    archive = merge_games_documents(documents)
    validation = validate_archive(archive)

    if args.dry_run:
        print('\nDry run — combined archive not written.')
        _print_archive_report(archive, validation, args.archive_output)
        return

    args.archive_output.parent.mkdir(parents=True, exist_ok=True)
    with args.archive_output.open('w', encoding='utf-8') as fh:
        json.dump(archive, fh, indent=2)
        fh.write('\n')

    _print_archive_report(archive, validation, args.archive_output)

    if warnings:
        print('\n=== Season warnings ===')
        for w in warnings:
            print(f'  - {w}')

    print('\nSet locally: ORBIT_GAMES_PATH=data/games-archive.json')


if __name__ == '__main__':
    main()
