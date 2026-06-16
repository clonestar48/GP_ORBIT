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
const MATCHUP_SEASON_MAJOR_SWING_MIN = 14;
const MATCHUP_SEASON_EVENT_MOVE_MIN = 9;
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
  if (gameCount <= 4) return true;
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

/** Robinhood-style curve — display only; hit areas stay on raw game values. */
function traceSmoothPath(ctx, path) {
  if (!path?.length) return;
  if (path.length === 1) {
    ctx.moveTo(path[0].x, path[0].y);
    return;
  }
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 0; i < path.length - 2; i += 1) {
    const xc = (path[i].x + path[i + 1].x) / 2;
    const yc = (path[i].y + path[i + 1].y) / 2;
    ctx.quadraticCurveTo(path[i].x, path[i].y, xc, yc);
  }
  const last = path.length - 1;
  ctx.quadraticCurveTo(path[last - 1].x, path[last - 1].y, path[last].x, path[last].y);
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
  smooth = false,
  emphasize = false,
  deemphasize = false,
} = {}) {
  if (!path || path.length < 2) return;

  const lineAlpha = deemphasize ? alpha * 0.86 : alpha;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowBlur = 0;

  if (emphasize && layer === 'primary') {
    ctx.globalAlpha = lineAlpha * 0.2;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth + 3;
    ctx.shadowBlur = 7;
    ctx.shadowColor = colorWithAlpha(color, 0.38);
    ctx.beginPath();
    if (smooth) traceSmoothPath(ctx, path);
    else tracePath(ctx, path);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (underlay && layer === 'primary') {
    ctx.globalAlpha = emphasize ? lineAlpha * 0.22 : lineAlpha * 0.18;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth + 1.25;
    ctx.beginPath();
    if (smooth) traceSmoothPath(ctx, path);
    else tracePath(ctx, path);
    ctx.stroke();
  }

  ctx.globalAlpha = lineAlpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = emphasize ? lineWidth + 0.15 : lineWidth;
  ctx.beginPath();
  if (smooth) traceSmoothPath(ctx, path);
  else tracePath(ctx, path);
  ctx.stroke();
  ctx.restore();
}

const POSTSEASON_ACCENT_GOLD = '#e8c547';
const POSTSEASON_HALO_WARM = '#fff4d0';

/** @typedef {'hidden'|'meaningful'|'postseason'|'major'|'hover'} MarkerTier */

const MARKER_TIER_STYLE = {
  meaningful: { radius: 2.05, fillAlpha: 0.9 },
  postseason: { radius: 2.1, fillAlpha: 0.92 },
  major: { radius: 2.2, fillAlpha: 0.94 },
  hover: { radius: 2.3, fillAlpha: 0.98, ring: true },
};

function parseHexRgb(color) {
  if (typeof color !== 'string' || !color.startsWith('#') || color.length < 7) return null;
  return {
    r: parseInt(color.slice(1, 3), 16),
    g: parseInt(color.slice(3, 5), 16),
    b: parseInt(color.slice(5, 7), 16),
  };
}

/** Lakers-style gold teams — use warm light halo instead of gold-on-gold. */
function isWarmGoldTeamColor(color) {
  const rgb = parseHexRgb(color);
  if (!rgb) return false;
  const { r, g, b } = rgb;
  return r >= 170 && g >= 120 && b <= 90 && (r + g) > b * 2.2;
}

function postseasonAccentForTeam(teamColor) {
  return isWarmGoldTeamColor(teamColor) ? POSTSEASON_HALO_WARM : POSTSEASON_ACCENT_GOLD;
}

/** Crisp filled core — no shadow bloom. */
function drawCleanMarkerCore(ctx, x, y, r, color, alpha = 0.92) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = colorWithAlpha(color, alpha);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Thin stroke ring — reserved for hover emphasis; no blur. */
function drawThinMarkerRing(ctx, x, y, ringR, color, { lineWidth = 0.65, alpha = 0.4 } = {}) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = colorWithAlpha(color, alpha);
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(x, y, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawTieredMarker(ctx, x, y, teamColor, tier, { isPlayoff = false } = {}) {
  if (!tier || tier === 'hidden') return;
  const style = MARKER_TIER_STYLE[tier];
  if (!style) return;

  const r = style.radius;
  const fill = style.fillAlpha ?? 0.9;

  if (style.ring) {
    drawThinMarkerRing(ctx, x, y, r + 2.2, teamColor, { lineWidth: 0.7, alpha: 0.44 });
    if (isPlayoff) {
      drawThinMarkerRing(
        ctx,
        x,
        y,
        r + 3.4,
        postseasonAccentForTeam(teamColor),
        { lineWidth: 0.55, alpha: 0.3 },
      );
    }
  }

  drawCleanMarkerCore(ctx, x, y, r, teamColor, fill);
}

function formEntryToTier(entry) {
  const { type, hover, point } = entry;
  const isPlayoff = Boolean(point?.isPlayoff);
  const move = Math.abs(point?.movementAmount ?? 0);

  if (hover || type === 'hover') {
    return { tier: 'hover', isPlayoff };
  }
  if (type === 'playoffSwing' || (type === 'largestMove' && move >= MATCHUP_SEASON_MAJOR_SWING_MIN)) {
    return { tier: 'major', isPlayoff };
  }
  if (type === 'endpoint') {
    return { tier: isPlayoff ? 'postseason' : 'meaningful', isPlayoff };
  }
  if (type === 'headToHeadPlayoff' || isPlayoff) {
    return { tier: 'postseason', isPlayoff: true };
  }
  if (type === 'largestMove' || type === 'headToHead' || type === 'regEvent') {
    return { tier: 'meaningful', isPlayoff: false };
  }
  return { tier: 'meaningful', isPlayoff: false };
}

function resolveSeriesMarkerTier(p, {
  isHover = false,
  isEndpoint = false,
  landmark = null,
  isPlayoff = false,
  isHeadToHeadGame = false,
  isOpponentEvent = false,
  isHighImpact = false,
  isFormSwing = false,
  metric = 'winPct',
} = {}) {
  if (isHover) return { tier: 'hover', isPlayoff };

  const move = Math.abs(p?.movementAmount ?? 0);
  const majorThreshold = metric === 'winPct'
    ? LANDMARK_MOVE_THRESHOLD_WIN
    : MATCHUP_SEASON_MAJOR_SWING_MIN;
  const isMajorMove = move >= majorThreshold
    || (landmark?.kind === 'swing' && (landmark.prominence ?? 0) >= majorThreshold);
  const isBlowout = Boolean(p?.isBlowout || p?.impactTier === 'blowout');

  if (isPlayoff && (isMajorMove || isBlowout || isHighImpact || isFormSwing)) {
    return { tier: 'major', isPlayoff: true };
  }
  if (isPlayoff) return { tier: 'postseason', isPlayoff: true };
  if (isMajorMove || isBlowout || isFormSwing) {
    return { tier: 'major', isPlayoff: false };
  }
  if (isEndpoint || landmark || isHeadToHeadGame || isOpponentEvent || isHighImpact) {
    return { tier: 'meaningful', isPlayoff: false };
  }
  return { tier: 'hidden', isPlayoff: false };
}

function drawSeriesMarker(ctx, x, y, teamColor, options = {}) {
  const resolved = options.tier
    ? { tier: options.tier, isPlayoff: Boolean(options.isPlayoff) }
    : resolveSeriesMarkerTier(options.point, options);
  drawTieredMarker(ctx, x, y, teamColor, resolved.tier, { isPlayoff: resolved.isPlayoff });
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

  if (dense) {
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

/** Matchup/Solo + Season — game-level form index with controlled display smoothing. */
function isFormSeasonTrajectory(meta = {}) {
  const preset = meta.profile?.preset;
  return (preset === 'matchupSeason' || preset === 'soloSeason')
    && meta.chartKind === 'trajectory';
}

/** Matchup/Solo + All — macro archive form (monthly aggregation on server). */
function isFormArchiveTrajectory(meta = {}) {
  const preset = meta.profile?.preset;
  return (preset === 'matchupAll' || preset === 'soloAll')
    && meta.chartKind === 'trajectory';
}

function usesFormTrajectoryMarkers(meta = {}) {
  return isFormSeasonTrajectory(meta) || isFormArchiveTrajectory(meta);
}

/** @deprecated alias */
function isMatchupSeasonTrajectory(meta = {}) {
  return isFormSeasonTrajectory(meta);
}

const MATCHUP_SEASON_SMOOTH_ALPHA = 0.44;
const MATCHUP_SEASON_EVENT_ALPHA = 0.82;
const MATCHUP_SEASON_EVENT_RAW_BLEND = 0.78;
const MATCHUP_SEASON_NEIGHBOR_BLEND = 0.68;

function isMatchupFormEventPoint(p) {
  return Boolean(p.isH2h)
    || Boolean(p.isPlayoff)
    || Math.abs(p.movementAmount ?? 0) >= MATCHUP_SEASON_EVENT_MOVE_MIN;
}

/** Soften ordinary zig-zags for display; preserve swings at meaningful games. */
function smoothMatchupSeasonLine(points) {
  const normalized = normalizeSeriesPoints(points);
  const gamePoints = normalized.filter((p) => p.gameId && !p.flatline);
  if (gamePoints.length < 2) return points;

  const displayValues = new Map();
  let ema = Number(gamePoints[0].value);

  for (let i = 0; i < gamePoints.length; i += 1) {
    const p = gamePoints[i];
    const raw = Number(p.value);
    const event = isMatchupFormEventPoint(p);
    const alpha = event ? MATCHUP_SEASON_EVENT_ALPHA : MATCHUP_SEASON_SMOOTH_ALPHA;
    ema = alpha * raw + (1 - alpha) * ema;
    const display = event
      ? raw * MATCHUP_SEASON_EVENT_RAW_BLEND + ema * (1 - MATCHUP_SEASON_EVENT_RAW_BLEND)
      : ema;
    displayValues.set(pointKey(p), display);
  }

  const keys = gamePoints.map((p) => pointKey(p));
  const softened = keys.map((k) => displayValues.get(k));
  const neighborWeight = (1 - MATCHUP_SEASON_NEIGHBOR_BLEND) / 2;
  for (let i = 1; i < softened.length - 1; i += 1) {
    if (isMatchupFormEventPoint(gamePoints[i])) continue;
    softened[i] = softened[i] * MATCHUP_SEASON_NEIGHBOR_BLEND
      + (softened[i - 1] + softened[i + 1]) * neighborWeight;
  }
  keys.forEach((k, i) => displayValues.set(k, Number(softened[i].toFixed(2))));

  return normalized.map((p) => {
    const k = pointKey(p);
    if (k && displayValues.has(k)) {
      return { ...p, value: displayValues.get(k) };
    }
    return p;
  });
}

function formSeasonDisplayY(displayYByKey, p, fallbackYFn) {
  const k = pointKey(p);
  const v = k && displayYByKey?.has(k) ? displayYByKey.get(k) : p.value;
  return fallbackYFn(v);
}

function trajectoryMarkerPoints(rawPoints, formSeasonMode) {
  const candidates = formSeasonMode
    ? rawPoints.filter((p) => p.gameId && !p.flatline)
    : rawPoints.filter((p) => !p.flatline && (p.aggregated || p.gameId));
  return enrichGamePoints(candidates);
}

function trajectoryLastPoint(rawPoints, formSeasonMode) {
  const points = formSeasonMode
    ? rawPoints.filter((p) => p.gameId && !p.flatline)
    : rawPoints.filter((p) => !p.flatline && (p.aggregated || p.gameId));
  return points[points.length - 1] ?? null;
}

function classifyFormTrajectoryMarkers(gamePoints, { hoverPoint = null, lastPoint = null } = {}) {
  const chosen = new Map();
  const lastKey = lastPoint ? pointKey(lastPoint) : null;

  const add = (p, type, priority, extra = {}) => {
    const k = pointKey(p);
    if (!k) return;
    const prev = chosen.get(k);
    if (!prev || priority >= prev.priority) {
      chosen.set(k, { point: p, type, priority, ...extra });
    }
  };

  for (const p of gamePoints) {
    if (p.isPlayoff || pointKey(p) === lastKey) continue;
    const move = Math.abs(p.movementAmount ?? 0);
    if (move >= MATCHUP_SEASON_EVENT_MOVE_MIN && !chosen.has(pointKey(p))) {
      add(p, 'regEvent', 2);
    }
  }

  for (const p of gamePoints) {
    if (p.isH2h && pointKey(p) !== lastKey) {
      add(p, p.isPlayoff ? 'headToHeadPlayoff' : 'headToHead', 5);
    }
  }

  for (const p of gamePoints) {
    if (
      p.isPlayoff
      && !p.isH2h
      && pointKey(p) !== lastKey
      && Math.abs(p.movementAmount ?? 0) >= MATCHUP_SEASON_MAJOR_SWING_MIN
      && !chosen.has(pointKey(p))
    ) {
      add(p, 'playoffSwing', 4);
    }
  }

  const [largest] = [...gamePoints].sort(
    (a, b) => Math.abs(b.movementAmount ?? 0) - Math.abs(a.movementAmount ?? 0),
  );
  if (
    largest
    && pointKey(largest) !== lastKey
    && Math.abs(largest.movementAmount ?? 0) >= MATCHUP_SEASON_MAJOR_SWING_MIN
    && !chosen.has(pointKey(largest))
  ) {
    add(largest, 'largestMove', 3);
  }

  if (lastPoint) add(lastPoint, 'endpoint', 6);

  if (hoverPoint) {
    const hoverKey = pointKey(hoverPoint);
    const existing = chosen.get(hoverKey);
    if (existing) {
      existing.hover = true;
    } else {
      add(hoverPoint, 'hover', 10);
    }
  }

  return [...chosen.values()].sort(
    (a, b) => (a.point.date || '').localeCompare(b.point.date || ''),
  );
}

function drawFormTrajectoryMarker(ctx, x, y, entry, meta, seriesColor) {
  const teamColor = seriesColor || meta.dotColor || '#5da396';
  const { tier, isPlayoff } = formEntryToTier(entry);
  drawTieredMarker(ctx, x, y, teamColor, tier, { isPlayoff });
}

function resolveMatchupSeasonLeader(seriesList) {
  let leaderId = null;
  let leaderValue = -Infinity;

  for (const series of seriesList || []) {
    if (series.layer === 'context') continue;
    const gamePoints = normalizeSeriesPoints(series.points)
      .filter((p) => p.gameId && !p.flatline);
    const last = gamePoints[gamePoints.length - 1];
    if (!last || last.value == null) continue;
    const value = Number(last.value);
    if (value > leaderValue) {
      leaderValue = value;
      leaderId = series.teamId;
    }
  }

  return leaderId;
}

function orderSeriesForMatchupSeason(seriesList, leaderId) {
  if (!leaderId) return seriesList;
  const leader = String(leaderId).toUpperCase();
  return [...seriesList].sort((a, b) => {
    const aLead = String(a.teamId || '').toUpperCase() === leader;
    const bLead = String(b.teamId || '').toUpperCase() === leader;
    if (aLead === bLead) return 0;
    return aLead ? 1 : -1;
  });
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
  if (preset === 'matchupSeason' || preset === 'matchupAll') return { show: false, ticks: [] };
  if (preset === 'soloSeason' || preset === 'soloAll') return { show: false, ticks: [] };

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

function resolveHoverPoint(hoverHit, teamId) {
  if (!hoverHit) return null;
  if (hoverHit.relatedHits?.length) {
    const match = hoverHit.relatedHits.find((h) => h.teamId === teamId);
    if (match?.point) return match.point;
  }
  if (hoverHit.teamId === teamId && hoverHit.point) return hoverHit.point;
  return null;
}

function drawHoverGuide(ctx, plot, guideX) {
  if (guideX == null || !plot) return;
  const x = Math.max(plot.left, Math.min(plot.left + plot.width, guideX));
  ctx.save();
  ctx.strokeStyle = 'rgba(93, 163, 150, 0.22)';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x, plot.top);
  ctx.lineTo(x, plot.top + plot.height);
  ctx.stroke();
  ctx.restore();
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
  const formSeasonMode = isFormSeasonTrajectory(meta);
  const formMarkerMode = usesFormTrajectoryMarkers(meta);
  const displayYByKey = new Map();
  let linePoints = rawPoints;

  if (formSeasonMode) {
    linePoints = smoothMatchupSeasonLine(rawPoints);
    const gameRaw = enrichGamePoints(rawPoints.filter((p) => p.gameId && !p.flatline));
    const gameSmooth = enrichGamePoints(linePoints.filter((p) => p.gameId && !p.flatline));
    gameRaw.forEach((p, i) => {
      const k = pointKey(p);
      if (k && gameSmooth[i]) displayYByKey.set(k, gameSmooth[i].value);
    });
  }

  const renderPoints = aggregatePointsByX(
    downsampleSeriesPoints(linePoints, maxPts),
    xFn,
    lineBucketPx,
  );

  const lineWidth = meta.lineWidth || (meta.chartKind === 'headToHead' ? 2.65 : 2);
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
    smooth: false,
    emphasize: Boolean(meta.emphasizeLine),
    deemphasize: Boolean(meta.deemphasizeLine),
  });

  if (meta.showMarkers !== false) {
    const hoverPoint = resolveHoverPoint(hoverHit, meta.teamId);
    const gamePoints = trajectoryMarkerPoints(rawPoints, formSeasonMode);
    const lastGame = trajectoryLastPoint(rawPoints, formSeasonMode);
    const yAt = (p) => (formSeasonMode
      ? formSeasonDisplayY(displayYByKey, p, yFn)
      : yFn(p.value));

    for (const p of gamePoints) {
      const x = xFn(p.date);
      const y = yAt(p);
      hitAreas.push({
        x,
        y,
        r: dense ? 14 : 10,
        point: p,
        isGame: true,
        isLandmark: Boolean(p.isH2h || p.isPlayoff),
        landmarkKind: p.isH2h ? 'h2h' : (p.isPlayoff ? 'playoff' : null),
        teamName: meta.teamName,
        teamId: meta.teamId,
        color,
        metric: meta.metric,
        layer: 'primary',
      });
    }

    if (formMarkerMode) {
      const classified = classifyFormTrajectoryMarkers(gamePoints, {
        hoverPoint,
        lastPoint: lastGame,
      });
      for (const entry of classified) {
        const p = entry.point;
        drawFormTrajectoryMarker(ctx, xFn(p.date), yAt(p), entry, meta, color);
      }
    } else {
      const landmarks = findLandmarkPoints(gamePoints, meta.metric || 'winPct', dense);
      const markerPoints = selectMarkerPoints(gamePoints, xFn, {
        dense,
        hoverPoint,
        landmarks,
        lastPoint: lastGame,
      });

      for (const p of gamePoints) {
        const k = pointKey(p);
        const landmark = landmarks.get(k);
        if (landmark) {
          const idx = hitAreas.findIndex((h) => h.point === p);
          if (idx >= 0) {
            hitAreas[idx].isLandmark = true;
            hitAreas[idx].landmarkKind = landmark.kind;
            hitAreas[idx].r = dense ? 16 : 12;
          }
        }
      }

      for (const p of markerPoints) {
        const k = pointKey(p);
        const landmark = landmarks.get(k);
        const x = xFn(p.date);
        const y = yAt(p);
        const isHover = hoverPoint === p;
        const isEndpoint = lastGame && p === lastGame;
        const isLandmark = Boolean(landmark) && !isEndpoint;
        const isHeadToHead = meta.chartKind === 'headToHead';
        const isH2hEvent = Boolean(p.isH2h) && !isHeadToHead;
        const isHeadToHeadGame = isHeadToHead && p.gameId && !p.flatline;
        const isPlayoff = Boolean(p.isPlayoff);
        const isHighImpact = p.impactTier === 'playoff' || p.impactTier === 'blowout';
        const isFormSwing = Math.abs(p.movementAmount ?? 0) >= 12;
        const isOpponentEvent = isH2hEvent;

        drawSeriesMarker(ctx, x, y, color, {
          point: p,
          isHover,
          isEndpoint,
          landmark: isLandmark ? landmark : null,
          isPlayoff,
          isHeadToHeadGame,
          isOpponentEvent,
          isHighImpact,
          isFormSwing,
          metric: meta.metric || 'winPct',
        });
      }

      const lastDrawnAsMarker = lastGame
        && markerPoints.some((p) => p === lastGame || p.date === lastGame.date);
      if (!lastDrawnAsMarker && lastGame) {
        drawSeriesMarker(ctx, xFn(lastGame.date), yAt(lastGame), color, {
          point: lastGame,
          isEndpoint: true,
          isPlayoff: Boolean(lastGame.isPlayoff),
          metric: meta.metric || 'winPct',
        });
      }
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

function drawSeasonBoundaries(ctx, boundaries, xFn, plot) {
  if (!boundaries?.length) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(236, 234, 228, 0.08)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  for (const day of boundaries) {
    const x = xFn(day);
    if (x < plot.left || x > plot.left + plot.width) continue;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.stroke();
  }
  ctx.restore();
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
  seasonBoundaries = null,
  leadingTeamId = null,
} = {}) {
  const hitAreas = [];
  const valid = (seriesList || []).filter((s) => s.points?.length);
  if (!valid.length) return { hitAreas, plot: resolvePlot(w, h, layout) };

  const plot = resolvePlot(w, h, layout);
  const chartProfile = profile ?? resolveProfile(rangePreset);
  const dense = isDenseProfile(chartProfile);
  const matchupSeasonChart = chartProfile?.preset === 'matchupSeason';
  const leaderId = leadingTeamId
    ? String(leadingTeamId).toUpperCase()
    : null;
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

  if (!micro && seasonBoundaries?.length) {
    drawSeasonBoundaries(ctx, seasonBoundaries, createDateXFn(allPoints, plot), plot);
  }

  if (hoverHit?.guideX != null) {
    drawHoverGuide(ctx, plot, hoverHit.guideX);
  }

  const ordered = orderSeriesForMatchupSeason(
    [...valid].sort((a, b) => {
      const aCtx = a.layer === 'context' ? 0 : 1;
      const bCtx = b.layer === 'context' ? 0 : 1;
      return aCtx - bCtx;
    }),
    matchupSeasonChart ? leaderId : null,
  );

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
      chartKind: teamSeries.chartKind ?? null,
      showMarkers: teamSeries.showMarkers ?? (teamSeries.layer === 'context' ? false : chartProfile.showMarkers),
      emphasizeLine: matchupSeasonChart
        && leaderId
        && teamSeries.layer !== 'context'
        && String(teamSeries.teamId || '').toUpperCase() === leaderId,
      deemphasizeLine: matchupSeasonChart
        && leaderId
        && teamSeries.layer !== 'context'
        && String(teamSeries.teamId || '').toUpperCase() !== leaderId,
    }, teamSeries.layer === 'context' ? null : hoverHit);
  });

  return {
    hitAreas,
    plot: {
      left: plot.left,
      top: plot.top,
      width: plot.width,
      height: plot.height,
      right: plot.right,
      bottom: plot.bottom,
    },
  };
}

