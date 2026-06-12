/**
 * Form / success score from real game outcomes only.
 * Returns null when scores are missing — never invents values.
 */

export function gameSuccessScore(teamScore, opponentScore) {
  if (teamScore == null || opponentScore == null) return null;
  const ts = Number(teamScore);
  const os = Number(opponentScore);
  if (!Number.isFinite(ts) || !Number.isFinite(os)) return null;

  const margin = ts - os;
  if (margin > 0) return Math.min(100, Math.round(55 + margin * 2.5));
  if (margin < 0) return Math.max(0, Math.round(45 + margin * 2.5));
  return 50;
}

export function rollingFormScore(games, endIndex, window = 5) {
  const slice = games.slice(Math.max(0, endIndex - window + 1), endIndex + 1);
  const scores = slice.map((g) => g.successScore).filter((s) => s != null);
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function latestFormScore(games, window = 5) {
  if (!games.length) return null;
  return rollingFormScore(games, games.length - 1, window);
}
