"""Resolve chart lens vs archive-backed game log — separate concerns."""

from __future__ import annotations

from typing import Any

from .range import (
    STAT_SCOPE_LABELS,
    normalize_matchup_preset,
    preset_dates,
    reference_date,
    resolve_range,
)
from .series import (
    build_h2h_matchup_index_series,
    build_impact_index_series,
    build_index_series_for_game_set,
    build_momentum_form_series,
    build_win_pct_series_for_game_set,
)

GAME_SET_LIMIT = 10
ARCHIVE_LOG_PRESET = 'archive'
PLAYOFF_SEASON_TYPE = 'Playoffs'

NBA_EAST = frozenset({
    'BOS', 'NYK', 'PHI', 'BKN', 'TOR', 'MIA', 'ORL', 'ATL', 'CHI', 'CLE', 'DET', 'IND', 'MIL', 'CHA', 'WAS',
})

_SERIES_ROUND_ORDER = {
    '010': 1, '011': 1, '012': 1, '013': 1,
    '014': 1, '015': 1, '016': 1, '017': 1,
    '020': 2, '021': 2, '022': 2, '023': 2,
    '030': 3, '031': 3,
    '040': 4,
}


def _parse_day(value: str):
    from datetime import date

    return date.fromisoformat(value[:10])


def _games_in_range(games: list[dict], start, end) -> list[dict]:
    return [
        g for g in games
        if start <= _parse_day(g['date']) <= end
    ]


def _games_for_range_stats(
    games: list[dict],
    preset: str,
    *,
    ref=None,
) -> list[dict]:
    """All games in the selected preset window — never capped to game-log limit."""
    if not games:
        return []
    ref = ref or reference_date()
    sorted_games = sorted(games, key=lambda g: g['date'])
    if preset == 'all':
        return sorted_games
    start, end = preset_dates(preset, ref)
    return _games_in_range(sorted_games, start, end)


def _playoff_round_label(series_id: str, team_id: str) -> str:
    suffix = str(series_id or '')[-3:]
    round_num = _SERIES_ROUND_ORDER.get(suffix)
    if round_num is None:
        return 'R?'
    if round_num == 4:
        return 'Finals'
    if round_num == 3:
        return 'ECF' if team_id.upper() in NBA_EAST else 'WCF'
    return f'R{round_num}'


def _playoff_series_results(postseason_games: list[dict], team_id: str) -> list[dict[str, Any]]:
    """Per-round series W–L for solo season subtitle."""
    by_series: dict[str, list[dict]] = {}
    for game in postseason_games:
        sid = game.get('seriesId')
        if not sid:
            continue
        by_series.setdefault(str(sid), []).append(game)

    results: list[dict[str, Any]] = []
    for sid, series_games in by_series.items():
        suffix = sid[-3:]
        wins = sum(1 for g in series_games if g.get('result') == 'W')
        losses = len(series_games) - wins
        won = wins >= 4 and wins > losses
        lost = losses >= 4 and losses > wins
        results.append({
            'label': _playoff_round_label(sid, team_id),
            'wins': wins,
            'losses': losses,
            'record': f'{wins}–{losses}',
            'won': won,
            'lost': lost,
            'roundOrder': _SERIES_ROUND_ORDER.get(suffix, 99),
        })

    results.sort(key=lambda row: row['roundOrder'])
    for row in results:
        del row['roundOrder']
    return results


def _stats_from_games(
    games: list[dict],
    preset: str,
    *,
    team_id: str | None = None,
) -> dict[str, Any]:
    wins = sum(1 for g in games if g.get('result') == 'W')
    total = len(games)
    losses = total - wins
    win_pct = round(wins / total * 100, 1) if total else None
    stats: dict[str, Any] = {
        'preset': preset,
        'scopeLabel': STAT_SCOPE_LABELS.get(preset, preset),
        'games': total,
        'wins': wins,
        'losses': losses,
        'record': f'{wins}–{losses}' if total else None,
        'winPct': win_pct,
    }
    if preset == 'season' and team_id:
        regular = [g for g in games if (g.get('seasonType') or '') != PLAYOFF_SEASON_TYPE]
        postseason = [g for g in games if (g.get('seasonType') or '') == PLAYOFF_SEASON_TYPE]
        stats['regularGames'] = len(regular)
        stats['postseasonGames'] = len(postseason)
        stats['playoffSeriesResults'] = _playoff_series_results(postseason, team_id)
    return stats


