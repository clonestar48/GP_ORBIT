"""Build chart series from real game results — no fabricated volatility."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from .range import RANGE_LABELS, RangeQuery, resolve_range

INDEX_BASE = 100.0
WIN_DELTA = 1.0
LOSS_DELTA = -1.0


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
    meta = _series_meta(rq, 'index', len(in_range), points)
    meta['startDate'] = start.isoformat()
    return meta


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
