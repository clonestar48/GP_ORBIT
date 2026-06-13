#!/usr/bin/env python3
"""Offline NBA game sync → normalized data/games.json (not wired to frontend by default).

Usage:
  python3 scripts/sync_games.py --dry-run
  python3 scripts/sync_games.py --dry-run --max-pages 2 --season 2024
  python3 scripts/sync_games.py --output data/games.json --max-pages 5

Requires BALLDONTLIE_API_KEY in .env when using --provider balldontlie.
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

DEFAULT_OUTPUT = ROOT / 'data' / 'games.json'


def sync_balldontlie(args: argparse.Namespace) -> dict:
    api_key = balldontlie_api_key()
    if not api_key:
        raise SystemExit(
            'BALLDONTLIE_API_KEY is not set. Add it to .env (see .env.example).',
        )

    seasons = [int(s) for s in args.season] if args.season else None
    rows, stats = collect_balldontlie_games(
        api_key,
        max_pages=args.max_pages,
        per_page=args.per_page,
        seasons=seasons,
    )

    document = build_games_document(
        rows,
        source='balldontlie',
        label='NBA historical games (balldontlie sync)',
        provider='balldontlie',
    )
    document['_syncStats'] = stats
    return document


def sync_nba_api(_args: argparse.Namespace) -> dict:
    raise SystemExit(
        'Provider nba_api is not implemented yet. Use --provider balldontlie.',
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Sync normalized NBA games into data/games.json (offline).',
    )
    parser.add_argument(
        '--provider',
        choices=('balldontlie', 'nba_api'),
        default='balldontlie',
        help='Ingest source (default: balldontlie)',
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f'Output path (default: {DEFAULT_OUTPUT.relative_to(ROOT)})',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Fetch and validate without writing output file',
    )
    parser.add_argument(
        '--max-pages',
        type=int,
        default=1,
        help='Maximum API pages to fetch (default: 1 — scaffold / smoke test)',
    )
    parser.add_argument(
        '--per-page',
        type=int,
        default=100,
        help='Games per API page (default: 100)',
    )
    parser.add_argument(
        '--season',
        action='append',
        type=int,
        metavar='YEAR',
        help='Limit to season start year (repeatable, e.g. --season 2024)',
    )
    args = parser.parse_args()

    load_dotenv(ROOT)

    if args.provider == 'balldontlie':
        document = sync_balldontlie(args)
    else:
        document = sync_nba_api(args)

    stats = document.pop('_syncStats', {})
    games = document.get('games', [])
    teams = {g['team'] for g in games}

    print(f"Provider:  {document.get('provider')}")
    print(f"Pages:     {stats.get('pages', 0)}")
    print(f"Raw games: {stats.get('rawGames', 0)}")
    print(f"Skipped:   {stats.get('skipped', 0)}")
    print(f"Rows:      {len(games)} ({len(teams)} teams in batch)")
    print(f"Synced at: {document.get('syncedAt')}")

    if args.dry_run:
        print('Dry run — no file written.')
        if games:
            sample = games[0]
            print('Sample row:', json.dumps(sample, indent=2))
        return

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('w', encoding='utf-8') as fh:
        json.dump(document, fh, indent=2)
        fh.write('\n')
    print(f'Wrote {args.output.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
