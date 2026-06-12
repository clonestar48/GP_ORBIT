/**
 * Performance chart renderer — flatlines on off days, steps only on game days.
 * drawMultiSeriesChart supports N teams for future league-wide mode.
 */

const MAX_RENDER_POINTS = 900;

/** Preserve game days and flat-run boundaries; cap render cost on long ranges. */
export function thinPointsForRender(points, maxPoints = MAX_RENDER_POINTS) {
  if (!points?.length || points.length <= maxPoints) return points;

  const keep = new Set([0, points.length - 1]);
  points.forEach((p, i) => {
    if (p.gameId && !p.flatline) keep.add(i);
  });

  let i = 0;
  while (i < points.length) {
    if (keep.has(i)) {
      i += 1;
      continue;
    }
    const runStart = i;
    while (i < points.length && points[i].flatline && !keep.has(i)) i += 1;
    keep.add(runStart);
    if (i - 1 > runStart) keep.add(i - 1);
  }

  let indices = [...keep].sort((a, b) => a - b);
  if (indices.length > maxPoints) {
    const gameIdx = indices.filter((idx) => points[idx].gameId && !points[idx].flatline);
    const flatIdx = indices.filter((idx) => !points[idx].gameId || points[idx].flatline);
    const slots = Math.max(maxPoints - gameIdx.length, 0);
    const step = Math.max(1, Math.ceil(flatIdx.length / Math.max(slots, 1)));
    const sampled = flatIdx.filter((_, n) => n % step === 0).slice(0, slots);
    indices = [...new Set([0, points.length - 1, ...gameIdx, ...sampled])].sort((a, b) => a - b);
  }
  return indices.map((idx) => points[idx]);
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

function drawGrid(ctx, w, h, pad, yFn, values) {
  ctx.strokeStyle = 'rgba(61, 139, 130, 0.12)';
  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(236, 234, 228, 0.28)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad + (i / 4) * (h - pad * 2);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
    if (yFn && values?.length) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const padded = span * 0.08;
      const lo = min - padded;
      const hi = max + padded;
      const val = hi - (i / 4) * (hi - lo);
      ctx.fillText(Number.isInteger(val) ? String(val) : val.toFixed(1), pad - 4, y + 3);
    }
  }
}

function yScale(values, h, pad) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padded = span * 0.08;
  const lo = min - padded;
  const hi = max + padded;
  return (v) => pad + (1 - (v - lo) / (hi - lo || 1)) * (h - pad * 2);
}

function xScale(count, w, pad) {
  return (i, total = count) => pad + (i / Math.max(total - 1, 1)) * (w - pad * 2);
}

