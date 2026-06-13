/**
 * Chart resolution profiles — mirror of lib/performance/resolution.py.
 * Governs render density, markers, ghost opponent, and tooltip mode per range.
 */

export const MAX_RENDER_POINTS_CEILING = 900;

/** @typedef {'game'|'day'|'week'|'month'|'season'} ResolutionUnit */
/** @typedef {'game'|'game-or-day'|'period'|'league-summary'} TooltipMode */

/** @typedef {{
 *   preset: string,
 *   resolution: ResolutionUnit,
 *   maxPointsPerSeries: number,
 *   showMarkers: boolean,
 *   showGhostOpponent: boolean,
 *   tooltipMode: TooltipMode,
 * }} ChartProfile */

/** @type {Record<string, ChartProfile>} */
export const RESOLUTION_BY_PRESET = {
  today: {
    preset: 'today',
    resolution: 'game',
    maxPointsPerSeries: 20,
    showMarkers: true,
    showGhostOpponent: true,
    tooltipMode: 'game',
  },
  week: {
    preset: 'week',
    resolution: 'game',
    maxPointsPerSeries: 30,
    showMarkers: true,
    showGhostOpponent: false,
    tooltipMode: 'game',
  },
  month: {
    preset: 'month',
    resolution: 'day',
    maxPointsPerSeries: 90,
    showMarkers: true,
    showGhostOpponent: false,
    tooltipMode: 'game-or-day',
  },
  season: {
    preset: 'season',
    resolution: 'week',
    maxPointsPerSeries: 40,
    showMarkers: false,
    showGhostOpponent: false,
    tooltipMode: 'period',
  },
  all: {
    preset: 'all',
    resolution: 'month',
    maxPointsPerSeries: 120,
    showMarkers: false,
    showGhostOpponent: false,
    tooltipMode: 'period',
  },
  league: {
    preset: 'league',
    resolution: 'season',
    maxPointsPerSeries: 10,
    showMarkers: false,
    showGhostOpponent: false,
    tooltipMode: 'league-summary',
  },
};

export const DEFAULT_PRESET = 'week';

/** @param {string|null|undefined} preset */
export function resolveProfile(preset) {
  return RESOLUTION_BY_PRESET[preset] ?? RESOLUTION_BY_PRESET[DEFAULT_PRESET];
}

/** @param {ChartProfile} profile */
export function isDenseProfile(profile) {
  return profile.resolution !== 'game';
}

/** @param {ChartProfile} profile */
export function showTrendOverlay(profile) {
  return profile.tooltipMode === 'period' || profile.tooltipMode === 'league-summary';
}

/** @param {string|null|undefined} preset @param {boolean} isSolo */
export function ghostOpponentEnabled(preset, isSolo = true) {
  if (!isSolo) return false;
  return resolveProfile(preset).showGhostOpponent;
}
