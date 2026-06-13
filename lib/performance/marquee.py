"""Featured homepage matchup — curated default state for Orbit."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from lib.performance.range import reference_date

TEAM_MARQUEE_WEIGHT: dict[str, int] = {
    'LAL': 10,
    'GSW': 9,
    'BOS': 9,
    'NYK': 8,
    'DEN': 7,
    'OKC': 7,
    'MIA': 6,
    'PHI': 6,
    'DAL': 5,
    'CHI': 5,
    'SAS': 4,
    'PHX': 4,
    'LAC': 4,
    'MIL': 4,
    'CLE': 3,
    'HOU': 3,
    'MEM': 3,
    'ATL': 3,
    'POR': 3,
    'MIN': 3,
    'NOP': 3,
    'IND': 3,
    'UTA': 2,
    'ORL': 2,
    'TOR': 2,
    'WAS': 2,
    'CHA': 2,
    'DET': 2,
    'BKN': 2,
    'SAC': 2,
}

RIVALRY_BONUS: dict[frozenset[str], int] = {
    frozenset({'LAL', 'GSW'}): 14,
    frozenset({'BOS', 'NYK'}): 12,
    frozenset({'DEN', 'OKC'}): 10,
    frozenset({'LAL', 'BOS'}): 8,
    frozenset({'MIA', 'NYK'}): 6,
    frozenset({'DAL', 'SAS'}): 5,
    frozenset({'CHI', 'CLE'}): 4,
}

FINALS_MATCHUP = ('BOS', 'OKC')
OPENING_NIGHT_MATCHUPS = [
    ('BOS', 'NYK'),
    ('LAL', 'GSW'),
    ('OKC', 'DEN'),
]


def _pair_key(team_a: str, team_b: str) -> frozenset[str]:
    return frozenset({team_a.upper(), team_b.upper()})


def _pair_score(team_a: str, team_b: str) -> int:
    a, b = team_a.upper(), team_b.upper()
    score = TEAM_MARQUEE_WEIGHT.get(a, 2) + TEAM_MARQUEE_WEIGHT.get(b, 2)
    score += RIVALRY_BONUS.get(_pair_key(a, b), 0)
    return score


def _games_by_date(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """One representative row per unique matchup per calendar day."""
    buckets: dict[str, dict[frozenset[str], dict[str, Any]]] = defaultdict(dict)
    for row in rows:
        day = (row.get('date') or '')[:10]
        if not day:
            continue
        team = (row.get('team') or '').upper()
        opp = (row.get('opponent') or '').upper()
        if not team or not opp:
            continue
        key = _pair_key(team, opp)
        if key not in buckets[day]:
            buckets[day][key] = row
    return {day: list(matchups.values()) for day, matchups in buckets.items()}


def _best_game_on_date(games: list[dict[str, Any]]) -> dict[str, Any]:
    return max(games, key=lambda g: _pair_score(g['team'], g['opponent']))


def _game_summary(row: dict[str, Any]) -> dict[str, Any]:
    return {
        'date': row['date'][:10],
        'team': row['team'].upper(),
        'opponent': row['opponent'].upper(),
        'teamScore': row['teamScore'],
        'opponentScore': row['opponentScore'],
        'result': row['result'],
    }


def _matchup_payload(
    team_a: str,
    team_b: str,
    *,
    context: str,
    headline: str,
    subheadline: str | None,
    range_preset: str,
    featured_game: dict[str, Any] | None = None,
) -> dict[str, Any]:
  a, b = team_a.upper(), team_b.upper()
  return {
      'heroMode': 'matchup',
      'context': context,
      'headline': headline,
      'subheadline': subheadline,
      'range': range_preset,
      'teamA': a,
      'teamB': b,
      'selectedTeamId': a,
      'featuredGame': featured_game,
  }


def _is_post_finals_window(ref: date) -> bool:
    if ref.month == 7:
        return True
    return ref.month == 6 and ref.day >= 20


def _is_deep_offseason(ref: date) -> bool:
    return ref.month in (8, 9) or (ref.month == 10 and ref.day < 15)


def _finals_feature(ref: date) -> dict[str, Any]:
    team_a, team_b = FINALS_MATCHUP
    return _matchup_payload(
        team_a,
        team_b,
        context='finals_marquee',
        headline='NBA Finals',
        subheadline='Championship spotlight',
        range_preset='season',
    )


def _opening_preview_feature(ref: date) -> dict[str, Any]:
    best = max(
        OPENING_NIGHT_MATCHUPS,
        key=lambda pair: _pair_score(pair[0], pair[1]),
    )
    return _matchup_payload(
        best[0],
        best[1],
        context='opening_preview',
        headline='Opening Night Preview',
        subheadline='Season opener watch',
        range_preset='season',
    )


def _recent_marquee_feature(
    game: dict[str, Any],
    ref: date,
    days_ago: int,
) -> dict[str, Any]:
    summary = _game_summary(game)
    team_a = summary['team']
    team_b = summary['opponent']
    result = summary['result']
    score_line = f'{team_a} {summary["teamScore"]}–{summary["opponentScore"]} {team_b}'
    if result == 'W':
        final_line = f'Final: {team_a} {summary["teamScore"]}–{summary["opponentScore"]} {team_b}'
    else:
        final_line = f'Final: {team_b} {summary["opponentScore"]}–{summary["teamScore"]} {team_a}'

    preset = 'week' if days_ago <= 10 else 'month'
    return _matchup_payload(
        team_a,
        team_b,
        context='recent_marquee',
        headline='Most Recent Marquee Matchup',
        subheadline=final_line,
        range_preset=preset,
        featured_game=summary,
    )


def resolve_featured_matchup(
    games: list[dict[str, Any]],
    ref: date | None = None,
) -> dict[str, Any]:
    """Pick the homepage featured matchup from normalized demo game rows."""
    ref = ref or reference_date()
    by_date = _games_by_date(games)
    if not by_date:
        return _opening_preview_feature(ref)

    ref_iso = ref.isoformat()
    sorted_dates = sorted(by_date.keys())

    if ref_iso in by_date:
        game = _best_game_on_date(by_date[ref_iso])
        return _matchup_payload(
            game['team'],
            game['opponent'],
            context='today_marquee',
            headline="Today's Marquee Matchup",
            subheadline=None,
            range_preset='today',
            featured_game=_game_summary(game),
        )

    past_dates = [d for d in sorted_dates if d <= ref_iso]
    if past_dates:
        latest = max(past_dates)
        days_ago = (ref - date.fromisoformat(latest)).days
        game = _best_game_on_date(by_date[latest])
        if days_ago <= 45:
            if _is_post_finals_window(ref) and days_ago > 14:
                return _finals_feature(ref)
            return _recent_marquee_feature(game, ref, days_ago)

    if _is_deep_offseason(ref):
        return _opening_preview_feature(ref)

    if _is_post_finals_window(ref):
        return _finals_feature(ref)

    latest = sorted_dates[-1]
    game = _best_game_on_date(by_date[latest])
    days_ago = (ref - date.fromisoformat(latest)).days
    return _recent_marquee_feature(game, ref, days_ago)
