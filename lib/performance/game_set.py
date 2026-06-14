"""Resolve chart lens vs archive-backed game log — separate concerns."""

from __future__ import annotations

from typing import Any

from .range import preset_dates, reference_date, resolve_range
from .series import (
    build_index_series,
    build_index_series_for_game_set,
    build_win_pct_series_for_game_set,
)

GAME_SET_LIMIT = 10
ARCHIVE_LOG_PRESET = 'archive'


def _parse_day(value: str):
    from datetime import date

    return date.fromisoformat(value[:10])


def _games_in_range(games: list[dict], start, end) -> list[dict]:
    return [
        g for g in games
        if start <= _parse_day(g['date']) <= end
    ]


def _select_from_pool(pool: list[dict], limit: int, preset: str) -> list[dict]:
    sorted_pool = sorted(pool, key=lambda g: g['date'])
    if not sorted_pool:
        return []
    if len(sorted_pool) <= limit:
        return sorted_pool
    if preset == 'all':
        n = len(sorted_pool)
        if limit <= 1:
            return [sorted_pool[-1]]
        step = (n - 1) / (limit - 1)
        indices = sorted({int(round(i * step)) for i in range(limit)})
        while len(indices) < limit:
            indices.append(indices[-1])
        indices = indices[:limit]
        return [sorted_pool[i] for i in indices]
    return sorted_pool[-limit:]


def _preference_pool(
    games: list[dict],
    preset: str,
    *,
    expand: bool = True,
    ref=None,
) -> list[dict]:
    if not games:
        return []
    ref = ref or reference_date()
    sorted_games = sorted(games, key=lambda g: g['date'])

    if preset == 'today':
        return sorted_games

    start, end = preset_dates(preset, ref)
    in_window = _games_in_range(sorted_games, start, end)

    if preset in ('week', 'month'):
        if expand and len(in_window) < GAME_SET_LIMIT:
            return sorted_games
        return in_window if in_window else sorted_games

    if preset == 'season':
        return in_window if in_window else sorted_games

    if preset == 'all':
        return sorted_games

    if preset == 'series':
        return sorted_games

    return in_window if in_window else sorted_games


def _game_set_meta(
    *,
    mode: str,
    preset: str,
    games: list[dict],
    limit: int = GAME_SET_LIMIT,
) -> dict[str, Any]:
    return {
        'mode': mode,
        'preset': preset,
        'limit': limit,
        'count': len(games),
        'games': games,
        'latestGameId': games[-1]['id'] if games else None,
        'startDate': games[0]['date'][:10] if games else None,
        'endDate': games[-1]['date'][:10] if games else None,
    }


def _latest_real_games(games: list[dict], limit: int = GAME_SET_LIMIT) -> list[dict]:
    if not games:
        return []
    sorted_pool = sorted(games, key=lambda g: g['date'])
    return _select_from_pool(sorted_pool, limit, 'all')


def _dedupe_league_rows(rows: list[dict], limit: int) -> list[dict]:
    seen: set[str] = set()
    recent: list[dict] = []
    for row in sorted(rows, key=lambda g: g.get('date', ''), reverse=True):
        team = (row.get('team') or '').upper()
        opp = (row.get('opponent') or '').upper()
        day = (row.get('date') or '')[:10]
        key = f'{day}|{tuple(sorted([team, opp]))}'
        if key in seen:
            continue
        seen.add(key)
        recent.append(row)
        if len(recent) >= limit:
            break
    return recent


def resolve_franchise_archive_log(
    all_games: list[dict],
    preset: str,
    *,
    limit: int = GAME_SET_LIMIT,
    ref=None,
) -> dict[str, Any]:
    """Solo game log — era + team context; up to *limit* real games, not calendar shrink."""
    pool = _preference_pool(all_games, preset, expand=True, ref=ref)
    selected = _select_from_pool(pool, limit, preset)
    meta = _game_set_meta(
        mode='solo',
        preset=preset,
        games=list(reversed(selected)),
        limit=limit,
    )
    return {**meta, 'metric': 'winPct'}


def resolve_franchise_chart_set(
    all_games: list[dict],
    preset: str,
    *,
    limit: int = GAME_SET_LIMIT,
    ref=None,
) -> dict[str, Any]:
    """Solo chart lens — range-sensitive sampling for visualization."""
    pool = _preference_pool(all_games, preset, expand=True, ref=ref)
    selected = _select_from_pool(pool, limit, preset)
    series = build_win_pct_series_for_game_set(all_games, selected)
    meta = _game_set_meta(mode='solo', preset=preset, games=selected, limit=limit)
    return {**meta, 'series': series, 'metric': 'winPct'}


# Backward-compatible alias for chart resolution
resolve_franchise_game_set = resolve_franchise_chart_set


def _all_matchup_h2h_games(team_games: list[dict], opponent_id: str) -> list[dict]:
    opp = opponent_id.upper()
    return sorted(
        [g for g in team_games if (g.get('opponent') or '').upper() == opp],
        key=lambda g: g['date'],
    )


def resolve_matchup_archive_log(
    team_a_games: list[dict],
    team_b_id: str,
    preset: str,
    *,
    limit: int = GAME_SET_LIMIT,
    ref=None,
) -> dict[str, Any]:
    """Matchup game log — head-to-head meetings for the active comparison lens."""
    h2h = _all_matchup_h2h_games(team_a_games, team_b_id)

    if preset == 'series':
        selected = h2h
    else:
        pool = _preference_pool(h2h, preset, expand=True, ref=ref)
        selected = _select_from_pool(pool, limit, preset)

    meta = _game_set_meta(
        mode='matchup',
        preset=preset,
        games=list(reversed(selected)),
        limit=limit if preset != 'series' else max(limit, len(selected)),
    )
    return {
        **meta,
        'metric': 'index',
        'honestCount': len(selected),
    }