export function drawPerformanceChart(ctx, w, h, series, hoverHit = null, options = {}) {
  if (!series?.points?.length) return { hitAreas: [], plot: resolvePlot(w, h) };
  const profile = options.profile ?? resolveProfile(options.rangePreset);
  const ghostDrawMode = profile.ghostMode === 'full' ? 'full' : 'segments';
  const primaryMetric = series.metric || 'winPct';
  const chartKind = options.chartKind ?? series.chartKind ?? null;
  const layers = [];

  const contextList = options.contextSeriesList?.length
    ? options.contextSeriesList
    : (options.contextSeries?.points?.length ? [options.contextSeries] : []);

  for (const ctxSeries of contextList) {
    layers.push({
      ...ctxSeries,
      metric: ctxSeries.metric || 'winPct',
      layer: 'context',
      ghostDrawMode,
    });
  }

  layers.push({
    ...series,
    metric: primaryMetric,
    chartKind,
    layer: 'primary',
  });
  return drawMultiSeriesChart(ctx, w, h, layers, {
    hoverHit,
    ghostHover: options.ghostHover,
    ghostHoverId: options.ghostHoverId ?? null,
    rangePreset: options.rangePreset ?? null,
    profile,
    opponentMarkerIds: options.opponentMarkerIds ?? null,
    opponentColors: options.opponentColors ?? null,
    seasonBoundaries: options.seasonBoundaries ?? null,
  });
}

