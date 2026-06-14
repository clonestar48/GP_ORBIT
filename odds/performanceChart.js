/**
 * Performance chart renderer — flatlines on off days, steps only on game days.
 * drawMultiSeriesChart supports N teams for future league-wide mode.
 */

import {
  MAX_RENDER_POINTS_CEILING,
  isDenseProfile,
  resolveProfile,
  showTrendOverlay,
} from './resolution.js';

const MIN_MARKER_SPACING_PX = 9;
const MIN_LINE_BUCKET_PX = 1.5;
const LANDMARK_MOVE_THRESHOLD_WIN = 0.75;
const LANDMARK_MOVE_THRESHOLD_INDEX = 1.5;
const LANDMARK_PROMINENCE_WIN = 0.9;
const LANDMARK_PROMINENCE_INDEX = 2;
const MAX_LANDMARKS_DENSE = 12;
const MAX_LANDMARKS_DEFAULT = 18;
const DAY_MS = 86400000;
const MICRO_Y_SPAN_WIN = 8;
const MICRO_Y_SPAN_INDEX = 4;
const MICRO_SERIES_X_OFFSET_PX = 14;

/** Shared plot insets — same spatial role across Overview, Solo, Matchup. */
export const CHART_LAYOUT = {
  top: 20,
  right: 20,
  bottom: 20,
  leftGutter: 44,
};

function resolvePlot(w, h, layout = CHART_LAYOUT) {
  const left = layout.leftGutter;
  const right = w - layout.right;
  const top = layout.top;
  const bottom = h - layout.bottom;
  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(right - left, 1),
    height: Math.max(bottom - top, 1),
    layout,
  };
}

/** Sparse displayed data — keyed on point count, not range preset. */
export function isMicroChart(allPoints) {
  if (!allPoints?.length) return false;
  const normalized = normalizeSeriesPoints(allPoints);
  const dates = new Set(
    normalized.map((p) => (p.date || '').slice(0, 10)).filter(Boolean),
  );
  const gameCount = normalized.filter((p) => p.gameId && !p.flatline).length;
  if (dates.size <= 1) return true;
  if (gameCount <= 2) return true;
  return false;
}

/** Preserve game days and flat-run boundaries; cap render cost on long ranges. */
export function thinPointsForRender(points, maxPoints = MAX_RENDER_POINTS_CEILING) {
  return downsampleSeriesPoints(points, maxPoints);
}

