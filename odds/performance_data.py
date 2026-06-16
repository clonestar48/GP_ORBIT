"""Performance dashboard data layer — local demo provider only for now."""

from __future__ import annotations

import os
import threading
import time
from pathlib import Path

from lib.performance.context import build_team_context, compute_streak
from lib.performance.game_set import (
    GAME_SET_LIMIT,
    resolve_franchise_archive_log,
    resolve_franchise_chart_set,
    resolve_franchise_range_stats,
    resolve_league_archive_log,
    resolve_league_chart_set,
    resolve_matchup_archive_log,
    resolve_matchup_chart_set,
)
from lib.performance.marquee import resolve_featured_matchup
from lib.performance.range import normalize_matchup_preset, reference_date, reference_date_mode
from lib.performance.resolution import aggregate_points, resolve_profile
from lib.providers import get_provider

ROOT = Path(__file__).resolve().parent.parent
_lock = threading.Lock()
_meta_cache: dict = {'at': 0.0, 'payload': None}


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


def _provider():
    return get_provider('local')


def _meta() -> dict:
    now = time.time()
    with _lock:
        if _meta_cache['payload'] and now - _meta_cache['at'] < 3600:
            return _meta_cache['payload']
        provider = _provider()
        provider.get_teams('NBA')
        provider_meta = provider.meta()
        payload = {
            'mode': 'demo',
            'source': provider_meta.get('source', 'demo'),
            'label': provider_meta.get('label', 'Historical performance demo data'),
            'cachedAt': provider_meta.get('cachedAt', int(now)),
            'provider': 'local',
            'referenceDate': reference_date().isoformat(),
            'referenceDateMode': reference_date_mode(),
            'gamesPath': provider_meta.get('gamesPath', ''),
            'archiveFallback': provider_meta.get('archiveFallback', False),
            'gameCount': provider_meta.get('gameCount', 0),
            'seasonCount': provider_meta.get('seasonCount', 0),
        }
        _meta_cache['payload'] = payload
        _meta_cache['at'] = now
        return payload


def get_teams_payload(league: str = 'NBA') -> dict:
    provider = _provider()
    return {**_meta(), 'teams': provider.get_teams(league)}


def _matchup_resolution_key(preset: str, chart_kind: str | None) -> str:
    preset = normalize_matchup_preset(preset) or 'season'
    if chart_kind == 'headToHead':
        return 'matchupSeason'
    if preset == 'season':
        return 'matchupSeason'
    if preset == 'all':
        return 'matchupAll'
    return preset


def _solo_resolution_key(preset: str) -> str:
    if preset == 'season':
        return 'soloSeason'
    if preset == 'all':
        return 'soloAll'
    return preset


def _apply_resolution(payload: dict, time_range: str) -> dict:
    chart_set = payload.get('chartSet') or payload.get('gameSet')
    chart_kind = (chart_set or {}).get('chartKind')
    chart_mode = (chart_set or {}).get('mode')
    if chart_mode == 'matchup' and chart_kind in ('headToHead', 'trajectory'):
        profile_key = _matchup_resolution_key(time_range, chart_kind)
    elif chart_mode == 'solo' and chart_kind == 'trajectory':
        profile_key = _solo_resolution_key(time_range)
    else:
        profile_key = time_range
    profile = resolve_profile(profile_key)
    resolution = profile.to_dict()

    series = payload.get('series')
    if isinstance(series, list):
        payload = {
            **payload,
            'series': [
                {
                    **entry,
                    'points': aggregate_points(entry.get('points') or [], profile),
                }
                for entry in series
            ],
        }
    elif isinstance(series, dict) and series.get('points') is not None:
        payload = {
            **payload,
            'series': {
                **series,
                'points': aggregate_points(series.get('points') or [], profile),
            },
        }
    elif payload.get('points') is not None and not payload.get('error'):
        payload = {
            **payload,
            'points': aggregate_points(payload.get('points') or [], profile),
        }

    for block_key in ('chartSet', 'gameSet'):
        block = payload.get(block_key)
        if not isinstance(block, dict):
            continue
        inner = block.get('series')
        if isinstance(inner, dict) and inner.get('points') is not None:
            payload = {
                **payload,
                block_key: {
                    **block,
                    'series': {
                        **inner,
                        'points': aggregate_points(inner.get('points') or [], profile),
                    },
                },
            }
        elif isinstance(inner, list):
            payload = {
                **payload,
                block_key: {
                    **block,
                    'series': [
                        {
                            **entry,
                            'points': aggregate_points(entry.get('points') or [], profile),
                        }
                        for entry in inner
                    ],
                },
            }

    return {**payload, 'resolution': resolution}