export function drawMatchupChart(ctx, w, h, matchup, hoverHit = null, options = {}) {
  if (!matchup?.series?.length) return { hitAreas: [], plot: resolvePlot(w, h) };
  const chartKind = matchup.chartKind ?? matchup.chartSet?.chartKind ?? 'trajectory';
  const isHeadToHead = chartKind === 'headToHead';
  const colorByTeam = Object.fromEntries(
    matchup.series.map((s) => [String(s.teamId || '').toUpperCase(), s.color]),
  );
  const layers = matchup.series.map((s) => {
    const oppId = s.h2hOpponentId ? String(s.h2hOpponentId).toUpperCase() : null;
    return {
      ...s,
      metric: 'index',
      chartKind,
      showMarkers: true,
      opponentMarkerIds: oppId ? new Set([oppId]) : null,
      opponentColors: oppId ? { [oppId]: colorByTeam[oppId] || s.color } : null,
    };
  });
  const chartProfile = options.profile ?? resolveProfile(options.rangePreset);
  const leadingTeamId = chartProfile?.preset === 'matchupSeason'
    ? resolveMatchupSeasonLeader(layers)
    : null;
  return drawMultiSeriesChart(ctx, w, h, layers, {
    hoverHit,
    rangePreset: options.rangePreset ?? null,
    profile: chartProfile,
    seasonBoundaries: options.seasonBoundaries ?? matchup.seasonBoundaries ?? [],
    leadingTeamId,
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

/** Forgiving plot-area hover — snap to nearest game date by x, not line proximity. */
export function findNearestChartHover(hitAreas, plot, mx, my) {
  if (!hitAreas?.length || !plot) return null;

  const plotRight = plot.left + plot.width;
  const plotBottom = plot.top + plot.height;
  if (mx < plot.left || mx > plotRight || my < plot.top || my > plotBottom) {
    return null;
  }

  const gameHits = hitAreas.filter((h) =>
    h.layer !== 'context'
    && h.isGame
    && h.point?.gameId
    && !h.point?.flatline);

  if (!gameHits.length) return null;

  let nearest = null;
  let nearestDx = Infinity;
  for (const hit of gameHits) {
    const dx = Math.abs(mx - hit.x);
    if (dx < nearestDx) {
      nearestDx = dx;
      nearest = hit;
    }
  }
  if (!nearest) return null;

  const dateKey = (nearest.point.date || '').slice(0, 10);
  const byTeam = new Map();
  for (const hit of gameHits) {
    if ((hit.point.date || '').slice(0, 10) !== dateKey) continue;
    const id = hit.teamId || hit.point?.teamId || '';
    const existing = byTeam.get(id);
    if (!existing || Math.abs(mx - hit.x) < Math.abs(mx - existing.x)) {
      byTeam.set(id, hit);
    }
  }

  const hits = [...byTeam.values()].sort((a, b) => a.x - b.x);
  const guideX = hits.length > 1
    ? hits.reduce((sum, h) => sum + h.x, 0) / hits.length
    : nearest.x;

  return { guideX, dateKey, hits, primary: nearest };
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

function fmtTipDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function teamAbbr(hit) {
  return String(hit.teamId || hit.point?.teamId || hit.teamName || '').toUpperCase();
}

function fmtResultLine(hit) {
  const p = hit.point;
  const abbr = teamAbbr(hit);
  const opp = String(p.opponentId || '').toUpperCase();
  const score = `${p.pointsFor}–${p.pointsAgainst}`;
  if (p.result === 'W') return `${abbr} def. ${opp}, ${score}`;
  if (p.result === 'L') return `${abbr} lost to ${opp}, ${score}`;
  return `${abbr} vs ${opp}, ${score}`;
}

function fmtMoveLine(amount, metric) {
  if (amount == null || Number.isNaN(Number(amount)) || amount === 0) return null;
  const suffix = metric === 'winPct' ? '%' : '';
  const n = Number(amount);
  const cls = n > 0 ? 'is-up' : n < 0 ? 'is-down' : '';
  const text = `${n > 0 ? '+' : ''}${metric === 'winPct' ? n.toFixed(1) : n.toFixed(1)}${suffix}`;
  return { text, cls };
}

function playoffTooltipTag(playoffEvent) {
  if (!playoffEvent?.kind) return null;
  switch (playoffEvent.kind) {
    case 'won-title':
      return { label: 'Won Title', cls: 'is-up' };
    case 'won-series':
      return { label: 'Won Series', cls: 'is-up' };
    case 'sweep':
      return { label: 'Sweep', cls: 'is-up' };
    case 'swept':
      return { label: 'Swept', cls: 'is-down' };
    case 'eliminated':
      return { label: 'Eliminated', cls: 'is-down' };
    case 'series-ended':
      return { label: 'Series Ended', cls: '' };
    default:
      return null;
  }
}

function streakEndTooltipTag(streakEndInfo) {
  if (!streakEndInfo || streakEndInfo.length < 4) return null;
  if (streakEndInfo.endedResult === 'W') {
    return { label: 'Streak Ended', cls: 'is-down' };
  }
  return { label: 'Drought Ended', cls: 'is-up' };
}

function capTooltipTags(tags, max = 3) {
  return tags.slice(0, max);
}

function isLargestMoveInView(point, allHitAreas, metric) {
  if (!point?.gameId || !allHitAreas?.length) return false;
  const moves = allHitAreas
    .filter((h) => h.layer !== 'context' && h.point?.gameId)
    .map((h) => Math.abs(Number(h.point.movementAmount) || 0));
  const max = Math.max(...moves, 0);
  const amt = Math.abs(Number(point.movementAmount) || 0);
  if (amt <= 0 || amt < max) return false;
  const threshold = metric === 'winPct' ? 0.5 : 1;
  return amt >= threshold;
}

function comebackTooltipTag(comebackEvent) {
  if (!comebackEvent?.label) return null;
  return { label: comebackEvent.label, cls: 'is-up' };
}

function buildTooltipTags(p, hit, {
  metric,
  allHitAreas = [],
  streakEndInfo = null,
  playoffEvent = null,
  comebackEvent = null,
} = {}) {
  const ranked = [];
  const add = (priority, tag) => {
    if (tag) ranked.push({ priority, tag });
  };

  const playoffTag = playoffTooltipTag(playoffEvent);
  const comebackTag = comebackTooltipTag(comebackEvent);
  const historicEvent = comebackEvent && (
    comebackEvent.tier === 'historic'
    || String(comebackEvent.kind || '').startsWith('historic')
  );

  if (playoffEvent?.kind === 'won-title') add(1, playoffTag);
  else if (historicEvent) add(2, comebackTag);
  else if (playoffEvent?.kind === 'sweep' || playoffEvent?.kind === 'swept') add(3, playoffTag);
  else if (playoffEvent?.kind === 'won-series' || playoffEvent?.kind === 'eliminated') add(4, playoffTag);
  else if (playoffEvent?.kind === 'series-ended') add(5, playoffTag);
  else if (comebackEvent?.kind === 'major-comeback') add(6, comebackTag);
  else if (comebackEvent) add(7, comebackTag);

  add(8, streakEndTooltipTag(streakEndInfo));

  const margin = p.margin ?? (
    p.pointsFor != null && p.pointsAgainst != null
      ? Number(p.pointsFor) - Number(p.pointsAgainst)
      : null
  );

  const blowout = p.isBlowout
    || p.impactTier === 'blowout'
    || (margin != null && Math.abs(margin) >= 15);
  if (isLargestMoveInView(p, allHitAreas, metric)) {
    const amt = Number(p.movementAmount) || 0;
    add(9, amt < 0 ? 'Largest Drop' : 'Largest Move');
  } else if (margin != null && Math.abs(margin) <= 3 && p.result) {
    add(12, p.result === 'W' ? 'Close Win' : 'Close Loss');
  }

  if (blowout) {
    add(10, p.result === 'W' ? 'Blowout Win' : 'Blowout Loss');
  }

  if (p.isPlayoff || p.impactTier === 'playoff') {
    add(8, 'Postseason');
  }
  if (p.meetingNumber) {
    add(8, `G${p.meetingNumber}`);
  }

  ranked.sort((a, b) => a.priority - b.priority);
  return capTooltipTags(dedupeTooltipTags(ranked.map((entry) => entry.tag)));
}

function dedupeTooltipTags(tags) {
  const seen = new Set();
  const out = [];
  for (const tag of tags) {
    const label = typeof tag === 'string' ? tag : tag.label;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(tag);
  }
  return out;
}

function renderTooltipTagsHtml(tags) {
  if (!tags?.length) return '';
  return tags.map((tag) => {
    if (typeof tag === 'string') {
      return `<span class="sd-tip__tag">${esc(tag)}</span>`;
    }
    const cls = tag.cls ? ` ${tag.cls}` : '';
    return `<span class="sd-tip__tag${cls}">${esc(tag.label)}</span>`;
  }).join('<span class="sd-tip__sep"> · </span>');
}

function formatSoloTooltipHtml(hit, allHitAreas = [], options = {}) {
  const p = hit.point;
  if (!p) return '';
  const metric = hit.metric || 'winPct';
  const streakEndInfo = options.streakEndForPoint?.(p, hit.teamId) ?? null;
  const playoffEvent = options.playoffEventForPoint?.(p, hit.teamId) ?? null;
  const comebackEvent = options.comebackEventForPoint?.(p, hit.teamId) ?? null;

  if (p.flatline || !p.gameId) {
    return `
      <div class="sd-tip">
        <div class="sd-tip__context">${esc(fmtTipDate(p.date))}</div>
        <div class="sd-tip__note">Off day · line held steady</div>
      </div>`;
  }

  const move = fmtMoveLine(p.movementAmount, metric);
  const tags = buildTooltipTags(p, hit, {
    metric,
    allHitAreas,
    streakEndInfo,
    playoffEvent,
    comebackEvent,
  });
  const resultCls = p.result === 'W' ? 'is-up' : 'is-down';

  return `
    <div class="sd-tip">
      <div class="sd-tip__context">${esc(fmtTipDate(p.date))}</div>
      <div class="sd-tip__result ${resultCls}">${esc(fmtResultLine(hit))}</div>
      ${move ? `<div class="sd-tip__move ${move.cls}">${esc(move.text)}</div>` : ''}
      ${tags.length ? `<div class="sd-tip__tags">${renderTooltipTagsHtml(tags)}</div>` : ''}
    </div>`;
}

function formatMatchupTooltipHtml(hoverBundle, allHitAreas = [], options = {}) {
  const hits = hoverBundle.hits || [];
  if (!hits.length) return '';

  const sharedDate = hoverBundle.dateKey || hits[0].point?.date;
  const contextParts = [fmtTipDate(sharedDate)];
  const playoffHit = hits.find((h) => h.point?.isPlayoff);
  const meeting = hits.find((h) => h.point?.meetingNumber)?.point?.meetingNumber;
  if (meeting) contextParts.push(`G${meeting}`);
  else if (playoffHit) contextParts.push('postseason');

  const headToHead = hits.length >= 2
    && hits.every((h) => {
      const opp = String(h.point?.opponentId || '').toUpperCase();
      return hits.some((other) => other !== h && teamAbbr(other) === opp);
    });

  let resultLine = '';
  if (headToHead && hits.length >= 2) {
    resultLine = fmtResultLine(hits[0]);
  } else if (hits.length === 1) {
    resultLine = fmtResultLine(hits[0]);
  } else {
    resultLine = hits.map((h) => {
      const p = h.point;
      return `${teamAbbr(h)} ${p.pointsFor}–${p.pointsAgainst}`;
    }).join(', ');
  }

  const moveLines = hits.map((h) => {
    const metric = h.metric || 'index';
    const amt = Number(h.point?.movementAmount) || 0;
    const suffix = metric === 'winPct' ? '%' : '';
    const cls = amt > 0 ? 'is-up' : amt < 0 ? 'is-down' : '';
    const text = `${teamAbbr(h)} ${amt > 0 ? '+' : ''}${amt.toFixed(1)}${suffix}`;
    return `<span class="${cls}">${esc(text)}</span>`;
  }).join('<span class="sd-tip__sep"> · </span>');

  const streakEndForPoint = options.streakEndForPoint;
  const playoffEventForPoint = options.playoffEventForPoint;
  const comebackEventForPoint = options.comebackEventForPoint;
  const tagEntries = [];
  for (const h of hits) {
    const streakEndInfo = streakEndForPoint?.(h.point, h.teamId) ?? null;
    const playoffEvent = playoffEventForPoint?.(h.point, h.teamId) ?? null;
    const comebackEvent = comebackEventForPoint?.(h.point, h.teamId) ?? null;
    tagEntries.push(...buildTooltipTags(h.point, h, {
      metric: h.metric || 'index',
      allHitAreas,
      streakEndInfo,
      playoffEvent,
      comebackEvent,
    }));
  }
  const tags = dedupeTooltipTags(tagEntries).slice(0, 3);

  return `
    <div class="sd-tip sd-tip--matchup">
      <div class="sd-tip__context">${esc(contextParts.join(' · '))}</div>
      <div class="sd-tip__result">${esc(resultLine)}</div>
      <div class="sd-tip__moves">${moveLines}</div>
      ${tags.length ? `<div class="sd-tip__tags">${renderTooltipTagsHtml(tags)}</div>` : ''}
    </div>`;
}

export function formatChartTooltipHtml(hoverBundle, {
  matchupMode = false,
  allHitAreas = [],
  streakEndForPoint = null,
  playoffEventForPoint = null,
} = {}) {
  const options = { streakEndForPoint, playoffEventForPoint };
  if (!hoverBundle?.hits?.length) return '';
  if (matchupMode && hoverBundle.hits.length >= 1) {
    if (hoverBundle.hits.length > 1) {
      return formatMatchupTooltipHtml(hoverBundle, allHitAreas, options);
    }
    return formatSoloTooltipHtml(hoverBundle.hits[0], allHitAreas, options);
  }
  return formatSoloTooltipHtml(hoverBundle.hits[0], allHitAreas, options);
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
  return formatSoloTooltipHtml(hit, []);
}
