"""Team and league context — always surface the most relevant story from real games."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from lib.performance.range import reference_date

RECENT_GAME_LIMIT = 10
KEY_OPPONENT_LIMIT = 5


def _parse_day(value: str) -> date:
    return date.fromisoformat(value[:10])


def _margin(game: dict) -> int:
    return int(game['teamScore']) - int(game['opponentScore'])


def _win_pct(wins: int, total: int) -> float:
    if total == 0:
        return 50.0
    return round(wins / total * 100, 1)


def _game_summary(game: dict) -> dict[str, Any]:
    return {
        'id': game.get('id'),
        'date': game['date'][:10],
        'team': game.get('team', '').upper(),
        'opponent': game['opponent'].upper(),
        'teamScore': game['teamScore'],
        'opponentScore': game['opponentScore'],
        'result': game['result'],
        'margin': _margin(game),
    }


def compute_streak(games: list[dict]) -> dict[str, Any] | None:
    if not games:
        return None
    sorted_games = sorted(games, key=lambda g: g['date'], reverse=True)
    result = sorted_games[0]['result']
    length = 0
    for game in sorted_games:
        if game['result'] != result:
            break
        length += 1
    if length < 2:
        return None
    return {'result': result, 'length': length}


def _season_games(games: list[dict], ref: date) -> list[dict]:
    start_year = ref.year if ref.month >= 10 else ref.year - 1
    season_start = date(start_year, 10, 1)
    return [g for g in games if season_start <= _parse_day(g['date']) <= ref]


def _season_label(ref: date) -> str:
    start_year = ref.year if ref.month >= 10 else ref.year - 1
    return f'{start_year}–{str(start_year + 1)[-2:]}'


def _aggregate_opponents(games: list[dict], limit: int = KEY_OPPONENT_LIMIT) -> list[dict]:
    counts: dict[str, dict] = {}
    for game in games:
        opp = game['opponent'].upper()
        entry = counts.setdefault(opp, {'id': opp, 'wins': 0, 'losses': 0, 'lastDate': game['date']})
        if game['result'] == 'W':
            entry['wins'] += 1
        else:
            entry['losses'] += 1
        if game['date'] > entry['lastDate']:
            entry['lastDate'] = game['date']
    ranked = sorted(
        counts.values(),
        key=lambda row: (row['wins'] + row['losses'], row['lastDate']),
        reverse=True,
    )
    return ranked[:limit]


def _extreme_game(games: list[dict], *, wins: bool) -> dict | None:
    candidates = [g for g in games if (g['result'] == 'W') == wins]
    if not candidates:
        return None
    key = max if wins else min
    return key(candidates, key=_margin)


def _games_on_day(games: list[dict], day: date) -> list[dict]:
    iso = day.isoformat()
    return [g for g in games if g['date'][:10] == iso]


def _suggest_chart_preset(games: list[dict], ref: date) -> str:
    if _games_on_day(games, ref):
        return 'today'
    week_start = ref - timedelta(days=6)
    if any(week_start <= _parse_day(g['date']) <= ref for g in games):
        return 'week'
    month_start = ref - timedelta(days=29)
    if any(month_start <= _parse_day(g['date']) <= ref for g in games):
        return 'month'
    if _season_games(games, ref):
        return 'season'
    return 'all'


def _fallback_presets(games: list[dict], ref: date) -> list[str]:
    ordered = ['today', 'week', 'month', 'season', 'all']
    start = _suggest_chart_preset(games, ref)
    idx = ordered.index(start)
    return ordered[idx:]


def _phase(
    *,
    ref: date,
    today_game: dict | None,
    last_game: dict | None,
    season_games: list[dict],
) -> str:
    if today_game:
        return 'today_game'
    if last_game and _parse_day(last_game['date']) == ref - timedelta(days=1):
        return 'last_game'
    if season_games:
        days_since = (ref - _parse_day(season_games[-1]['date'])).days
        if days_since > 21:
            return 'offseason'
        return 'recent_trend'
    if last_game:
        return 'season_summary'
    return 'historical'


def _headline(
    phase: str,
    *,
    team_abbr: str,
    today_game: dict | None,
    last_game: dict | None,
    streak: dict | None,
    season_summary: dict | None,
    ref: date,
) -> tuple[str, str]:
    if phase == 'today_game' and today_game:
        result = today_game['result']
        opp = today_game['opponent']
        score = f"{today_game['teamScore']}–{today_game['opponentScore']}"
        tone = 'Final' if result in {'W', 'L'} else 'Today'
        return (
            f'{tone}: {team_abbr} vs {opp} · {score}',
            'Live from today’s result in the archive.',
        )

    if phase == 'last_game' and last_game:
        result = last_game['result']
        opp = last_game['opponent']
        score = f"{last_game['teamScore']}–{last_game['opponentScore']}"
        day = _parse_day(last_game['date']).strftime('%b %d')
        return (
            f'Last game · {day} vs {opp} · {result} {score}',
            'No game today — most recent result shown.',
        )

    if phase == 'offseason' and season_summary:
        record = season_summary['record']
        label = season_summary['seasonLabel']
        return (
            f'{label} complete · {team_abbr} finished {record}',
            'Offseason — season summary and final trends below.',
        )

    if streak and streak['length'] >= 3:
        return (
            f"{team_abbr} on a {streak['result']}{streak['length']} run",
            'Recent momentum from the last stretch of games.',
        )

    if season_summary and season_summary['games'] > 0:
        return (
            f"{season_summary['seasonLabel']} · {team_abbr} {season_summary['record']} ({season_summary['winPct']}%)",
            'Season snapshot from completed games.',
        )

    if last_game:
        day = _parse_day(last_game['date']).strftime('%b %d, %Y')
        return (
            f'Most recent · {day} vs {last_game["opponent"]}',
            'Showing the latest available game in the archive.',
        )

    return (
        f'{team_abbr} performance index',
        'Select a wider range to explore franchise history.',
    )


def build_team_context(team: dict, games: list[dict], ref: date | None = None) -> dict[str, Any]:
    """Build narrative context for a franchise from real historical games."""
    ref = ref or reference_date()
    abbr = team.get('abbreviation') or team['id']
    sorted_games = sorted(games, key=lambda g: g['date'])
    recent = list(reversed(sorted_games[-RECENT_GAME_LIMIT:]))
    today_rows = _games_on_day(sorted_games, ref)
    today_game = _game_summary(today_rows[-1]) if today_rows else None
    last_game = _game_summary(sorted_games[-1]) if sorted_games else None
    season_rows = _season_games(sorted_games, ref)
    streak = compute_streak(sorted_games)

    season_wins = sum(1 for g in season_rows if g['result'] == 'W')
    season_losses = len(season_rows) - season_wins
    biggest_win = _extreme_game(season_rows, wins=True)
    biggest_loss = _extreme_game(season_rows, wins=False)
    season_summary = {
        'seasonLabel': _season_label(ref),
        'games': len(season_rows),
        'wins': season_wins,
        'losses': season_losses,
        'record': f'{season_wins}–{season_losses}',
        'winPct': _win_pct(season_wins, len(season_rows)),
        'biggestWin': _game_summary(biggest_win) if biggest_win else None,
        'biggestLoss': _game_summary(biggest_loss) if biggest_loss else None,
        'keyOpponents': _aggregate_opponents(season_rows),
    }

    phase = _phase(
        ref=ref,
        today_game=today_rows[-1] if today_rows else None,
        last_game=sorted_games[-1] if sorted_games else None,
        season_games=season_rows,
    )
    headline, subheadline = _headline(
        phase,
        team_abbr=abbr,
        today_game=today_game,
        last_game=last_game,
        streak=streak,
        season_summary=season_summary if season_rows else None,
        ref=ref,
    )

    days_since_last = None
    if sorted_games:
        days_since_last = (ref - _parse_day(sorted_games[-1]['date'])).days

    outlook = None
    if phase == 'offseason':
        next_open = date(ref.year if ref.month < 10 else ref.year + 1, 10, 1)
        if next_open <= ref:
            next_open = date(ref.year + 1, 10, 1)
        outlook = f'Next season opens {next_open.strftime("%b %Y")}'

    return {
        'teamId': team['id'],
        'phase': phase,
        'headline': headline,
        'subheadline': subheadline,
        'todayGame': today_game,
        'lastGame': last_game,
        'recentGames': [_game_summary(g) for g in recent],
        'streak': streak,
        'seasonSummary': season_summary if season_rows else None,
        'keyOpponents': season_summary['keyOpponents'] if season_rows else _aggregate_opponents(sorted_games[-20:]),
        'suggestedPreset': _suggest_chart_preset(sorted_games, ref),
        'fallbackPresets': _fallback_presets(sorted_games, ref),
        'daysSinceLastGame': days_since_last,
        'outlook': outlook,
        'hasGames': bool(sorted_games),
    }


def build_league_spotlight(
    featured_team_id: str,
    series: dict,
    *,
    headline: str | None = None,
) -> dict[str, Any]:
    points = series.get('points') or []
    game_points = [p for p in points if p.get('gameId') and not p.get('flatline')]
    return {
        'teamId': featured_team_id,
        'headline': headline or 'League spotlight',
        'series': series,
        'gameCount': series.get('gameCount') or len(game_points),
    }