def _inject_h2h_point_flags(series: dict, h2h_dates: set[str]) -> dict:
    """Flag chart points that fall on head-to-head dates (game or aggregated period)."""
    if not h2h_dates:
        return series
    points: list[dict] = []
    for point in series.get('points') or []:
        row = {**point}
        day = (row.get('date') or '')[:10]
        period_start = (row.get('periodStart') or day)[:10]
        period_end = (row.get('periodEnd') or day)[:10]
        if row.get('gameId') and not row.get('flatline'):
            if day in h2h_dates:
                row['isH2h'] = True
        elif any(period_start <= hd <= period_end for hd in h2h_dates):
            row['isH2h'] = True
        points.append(row)
    return {**series, 'points': points}


def get_performance_payload(
    team_id: str,
    time_range: str | None = 'week',
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    provider = _provider()
    preset = time_range or 'week'
    all_games = provider._team_games(team_id)
    team = provider._team_meta(team_id)
    chart_set = resolve_franchise_chart_set(all_games, preset)
    archive_log = resolve_franchise_archive_log(all_games, preset)
    range_stats = resolve_franchise_range_stats(all_games, preset, team_id=team_id)
    series = {
        'teamId': team['id'] if team else team_id,
        'teamName': team['name'] if team else team_id,
        'color': (team or {}).get('colors', {}).get('primary', '#5da396'),
        **chart_set['series'],
    }
    payload = {
        **_meta(),
        'series': series,
        'chartSet': chart_set,
        'archiveLog': archive_log,
        'rangeStats': range_stats,
        'games': archive_log['games'],
        'gameSet': chart_set,
        'range': preset,
        'seasonBoundaries': chart_set.get('seasonBoundaries') or [],
    }
    return _apply_resolution(payload, preset)


def get_matchup_payload(
    team_a: str,
    team_b: str,
    time_range: str | None = 'season',
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    provider = _provider()
    preset = normalize_matchup_preset(time_range or 'season') or 'season'
    team_a_meta = provider._team_meta(team_a)
    team_b_meta = provider._team_meta(team_b)
    if not team_a_meta or not team_b_meta:
        missing = [tid for tid, t in [(team_a, team_a_meta), (team_b, team_b_meta)] if not t]
        return {
            **_meta(),
            'error': f'Unknown team(s): {", ".join(missing)}',
            'series': [],
            'games': [],
            'gameSet': None,
            'hasGames': False,
        }

    if team_a.upper() == team_b.upper():
        return {
            **_meta(),
            'error': 'Choose two different teams for a matchup.',
            'series': [],
            'games': [],
            'archiveLog': None,
            'chartSet': None,
            'gameSet': None,
            'hasGames': False,
        }

    games_a = provider._team_games(team_a)
    games_b = provider._team_games(team_b)
    chart_set = resolve_matchup_chart_set(games_a, games_b, team_a, team_b, preset)
    archive_log = resolve_matchup_archive_log(games_a, team_b, preset)
    range_stats = {
        'teamA': resolve_franchise_range_stats(games_a, preset),
        'teamB': resolve_franchise_range_stats(games_b, preset),
        'h2h': chart_set.get('h2h'),
    }
    sa = chart_set['series'][0]
    sb = chart_set['series'][1]
    h2h = chart_set.get('h2h') or {}
    h2h_dates = set(h2h.get('dates') or [])
    h2h_opponents = chart_set.get('h2hOpponentIds') or {}
    matchup = {
        **chart_set,
        'hasGames': bool(sa.get('hasGames') or sb.get('hasGames')),
        'chartSet': chart_set,
        'archiveLog': archive_log,
        'games': archive_log['games'],
        'gameSet': chart_set,
        'h2h': h2h,
        'h2hBreakdown': chart_set.get('h2hBreakdown'),
        'teamARecord': chart_set.get('teamARecord'),
        'teamBRecord': chart_set.get('teamBRecord'),
        'rangeStats': range_stats,
        'series': [
            {
                'teamId': team_a_meta['id'],
                'teamName': team_a_meta['name'],
                'color': team_a_meta.get('colors', {}).get('primary', '#5da396'),
                'h2hOpponentId': h2h_opponents.get(team_a_meta['id'].upper()),
                'seriesKind': chart_set.get('seriesKind'),
                **sa,
            },
            {
                'teamId': team_b_meta['id'],
                'teamName': team_b_meta['name'],
                'color': team_b_meta.get('colors', {}).get('primary', '#5da396'),
                'h2hOpponentId': h2h_opponents.get(team_b_meta['id'].upper()),
                'seriesKind': chart_set.get('seriesKind'),
                **sb,
            },
        ],
    }
    resolution_key = preset
    resolved = _apply_resolution({**_meta(), **matchup, 'range': preset}, resolution_key)
    if (
        h2h_dates
        and chart_set.get('chartKind') == 'trajectory'
        and isinstance(resolved.get('series'), list)
    ):
        resolved = {
            **resolved,
            'series': [
                _inject_h2h_point_flags(entry, h2h_dates)
                for entry in resolved['series']
            ],
        }
    return resolved


def get_marquee_payload(league: str = 'NBA') -> dict:
    provider = _provider()
    teams = provider.get_teams(league)
    team_ids = {t['id'].upper() for t in teams}
    from lib.providers.local import _cached_bundle  # noqa: PLC0415

    all_games, _, _ = _cached_bundle()
    league_upper = league.upper()
    league_games = [g for g in all_games if g.get('league', 'NBA').upper() == league_upper]
    featured = resolve_featured_matchup(league_games)
    if featured['teamA'] not in team_ids or featured['teamB'] not in team_ids:
        featured['teamA'] = 'BOS'
        featured['teamB'] = 'NYK'
    return {**_meta(), **featured}


def _game_pair_key(row: dict) -> str:
    team = (row.get('team') or '').upper()
    opp = (row.get('opponent') or '').upper()
    day = (row.get('date') or '')[:10]
    pair = tuple(sorted([team, opp]))
    return f'{day}|{pair[0]}|{pair[1]}'


def _dedupe_league_games(rows: list[dict], limit: int = 12) -> list[dict]:
    seen: set[str] = set()
    recent: list[dict] = []
    for row in sorted(rows, key=lambda g: g.get('date', ''), reverse=True):
        key = _game_pair_key(row)
        if key in seen:
            continue
        seen.add(key)
        recent.append(row)
        if len(recent) >= limit:
            break
    return recent


def _recent_matchup_pairs(recent_games: list[dict], featured: dict, limit: int = 5) -> list[dict]:
    pairs: list[dict] = []
    seen: set[frozenset[str]] = set()

    def add_pair(team_a: str, team_b: str, *, headline: str | None = None) -> None:
        a, b = team_a.upper(), team_b.upper()
        key = frozenset({a, b})
        if key in seen:
            return
        seen.add(key)
        pairs.append({'teamA': a, 'teamB': b, 'headline': headline})

    if featured.get('teamA') and featured.get('teamB'):
        add_pair(
            featured['teamA'],
            featured['teamB'],
            headline=featured.get('headline'),
        )

    for row in recent_games:
        add_pair(row['team'], row['opponent'])
        if len(pairs) >= limit:
            break

    return pairs


def get_home_payload(league: str = 'NBA', time_range: str = 'season') -> dict:
    provider = _provider()
    teams = provider.get_teams(league)
    from lib.providers.local import _cached_bundle  # noqa: PLC0415

    all_games, _, _ = _cached_bundle()
    league_upper = league.upper()
    league_games = [g for g in all_games if g.get('league', 'NBA').upper() == league_upper]
    featured = resolve_featured_matchup(league_games)
    team_ids = {t['id'].upper() for t in teams}
    if featured['teamA'] not in team_ids or featured['teamB'] not in team_ids:
        featured['teamA'] = 'BOS'
        featured['teamB'] = 'NYK'

    preset = time_range or 'season'
    league_archive = resolve_league_archive_log(league_games, preset)
    recent_games = league_archive['games']
    recent_matchups = _recent_matchup_pairs(recent_games, featured, limit=5)

    movers: list[dict] = []
    for team in teams:
        chart = resolve_franchise_chart_set(provider._team_games(team['id']), preset)
        points = chart['series'].get('points') or []
        if len(points) < 2:
            continue
        start = points[0].get('previousValue', points[0].get('value'))
        end = points[-1].get('value')
        if start is None or end is None:
            continue
        delta = round(float(end) - float(start), 1)
        movers.append({
            'teamId': team['id'],
            'delta': delta,
            'end': round(float(end), 1),
        })
    movers.sort(key=lambda m: abs(m['delta']), reverse=True)
    top_movers = movers[:5]

    active_streaks: list[dict] = []
    for team in teams:
        archive = resolve_franchise_archive_log(provider._team_games(team['id']), preset)
        streak = compute_streak(archive['games'])
        if streak and streak['length'] >= 3:
            active_streaks.append({
                'teamId': team['id'],
                'result': streak['result'],
                'length': streak['length'],
            })
    active_streaks.sort(key=lambda row: row['length'], reverse=True)
    active_streaks = active_streaks[:5]

    ref = reference_date().isoformat()
    spotlight_team = featured['teamA']
    spotlight_chart = resolve_franchise_chart_set(provider._team_games(spotlight_team), preset)
    from lib.performance.range import RANGE_LABELS  # noqa: PLC0415

    spotlight = {
        'teamId': spotlight_team,
        'headline': featured.get('headline') or f'{spotlight_team} · {RANGE_LABELS.get(preset, preset)}',
        'series': spotlight_chart['series'],
        'gameCount': spotlight_chart['count'],
    }

    league_headline = featured.get('headline') or 'Latest around the league'
    if recent_games:
        latest = recent_games[0]
        league_headline = (
            f"Latest · {latest['team']} vs {latest['opponent']} "
            f"({latest['teamScore']}–{latest['opponentScore']})"
        )

    return {
        **_meta(),
        'intro': {
            'kicker': 'NBA performance index',
            'title': 'Orbit Overview',
            'detail': league_headline,
        },
        'teamCount': len(teams),
        'recentGames': recent_games,
        'archiveLog': league_archive,
        'recentMatchups': recent_matchups,
        'topMovers': top_movers,
        'activeStreaks': active_streaks,
        'featuredMatchup': {
            'teamA': featured['teamA'],
            'teamB': featured['teamB'],
            'headline': featured.get('headline'),
            'subheadline': featured.get('subheadline'),
            'range': featured.get('range', 'today'),
        },
        'spotlight': spotlight,
        'range': preset,
        'asOf': ref,
    }


def get_team_context_payload(team_id: str, league: str = 'NBA') -> dict:
    provider = _provider()
    team = provider._team_meta(team_id)
    if not team:
        return {**_meta(), 'error': f'Unknown team: {team_id}'}
    games = provider._team_games(team_id)
    ctx = build_team_context(team, games)
    suggested = ctx.get('suggestedPreset') or 'season'
    chart_series = provider.get_performance_series(team_id, suggested)
    chart_games = provider.get_games_for_team(team_id, suggested)
    chart_payload = _apply_resolution(
        {**_meta(), 'series': chart_series, 'games': chart_games},
        suggested,
    )
    return {
        **chart_payload,
        'context': ctx,
        'suggestedPreset': suggested,
    }