function drawOneSeries(ctx, points, color, xFn, yFn, hitAreas, meta = {}, hoverHit = null) {
  const renderPoints = thinPointsForRender(points);
  if (!renderPoints?.length) return;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = meta.lineWidth || 2.25;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  renderPoints.forEach((p, i) => {
    const x = xFn(i, renderPoints.length);
    const y = yFn(p.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  points.forEach((p, i) => {
    const x = xFn(i, points.length);
    const y = yFn(p.value);
    const isGame = p.gameId && !p.flatline;
    if (isGame) {
      const isHover = hoverHit?.point === p && hoverHit?.teamId === meta.teamId;
      const r = isHover ? 6 : 4;
      ctx.fillStyle = meta.dotColor || (p.result === 'W' ? '#6dd4a8' : '#f08080');
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (isHover) {
        ctx.strokeStyle = 'rgba(236, 234, 228, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      hitAreas.push({
        x, y, r: 10,
        point: p,
        isGame: true,
        teamName: meta.teamName,
        teamId: meta.teamId,
        color,
        metric: meta.metric,
      });
    }
  });

  const last = renderPoints[renderPoints.length - 1];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(xFn(renderPoints.length - 1, renderPoints.length), yFn(last.value), 3.5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Generic N-series chart — used by franchise, matchup, and future league views.
 */
export function drawMultiSeriesChart(ctx, w, h, seriesList, { pad = 22, hoverHit = null } = {}) {
  const hitAreas = [];
  const valid = (seriesList || []).filter((s) => s.points?.length);
  if (!valid.length) return { hitAreas };

  const allPoints = valid.flatMap((s) => s.points);
  const values = allPoints.map((p) => p.value);
  const yFn = yScale(values, h, pad);
  const count = Math.max(...valid.map((s) => s.points.length));
  const xFn = xScale(count, w, pad);

  drawGrid(ctx, w, h, pad, yFn, values);

  valid.forEach((teamSeries) => {
    drawOneSeries(ctx, teamSeries.points, teamSeries.color || '#5da396', xFn, yFn, hitAreas, {
      teamName: teamSeries.teamName,
      teamId: teamSeries.teamId,
      metric: teamSeries.metric,
      dotColor: teamSeries.color,
    }, hoverHit);
  });

  return { hitAreas };
}

export function drawPerformanceChart(ctx, w, h, series, hoverHit = null) {
  if (!series?.points?.length) return { hitAreas: [] };
  return drawMultiSeriesChart(ctx, w, h, [{
    ...series,
    metric: 'winPct',
  }], { hoverHit });
}

export function drawMatchupChart(ctx, w, h, matchup, hoverHit = null) {
  if (!matchup?.series?.length) return { hitAreas: [] };
  return drawMultiSeriesChart(ctx, w, h, matchup.series.map((s) => ({
    ...s,
    metric: 'index',
  })), { hoverHit });
}

export function findHit(hitAreas, mx, my) {
  let best = null;
  let bestDist = Infinity;
  for (const hit of hitAreas) {
    const d = Math.hypot(mx - hit.x, my - hit.y);
    if (d <= hit.r && d < bestDist) {
      best = hit;
      bestDist = d;
    }
  }
  return best;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtVal(v, suffix = '') {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return `${v}${suffix}`;
}

function esc(s) {
  return String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function metricLabel(metric) {
  return metric === 'winPct' ? 'Win %' : 'Performance index';
}

function fmtMovement(amount, metric) {
  if (amount == null || Number.isNaN(Number(amount)) || amount === 0) return 'No change';
  const suffix = metric === 'winPct' ? '%' : '';
  return `${amount > 0 ? '+' : ''}${amount}${suffix}`;
}

export function formatTooltip(hit) {
  return formatTooltipHtml(hit);
}

export function formatTooltipHtml(hit) {
  const p = hit.point;
  if (!p) return '';
  const metric = hit.metric || (hit.teamName ? 'index' : 'winPct');
  const ml = metricLabel(metric);
  const suffix = metric === 'winPct' ? '%' : '';

  if (p.flatline || !p.gameId) {
    return `
      <div class="sd-tip">
        ${hit.teamName ? `<div class="sd-tip__team">${esc(hit.teamName)}</div>` : ''}
        <div class="sd-tip__date">${esc(fmtDate(p.date))}</div>
        <div class="sd-tip__note">No game — flat performance line</div>
        <div class="sd-tip__row"><span>${ml}</span><strong>${esc(p.value)}${suffix}</strong></div>
        ${p.movementReason ? `<div class="sd-tip__reason">${esc(p.movementReason)}</div>` : ''}
      </div>`;
  }

  const resultCls = p.result === 'W' ? 'is-up' : 'is-down';
  return `
    <div class="sd-tip">
      ${hit.teamName ? `<div class="sd-tip__team">${esc(hit.teamName)}</div>` : ''}
      <div class="sd-tip__date">${esc(fmtDate(p.date))}</div>
      <div class="sd-tip__result ${resultCls}">${esc(p.result)} vs ${esc(p.opponentId)} · ${esc(p.pointsFor)}–${esc(p.pointsAgainst)}</div>
      <div class="sd-tip__grid">
        <div class="sd-tip__row"><span>Previous</span><strong>${esc(p.previousValue)}${suffix}</strong></div>
        <div class="sd-tip__row"><span>New</span><strong>${esc(p.value)}${suffix}</strong></div>
        <div class="sd-tip__row"><span>Movement</span><strong class="${resultCls}">${esc(fmtMovement(p.movementAmount, metric))}</strong></div>
      </div>
      ${p.movementReason ? `<div class="sd-tip__reason">${esc(p.movementReason)}</div>` : ''}
      ${p.cumulativeWins != null ? `<div class="sd-tip__meta">Range record · ${p.cumulativeWins}–${p.cumulativeLosses ?? 0}</div>` : ''}
    </div>`;
}
