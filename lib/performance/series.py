"""Build chart series from real game results — no fabricated volatility."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from .range import RANGE_LABELS, RangeQuery, resolve_range

INDEX_BASE = 100.0
WIN_DELTA = 1.0
LOSS_DELTA = -1.0
PLAYOFF_SEASON_TYPE = 'Playoffs'
FORM_WINDOW = 10
FORM_DECAY = 0.82
FORM_SWING_SCALE = 1.65


def _impact_index_delta(
    game: dict,
    *,
    rivalry_opponent_id: str | None = None,
    head_to_head_meeting: bool = False,
) -> float:
    """Weighted index move — bigger swings for playoffs, blowouts, and rivalry games."""
    margin = _margin(game)
    sign = 1.0 if game.get('result') == 'W' else -1.0
    magnitude = 1.0

    if abs(margin) >= 15:
        magnitude *= 1.75
    if (game.get('seasonType') or '') == PLAYOFF_SEASON_TYPE:
        magnitude *= 2.0
        if int(game.get('seriesGameNumber') or 0) >= 6:
            magnitude *= 1.25

    opp = (game.get('opponent') or '').upper()
    if head_to_head_meeting or (rivalry_opponent_id and opp == rivalry_opponent_id.upper()):
        magnitude *= 1.5

    return round(sign * magnitude, 2)


def _impact_point_meta(
    game: dict,
    *,
    rivalry_opponent_id: str | None = None,
    head_to_head_meeting: bool = False,
) -> dict[str, Any]:
    margin = _margin(game)
    is_playoff = (game.get('seasonType') or '') == PLAYOFF_SEASON_TYPE
    opp = (game.get('opponent') or '').upper()
    is_rivalry = head_to_head_meeting or bool(
        rivalry_opponent_id and opp == rivalry_opponent_id.upper(),
    )
    is_blowout = abs(margin) >= 15
    tier = 'normal'
    if is_playoff:
        tier = 'playoff'
    elif is_blowout:
        tier = 'blowout'
    elif is_rivalry:
        tier = 'rivalry'
    return {
        'isPlayoff': is_playoff,
        'isH2h': is_rivalry,
        'isBlowout': is_blowout,
        'impactTier': tier,
    }


def _impact_movement_reason(game: dict, delta: float, metric: str = 'index') -> str:
    margin = _margin(game)
    unit = 'index' if metric == 'index' else '% win rate'
    signed = f'{delta:+.2f}'.rstrip('0').rstrip('.') if metric == 'index' else f'{delta:+.0f}'
    if (game.get('seasonType') or '') == PLAYOFF_SEASON_TYPE:
        base = 'Playoff win' if game['result'] == 'W' else 'Playoff loss'
    elif abs(margin) >= 15:
        base = 'Blowout win' if game['result'] == 'W' else 'Blowout loss'
    elif abs(margin) <= 3:
        base = 'Close win' if game['result'] == 'W' else 'Close loss'
    else:
        base = 'Win' if game['result'] == 'W' else 'Loss'
    return f'{base} ({signed} {unit})'


def _parse_game_date(value: str) -> date:
    return date.fromisoformat(value[:10])


def _games_before(games: list[dict], before: date) -> list[dict]:
    return [g for g in games if _parse_game_date(g['date']) < before]


def _games_in_range(games: list[dict], start: date, end: date) -> list[dict]:
    return [
        g for g in games
        if start <= _parse_game_date(g['date']) <= end
    ]


def _effective_start(start: date, all_games: list[dict]) -> date:
    """All-time ranges begin at first observed game, not a sentinel epoch."""
    if all_games and start == date(1900, 1, 1):
        return _parse_game_date(all_games[0]['date'])
    return start


def _entry_win_pct(wins: int, total: int) -> float:
    if total == 0:
        return 50.0
    return round(wins / total * 100, 2)


def _cumulative_before(games: list[dict]) -> tuple[int, int, float]:
    wins = sum(1 for g in games if g['result'] == 'W')
    losses = len(games) - wins
    return wins, losses, _entry_win_pct(wins, len(games))


def _index_before(games: list[dict]) -> float:
    value = INDEX_BASE
    for g in sorted(games, key=lambda x: x['date']):
        value += WIN_DELTA if g['result'] == 'W' else LOSS_DELTA
    return value


def _impact_index_before(games: list[dict], *, rivalry_opponent_id: str | None = None) -> float:
    value = INDEX_BASE
    for g in sorted(games, key=lambda x: x['date']):
        value += _impact_index_delta(g, rivalry_opponent_id=rivalry_opponent_id)
    return round(value, 2)


def _game_form_score(
    game: dict,
    *,
    rivalry_opponent_id: str | None = None,
    head_to_head_meeting: bool = False,
) -> float:
    """Single-game form score (20–95) from result, margin, and stakes — not cumulative."""
    margin = _margin(game)
    is_win = game.get('result') == 'W'
    base = 64.0 if is_win else 36.0
    margin_adj = max(-20.0, min(20.0, margin * 0.6))
    score = base + margin_adj

    if (game.get('seasonType') or '') == PLAYOFF_SEASON_TYPE:
        score += 9.0 if is_win else -9.0
        if int(game.get('seriesGameNumber') or 0) >= 6:
            score += 4.0 if is_win else -4.0
    elif abs(margin) >= 15:
        score += 5.0 if is_win else -5.0

    opp = (game.get('opponent') or '').upper()
    if head_to_head_meeting or (rivalry_opponent_id and opp == rivalry_opponent_id.upper()):
        score += 4.0 if is_win else -4.0

    return max(20.0, min(95.0, score))


def _game_form_weight(
    game: dict,
    *,
    rivalry_opponent_id: str | None = None,
    head_to_head_meeting: bool = False,
) -> float:
    """Recency window weight — playoff and direct meetings count more in rolling form."""
    weight = 1.0
    if (game.get('seasonType') or '') == PLAYOFF_SEASON_TYPE:
        weight *= 2.4
        if int(game.get('seriesGameNumber') or 0) >= 6:
            weight *= 1.25
    if abs(_margin(game)) >= 15:
        weight *= 1.3
    opp = (game.get('opponent') or '').upper()
    if head_to_head_meeting or (rivalry_opponent_id and opp == rivalry_opponent_id.upper()):
        weight *= 1.45
    return weight


def _rolling_form_value(
    games: list[dict],
    *,
    rivalry_opponent_id: str | None = None,
    window: int = FORM_WINDOW,
) -> float:
    """Weighted rolling form mapped to an index centered at 100."""
    if not games:
        return INDEX_BASE
    window_games = games[-window:]
    total_weight = 0.0
    weighted_sum = 0.0
    for offset, game in enumerate(window_games):
        recency = FORM_DECAY ** (len(window_games) - 1 - offset)
        game_weight = _game_form_weight(game, rivalry_opponent_id=rivalry_opponent_id)
        combined = recency * game_weight
        weighted_sum += _game_form_score(game, rivalry_opponent_id=rivalry_opponent_id) * combined
        total_weight += combined
    if total_weight <= 0:
        return INDEX_BASE
    form_score = weighted_sum / total_weight
    return round(INDEX_BASE + (form_score - 62.0) * FORM_SWING_SCALE, 2)


def _form_movement_reason(game: dict, delta: float) -> str:
    margin = _margin(game)
    signed = f'{delta:+.2f}'.rstrip('0').rstrip('.')
    if (game.get('seasonType') or '') == PLAYOFF_SEASON_TYPE:
        base = 'Playoff form shift' if delta != 0 else 'Playoff game'
    elif abs(margin) >= 15:
        base = 'Blowout form shift' if delta != 0 else 'Blowout game'
    elif abs(margin) <= 3:
        base = 'Close-game form shift' if delta != 0 else 'Close game'
    else:
        base = 'Form shift' if delta != 0 else 'Game'
    return f'{base} ({signed} index)'


def build_momentum_form_series(
    all_games: list[dict],
    range_query: RangeQuery | str = 'week',
    *,
    rivalry_opponent_id: str | None = None,
) -> dict[str, Any]:
    """Rolling momentum index — game points only; peaks/valleys reflect recent form, not lifetime record."""
    rq = range_query if isinstance(range_query, RangeQuery) else resolve_range(preset=range_query, metric='index')
    start = _effective_start(rq.start_date, all_games)
    end = rq.end_date
    prior = _games_before(all_games, start)
    in_range = sorted(_games_in_range(all_games, start, end), key=lambda g: g['date'])
    ordered = sorted(prior + in_range, key=lambda g: g['date'])

    if not in_range:
        return _series_meta(rq, 'index', 0, [])

    points: list[dict] = []
    prior_count = len(prior)
    for offset, game in enumerate(in_range):
        idx = prior_count + offset
        through = ordered[: idx + 1]
        prev_through = ordered[:idx] if idx > 0 else []

        value = _rolling_form_value(through, rivalry_opponent_id=rivalry_opponent_id)
        prev_value = _rolling_form_value(prev_through, rivalry_opponent_id=rivalry_opponent_id) if prev_through else INDEX_BASE
        delta = round(value - prev_value, 2)
        impact = _impact_point_meta(game, rivalry_opponent_id=rivalry_opponent_id)

        points.append({
            'date': game['date'],
            'value': value,
            'previousValue': round(prev_value, 2),
            'movementAmount': delta,
            'gameId': game['id'],
            'opponentId': game['opponent'],
            'result': game['result'],
            'pointsFor': game['teamScore'],
            'pointsAgainst': game['opponentScore'],
            'margin': _margin(game),
            'movementReason': _form_movement_reason(game, delta),
            'flatline': False,
            'seriesKind': 'momentumForm',
            **impact,
        })

    meta = _series_meta(rq, 'index', len(in_range), points)
    meta['startDate'] = start.isoformat()
    meta['seriesKind'] = 'momentumForm'
    meta['indexLabel'] = 'rolling form'
    return meta


def _margin(game: dict) -> int:
    return int(game['teamScore']) - int(game['opponentScore'])


def _movement_reason(game: dict, metric: str = 'index') -> str:
    margin = _margin(game)
    unit = '% win rate' if metric == 'winPct' else 'index'
    if game['result'] == 'W':
        if margin >= 15:
            return f'Blowout win (+1 {unit})'
        if margin <= 3:
            return f'Close win (+1 {unit})'
        return f'Win (+1 {unit})'
    if margin <= -15:
        return f'Blowout loss (-1 {unit})'
    if margin >= -3:
        return f'Close loss (-1 {unit})'
    return f'Loss (-1 {unit})'


def _daily_points(
    start: date,
    end: date,
    games_by_date: dict[date, dict],
    initial_value: float,
    on_game,
) -> list[dict]:
    """Walk each calendar day; flatline when no game; step only on game days."""
    points: list[dict] = []
    value = initial_value
    d = start
    while d <= end:
        game = games_by_date.get(d)
        if game:
            prev = value
            value, point = on_game(d, game, value)
            point.setdefault('previousValue', round(prev, 2))
            point.setdefault('movementAmount', round(point['value'] - prev, 2))
            points.append(point)
        else:
            points.append({
                'date': d.isoformat(),
                'value': round(value, 2),
                'previousValue': round(value, 2),
                'movementAmount': 0,
                'gameId': None,
                'result': None,
                'movementReason': 'No game — value carried forward',
                'flatline': True,
            })
        d += timedelta(days=1)
    return points


def _dedupe_points_by_date(points: list[dict]) -> list[dict]:
    """Keep one point per calendar day; prefer game points over flatlines."""
    by_date: dict[str, dict] = {}
    for p in sorted(points, key=lambda x: x.get('date', '')):
        key = (p.get('date') or '')[:10]
        if not key:
            continue
        prev = by_date.get(key)
        if not prev:
            by_date[key] = p
            continue
        p_game = p.get('gameId') and not p.get('flatline')
        prev_game = prev.get('gameId') and not prev.get('flatline')
        if p_game and not prev_game:
            by_date[key] = p
        elif p_game == prev_game:
            by_date[key] = p
    return [by_date[k] for k in sorted(by_date.keys())]


def _series_meta(range_query: RangeQuery, metric: str, game_count: int, points: list) -> dict[str, Any]:
    meta = range_query.to_dict()
    return {
        'metric': metric,
        'range': range_query.preset,
        'rangeLabel': RANGE_LABELS.get(range_query.preset or '', meta['rangeLabel']),
        'startDate': meta['startDate'],
        'endDate': meta['endDate'],
        'gameCount': game_count,
        'points': points,
        'hasGames': game_count > 0,
    }


def build_win_pct_series(
    all_games: list[dict],
    range_query: RangeQuery | str = 'week',
) -> dict[str, Any]:
    """Cumulative win percentage — changes only on game days."""
    rq = range_query if isinstance(range_query, RangeQuery) else resolve_range(preset=range_query, metric='winPct')
    start = _effective_start(rq.start_date, all_games)
    end = rq.end_date
    prior = _games_before(all_games, start)
    wins, losses, prior_pct = _cumulative_before(prior)

    in_range = sorted(_games_in_range(all_games, start, end), key=lambda g: g['date'])
    games_by_date = {_parse_game_date(g['date']): g for g in in_range}

    def on_game(d: date, game: dict, value: float):
        nonlocal wins, losses
        prev_pct = value
        if game['result'] == 'W':
            wins += 1
        else:
            losses += 1
        total = wins + losses
        pct = _entry_win_pct(wins, total)
        return pct, {
            'date': d.isoformat(),
            'value': pct,
            'label': f"{pct}%",
            'gameId': game['id'],
            'opponentId': game['opponent'],
            'result': game['result'],
            'pointsFor': game['teamScore'],
            'pointsAgainst': game['opponentScore'],
            'margin': _margin(game),
            'cumulativeWins': wins,
            'cumulativeLosses': losses,
            'winPct': pct,
            'movementReason': _movement_reason(game, 'winPct'),
            'flatline': False,
        }

    initial = prior_pct if prior else 50.0
    points = _daily_points(start, end, games_by_date, initial, on_game)
    points = _dedupe_points_by_date(points)
    meta = _series_meta(rq, 'winPct', len(in_range), points)
    meta['startDate'] = start.isoformat()
    return meta


def build_index_series(
    all_games: list[dict],
    range_query: RangeQuery | str = 'week',
) -> dict[str, Any]:
    """Performance index — base 100, +1 win / -1 loss, flatline on off days."""
    rq = range_query if isinstance(range_query, RangeQuery) else resolve_range(preset=range_query, metric='index')
    start = _effective_start(rq.start_date, all_games)
    end = rq.end_date
    prior = _games_before(all_games, start)
    initial = _index_before(prior)

    in_range = sorted(_games_in_range(all_games, start, end), key=lambda g: g['date'])
    games_by_date = {_parse_game_date(g['date']): g for g in in_range}

    def on_game(d: date, game: dict, value: float):
        delta = WIN_DELTA if game['result'] == 'W' else LOSS_DELTA
        value += delta
        return value, {
            'date': d.isoformat(),
            'value': round(value, 2),
            'gameId': game['id'],
            'opponentId': game['opponent'],
            'result': game['result'],
            'pointsFor': game['teamScore'],
            'pointsAgainst': game['opponentScore'],
            'margin': _margin(game),
            'movementReason': _movement_reason(game, 'index'),
            'flatline': False,
        }

    points = _daily_points(start, end, games_by_date, initial, on_game)
    points = _dedupe_points_by_date(points)
    meta = _series_meta(rq, 'index', len(in_range), points)
    meta['startDate'] = start.isoformat()
    return meta


def build_impact_index_series(
    all_games: list[dict],
    range_query: RangeQuery | str = 'week',
    *,
    rivalry_opponent_id: str | None = None,
) -> dict[str, Any]:
    """Performance index with weighted game impact — flatline on off days."""
    rq = range_query if isinstance(range_query, RangeQuery) else resolve_range(preset=range_query, metric='index')
    start = _effective_start(rq.start_date, all_games)
    end = rq.end_date
    prior = _games_before(all_games, start)
    initial = _impact_index_before(prior, rivalry_opponent_id=rivalry_opponent_id)

    in_range = sorted(_games_in_range(all_games, start, end), key=lambda g: g['date'])
    games_by_date = {_parse_game_date(g['date']): g for g in in_range}

    def on_game(d: date, game: dict, value: float):
        delta = _impact_index_delta(game, rivalry_opponent_id=rivalry_opponent_id)
        value = round(value + delta, 2)
        impact = _impact_point_meta(game, rivalry_opponent_id=rivalry_opponent_id)
        return value, {
            'date': d.isoformat(),
            'value': value,
            'gameId': game['id'],
            'opponentId': game['opponent'],
            'result': game['result'],
            'pointsFor': game['teamScore'],
            'pointsAgainst': game['opponentScore'],
            'margin': _margin(game),
            'movementReason': _impact_movement_reason(game, delta, 'index'),
            'movementAmount': delta,
            'flatline': False,
            **impact,
        }

    points = _daily_points(start, end, games_by_date, initial, on_game)
    points = _dedupe_points_by_date(points)
    meta = _series_meta(rq, 'index', len(in_range), points)
    meta['startDate'] = start.isoformat()
    return meta


def build_h2h_matchup_index_series(h2h_games: list[dict]) -> dict[str, Any]:
    """Head-to-head arc — both teams start at 100 across direct meetings only."""
    selected = sorted(h2h_games, key=lambda g: g['date'])
    if not selected:
        return {'points': [], 'gameCount': 0, 'hasGames': False, 'metric': 'index'}

    points: list[dict] = []
    value = INDEX_BASE
    for meeting, game in enumerate(selected, start=1):
        prev = value
        delta = _impact_index_delta(game, head_to_head_meeting=True)
        value = round(value + delta, 2)
        impact = _impact_point_meta(game, head_to_head_meeting=True)
        points.append({
            'date': game['date'],
            'value': value,
            'previousValue': round(prev, 2),
            'movementAmount': delta,
            'gameId': game['id'],
            'opponentId': game['opponent'],
            'result': game['result'],
            'pointsFor': game['teamScore'],
            'pointsAgainst': game['opponentScore'],
            'margin': _margin(game),
            'movementReason': _impact_movement_reason(game, delta, 'index'),
            'flatline': False,
            'meetingNumber': meeting,
            **impact,
        })

    return {
        'metric': 'index',
        'gameCount': len(selected),
        'points': points,
        'hasGames': True,
        'startDate': selected[0]['date'][:10],
        'endDate': selected[-1]['date'][:10],
        'chartKind': 'headToHead',
    }


def build_win_pct_series_for_game_set(
    all_games: list[dict],
    selected_games: list[dict],
) -> dict[str, Any]:
    """Win % at each selected game — game points only, shared by chart and game log."""
    selected = sorted(selected_games, key=lambda g: g['date'])
    if not selected:
        return {'points': [], 'gameCount': 0, 'hasGames': False, 'metric': 'winPct'}

    sorted_all = sorted(all_games, key=lambda g: g['date'])
    points: list[dict] = []

    for game in selected:
        d = _parse_game_date(game['date'])
        through = [g for g in sorted_all if _parse_game_date(g['date']) <= d]
        prev = [g for g in sorted_all if _parse_game_date(g['date']) < d]
        wins = sum(1 for g in through if g['result'] == 'W')
        total = len(through)
        pct = _entry_win_pct(wins, total)
        prev_wins = sum(1 for g in prev if g['result'] == 'W')
        prev_total = len(prev)
        prev_pct = _entry_win_pct(prev_wins, prev_total) if prev_total else 50.0

        points.append({
            'date': game['date'],
            'value': pct,
            'label': f'{pct}%',
            'previousValue': round(prev_pct, 2),
            'movementAmount': round(pct - prev_pct, 2),
            'gameId': game['id'],
            'opponentId': game['opponent'],
            'result': game['result'],
            'pointsFor': game['teamScore'],
            'pointsAgainst': game['opponentScore'],
            'margin': _margin(game),
            'cumulativeWins': wins,
            'cumulativeLosses': total - wins,
            'winPct': pct,
            'movementReason': _movement_reason(game, 'winPct'),
            'flatline': False,
        })

    return {
        'metric': 'winPct',
        'gameCount': len(selected),
        'points': points,
        'hasGames': True,
        'startDate': selected[0]['date'][:10],
        'endDate': selected[-1]['date'][:10],
    }


def build_index_series_for_game_set(
    all_games: list[dict],
    selected_games: list[dict],
) -> dict[str, Any]:
    """Index at each selected game — game points only."""
    selected = sorted(selected_games, key=lambda g: g['date'])
    if not selected:
        return {'points': [], 'gameCount': 0, 'hasGames': False, 'metric': 'index'}

    sorted_all = sorted(all_games, key=lambda g: g['date'])
    points: list[dict] = []

    for game in selected:
        d = _parse_game_date(game['date'])
        prev = [g for g in sorted_all if _parse_game_date(g['date']) < d]
        value = _index_before(prev + [game])
        prev_value = _index_before(prev) if prev else INDEX_BASE

        points.append({
            'date': game['date'],
            'value': round(value, 2),
            'previousValue': round(prev_value, 2),
            'movementAmount': round(value - prev_value, 2),
            'gameId': game['id'],
            'opponentId': game['opponent'],
            'result': game['result'],
            'pointsFor': game['teamScore'],
            'pointsAgainst': game['opponentScore'],
            'margin': _margin(game),
            'movementReason': _movement_reason(game, 'index'),
            'flatline': False,
        })

    return {
        'metric': 'index',
        'gameCount': len(selected),
        'points': points,
        'hasGames': True,
        'startDate': selected[0]['date'][:10],
        'endDate': selected[-1]['date'][:10],
    }


def build_multi_team_series(
    team_games: dict[str, list[dict]],
    range_query: RangeQuery,
    metric: str = 'winPct',
) -> list[dict[str, Any]]:
    """Build one series per team — ready for league-wide visualization later."""
    builder = build_win_pct_series if metric == 'winPct' else build_index_series
    out = []
    for team_id, games in team_games.items():
        series = builder(games, range_query)
        series['teamId'] = team_id
        out.append(series)
    return out
