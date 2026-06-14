/** Flexible range object — presets populate start/end dates internally. */

export const RANGE_LABELS = {
  today: 'Today',
  week: 'Past Week',
  month: 'Past Month',
  season: 'Current Season',
  all: 'All Time',
  series: 'Series',
};

export const FRANCHISE_RANGE_PRESETS = ['today', 'week', 'month', 'season', 'all'];
export const MATCHUP_RANGE_PRESETS = ['series', 'season', 'all'];
export const MATCHUP_DEFAULT_PRESET = 'season';

/** @deprecated use FRANCHISE_RANGE_PRESETS */
export const RANGE_PRESETS = FRANCHISE_RANGE_PRESETS;

let referenceDateOverride = null;

/** Sync client preset math with server ORBIT_REFERENCE_DATE. */
export function setReferenceDate(isoDate) {
  if (!isoDate) {
    referenceDateOverride = null;
    return;
  }
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  referenceDateOverride = new Date(y, m - 1, d);
}

export function referenceDate() {
  return referenceDateOverride ? new Date(referenceDateOverride) : new Date();
}

function toIsoDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function presetDates(preset, ref = referenceDate()) {
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const start = new Date(end);
  if (preset === 'today') return { startDate: toIsoDateString(end), endDate: toIsoDateString(end) };
  if (preset === 'week') {
    start.setDate(start.getDate() - 6);
    return { startDate: toIsoDateString(start), endDate: toIsoDateString(end) };
  }
  if (preset === 'month') {
    start.setDate(start.getDate() - 29);
    return { startDate: toIsoDateString(start), endDate: toIsoDateString(end) };
  }
  if (preset === 'season') {
    const startYear = end.getMonth() >= 9 ? end.getFullYear() : end.getFullYear() - 1;
    const seasonStart = new Date(startYear, 9, 1);
    return { startDate: toIsoDateString(seasonStart), endDate: toIsoDateString(end) };
  }
  if (preset === 'all') {
    return { startDate: '1900-01-01', endDate: toIsoDateString(end) };
  }
  if (preset === 'series') {
    return { startDate: '1900-01-01', endDate: toIsoDateString(end) };
  }
  throw new Error(`Unknown preset: ${preset}`);
}

/** @returns {{ startDate, endDate, teams, mode, metric, preset }} */
export function createRange({
  preset = 'week',
  startDate = null,
  endDate = null,
  teams = [],
  mode = 'franchise',
  metric = 'winPct',
} = {}) {
  if (startDate && endDate) {
    return {
      startDate,
      endDate,
      teams,
      mode,
      metric,
      preset: null,
    };
  }
  if (preset) {
    const dates = presetDates(preset);
    return {
      ...dates,
      teams,
      mode,
      metric,
      preset,
    };
  }
  return {
    startDate,
    endDate,
    teams,
    mode,
    metric,
    preset: preset || null,
  };
}

export function rangeLabel(range) {
  if (range.preset && RANGE_LABELS[range.preset]) return RANGE_LABELS[range.preset];
  if (range.startDate && range.endDate) return `${range.startDate} – ${range.endDate}`;
  return 'Custom range';
}

export function rangeToQuery(range) {
  const params = new URLSearchParams();
  if (range.startDate && range.endDate) {
    params.set('startDate', range.startDate);
    params.set('endDate', range.endDate);
  } else if (range.preset) {
    params.set('range', range.preset);
  }
  if (range.mode) params.set('mode', range.mode);
  if (range.metric) params.set('metric', range.metric);
  return params.toString();
}

/** @param {string} preset @param {string} isoDate @param {Date} [ref] */
export function presetContainsDate(preset, isoDate, ref = referenceDate()) {
  const { startDate, endDate } = presetDates(preset, ref);
  const d = isoDate.slice(0, 10);
  return d >= startDate && d <= endDate;
}

/** Narrowest preset window that includes the game date. */
export function smallestPresetContainingDate(isoDate, ref = referenceDate()) {
  for (const preset of RANGE_PRESETS) {
    if (presetContainsDate(preset, isoDate, ref)) return preset;
  }
  return 'all';
}

/**
 * Broadest useful jump from an empty current preset to one that contains the game.
 * Returns null when the game is already inside the current range or no jump exists.
 */
export function jumpPresetForLastPlayed(currentPreset, isoDate, ref = referenceDate()) {
  const currentIdx = RANGE_PRESETS.indexOf(currentPreset);
  if (currentIdx < 0) return null;
  const target = smallestPresetContainingDate(isoDate, ref);
  const targetIdx = RANGE_PRESETS.indexOf(target);
  if (targetIdx <= currentIdx) return null;
  return target;
}

/** Anchor chart + filters to a game: Today on ref-today, else the 7-day window ending that day. */
export function createRangeForGameDate(
  gameDate,
  { mode = 'franchise', metric = 'winPct' } = {},
) {
  const dateStr = String(gameDate || '').slice(0, 10);
  if (!dateStr) {
    return createRange({ preset: 'week', mode, metric });
  }
  if (presetContainsDate('today', dateStr)) {
    return createRange({ preset: 'today', mode, metric });
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const end = new Date(y, m - 1, d);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return createRange({
    startDate: toIsoDateString(start),
    endDate: toIsoDateString(end),
    mode,
    metric,
    preset: null,
  });
}
