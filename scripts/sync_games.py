#!/usr/bin/env python3
"""Offline NBA game sync → normalized data/games-YYYY.json (not wired to frontend by default).

Usage:
  python3 scripts/sync_games.py --dry-run
  python3 scripts/sync_games.py --dry-run --provider nba_api --season-year 2024
  python3 scripts/sync_games.py --provider nba_api --season-year 2024
  python3 scripts/sync_games.py --provider balldontlie --season-year 2024 --full

Multi-season archive: use scripts/sync_archive.py

Requires BALLDONTLIE_API_KEY in .env when using --provider balldontlie.
nba_api provider needs: pip install nba_api
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.ingest.balldontlie import collect_balldontlie_games  # noqa: E402
from lib.ingest.env import balldontlie_api_key, load_dotenv  # noqa: E402
from lib.ingest.schema import build_games_document  # noqa: E402
from lib.ingest.seasons import season_output_path  # noqa: E402
from lib.ingest.sync_season import sync_nba_api_season  # noqa: E402
from lib.ingest.validate import summarize_games, validate_games_batch  # noqa: E402


def _format_bytes(size: int) -> str:
    if size < 1024:
        return f'{size} B'
    if size < 1024 * 1024:
        return f'{size / 1024:.1f} KB'
    return f'{size / (1024 * 1024):.2f} MB'


def _print_report(
    document: dict,
    stats: dict,
    summary: dict,
    validation_errors: list[str],
    season_report: dict | None = None,
    file_size: int | None = None,
) -> None:
    print(f"Source:    {document.get('provider')}")
    print(f"Label:     {document.get('label')}")
    if season_report:
        print(f"Season:    {season_report.get('seasonLabel')} "
              f'({"complete" if season_report.get("complete") else "incomplete"})')
    if stats:
        print(f"Pages:     {stats.get('pages', 0)}")
        print(f"Raw games: {stats.get('rawGames', 0)}")
        print(f"Skipped:   {stats.get('skipped', 0)}")
    print(f"Games:     {summary['games']}")
    print(f"Rows:      {summary['rows']}")
    print(f"Date span: {summary['dateStart']} → {summary['dateEnd']}")
    print(f"Teams:     {summary['teams']}")
    if summary['teamList']:
        print(f"Team list: {', '.join(summary['teamList'])}")
    print(f"Synced at: {document.get('syncedAt')}")
    if file_size is not None:
        print(f"File size: {_format_bytes(file_size)}")
    if season_report and season_report.get('warning'):
        print(f"Warning:   {season_report['warning']}")
    if validation_errors:
        print(f'Validation: FAILED ({len(validation_errors)} errors)')
        for err in validation_errors[:10]:
            print(f'  - {err}')
    else:
        print('Validation: OK')


def sync_balldontlie(args: argparse.Namespace) -> dict:
    api_key = balldontlie_api_key()
    if not api_key:
        raise SystemExit(
            'BALLDONTLIE_API_KEY is not set. Add it to .env (see .env.example).',
        )

    seasons = [int(s) for s in args.season_year] if args.season_year else [2024]
    max_pages = None if args.full else args.max_pages

    rows, stats = collect_balldontlie_games(
        api_key,
        max_pages=max_pages,
        per_page=args.per_page,
        seasons=seasons,
        postseason=False,
        start_date=args.start_date,
        end_date=args.end_date,
    )

    document = build_games_document(
        rows,
        source='balldontlie',
        label=f'NBA {seasons[0]}-{str(seasons[0] + 1)[-2:]} regular season (balldontlie)',
        provider='balldontlie',
    )
    document['_syncStats'] = stats
    return document


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Sync normalized NBA games into data/games-YYYY.json (offline).',
    )
    parser.add_argument(
        '--provider',
        choices=('balldontlie', 'nba_api'),
        default='nba_api',
        help='Ingest source (default: nba_api — no API key)',
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=None,
        help='Output path (default: data/games-{endYear}.json from --season-year)',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Fetch and validate without writing output file',
    )
    parser.add_argument(
        '--full',
        action='store_true',
        help='Fetch entire season (all API pages for balldontlie)',
    )
    parser.add_argument(
        '--max-pages',
        type=int,
        default=1,
        help='Maximum API pages when not using --full (default: 1 — smoke test)',
    )
    parser.add_argument(
        '--per-page',
        type=int,
        default=100,
        help='Games per API page for balldontlie (default: 100)',
    )
    parser.add_argument(
        '--season-year',
        action='append',
        type=int,
        metavar='YEAR',
        help='Season start year (default: 2024 → 2024-25 → games-2025.json). Repeatable for balldontlie.',
    )
    parser.add_argument(
        '--start-date',
        type=str,
        default=None,
        help='balldontlie: games on or after YYYY-MM-DD',
    )
    parser.add_argument(
        '--end-date',
        type=str,
        default=None,
        help='balldontlie: games on or before YYYY-MM-DD',
    )
    args = parser.parse_args()

    load_dotenv(ROOT)

    season_years = [int(s) for s in args.season_year] if args.season_year else [2024]
    if args.provider == 'nba_api' and len(season_years) != 1:
        raise SystemExit('nba_api provider supports one --season-year at a time. Use scripts/sync_archive.py for multiple seasons.')

    season_year = season_years[0]
    output = args.output or season_output_path(season_year, ROOT)

    if args.provider == 'balldontlie':
        document = sync_balldontlie(args)
        stats = document.pop('_syncStats', {})
        season_report = None
    else:
        document, season_report, validation_errors = sync_nba_api_season(season_year)
        stats = {}
        games = document.get('games', [])
        summary = summarize_games(games)
        _print_report(document, stats, summary, validation_errors, season_report)
        if validation_errors and not args.dry_run:
            raise SystemExit(
                f'Validation failed with {len(validation_errors)} error(s). '
                'Use --dry-run to inspect without writing.',
            )
        if args.dry_run:
            print('Dry run — no file written.')
            if games:
                print('Sample row:', json.dumps(games[0], indent=2))
            return
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open('w', encoding='utf-8') as fh:
            json.dump(document, fh, indent=2)
            fh.write('\n')
        print(f'Wrote {output.relative_to(ROOT)}')
        print(f'File size: {_format_bytes(output.stat().st_size)}')
        return

    stats = document.pop('_syncStats', {})
    games = document.get('games', [])
    summary = summarize_games(games)
    validation_errors = validate_games_batch(games)

    if validation_errors and not args.dry_run:
        raise SystemExit(
            f'Validation failed with {len(validation_errors)} error(s). '
            'Use --dry-run to inspect without writing.',
        )

    _print_report(document, stats, summary, validation_errors)

    if args.dry_run:
        print('Dry run — no file written.')
        if games:
            print('Sample row:', json.dumps(games[0], indent=2))
        return

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('w', encoding='utf-8') as fh:
        json.dump(document, fh, indent=2)
        fh.write('\n')
    file_size = output.stat().st_size
    print(f'Wrote {output.relative_to(ROOT)}')
    print(f'File size: {_format_bytes(file_size)}')


if __name__ == '__main__':
    main()