/** Sort chronologically; prefer game points over flatline on the same date. */
export function normalizeSeriesPoints(points) {
  if (!points?.length) return [];

  const sorted = [...points].sort((a, b) => {
    const cmp = (a.date || '').localeCompare(b.date || '');
    if (cmp !== 0) return cmp;
    const aGame = a.gameId && !a.flatline ? 1 : 0;
    const bGame = b.gameId && !b.flatline ? 1 : 0;
    return bGame - aGame;
  });

  const byDate = new Map();
  for (const p of sorted) {
    const key = (p.date || '').slice(0, 10);
    if (!key) continue;
    const prev = byDate.get(key);
    if (!prev) {
      byDate.set(key, p);
      continue;
    }
    const pGame = p.gameId && !p.flatline;
    const prevGame = prev.gameId && !prev.flatline;
    if (pGame && !prevGame) byDate.set(key, p);
    else if (pGame === prevGame) byDate.set(key, p);
  }

  return [...byDate.values()].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

function parseDateMs(dateStr) {
  if (!dateStr) return NaN;
  return Date.parse(`${dateStr.slice(0, 10)}T12:00:00`);
}

function isoDateFromMs(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function createDateXFn(points, plot) {
  const ms = points
    .map((p) => parseDateMs(p.date))
    .filter((n) => !Number.isNaN(n));
  const t0 = ms[0] ?? 0;
  const t1 = ms[ms.length - 1] ?? t0;
  const span = Math.max(t1 - t0, 1);

  return (dateStr) => {
    const t = parseDateMs(dateStr);
    if (Number.isNaN(t)) return plot.left;
    return plot.left + ((t - t0) / span) * plot.width;
  };
}

/** Pad the time domain so single-day and tiny spans center in the plot. */
function createMicroDateXFn(allPoints, plot) {
  const ms = allPoints
    .map((p) => parseDateMs(p.date))
    .filter((n) => !Number.isNaN(n));
  let t0 = ms.length ? Math.min(...ms) : 0;
  let t1 = ms.length ? Math.max(...ms) : t0;

  if (t0 === t1) {
    t0 -= DAY_MS;
    t1 += DAY_MS;
  } else if (t1 - t0 < DAY_MS * 2) {
    t0 -= DAY_MS * 0.5;
    t1 += DAY_MS * 0.5;
  }

  const span = Math.max(t1 - t0, 1);

  return (dateStr) => {
    const t = parseDateMs(dateStr);
    if (Number.isNaN(t)) return plot.left + plot.width / 2;
    return plot.left + ((t - t0) / span) * plot.width;
  };
}

function withSeriesXOffset(baseFn, seriesIndex, seriesCount) {
  if (seriesCount <= 1) return baseFn;
  const offset = (seriesIndex - (seriesCount - 1) / 2) * MICRO_SERIES_X_OFFSET_PX;
  return (dateStr) => baseFn(dateStr) + offset;
}

/** Render-only prior-day point so single-game snapshots draw a short step line. */
function augmentPointsForMicro(rawPoints) {
  const normalized = normalizeSeriesPoints(rawPoints);
  if (normalized.length !== 1) return normalized;
  const p = normalized[0];
  if (p.previousValue == null || Number(p.previousValue) === Number(p.value)) {
    return normalized;
  }
  const d = (p.date || '').slice(0, 10);
  if (!d) return normalized;
  const prevDate = isoDateFromMs(parseDateMs(d) - DAY_MS);
  return [{
    date: prevDate,
    value: p.previousValue,
    previousValue: p.previousValue,
    movementAmount: 0,
    flatline: true,
    gameId: null,
  }, p];
}

export function downsampleSeriesPoints(points, maxPoints = MAX_RENDER_POINTS_CEILING) {
  const normalized = normalizeSeriesPoints(points);
  if (normalized.length <= maxPoints) return normalized;

  const keep = new Set([0, normalized.length - 1]);
  normalized.forEach((p, i) => {
    if (p.gameId && !p.flatline) keep.add(i);
  });

  let i = 0;
  while (i < normalized.length) {
    if (keep.has(i)) {
      i += 1;
      continue;
    }
    const runStart = i;
    while (i < normalized.length && normalized[i].flatline && !keep.has(i)) i += 1;
    keep.add(runStart);
    if (i - 1 > runStart) keep.add(i - 1);
  }

  let indices = [...keep].sort((a, b) => a - b);
  if (indices.length > maxPoints) {
    const gameIdx = indices.filter((idx) => normalized[idx].gameId && !normalized[idx].flatline);
    const flatIdx = indices.filter((idx) => !normalized[idx].gameId || normalized[idx].flatline);
    const slots = Math.max(maxPoints - gameIdx.length, 0);
    const step = Math.max(1, Math.ceil(flatIdx.length / Math.max(slots, 1)));
    const sampled = flatIdx.filter((_, n) => n % step === 0).slice(0, slots);
    indices = [...new Set([0, normalized.length - 1, ...gameIdx, ...sampled])].sort((a, b) => a - b);
  }

  return indices.map((idx) => normalized[idx]);
}

/** Merge points that map to the same x bucket so lines do not zig-zag or stack. */
function aggregatePointsByX(points, xFn, minPx = MIN_LINE_BUCKET_PX) {
  if (points.length < 2) return points;

  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const cur = points[i];
    const prev = out[out.length - 1];
    const dx = Math.abs(xFn(cur.date) - xFn(prev.date));
    if (dx >= minPx) {
      out.push(cur);
      continue;
    }
    const curGame = cur.gameId && !cur.flatline;
    const prevGame = prev.gameId && !prev.flatline;
    if (curGame && !prevGame) out[out.length - 1] = cur;
    else if (curGame === prevGame) out[out.length - 1] = cur;
  }
  return out;
}

function movingAverageWindow(profile, pointCount) {
  if (!profile || !showTrendOverlay(profile)) return 0;
  if (profile.preset === 'all') {
    return Math.max(14, Math.min(60, Math.floor(pointCount / 50)));
  }
  if (profile.preset === 'season') {
    return Math.max(7, Math.min(21, Math.floor(pointCount / 30)));
  }
  return 0;
}

function buildMovingAverage(points, windowSize) {
  if (!windowSize || points.length < 3) return null;
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize + 1); j <= i; j += 1) {
      sum += points[j].value;
      count += 1;
    }
    out.push({ date: points[i].date, value: sum / count });
  }
  return out;
}

function maxRenderPointsForWidth(plotWidth, profile) {
  const widthCap = Math.max(120, Math.min(MAX_RENDER_POINTS_CEILING, Math.floor(plotWidth)));
  const profileCap = profile?.maxPointsPerSeries ?? MAX_RENDER_POINTS_CEILING;
  return Math.min(widthCap, profileCap);
}

function buildLinePath(renderPoints, xFn, yFn) {
  return renderPoints.map((p) => ({ x: xFn(p.date), y: yFn(p.value) }));
}

function tracePath(ctx, path) {
  path.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
}

/** Crisp stroke with an optional soft underlay — no blur or chromatic fringe. */
function strokeSeriesLine(ctx, path, color, lineWidth, alpha = 1, {
  underlay = false,
  layer = 'primary',
} = {}) {
  if (!path || path.length < 2) return;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowBlur = 0;

  if (underlay && layer === 'primary') {
    ctx.globalAlpha = alpha * 0.18;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth + 1.25;
    ctx.beginPath();
    tracePath(ctx, path);
    ctx.stroke();
  }

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  tracePath(ctx, path);
  ctx.stroke();
  ctx.restore();
}

