/**
 * Chart resolution profiles — mirror of lib/performance/resolution.py.
 * Governs render density, markers, ghost opponent, and tooltip mode per range.
 */

export const MAX_RENDER_POINTS_CEILING = 900;

/** @typedef {'game'|'day'|'week'|'month'|'season'} ResolutionUnit */
/** @typedef {'game'|'game-or-day'|'period'|'league-summary'} TooltipMode */
/** @typedef {'none'|'full'|'segments'|'markers'} GhostMode */

/** @typedef {{
 *   preset: string,
 *   resolution: ResolutionUnit,
 *   maxPointsPerSeries: number,
 *   showMarkers: boolean,
 *   showGhostOpponent: boolean,
 *   ghostMode: GhostMode,
 *   maxGhostOpponents: number,
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
    ghostMode: 'full',
    maxGhostOpponents: 1,
    tooltipMode: 'game',
  },
  week: {
    preset: 'week',
    resolution: 'game',
    maxPointsPerSeries: 30,
    showMarkers: true,
    showGhostOpponent: true,
    ghostMode: 'segments',
    maxGhostOpponents: 5,
    tooltipMode: 'game',
  },
  month: {
    preset: 'month',
    resolution: 'day',
    maxPointsPerSeries: 90,
    showMarkers: true,
    showGhostOpponent: false,
    ghostMode: 'markers',
    maxGhostOpponents: 3,
    tooltipMode: 'game-or-day',
  },
  season: {
    preset: 'season',
    resolution: 'week',
    maxPointsPerSeries: 40,
    showMarkers: false,
    showGhostOpponent: false,
    ghostMode: 'none',
    maxGhostOpponents: 0,
    tooltipMode: 'period',
  },
  all: {
    preset: 'all',
    resolution: 'month',
    maxPointsPerSeries: 120,
    showMarkers: false,
    showGhostOpponent: false,
    ghostMode: 'none',
    maxGhostOpponents: 0,
    tooltipMode: 'period',
  },
  league: {
    preset: 'league',
    resolution: 'season',
    maxPointsPerSeries: 10,
    showMarkers: false,
    showGhostOpponent: false,
    ghostMode: 'none',
    maxGhostOpponents: 0,
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
export function ghostModeForPreset(preset, isSolo = true) {
  if (!isSolo) return 'none';
  return resolveProfile(preset).ghostMode ?? 'none';
}

/** @param {string|null|undefined} preset @param {boolean} isSolo */
export function ghostOpponentEnabled(preset, isSolo = true) {
  const mode = ghostModeForPreset(preset, isSolo);
  return mode !== 'none';
}

/** @param {ChartProfile} profile */
export function ghostUsesOverlay(profile) {
  return profile.ghostMode === 'full' || profile.ghostMode === 'segments';
}
