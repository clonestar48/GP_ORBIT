"""Orchestrates the three data layers with strict provenance.

Modes:
  demo — no ODDS_API_KEY: serves /data/demo fabricated data, every event
         labeled source="demo" / dataConfidence="demo".
  live — real providers only (The Odds API for lines, ESPN for scores).
         Demo data is NEVER mixed into live responses. Missing fields stay
         null and are listed in missingFields.

Line history in live mode is built exclusively from snapshots this server
actually observed (persisted in .line-snapshots.json). Opening lines are
the first observed snapshot — movement is only reported once two real
observations exist.
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

from lib.calculations import derived
from lib.dataSources import espn as espn_source
from lib.dataSources import odds_api as odds_source
from lib.normalizers import demo_norm
from lib.normalizers.base import attach_provenance
from lib.normalizers.espn_norm import normalize_scoreboard
from lib.normalizers.odds_api_norm import normalize_odds_events

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOTS_PATH = Path(__file__).resolve().parent / '.line-snapshots.json'
STORED_HISTORY_PATH = Path(__file__).resolve().parent / '.stored-history.json'

_lock = threading.Lock()
_cache: dict = {'bundle': None, 'at': 0.0}
_debug: dict = {'mode': None, 'lastUpdated': None, 'providers': {}, 'errors': []}


def load_dotenv(root: Path) -> None:
    env_path = root / '.env'
    if not env_path.is_file():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def cache_ttl() -> int:
    return int(os.environ.get('ODDS_CACHE_TTL', '600'))


def refresh_interval() -> int:
    return int(os.environ.get('ODDS_REFRESH_SEC', os.environ.get('ODDS_CACHE_TTL', '600')))


def _iso_now() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def _load_json(path: Path, default):
    if not path.is_file():
        return default
    try:
        with path.open(encoding='utf-8') as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError):
        return default


def _save_json(path: Path, data) -> None:
    try:
        with path.open('w', encoding='utf-8') as fh:
            json.dump(data, fh)
    except OSError:
        pass


# ---------------------------------------------------------------- derived

def _attach_derived(event: dict) -> dict:
    """Calculated fields from real source fields only — None when inputs missing."""
    event['spreadMovement'] = derived.spread_movement(
        event.get('openingSpread'), event.get('currentSpread'))
    event['finalMargin'] = derived.final_margin(
        event.get('homeScore'), event.get('awayScore'))
    closing = None
    if event.get('status') == 'final':
        closing = event.get('closingSpread')
        if closing is None:
            closing = event.get('currentSpread')
    event['lineResult'] = derived.line_result(closing, event.get('finalMargin'))
    event['impliedProbHome'] = derived.implied_probability(event.get('moneylineHome'))
    event['impliedProbAway'] = derived.implied_probability(event.get('moneylineAway'))
    event['hasOhlc'] = derived.has_ohlc(event.get('lineHistory'))
    return event


# ------------------------------------------------------------ line snapshots

def _record_snapshots(events: list[dict]) -> dict:
    """Append observed lines to the snapshot store. Returns the store."""
    store = _load_json(SNAPSHOTS_PATH, {})
    now = _iso_now()
    for event in events:
        if event.get('spread') is None and event.get('moneylineHome') is None:
            continue
        snapshots = store.setdefault(event['gameId'], [])
        snapshot = {
            'ts': now,
            'spread': event.get('spread'),
            'total': event.get('total'),
            'moneylineHome': event.get('moneylineHome'),
            'moneylineAway': event.get('moneylineAway'),
        }
        if snapshots and snapshots[-1].get('spread') == snapshot['spread'] \
                and snapshots[-1].get('total') == snapshot['total']:
            continue
        snapshots.append(snapshot)
        store[event['gameId']] = snapshots[-200:]
    _save_json(SNAPSHOTS_PATH, store)
    return store


def _apply_snapshots(events: list[dict], store: dict) -> None:
    """Opening line = first snapshot this server observed. No fabrication.

    With fewer than 2 observations there is no real movement to report,
    so opening values stay None.
    """
    for event in events:
        snapshots = store.get(event['gameId'], [])
        event['lineHistory'] = snapshots
        if len(snapshots) >= 2:
            event['openingSpread'] = snapshots[0].get('spread')
            event['openingTotal'] = snapshots[0].get('total')
        else:
            event['openingSpread'] = None
            event['openingTotal'] = None


# ------------------------------------------------------------- stored finals

def _store_finals(events: list[dict]) -> list[dict]:
    """Persist real completed games. Returns full stored history (newest first)."""
    stored = _load_json(STORED_HISTORY_PATH, [])
    by_id = {e['gameId']: e for e in stored}
    for event in events:
        if event.get('status') != 'final':
            continue
        if event.get('homeScore') is None or event.get('awayScore') is None:
            continue
        record = dict(event)
        record['source'] = 'stored'
        by_id[record['gameId']] = record
    merged = sorted(by_id.values(), key=lambda e: e.get('startTime') or '', reverse=True)[:100]
    _save_json(STORED_HISTORY_PATH, merged)
    return merged


# ----------------------------------------------------------------- live mode

def _match_key(event: dict) -> tuple | None:
    home, away = event.get('homeTeam'), event.get('awayTeam')
    if not home or not away:
        return None
    return (home.lower(), away.lower())


def _merge_lines(espn_event: dict, odds_event: dict) -> dict:
    """Real ESPN status/scores + real Odds API lines for the same matchup."""
    merged = dict(odds_event)
    for key in ('startTime', 'rawStartTime', 'status', 'homeScore', 'awayScore'):
        if espn_event.get(key) is not None:
            merged[key] = espn_event[key]
    merged['providersUsed'] = ['The Odds API', 'ESPN']
    primary = 'ESPN' if merged.get('status') in ('live', 'final') else 'The Odds API'
    return attach_provenance(
        merged, source='api', provider=primary,
        source_ts=odds_event.get('sourceTimestamp') or espn_event.get('sourceTimestamp'))


def _build_live_bundle(api_key: str) -> dict:
    errors = []
    providers: dict = {}

    odds_events: list[dict] = []
    try:
        odds_fetch = odds_source.fetch_nba_odds(api_key)
        providers['oddsApi'] = odds_fetch
        odds_events = normalize_odds_events(odds_fetch)
    except Exception as err:
        errors.append(f'The Odds API: {err}')
        providers['oddsApi'] = {'provider': 'The Odds API', 'error': str(err), 'fetchedAt': _iso_now()}

    espn_events: list[dict] = []
    try:
        espn_fetch = espn_source.fetch_nba_scoreboard()
        providers['espn'] = espn_fetch
        espn_events = normalize_scoreboard(espn_fetch)
    except Exception as err:
        errors.append(f'ESPN: {err}')
        providers['espn'] = {'provider': 'ESPN', 'error': str(err), 'fetchedAt': _iso_now()}

    snapshot_store = _record_snapshots(odds_events)
    _apply_snapshots(odds_events, snapshot_store)

    odds_by_match = {}
    for event in odds_events:
        key = _match_key(event)
        if key:
            odds_by_match[key] = event

    games: list[dict] = []
    matched_odds_ids = set()
    for espn_event in espn_events:
        key = _match_key(espn_event)
        odds_event = odds_by_match.get(key) if key else None
        if odds_event:
            matched_odds_ids.add(odds_event['gameId'])
            games.append(_merge_lines(espn_event, odds_event))
        else:
            games.append(espn_event)
    for event in odds_events:
        if event['gameId'] not in matched_odds_ids:
            games.append(event)

    games = [_attach_derived(e) for e in games]
    history = [_attach_derived(e) for e in _store_finals(games)]

    return {
        'mode': 'live',
        'errors': errors,
        'providers': providers,
        'games': games,
        'history': history,
        'updatedAt': _iso_now(),
    }


# ----------------------------------------------------------------- demo mode

def _build_demo_bundle() -> dict:
    upcoming = [_attach_derived(e) for e in demo_norm.demo_upcoming_events()]
    history = [_attach_derived(e) for e in demo_norm.demo_history_events()]
    return {
        'mode': 'demo',
        'errors': [],
        'providers': {
            'demo': {
                'provider': 'manual',
                'note': 'Fabricated demo data from /data/demo for layout testing only.',
                'fetchedAt': _iso_now(),
            },
        },
        'games': upcoming,
        'history': history,
        'updatedAt': _iso_now(),
    }


# ----------------------------------------------------------------- resolve

def _resolve_bundle(force: bool = False) -> dict:
    now = time.time()
    if not force and _cache['bundle'] and now - _cache['at'] < cache_ttl():
        return _cache['bundle']

    api_key = os.environ.get('ODDS_API_KEY', '').strip()
    bundle = _build_live_bundle(api_key) if api_key else _build_demo_bundle()
    bundle['cachedAt'] = int(now)
    bundle['refreshSec'] = refresh_interval()

    _debug['mode'] = bundle['mode']
    _debug['lastUpdated'] = bundle['updatedAt']
    _debug['providers'] = bundle['providers']
    _debug['errors'] = bundle['errors']

    _cache['bundle'] = bundle
    _cache['at'] = now
    return bundle


def _meta(bundle: dict) -> dict:
    return {
        'mode': bundle['mode'],
        'errors': bundle['errors'],
        'updatedAt': bundle['updatedAt'],
        'cachedAt': bundle['cachedAt'],
        'refreshSec': bundle['refreshSec'],
    }


def get_games_payload() -> dict:
    with _lock:
        bundle = _resolve_bundle()
    return {**_meta(bundle), 'games': bundle['games']}


def get_odds_payload() -> dict:
    with _lock:
        bundle = _resolve_bundle()
    events = [e for e in bundle['games'] if e.get('status') != 'final']
    return {
        **_meta(bundle),
        'events': events,
        'biggestMovement': derived.biggest_movement(events),
    }


def get_history_payload() -> dict:
    with _lock:
        bundle = _resolve_bundle()
    return {**_meta(bundle), 'games': bundle['history']}


def _time_audit_row(event: dict) -> dict:
    return {
        'gameId': event.get('gameId'),
        'matchup': f"{event.get('awayTeam')} @ {event.get('homeTeam')}",
        'rawProviderTimestamp': event.get('rawStartTime'),
        'normalizedStartTime': event.get('startTime'),
        'status': event.get('status'),
        'league': event.get('league'),
        'sourceProvider': event.get('sourceProvider'),
    }


def get_debug_payload() -> dict:
    with _lock:
        bundle = _resolve_bundle()
    return {
        **_meta(bundle),
        # Temporary diagnostics (safe: never exposes the key itself).
        'envFileExists': (ROOT / '.env').is_file(),
        'envKeyPresent': bool(os.environ.get('ODDS_API_KEY', '').strip()),
        'providers': bundle['providers'],
        'timeAudit': [_time_audit_row(e) for e in bundle['games']],
        'normalized': {
            'games': bundle['games'],
            'history': bundle['history'],
        },
    }


def refresh_all(force: bool = True) -> None:
    with _lock:
        _resolve_bundle(force=force)


def _background_loop() -> None:
    while True:
        time.sleep(refresh_interval())
        try:
            refresh_all(force=True)
        except Exception:
            pass


def start_background_refresh() -> None:
    try:
        refresh_all(force=True)
    except Exception:
        pass
    if os.environ.get('ODDS_API_KEY', '').strip():
        thread = threading.Thread(target=_background_loop, name='nba-stats-refresh', daemon=True)
        thread.start()
