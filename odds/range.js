/** Flexible range object — presets populate start/end dates internally. */

export const RANGE_LABELS = {
  today: 'Today',
  week: 'Past Week',
  month: 'Past Month',
  season: 'Current Season',
  all: 'All Time',
};

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function presetDates(preset, ref = new Date()) {
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const start = new Date(end);
  if (preset === 'today') return { startDate: isoDate(end), endDate: isoDate(end) };
  if (preset === 'week') {
    start.setDate(start.getDate() - 6);
    return { startDate: isoDate(start), endDate: isoDate(end) };
  }
  if (preset === 'month') {
    start.setDate(start.getDate() - 29);
    return { startDate: isoDate(start), endDate: isoDate(end) };
  }
  if (preset === 'season') {
    const startYear = end.getMonth() >= 9 ? end.getFullYear() : end.getFullYear() - 1;
    const seasonStart = new Date(startYear, 9, 1);
    return { startDate: isoDate(seasonStart), endDate: isoDate(end) };
  }
  if (preset === 'all') {
    return { startDate: '1900-01-01', endDate: isoDate(end) };
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
  if (preset && !startDate && !endDate) {
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
  if (range.preset) params.set('range', range.preset);
  else {
    if (range.startDate) params.set('startDate', range.startDate);
    if (range.endDate) params.set('endDate', range.endDate);
  }
  if (range.mode) params.set('mode', range.mode);
  if (range.metric) params.set('metric', range.metric);
  return params.toString();
}