def _record_in_range(games: list[dict], start, end) -> str | None:
    scoped = _games_in_range(games, start, end)
    if not scoped:
        return None
    wins = sum(1 for g in scoped if g.get('result') == 'W')
    return f'{wins}–{len(scoped) - wins}'


def _matchup_h2h_games(
    team_a_games: list[dict],
    team_b_id: str,
    *,
    start,
    end,
) -> list[dict]:
    opp = team_b_id.upper()
    h2h = [
        g for g in team_a_games
        if (g.get('opponent') or '').upper() == opp
    ]
    return _games_in_range(h2h, start, end)


def _matchup_h2h_summary(
    team_a_games: list[dict],
    team_a_id: str,
    team_b_id: str,
    *,
    start,
    end,
) -> dict[str, Any]:
    h2h = _matchup_h2h_games(team_a_games, team_b_id, start=start, end=end)
    wins_a = sum(1 for g in h2h if g.get('result') == 'W')
    wins_b = len(h2h) - wins_a
    return {
        'count': len(h2h),
        'teamAId': team_a_id.upper(),
        'teamBId': team_b_id.upper(),
        'teamAWins': wins_a,
        'teamBWins': wins_b,
        'dates': sorted({g['date'][:10] for g in h2h}),
        'gameIds': [g['id'] for g in h2h if g.get('id')],
    }


def resolve_matchup_chart_set(
    team_a_games: list[dict],
    team_b_games: list[dict],
    team_a_id: str,
    team_b_id: str,
    preset: str,
    *,
    limit: int = GAME_SET_LIMIT,
    ref=None,
) -> dict[str, Any]:
    """Matchup chart lens — Series (H2H only) or Season/All (full trajectories + H2H markers)."""
    ref = ref or reference_date()
    span_start, span_end = preset_dates('all' if preset == 'series' else preset, ref)

    if preset == 'series':
        h2h_a = _all_matchup_h2h_games(team_a_games, team_b_id)
        h2h_b = _all_matchup_h2h_games(team_b_games, team_a_id)
        series_a = build_index_series_for_game_set(team_a_games, h2h_a)
        series_b = build_index_series_for_game_set(team_b_games, h2h_b)
        chart_kind = 'series'
    else:
        rq = resolve_range(
            preset=preset,
            teams=[team_a_id, team_b_id],
            mode='matchup',
            metric='index',
            reference=ref,
        )
        span_start, span_end = rq.start_date, rq.end_date
        series_a = build_index_series(team_a_games, rq)
        series_b = build_index_series(team_b_games, rq)
        chart_kind = 'trajectory'

    h2h = _matchup_h2h_summary(
        team_a_games,
        team_a_id,
        team_b_id,
        start=span_start,
        end=span_end,
    )

    h2h_games = _matchup_h2h_games(
        team_a_games,
        team_b_id,
        start=span_start,
        end=span_end,
    )
    meta = _game_set_meta(
        mode='matchup',
        preset=preset,
        games=h2h_games,
        limit=limit,
    )
    chart_game_count = max(series_a.get('gameCount', 0), series_b.get('gameCount', 0))

    team_a_record = _record_in_range(team_a_games, span_start, span_end)
    team_b_record = _record_in_range(team_b_games, span_start, span_end)
    if preset == 'series' and h2h['count']:
        team_a_record = f'{h2h["teamAWins"]}–{h2h["count"] - h2h["teamAWins"]}'
        team_b_record = f'{h2h["teamBWins"]}–{h2h["count"] - h2h["teamBWins"]}'

    return {
        **meta,
        'count': chart_game_count,
        'chartKind': chart_kind,
        'metric': 'index',
        'series': [series_a, series_b],
        'h2h': h2h,
        'honestCount': h2h['count'],
        'teamARecord': team_a_record,
        'teamBRecord': team_b_record,
        'h2hOpponentIds': {
            team_a_id.upper(): team_b_id.upper(),
            team_b_id.upper(): team_a_id.upper(),
        },
    }


resolve_matchup_game_set = resolve_matchup_chart_set


def resolve_league_archive_log(
    league_games: list[dict],
    preset: str,
    *,
    limit: int = GAME_SET_LIMIT,
    ref=None,
) -> dict[str, Any]:
    """Overview recent results — era-scoped league feed, up to *limit* real games."""
    pool = _preference_pool(league_games, preset, expand=True, ref=ref)
    sorted_pool = sorted(pool, key=lambda g: g.get('date', ''), reverse=True)
    rows: list[dict] = []
    seen: set[str] = set()
    for row in sorted_pool:
        team = (row.get('team') or '').upper()
        opp = (row.get('opponent') or '').upper()
        day = (row.get('date') or '')[:10]
        pair_key = f'{day}|{tuple(sorted([team, opp]))}'
        if pair_key in seen:
            continue
        seen.add(pair_key)
        rows.append(row)
        if len(rows) >= limit:
            break
    meta = _game_set_meta(mode='overview', preset=preset, games=rows, limit=limit)
    return {**meta, 'metric': 'winPct'}


def resolve_league_chart_set(
    league_games: list[dict],
    preset: str,
    *,
    limit: int = GAME_SET_LIMIT,
    ref=None,
) -> dict[str, Any]:
    """Overview chart lens — range-sensitive league events (optional)."""
    pool = _preference_pool(league_games, preset, expand=True, ref=ref)
    selected = _select_from_pool(pool, limit, preset)
    meta = _game_set_meta(
        mode='overview',
        preset=preset,
        games=list(reversed(selected)),
        limit=limit,
    )
    return {**meta, 'metric': 'winPct'}


resolve_league_game_set = resolve_league_chart_set