def resolve_franchise_range_stats(
    all_games: list[dict],
    preset: str,
    *,
    ref=None,
    team_id: str | None = None,
) -> dict[str, Any]:
    """Full selected-range summary for hero stats — not derived from game log rows."""
    scoped = _games_for_range_stats(all_games, preset, ref=ref)
    return _stats_from_games(scoped, preset, team_id=team_id)


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

    if preset in ('matchup', 'series'):
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
    ref = ref or reference_date()
    full_range = _games_for_range_stats(all_games, preset, ref=ref)
    pool = _preference_pool(all_games, preset, expand=True, ref=ref)
    selected = _select_from_pool(pool, limit, preset)
    meta = _game_set_meta(
        mode='solo',
        preset=preset,
        games=list(reversed(selected)),
        limit=limit,
    )
    return {
        **meta,
        'metric': 'winPct',
        'honestCount': len(full_range),
    }


def resolve_franchise_chart_set(
    all_games: list[dict],
    preset: str,
    *,
    limit: int = GAME_SET_LIMIT,
    ref=None,
) -> dict[str, Any]:
    """Solo chart lens — range-sensitive sampling for visualization."""
    ref = ref or reference_date()
    pool = _preference_pool(all_games, preset, expand=True, ref=ref)
    full_count = len(_games_for_range_stats(all_games, preset, ref=ref))

    if preset == 'season':
        rq = resolve_range(preset='season', mode='franchise', metric='index', reference=ref)
        series_data = build_momentum_form_series(all_games, rq)
        meta = _game_set_meta(mode='solo', preset=preset, games=[], limit=full_count or limit)
        return {
            **meta,
            'count': series_data.get('gameCount', 0),
            'honestCount': full_count,
            'chartKind': 'trajectory',
            'seriesKind': 'momentumForm',
            'metric': 'index',
            'series': series_data,
        }

    if preset == 'all':
        rq = resolve_range(preset='all', mode='franchise', metric='index', reference=ref)
        series_data = build_impact_index_series(all_games, rq)
        meta = _game_set_meta(mode='solo', preset=preset, games=[], limit=full_count or limit)
        return {
            **meta,
            'count': series_data.get('gameCount', 0),
            'honestCount': full_count,
            'chartKind': 'trajectory',
            'seriesKind': 'impactIndex',
            'metric': 'index',
            'series': series_data,
            'seasonBoundaries': _season_boundary_dates(all_games),
        }

    selected = _select_from_pool(pool, limit, preset)
    series = build_win_pct_series_for_game_set(all_games, selected)
    meta = _game_set_meta(mode='solo', preset=preset, games=selected, limit=limit)
    return {**meta, 'series': series, 'metric': 'winPct'}


# Backward-compatible alias for chart resolution
resolve_franchise_game_set = resolve_franchise_chart_set


def _season_boundary_dates(games: list[dict]) -> list[str]:
    """First game date of each season label — for archive chart breaks."""
    by_label: dict[str, str] = {}
    for game in games:
        label = game.get('seasonLabel')
        day = (game.get('date') or '')[:10]
        if not label or not day:
            continue
        if label not in by_label or day < by_label[label]:
            by_label[label] = day
    ordered = sorted(by_label.items(), key=lambda item: item[1])
    return [day for _, day in ordered[1:]]


