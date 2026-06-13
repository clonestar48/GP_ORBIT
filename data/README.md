# Orbit performance data

Historical game results for the Performance Market (`/odds/`). The frontend never calls sports APIs directly.

## Architecture

```text
balldontlie (or future nba_api)
        ↓
scripts/sync_games.py      ← offline, manual / cron
        ↓
data/games.json            ← normalized cache (optional; not default yet)
        ↓
LocalProvider              ← reads JSON from disk
        ↓
lib/performance/series.py  ← win % / index series
        ↓
/api/performance           ← slim JSON to frontend
```

**Default today:** `LocalProvider` serves `demo-games.json`. Sync output is separate until you opt in.

## 2024–25 season import (one-time)

Offline import for a single real NBA season — regular season only, two rows per game.

```bash
# Dry-run first (nba_api — no API key)
python3 scripts/sync_games.py --dry-run --provider nba_api --season-year 2024

# Write data/games-2025.json (does not touch demo-games.json)
pip install nba_api   # one-time, sync script only
python3 scripts/sync_games.py --provider nba_api --season-year 2024

# Alternative: balldontlie (requires BALLDONTLIE_API_KEY in .env)
python3 scripts/sync_games.py --dry-run --provider balldontlie --season-year 2024 --full
python3 scripts/sync_games.py --provider balldontlie --season-year 2024 --full
```

Validation checks: unique row IDs, mirrored pairs, W/L vs scores, known NBA teams, file size summary.

## Normalized game row

Each API game becomes **two rows** (home + visitor perspective), matching `demo-games.json`:

| Field | Type | Example |
|-------|------|---------|
| `id` | string | `2015-10-23-bos-mia-0028-BOS` |
| `date` | string (ISO date) | `2015-10-23` |
| `season` | int | `2015` |
| `league` | string | `NBA` |
| `team` | string | `BOS` |
| `opponent` | string | `MIA` |
| `teamScore` | int | `99` |
| `opponentScore` | int | `117` |
| `result` | `"W"` \| `"L"` | `L` |

Top-level document (`games.json`):

| Field | Description |
|-------|-------------|
| `source` | Ingest label, e.g. `balldontlie` |
| `label` | Human-readable description |
| `provider` | Provider key used for sync |
| `syncedAt` | UTC ISO timestamp of last sync |
| `games` | Array of normalized rows |

Schema helpers: `lib/ingest/schema.py`.

## Running a sync (scaffold)

1. Copy `.env.example` → `.env` and set `BALLDONTLIE_API_KEY` ([balldontlie.io](https://www.balldontlie.io/)).
2. Dry-run one page (no file written):

   ```bash
   python3 scripts/sync_games.py --dry-run
   ```

3. Write a small batch to `data/games.json`:

   ```bash
   python3 scripts/sync_games.py --max-pages 5 --season 2024
   ```

4. Full historical backfill (later, not run by default):

   ```bash
   python3 scripts/sync_games.py --max-pages 500
   ```

Use `--dry-run` first. Increase `--max-pages` gradually; do not sync the full archive until rate limits and storage are confirmed.

## Opting in (later)

When ready to serve synced data instead of demo data:

1. Set in `.env`:
   ```
   ORBIT_GAMES_PATH=data/games-2025.json
   ```
   Preset ranges auto-anchor to the **latest game date** in that file (no separate date env needed).

   Optional overrides:
   - `ORBIT_REFERENCE_DATE=2025-04-13` — fixed anchor
   - `ORBIT_REFERENCE_DATE=auto` — auto even when using default demo data
2. Restart `python3 serve.py`
3. Hard refresh the browser

No frontend or chart changes required.

## Chart resolution (range guardrails)

Shared preset profiles live in:

- `lib/performance/resolution.py` (server-side contract, future API aggregation)
- `odds/resolution.js` (frontend mirror — chart density, markers, ghost opponent)

Raw game rows in this folder stay at full game-level precision. Resolution only affects how series are rendered/summarized at broader ranges.

## Out of scope

- Live fetch on page load
- Raw provider payloads to the client
- Odds, spreads, or betting APIs
