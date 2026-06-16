/**
 * Chart lens vs archive-backed game log — do not let chart range shrink the log.
 */

export const GAME_SET_LIMIT = 10;

export function resolveGameSet({
  mode,
  teamA,
  teamB,
  timeState,
  referenceDate,
  limit = GAME_SET_LIMIT,
}) {
  return {
    mode: mode || 'solo',
    teamA: teamA || null,
    teamB: teamB || null,
    timeState: timeState || 'season',
    referenceDate: referenceDate || null,
    limit,
  };
}

/** Range-sensitive chart + series from API payload. */
export function applyChartPayload(payload, mode) {
  const chartSet = payload?.chartSet ?? payload?.gameSet ?? null;
  const series = payload?.series ?? chartSet?.series ?? null;
  return {
    chartSet,
    series,
    metric: chartSet?.metric ?? (mode === 'matchup' ? 'index' : 'winPct'),
    mode: chartSet?.mode || mode,
    count: chartSet?.count ?? 0,
    preset: payload?.range ?? chartSet?.preset ?? null,
  };
}

/** Full selected-range summary for hero stats (not capped to game log). */
export function applyRangeStatsPayload(payload) {
  return {
    rangeStats: payload?.rangeStats ?? null,
  };
}

/** Archive-backed game log (latest real games for context). */
export function applyArchiveLogPayload(payload, mode) {
  const archiveLog = payload?.archiveLog ?? null;
  const games = archiveLog?.games ?? payload?.games ?? [];
  return {
    archiveLog: archiveLog ? { ...archiveLog, mode: archiveLog.mode || mode } : null,
    games,
    metric: archiveLog?.metric ?? (mode === 'matchup' ? 'index' : 'winPct'),
    mode: archiveLog?.mode || mode,
    count: archiveLog?.count ?? games.length,
    limit: archiveLog?.limit ?? GAME_SET_LIMIT,
    honestCount: archiveLog?.honestCount ?? archiveLog?.count ?? games.length,
  };
}

/** @deprecated — use applyChartPayload + applyArchiveLogPayload */
export function applyGameSetPayload(payload, mode) {
  const chart = applyChartPayload(payload, mode);
  const archive = applyArchiveLogPayload(payload, mode);
  return { ...chart, ...archive, gameSet: chart.chartSet };
}

export function gameLogRowsFromSet(archiveLog, { dedupeFn } = {}) {
  if (!archiveLog?.games?.length) {
    return {
      games: [],
      metric: archiveLog?.metric ?? 'winPct',
      mode: archiveLog?.mode ?? 'solo',
      count: 0,
    };
  }
  const sorted = [...archiveLog.games].sort((a, b) => b.date.localeCompare(a.date));
  const games = dedupeFn ? dedupeFn(sorted) : sorted;
  return {
    games,
    metric: archiveLog.metric ?? 'winPct',
    mode: archiveLog.mode ?? 'solo',
    count: archiveLog.count ?? games.length,
    limit: archiveLog.limit ?? GAME_SET_LIMIT,
    honestCount: archiveLog.honestCount ?? games.length,
  };
}

export function seriesForChart(chartSet, payload, mode) {
  if (mode === 'matchup') {
    return payload?.series ?? chartSet?.series ?? [];
  }
  return payload?.series ?? chartSet?.series ?? null;
}