def _shared_playoff_series_exists(team_a_games: list[dict], team_b_id: str) -> bool:
    """True when the pairing has at least one shared NBA playoff/tournament series."""
    opp = team_b_id.upper()
    for game in team_a_games:
        if (game.get('opponent') or '').upper() != opp:
            continue
        if (game.get('seasonType') or '') != 'Playoffs':
            continue
        if game.get('seriesId'):
            return True
    return False


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
    preset = normalize_matchup_preset(preset) or preset
    ref = ref or reference_date()
    h2h = _all_matchup_h2h_games(team_a_games, team_b_id)

    if preset == 'matchup':
        selected = h2h
        full_count = len(h2h)
    else:
        start, end = preset_dates(preset, ref)
        full_count = len(_matchup_h2h_games(team_a_games, team_b_id, start=start, end=end))
        pool = _preference_pool(h2h, preset, expand=True, ref=ref)
        selected = _select_from_pool(pool, limit, preset)

    meta = _game_set_meta(
        mode='matchup',
        preset=preset,
        games=list(reversed(selected)),
        limit=limit if preset != 'matchup' else max(limit, len(selected)),
    )
    return {
        **meta,
        'metric': 'index',
        'honestCount': full_count,
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


def _h2h_scope_record(h2h_games: list[dict], team_a_id: str, team_b_id: str) -> dict[str, Any]:
    wins_a = sum(1 for g in h2h_games if g.get('result') == 'W')
    wins_b = len(h2h_games) - wins_a
    leader_id: str | None = None
    if wins_a > wins_b:
        leader_id = team_a_id.upper()
    elif wins_b > wins_a:
        leader_id = team_b_id.upper()
    leader_wins = max(wins_a, wins_b)
    trailer_wins = min(wins_a, wins_b)
    return {
        'count': len(h2h_games),
        'teamAWins': wins_a,
        'teamBWins': wins_b,
        'leaderId': leader_id,
        'record': f'{leader_wins}–{trailer_wins}' if h2h_games else None,
        'recordNeutral': f'{wins_a}–{wins_b}' if h2h_games else None,
    }


def _matchup_h2h_breakdown(
    team_a_games: list[dict],
    team_a_id: str,
    team_b_id: str,
    *,
    start,
    end,
) -> dict[str, Any]:
    h2h = _matchup_h2h_games(team_a_games, team_b_id, start=start, end=end)
    regular = [g for g in h2h if (g.get('seasonType') or '') != 'Playoffs']
    postseason = [g for g in h2h if (g.get('seasonType') or '') == 'Playoffs']
    return {
        'regularSeason': _h2h_scope_record(regular, team_a_id, team_b_id),
        'postseason': _h2h_scope_record(postseason, team_a_id, team_b_id),
    }


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
    """Matchup chart lens — Matchup (H2H only) or Season/All (full trajectories + H2H markers)."""
    preset = normalize_matchup_preset(preset) or preset
    ref = ref or reference_date()
    span_start, span_end = preset_dates('all' if preset == 'matchup' else preset, ref)

    if preset == 'matchup':
        h2h_a = _all_matchup_h2h_games(team_a_games, team_b_id)
        h2h_b = _all_matchup_h2h_games(team_b_games, team_a_id)
        series_a = build_h2h_matchup_index_series(h2h_a)
        series_b = build_h2h_matchup_index_series(h2h_b)
        chart_kind = 'headToHead'
    else:
        rq = resolve_range(
            preset=preset,
            teams=[team_a_id, team_b_id],
            mode='matchup',
            metric='index',
            reference=ref,
        )
        span_start, span_end = rq.start_date, rq.end_date
        series_builder = build_momentum_form_series if preset == 'season' else build_impact_index_series
        series_a = series_builder(
            team_a_games,
            rq,
            rivalry_opponent_id=team_b_id,
        )
        series_b = series_builder(
            team_b_games,
            rq,
            rivalry_opponent_id=team_a_id,
        )
        chart_kind = 'trajectory'

    h2h = _matchup_h2h_summary(
        team_a_games,
        team_a_id,
        team_b_id,
        start=span_start,
        end=span_end,
    )
    h2h_breakdown = _matchup_h2h_breakdown(
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
    if preset == 'matchup' and h2h['count']:
        team_a_record = f'{h2h["teamAWins"]}–{h2h["count"] - h2h["teamAWins"]}'
        team_b_record = f'{h2h["teamBWins"]}–{h2h["count"] - h2h["teamBWins"]}'

    return {
        **meta,
        'count': chart_game_count,
        'chartKind': chart_kind,
        'seriesKind': 'momentumForm' if preset == 'season' else 'impactIndex',
        'metric': 'index',
        'series': [series_a, series_b],
        'h2h': h2h,
        'h2hBreakdown': h2h_breakdown,
        'honestCount': h2h['count'],
        'teamARecord': team_a_record,
        'teamBRecord': team_b_record,
        'seasonBoundaries': _season_boundary_dates(team_a_games + team_b_games) if preset == 'all' else [],
        'playoffSeriesAvailable': _shared_playoff_series_exists(team_a_games, team_b_id),
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
