/** Flexible range object — presets populate start/end dates internally. */

/** Product-facing aliases — preset keys stay `today` / `all` for API compatibility. */
export const RANGE_PRESET_ALIASES = {
  latest: 'today',
  archive: 'all',
};

export function normalizeRangePreset(preset) {
  if (!preset) return preset;
  const key = String(preset).toLowerCase();
  return RANGE_PRESET_ALIASES[key] ?? preset;
}

export const RANGE_LABELS = {
  today: 'Latest',
  week: 'Week',
  month: 'Month',
  season: 'Season',
  all: 'Archive',
  series: 'Series',
};

/** Hero stat block scope — full selected range, not game-log rows. */
export const STAT_SCOPE_LABELS = {
  today: 'Latest',
  week: 'This week',
  month: 'This month',
  season: 'Current Season',
  all: 'Loaded archive',
  matchup: 'Head-to-head',
};

/** Loaded multi-season archive — never "All Time" unless the dataset is truly complete. */
export function archiveSampleLabel(seasonCount) {
  const n = Number(seasonCount);
  if (Number.isFinite(n) && n > 0 && n <= 12) {
    return `${n}-season archive`;
  }
  return 'Full archive';
}

export function scopeLabelForPreset(preset, { seasonCount } = {}) {
  if (preset === 'all') return archiveSampleLabel(seasonCount);
  return STAT_SCOPE_LABELS[preset] ?? RANGE_LABELS[preset] ?? preset ?? '';
}

export const FRANCHISE_RANGE_PRESETS = ['today', 'week', 'month', 'season', 'all'];
export const MATCHUP_RANGE_PRESETS = ['season', 'all'];

/** Right-side range bar — one visible set per mode. */
export const FRANCHISE_RANGE_CONTROLS = [
  { preset: 'today', label: 'Latest' },
  { preset: 'week', label: 'Week' },
  { preset: 'month', label: 'Month' },
  { preset: 'season', label: 'Season' },
  { preset: 'all', label: 'Archive' },
];

export const MATCHUP_RANGE_CONTROLS = [
  { preset: 'season', label: 'Season' },
  { preset: 'all', label: 'Archive' },
];

/** Map legacy or invalid matchup presets to the active comparison lens. */
export function normalizeMatchupPreset(preset) {
  if (!preset || preset === 'matchup' || preset === 'series') return 'season';
  return preset;
}
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
  preset = normalizeRangePreset(preset);
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
  if (preset === 'matchup') {
    return presetDates('season', ref);
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
    const normalized = normalizeRangePreset(preset);
    const dates = presetDates(normalized);
    return {
      ...dates,
      teams,
      mode,
      metric,
      preset: normalized,
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

export function rangeLabel(range, { seasonCount } = {}) {
  if (range?.preset === 'all') return archiveSampleLabel(seasonCount);
  if (range?.preset && RANGE_LABELS[range.preset]) return RANGE_LABELS[range.preset];
  if (range?.startDate && range?.endDate) return `${range.startDate} – ${range.endDate}`;
  return 'Custom range';
}

export function rangeToQuery(range) {
  const params = new URLSearchParams();
  // Preset is authoritative — do not send date bounds that would override it server-side.
  if (range.preset) {
    params.set('range', range.preset);
  } else if (range.startDate && range.endDate) {
    params.set('startDate', range.startDate);
    params.set('endDate', range.endDate);
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

/** Anchor chart + filters to a game: Latest on ref-today, else the 7-day window ending that day. */
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