/** Robinhood-style marker: filled core, thin ring, no bloom. */
function drawSeriesMarker(ctx, x, y, r, fillColor, {
  isHover = false,
  isEndpoint = false,
  isLandmark = false,
  ringColor = null,
} = {}) {
  const coreR = isEndpoint ? r + 0.35 : (isLandmark ? r + 0.3 : r);
  const ringR = coreR + (isHover ? 2.75 : (isLandmark ? 2.15 : 1.75));
  const stroke = ringColor || fillColor;

  ctx.save();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(8, 10, 14, 0.92)';
  ctx.beginPath();
  ctx.arc(x, y, ringR + 0.75, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = isHover
    ? 'rgba(236, 234, 228, 0.52)'
    : isLandmark
      ? colorWithAlpha(stroke, 0.58)
      : colorWithAlpha(stroke, 0.42);
  ctx.lineWidth = isHover ? 1.15 : (isLandmark ? 1 : 0.85);
  ctx.beginPath();
  ctx.arc(x, y, ringR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.arc(x, y, coreR, 0, Math.PI * 2);
  ctx.fill();

  if (isEndpoint) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, coreR * 0.34), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function colorWithAlpha(color, alpha) {
  if (typeof color !== 'string') return `rgba(93, 163, 150, ${alpha})`;
  if (color.startsWith('rgba(') || color.startsWith('rgb(')) {
    return color.replace(/rgba?\(([^)]+)\)/, (_, inner) => {
      const parts = inner.split(',').map((s) => s.trim());
      if (parts.length === 4) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    });
  }
  if (color.startsWith('#') && color.length >= 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function pointKey(p) {
  return p?.gameId || p?.date || '';
}

/** Peaks, valleys, range extrema, and largest swings — always get markers. */
function findLandmarkPoints(gamePoints, metric = 'winPct', dense = false) {
  const landmarks = new Map();
  if (!gamePoints.length) return landmarks;

  const moveThreshold = metric === 'winPct'
    ? LANDMARK_MOVE_THRESHOLD_WIN
    : LANDMARK_MOVE_THRESHOLD_INDEX;
  const prominenceMin = metric === 'winPct'
    ? LANDMARK_PROMINENCE_WIN
    : LANDMARK_PROMINENCE_INDEX;
  const maxLandmarks = dense ? MAX_LANDMARKS_DENSE : MAX_LANDMARKS_DEFAULT;

  const setKind = (p, kind) => {
    const k = pointKey(p);
    if (!k) return;
    const rank = { high: 5, low: 5, peak: 4, valley: 4, swing: 3 };
    const prev = landmarks.get(k);
    if (!prev || rank[kind] >= rank[prev.kind]) {
      landmarks.set(k, { kind, prominence: prev?.prominence ?? 0 });
    }
  };

  let maxP = gamePoints[0];
  let minP = gamePoints[0];
  for (const p of gamePoints) {
    if (p.value > maxP.value) maxP = p;
    if (p.value < minP.value) minP = p;
  }
  setKind(maxP, 'high');
  if (minP !== maxP) setKind(minP, 'low');

  const extrema = [];
  for (let i = 0; i < gamePoints.length; i += 1) {
    const cur = gamePoints[i].value;
    const prev = i > 0 ? gamePoints[i - 1].value : null;
    const next = i < gamePoints.length - 1 ? gamePoints[i + 1].value : null;

    if (prev != null && next != null) {
      if (cur > prev && cur > next) {
        extrema.push({
          point: gamePoints[i],
          kind: 'peak',
          prominence: Math.min(cur - prev, cur - next),
        });
      } else if (cur < prev && cur < next) {
        extrema.push({
          point: gamePoints[i],
          kind: 'valley',
          prominence: Math.min(prev - cur, next - cur),
        });
      }
    }
  }

  extrema
    .sort((a, b) => b.prominence - a.prominence)
    .slice(0, maxLandmarks)
    .forEach(({ point, kind, prominence }) => {
      if (prominence >= prominenceMin) {
        const k = pointKey(point);
        landmarks.set(k, { kind, prominence });
      }
    });

  [...gamePoints]
    .sort((a, b) => Math.abs(b.movementAmount ?? 0) - Math.abs(a.movementAmount ?? 0))
    .slice(0, 5)
    .forEach((p) => {
      if (Math.abs(p.movementAmount ?? 0) >= moveThreshold) {
        const k = pointKey(p);
        const prev = landmarks.get(k);
        landmarks.set(k, {
          kind: prev?.kind && prev.kind !== 'swing' ? prev.kind : 'swing',
          prominence: Math.max(prev?.prominence ?? 0, Math.abs(p.movementAmount ?? 0)),
        });
      }
    });

  return landmarks;
}

function selectMarkerPoints(gamePoints, xFn, {
  dense = false,
  hoverPoint = null,
  landmarks = new Map(),
  lastPoint = null,
} = {}) {
  const landmarkKeys = landmarks;
  const chosen = new Map();

  const add = (p, priority = 0) => {
    const k = pointKey(p);
    if (!k) return;
    const prev = chosen.get(k);
    if (!prev || priority > prev.priority) {
      chosen.set(k, { point: p, priority });
    }
  };

  for (const p of gamePoints) {
    if (landmarkKeys.has(pointKey(p))) add(p, 3);
  }
  if (lastPoint) add(lastPoint, 2);
  if (hoverPoint) add(hoverPoint, 5);

  if (!dense) {
    const sorted = [...gamePoints].sort((a, b) => xFn(a.date) - xFn(b.date));
    let lastX = -Infinity;

    for (const p of sorted) {
      const k = pointKey(p);
      const x = xFn(p.date);
      const protectedPt = landmarkKeys.has(k) || p === hoverPoint || p === lastPoint;

      if (protectedPt) {
        add(p, landmarkKeys.has(k) ? 3 : p === hoverPoint ? 5 : 2);
        if (!landmarkKeys.has(k)) lastX = x;
        continue;
      }

      if (x - lastX >= MIN_MARKER_SPACING_PX) {
        add(p, 1);
        lastX = x;
      }
    }
  }

  return [...chosen.values()]
    .sort((a, b) => xFn(a.point.date) - xFn(b.point.date))
    .map((entry) => entry.point);
}

function drawPolyline(ctx, renderPoints, xFn, yFn, color, lineWidth, alpha = 1, meta = {}) {
  if (!renderPoints?.length) return;
  const path = buildLinePath(renderPoints, xFn, yFn);
  strokeSeriesLine(ctx, path, color, lineWidth, alpha, {
    underlay: meta.underlay === true,
    layer: meta.layer || 'primary',
  });
}

export function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, w: rect.width, h: rect.height };
}

function drawGrid(ctx, plot, { yAxisTicks, yFn, metric } = {}) {
  const { left, right, top, height } = plot;
  const minor = 'rgba(61, 139, 130, 0.045)';
  const major = 'rgba(61, 139, 130, 0.11)';
  const steps = 8;
  ctx.lineWidth = 1;
  for (let i = 0; i <= steps; i += 1) {
    const y = top + (i / steps) * height;
    ctx.strokeStyle = i % 4 === 0 ? major : minor;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  if (!yAxisTicks?.length || !yFn) return;

  ctx.fillStyle = 'rgba(236, 234, 228, 0.32)';
  ctx.font = '10px "Space Grotesk", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const labelX = left - 10;
  for (const val of yAxisTicks) {
    const y = yFn(val);
    if (y < top + 8 || y > top + height - 8) continue;
    ctx.fillText(formatAxisLabel(val, metric), labelX, y);
  }
}

function drawGridMicro(ctx, plot) {
  const { left, right, top, height } = plot;
  const line = 'rgba(61, 139, 130, 0.07)';
  ctx.lineWidth = 1;
  for (const frac of [0.35, 0.65]) {
    const y = top + frac * height;
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
}

function domainFromValues(values, { padFraction = 0.08, minSpan = 0 } = {}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  let span = max - min;
  if (span < minSpan) {
    const mid = (min + max) / 2;
    return { lo: mid - minSpan / 2, hi: mid + minSpan / 2 };
  }
  const padded = (span || 1) * padFraction;
  return { lo: min - padded, hi: max + padded };
}

function yScaleFromDomain(lo, hi, plot) {
  const span = hi - lo || 1;
  return (v) => plot.top + (1 - (v - lo) / span) * plot.height;
}

function yScale(values, plot) {
  const { lo, hi } = domainFromValues(values);
  return { yFn: yScaleFromDomain(lo, hi, plot), lo, hi };
}

function yScaleMicro(values, metric, plot) {
  const minSpan = metric === 'winPct' ? MICRO_Y_SPAN_WIN : MICRO_Y_SPAN_INDEX;
  const { lo, hi } = domainFromValues(values, { minSpan, padFraction: 0.06 });
  return { yFn: yScaleFromDomain(lo, hi, plot), lo, hi };
}

function winPctStepForSpan(span) {
  if (span > 35) return 20;
  if (span > 15) return 10;
  return 5;
}

function indexStepForSpan(span) {
  if (span > 40) return 10;
  if (span > 24) return 5;
  if (span > 12) return 4;
  return 2;
}

function buildAxisTicks(lo, hi, step) {
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step * 0.001; v += step) {
    const rounded = Math.round(v);
    if (rounded >= Math.floor(lo) - 1 && rounded <= Math.ceil(hi) + 1) {
      ticks.push(rounded);
    }
  }
  return [...new Set(ticks)].sort((a, b) => a - b);
}

function computeYAxisTicks(lo, hi, metric, maxTicks = 3) {
  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) return [];

  const preferredStep = metric === 'winPct' ? winPctStepForSpan(span) : indexStepForSpan(span);
  let ticks = buildAxisTicks(lo, hi, preferredStep);

  if (ticks.length < 2) {
    const fallbackStep = metric === 'winPct'
      ? Math.max(5, preferredStep / 2)
      : Math.max(2, preferredStep / 2);
    ticks = buildAxisTicks(lo, hi, fallbackStep);
  }

  if (ticks.length < 2) return [];

  if (ticks.length <= maxTicks) return ticks;

  const out = [];
  for (let i = 0; i < maxTicks; i += 1) {
    const idx = Math.round((i / (maxTicks - 1)) * (ticks.length - 1));
    out.push(ticks[idx]);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function formatAxisLabel(value, metric) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return '—';
  if (metric === 'winPct') return `${n}%`;
  return String(n);
}

function countGamePoints(allPoints) {
  return normalizeSeriesPoints(allPoints)
    .filter((p) => p.gameId && !p.flatline).length;
}

function resolveYAxisDisplay({
  micro,
  metric,
  lo,
  hi,
  profile,
  gameCount,
}) {
  if (micro) return { show: false, ticks: [] };

  const preset = profile?.preset;
  if (preset === 'today') return { show: false, ticks: [] };

  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) return { show: false, ticks: [] };

  const ticks = computeYAxisTicks(lo, hi, metric);
  if (ticks.length < 2) return { show: false, ticks: [] };

  if (preset === 'week') {
    if (gameCount <= 3) return { show: false, ticks: [] };
    if (metric === 'winPct' && span < 12) return { show: false, ticks: [] };
    if (metric === 'index' && span < 8) return { show: false, ticks: [] };
    return { show: true, ticks };
  }

  if (preset === 'month' || preset === 'season' || preset === 'all') {
    if (metric === 'winPct' && span < 8) return { show: false, ticks: [] };
    if (metric === 'index' && span < 6) return { show: false, ticks: [] };
    return { show: true, ticks };
  }

  if (metric === 'winPct' && span < 12) return { show: false, ticks: [] };
  if (metric === 'index' && span < 8) return { show: false, ticks: [] };
  return { show: true, ticks };
}

function enrichGamePoints(gamePoints) {
  return gamePoints.map((p, i) => {
    if (p.movementAmount != null && p.previousValue != null) return p;
    const prevVal = p.previousValue ?? (i > 0 ? gamePoints[i - 1].value : p.value);
    const move = p.movementAmount ?? Number((p.value - prevVal).toFixed(2));
    return { ...p, previousValue: prevVal, movementAmount: move };
  });
}

function splitPointsByDayGap(points, maxGapDays = 1) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const segments = [];
  let current = [];
  for (const p of sorted) {
    if (!current.length) {
      current.push(p);
      continue;
    }
    const prevDay = new Date(`${current[current.length - 1].date.slice(0, 10)}T12:00:00`);
    const curDay = new Date(`${p.date.slice(0, 10)}T12:00:00`);
    const gap = (curDay - prevDay) / DAY_MS;
    if (gap > maxGapDays) {
      segments.push(current);
      current = [p];
    } else {
      current.push(p);
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

/** Opponent traces tied to matchup dates — no franchise-wide comparison lines. */
function drawContextGhostSeries(ctx, rawPoints, color, plot, yFn, hitAreas, meta, {
  ghostDrawMode = 'full',
  ghostHover = false,
} = {}) {
  const xFn = meta.xFn ?? createDateXFn(rawPoints, plot);
  const lineWidth = 1.15;
  const alpha = ghostHover ? 0.42 : 0.26;
  const gamePoints = enrichGamePoints(rawPoints.filter((p) => p.gameId && !p.flatline));
  const segmentsOut = [];

  if (ghostDrawMode === 'segments') {
    const chunks = splitPointsByDayGap(gamePoints, 0);
    for (const chunk of chunks) {
      if (chunk.length >= 2) {
        const path = buildLinePath(chunk, xFn, yFn);
        strokeSeriesLine(ctx, path, color, lineWidth, alpha, { underlay: true, layer: 'context' });
        for (let i = 1; i < chunk.length; i += 1) {
          segmentsOut.push({
            x1: xFn(chunk[i - 1].date),
            y1: yFn(chunk[i - 1].value),
            x2: xFn(chunk[i].date),
            y2: yFn(chunk[i].value),
            teamId: meta.teamId,
            teamName: meta.teamName,
          });
        }
      }
      for (const p of chunk) {
        const x = xFn(p.date);
        const y = yFn(p.value);
        ctx.beginPath();
        ctx.arc(x, y, 2.75, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
        hitAreas.push({
          x,
          y,
          r: 12,
          point: p,
          isGame: true,
          teamName: meta.teamName,
          teamId: meta.teamId,
          color,
          metric: meta.metric,
          layer: 'context',
        });
      }
    }
    segmentsOut.forEach((seg) => {
      hitAreas.push({ ...seg, layer: 'context', metric: meta.metric, r: 12 });
    });
    return { segments: segmentsOut };
  }

  const renderPoints = aggregatePointsByX(rawPoints, xFn, MIN_LINE_BUCKET_PX);
  const linePath = buildLinePath(renderPoints, xFn, yFn);
  strokeSeriesLine(ctx, linePath, color, lineWidth, alpha, { underlay: true, layer: 'context' });
  for (let i = 1; i < renderPoints.length; i += 1) {
    segmentsOut.push({
      x1: xFn(renderPoints[i - 1].date),
      y1: yFn(renderPoints[i - 1].value),
      x2: xFn(renderPoints[i].date),
      y2: yFn(renderPoints[i].value),
      teamId: meta.teamId,
      teamName: meta.teamName,
    });
  }
  segmentsOut.forEach((seg) => {
    hitAreas.push({ ...seg, layer: 'context', metric: meta.metric, r: 12 });
  });
  return { segments: segmentsOut };
}

function drawOneSeries(ctx, points, color, plot, yFn, hitAreas, meta = {}, hoverHit = null) {
  let rawPoints = normalizeSeriesPoints(points);
  if (!rawPoints.length) return { segments: [] };

  const profile = meta.profile ?? resolveProfile(meta.rangePreset);
  const micro = meta.micro === true;
  if (micro) rawPoints = augmentPointsForMicro(rawPoints);

  const isContext = meta.layer === 'context';
  if (isContext) {
    return drawContextGhostSeries(ctx, rawPoints, color, plot, yFn, hitAreas, meta, {
      ghostDrawMode: meta.ghostDrawMode || 'full',
      ghostHover: meta.ghostHover,
    });
  }

  const xFn = meta.xFn ?? createDateXFn(rawPoints, plot);
  const maxPts = maxRenderPointsForWidth(plot.width, profile);
  const dense = meta.dense === true;
  const lineBucketPx = micro ? 0.75 : MIN_LINE_BUCKET_PX;
  const renderPoints = aggregatePointsByX(
    downsampleSeriesPoints(rawPoints, maxPts),
    xFn,
    lineBucketPx,
  );

  const lineWidth = meta.lineWidth || 2;
  const segments = [];

  if (showTrendOverlay(profile)) {
    const maWindow = movingAverageWindow(profile, rawPoints.length);
    const maPoints = buildMovingAverage(rawPoints, maWindow);
    if (maPoints?.length) {
      const maRender = aggregatePointsByX(
        downsampleSeriesPoints(
          maPoints.map((p) => ({ ...p, flatline: true, gameId: null })),
          maxPts,
        ),
        xFn,
      );
      drawPolyline(ctx, maRender, xFn, yFn, color, 1.15, 0.32, {
        layer: 'context',
        metric: meta.metric,
        underlay: false,
      });
    }
  }

  const linePath = buildLinePath(renderPoints, xFn, yFn);

  renderPoints.forEach((p, i) => {
    if (i === 0) return;
    const px = xFn(renderPoints[i - 1].date);
    const py = yFn(renderPoints[i - 1].value);
    const x = xFn(p.date);
    const y = yFn(p.value);
    segments.push({ x1: px, y1: py, x2: x, y2: y, teamId: meta.teamId, teamName: meta.teamName });
  });

  strokeSeriesLine(ctx, linePath, color, lineWidth, 1, {
    underlay: true,
    layer: 'primary',
  });

  if (meta.showMarkers !== false) {
    const hoverPoint = hoverHit?.point && hoverHit?.teamId === meta.teamId ? hoverHit.point : null;
    const gamePoints = enrichGamePoints(rawPoints.filter((p) => p.gameId && !p.flatline));
    const last = rawPoints[rawPoints.length - 1];
    const landmarks = findLandmarkPoints(gamePoints, meta.metric || 'winPct', dense);
    const opponentMarkerIds = meta.opponentMarkerIds;
    const markerPoints = selectMarkerPoints(gamePoints, xFn, {
      dense,
      hoverPoint,
      landmarks,
      lastPoint: last?.gameId && !last.flatline ? last : null,
    });

    for (const p of gamePoints) {
      const k = pointKey(p);
      const landmark = landmarks.get(k);
      const x = xFn(p.date);
      const y = yFn(p.value);
      hitAreas.push({
        x,
        y,
        r: dense ? (landmark ? 16 : 14) : (landmark ? 12 : 10),
        point: p,
        isGame: true,
        isLandmark: Boolean(landmark),
        landmarkKind: landmark?.kind ?? null,
        teamName: meta.teamName,
        teamId: meta.teamId,
        color,
        metric: meta.metric,
        layer: 'primary',
      });
    }

    for (const p of markerPoints) {
      const k = pointKey(p);
      const landmark = landmarks.get(k);
      const x = xFn(p.date);
      const y = yFn(p.value);
      const isHover = hoverPoint === p;
      const isEndpoint = p === last;
      const isLandmark = Boolean(landmark) && !isEndpoint;
      const isOpponentEvent = opponentMarkerIds?.has?.(p.opponentId) || p.isH2h;
      const r = isHover ? 3.25 : (isLandmark || isOpponentEvent ? 3 : 2.75);
      const fill = meta.dotColor || (p.result === 'W' ? '#6dd4a8' : '#f08080');
      const oppColor = isOpponentEvent && p.opponentId ? meta.opponentColors?.[p.opponentId] : null;
      drawSeriesMarker(ctx, x, y, r, fill, {
        isHover,
        isLandmark: isLandmark || isOpponentEvent,
        isEndpoint,
        ringColor: oppColor || (isLandmark ? color : null),
      });
    }

    const lastDrawnAsMarker = markerPoints.some((p) => p.date === last.date);
    if (!lastDrawnAsMarker && last?.gameId && !last.flatline) {
      drawSeriesMarker(
        ctx,
        xFn(last.date),
        yFn(last.value),
        dense ? 2.75 : 3,
        color,
        { isEndpoint: true, ringColor: color },
      );
    }
  } else {
    const gamePoints = enrichGamePoints(rawPoints.filter((p) => p.gameId && !p.flatline));
    for (const p of gamePoints) {
      const x = xFn(p.date);
      const y = yFn(p.value);
      hitAreas.push({
        x,
        y,
        r: dense ? 14 : 10,
        point: p,
        isGame: true,
        isLandmark: false,
        landmarkKind: null,
        teamName: meta.teamName,
        teamId: meta.teamId,
        color,
        metric: meta.metric,
        layer: 'primary',
      });
    }
  }

  return { segments };
}

/**
 * Generic N-series chart — used by franchise, matchup, and future league views.
 */
export function drawMultiSeriesChart(ctx, w, h, seriesList, {
  layout = CHART_LAYOUT,
  hoverHit = null,
  ghostHover = false,
  ghostHoverId = null,
  rangePreset = null,
  profile = null,
  opponentMarkerIds = null,
  opponentColors = null,
} = {}) {
  const hitAreas = [];
  const valid = (seriesList || []).filter((s) => s.points?.length);
  if (!valid.length) return { hitAreas };

  const plot = resolvePlot(w, h, layout);
  const chartProfile = profile ?? resolveProfile(rangePreset);
  const dense = isDenseProfile(chartProfile);
  const allPoints = valid.flatMap((s) => normalizeSeriesPoints(s.points));
  const micro = isMicroChart(allPoints);
  const values = allPoints.map((p) => p.value);
  const primaryMetric = valid.find((s) => s.layer !== 'context')?.metric
    || valid[0]?.metric
    || 'winPct';
  const scale = micro
    ? yScaleMicro(values, primaryMetric, plot)
    : yScale(values, plot);
  const { yFn, lo, hi } = scale;
  const gameCount = countGamePoints(allPoints);
  const yAxis = resolveYAxisDisplay({
    micro,
    metric: primaryMetric,
    lo,
    hi,
    profile: chartProfile,
    gameCount,
  });

  if (micro) drawGridMicro(ctx, plot);
  else drawGrid(ctx, plot, {
    yAxisTicks: yAxis.show ? yAxis.ticks : [],
    yFn,
    metric: primaryMetric,
  });

  const ordered = [...valid].sort((a, b) => {
    const aCtx = a.layer === 'context' ? 0 : 1;
    const bCtx = b.layer === 'context' ? 0 : 1;
    return aCtx - bCtx;
  });

  const primarySeries = ordered.filter((s) => s.layer !== 'context');
  const gameDates = new Set(
    allPoints
      .filter((p) => p.gameId && !p.flatline)
      .map((p) => (p.date || '').slice(0, 10)),
  );
  const sameDayCluster = gameDates.size <= 1 && gameDates.size > 0;
  const microBaseXFn = micro ? createMicroDateXFn(allPoints, plot) : null;
  let primaryIndex = 0;

  ordered.forEach((teamSeries) => {
    const isContext = teamSeries.layer === 'context';
    let xFn = null;
    if (micro && microBaseXFn) {
      if (isContext) {
        xFn = microBaseXFn;
      } else {
        xFn = sameDayCluster
          ? withSeriesXOffset(microBaseXFn, primaryIndex, primarySeries.length)
          : microBaseXFn;
        primaryIndex += 1;
      }
    }

    const contextHovered = teamSeries.layer === 'context'
      && ghostHover
      && (!ghostHoverId || ghostHoverId === teamSeries.teamId);

    drawOneSeries(ctx, teamSeries.points, teamSeries.color || '#5da396', plot, yFn, hitAreas, {
      teamName: teamSeries.teamName,
      teamId: teamSeries.teamId,
      metric: teamSeries.metric,
      dotColor: teamSeries.color,
      layer: teamSeries.layer || 'primary',
      ghostDrawMode: teamSeries.ghostDrawMode || chartProfile.ghostMode,
      ghostHover: contextHovered,
      opponentMarkerIds: teamSeries.layer === 'context'
        ? null
        : (teamSeries.opponentMarkerIds ?? opponentMarkerIds),
      opponentColors: teamSeries.layer === 'context'
        ? null
        : (teamSeries.opponentColors ?? opponentColors),
      dense,
      micro,
      xFn,
      profile: chartProfile,
      rangePreset: chartProfile.preset,
      showMarkers: teamSeries.showMarkers ?? (teamSeries.layer === 'context' ? false : chartProfile.showMarkers),
    }, teamSeries.layer === 'context' ? null : hoverHit);
  });

  return { hitAreas };
}

export function drawPerformanceChart(ctx, w, h, series, hoverHit = null, options = {}) {
  if (!series?.points?.length) return { hitAreas: [] };
  const profile = options.profile ?? resolveProfile(options.rangePreset);
  const ghostDrawMode = profile.ghostMode === 'full' ? 'full' : 'segments';
  const layers = [];

  const contextList = options.contextSeriesList?.length
    ? options.contextSeriesList
    : (options.contextSeries?.points?.length ? [options.contextSeries] : []);

  for (const ctxSeries of contextList) {
    layers.push({
      ...ctxSeries,
      metric: 'winPct',
      layer: 'context',
      ghostDrawMode,
    });
  }

  layers.push({ ...series, metric: 'winPct', layer: 'primary' });
  return drawMultiSeriesChart(ctx, w, h, layers, {
    hoverHit,
    ghostHover: options.ghostHover,
    ghostHoverId: options.ghostHoverId ?? null,
    rangePreset: options.rangePreset ?? null,
    profile,
    opponentMarkerIds: options.opponentMarkerIds ?? null,
    opponentColors: options.opponentColors ?? null,
  });
}

export function drawMatchupChart(ctx, w, h, matchup, hoverHit = null, options = {}) {
  if (!matchup?.series?.length) return { hitAreas: [] };
  const colorByTeam = Object.fromEntries(
    matchup.series.map((s) => [String(s.teamId || '').toUpperCase(), s.color]),
  );
  const layers = matchup.series.map((s) => {
    const oppId = s.h2hOpponentId ? String(s.h2hOpponentId).toUpperCase() : null;
    return {
      ...s,
      metric: 'index',
      showMarkers: true,
      opponentMarkerIds: oppId ? new Set([oppId]) : null,
      opponentColors: oppId ? { [oppId]: colorByTeam[oppId] || s.color } : null,
    };
  });
  return drawMultiSeriesChart(ctx, w, h, layers, {
    hoverHit,
    rangePreset: options.rangePreset ?? null,
    profile: options.profile ?? null,
  });
}

export function findHit(hitAreas, mx, my) {
  let best = null;
  let bestScore = Infinity;
  for (const hit of hitAreas) {
    if (hit.layer === 'context') continue;
    const d = Math.hypot(mx - hit.x, my - hit.y);
    if (d <= hit.r) {
      const score = d - (hit.isLandmark ? 2.5 : 0);
      if (score < bestScore) {
        best = hit;
        bestScore = score;
      }
    }
  }
  return best;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function findContextHit(hitAreas, mx, my, maxDist = 12) {
  let best = null;
  let bestDist = Infinity;
  for (const hit of hitAreas) {
    if (hit.layer !== 'context') continue;
    let d = Infinity;
    if (hit.x1 != null) {
      d = distToSegment(mx, my, hit.x1, hit.y1, hit.x2, hit.y2);
    } else if (hit.x != null) {
      d = Math.hypot(mx - hit.x, my - hit.y);
    }
    if (d <= maxDist && d < bestDist) {
      best = hit;
      bestDist = d;
    }
  }
  return best;
}

export function formatContextTooltipHtml(teamName) {
  return `
    <div class="sd-tip sd-tip--ghost">
      <div class="sd-tip__team">${esc(teamName)}</div>
      <div class="sd-tip__note">Opponent reference · click to switch</div>
    </div>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function esc(s) {
  return String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function metricLabel(metric) {
  return metric === 'winPct' ? 'Win %' : 'Performance index';
}

function fmtMetricValue(value, metric) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (metric === 'winPct') return n.toFixed(1);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtMovement(amount, metric) {
  if (amount == null || Number.isNaN(Number(amount)) || amount === 0) return 'No change';
  const suffix = metric === 'winPct' ? '%' : '';
  return `${amount > 0 ? '+' : ''}${amount}${suffix}`;
}

export function formatTooltip(hit) {
  return formatTooltipHtml(hit);
}

function landmarkLabel(kind) {
  switch (kind) {
    case 'high': return 'Range high';
    case 'low': return 'Range low';
    case 'peak': return 'Local peak';
    case 'valley': return 'Local low';
    case 'swing': return 'Key move';
    default: return null;
  }
}

export function formatTooltipHtml(hit) {
  const p = hit.point;
  if (!p) return '';
  const metric = hit.metric || 'winPct';
  const ml = metricLabel(metric);
  const suffix = metric === 'winPct' ? '%' : '';
  const landmark = hit.landmarkKind ? landmarkLabel(hit.landmarkKind) : null;

  if (p.flatline || !p.gameId) {
    return `
      <div class="sd-tip">
        ${hit.teamName ? `<div class="sd-tip__team">${esc(hit.teamName)}</div>` : ''}
        <div class="sd-tip__date">${esc(fmtDate(p.date))}</div>
        <div class="sd-tip__note">No game — flat performance line</div>
        <div class="sd-tip__row"><span>${ml}</span><strong>${esc(fmtMetricValue(p.value, metric))}${suffix}</strong></div>
        ${p.movementReason ? `<div class="sd-tip__reason">${esc(p.movementReason)}</div>` : ''}
      </div>`;
  }

  const resultCls = p.result === 'W' ? 'is-up' : 'is-down';
  return `
    <div class="sd-tip">
      ${hit.teamName ? `<div class="sd-tip__team">${esc(hit.teamName)}</div>` : ''}
      ${landmark ? `<div class="sd-tip__landmark">${esc(landmark)}</div>` : ''}
      <div class="sd-tip__date">${esc(fmtDate(p.date))}</div>
      <div class="sd-tip__result ${resultCls}">${esc(p.result)} vs ${esc(p.opponentId)} · ${esc(p.pointsFor)}–${esc(p.pointsAgainst)}</div>
      <div class="sd-tip__grid">
        <div class="sd-tip__row"><span>Previous</span><strong>${esc(fmtMetricValue(p.previousValue, metric))}${suffix}</strong></div>
        <div class="sd-tip__row"><span>New</span><strong>${esc(fmtMetricValue(p.value, metric))}${suffix}</strong></div>
        <div class="sd-tip__row"><span>Movement</span><strong class="${resultCls}">${esc(fmtMovement(p.movementAmount, metric))}</strong></div>
      </div>
      ${p.movementReason ? `<div class="sd-tip__reason">${esc(p.movementReason)}</div>` : ''}
      ${p.cumulativeWins != null ? `<div class="sd-tip__meta">Range record · ${p.cumulativeWins}–${p.cumulativeLosses ?? 0}</div>` : ''}
    </div>`;
}
