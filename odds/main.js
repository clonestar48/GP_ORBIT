/**
 * NBA stats dashboard — data integrity first.
 *
 * Every event arrives from the server with a provenance envelope:
 *   source, sourceProvider, sourceTimestamp, dataConfidence, missingFields.
 * Nothing is invented client-side: missing fields render as "Unavailable",
 * charts only draw from real source data, movement only shows when the
 * server derived it from two real observations.
 */

import { buildComparisonModel } from '/lib/normalizers/competitorHistory.js';
import {
  drawComparisonChart,
  findHit,
  formatTooltipPoint,
  setupComparisonCanvas,
} from './comparisonChart.js';

const $ = (sel) => document.querySelector(sel);

const UNAVAILABLE = 'Unavailable';

const BADGES = {
  live: { label: 'LIVE DATA', cls: 'sd-flag--live' },
  partial: { label: 'PARTIAL DATA', cls: 'sd-flag--partial' },
  demo: { label: 'DEMO DATA', cls: 'sd-flag--demo' },
  unavailable: { label: 'DATA UNAVAILABLE', cls: 'sd-flag--unavailable' },
};

const state = {
  games: [],
  history: [],
  odds: null,
  meta: null,
  selectedId: null,
  errors: [],
  graphMode: 'success',
  graphRange: '5',
  compareHitAreas: [],
};

const GRAPH_MODE_LABELS = {
  success: 'General success',
  upcoming: 'Upcoming event',
  history: 'Past history',
};

const GRAPH_RANGE_LABELS = {
  5: 'Last 5',
  10: 'Last 10',
  season: 'Season',
};

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function parseTs(value) {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function formatTime(iso) {
  const ts = parseTs(iso);
  if (!ts) return UNAVAILABLE;
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmt(value) {
  return value == null ? UNAVAILABLE : String(value);
}

function fmtSpread(value, homeTeam) {
  if (value == null) return UNAVAILABLE;
  const n = Number(value);
  return `${homeTeam ?? ''} ${n > 0 ? '+' : ''}${n}`.trim();
}

function fmtAmerican(value) {
  if (value == null) return UNAVAILABLE;
  const n = Number(value);
  return n > 0 ? `+${n}` : String(n);
}

function movementClass(delta) {
  if (delta > 0) return 'is-up';
  if (delta < 0) return 'is-down';
  return '';
}

function isToday(iso) {
  const ts = parseTs(iso);
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function isPast(iso) {
  const ts = parseTs(iso);
  return ts != null && ts < Date.now();
}

function matchupLabel(g) {
  return `${g.awayTeam ?? UNAVAILABLE} @ ${g.homeTeam ?? UNAVAILABLE}`;
}

function badgeHtml(event) {
  const badge = BADGES[event.dataConfidence] || BADGES.unavailable;
  return `<span class="sd-flag ${badge.cls}">${badge.label}</span>`;
}

/* ------------------------------------------------------------- top chrome */

function renderModeBadge() {
  const badge = $('#mode-badge');
  if (!badge || !state.meta) return;
  badge.hidden = false;
  if (state.meta.mode === 'live') {
    badge.textContent = 'LIVE DATA';
    badge.className = 'sd-flag sd-flag--live';
  } else {
    badge.textContent = 'DEMO DATA';
    badge.className = 'sd-flag sd-flag--demo';
  }
}

function renderLastUpdated() {
  const el = $('#last-updated');
  if (!el) return;
  const ts = state.meta?.cachedAt;
  el.textContent = ts
    ? `Last updated ${new Date(ts * 1000).toLocaleTimeString()}`
    : `Last updated ${UNAVAILABLE}`;
}

function renderStatus() {
  const banner = $('#status-banner');
  if (!banner) return;
  const notices = [...state.errors];
  (state.meta?.errors || []).forEach((e) => notices.push(`Provider error: ${e}`));
  if (state.meta?.mode === 'demo') {
    notices.unshift('Demo data — fabricated values for layout testing only. Add ODDS_API_KEY for live data.');
  }
  if (!notices.length) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.classList.toggle('is-notice', state.errors.length === 0);
  banner.textContent = notices.join(' ');
}

/* ----------------------------------------------------------------- cards */

function renderEmpty(container, message) {
  container.innerHTML = `<p class="sd-empty">${message}</p>`;
}

function cardHtml(game, { showMovement = false, showScore = false } = {}) {
  const movement = game.spreadMovement;
  const moveHtml = showMovement && movement != null
    ? `<span class="sd-card__move ${movementClass(movement)}">${movement > 0 ? '+' : ''}${movement}</span>`
    : '';
  const status = game.status || 'upcoming';
  const hasScores = game.homeScore != null && game.awayScore != null;
  const scoreHtml = showScore && hasScores
    ? `<span class="sd-card__score">${game.awayScore} – ${game.homeScore}</span>`
    : '';
  const lineHtml = game.spread != null || game.currentSpread != null
    ? `<span class="sd-card__line">${fmtSpread(game.currentSpread ?? game.spread, game.homeTeam)}</span>`
    : '<span class="sd-card__line sd-card__line--na">Line unavailable</span>';
  const totalVal = game.currentTotal ?? game.total;
  const totalHtml = totalVal != null ? `<span>O/U ${totalVal}</span>` : '';
  return `
    <button type="button" class="sd-card${state.selectedId === game.gameId ? ' is-selected' : ''}"
      data-game-id="${game.gameId}">
      <div class="sd-card__top">
        <span class="sd-card__matchup">${matchupLabel(game)}</span>
        <span class="sd-card__time">${formatTime(game.startTime)}</span>
      </div>
      <div class="sd-card__row">
        ${badgeHtml(game)}
        <span class="sd-card__status${status === 'final' ? ' is-final' : ''}">${status}</span>
        ${lineHtml}
        ${totalHtml}
        ${moveHtml}
        ${scoreHtml}
      </div>
    </button>`;
}

function bindCards(container) {
  container.querySelectorAll('.sd-card').forEach((btn) => {
    btn.addEventListener('click', () => selectGame(btn.dataset.gameId));
  });
}

function renderToday() {
  const el = $('#today-games');
  // A stale 'upcoming' status on a game that already started must not
  // resurface it as a today/tonight event — only live or genuinely future.
  const today = state.games.filter((g) => isToday(g.startTime)
    && g.status !== 'final'
    && !(g.status === 'upcoming' && isPast(g.startTime)));
  if (!today.length) {
    renderEmpty(el, 'No NBA events for today in the current data source.');
    return;
  }
  el.innerHTML = today.map((g) => cardHtml(g, { showMovement: true })).join('');
  bindCards(el);
}

function renderUpcoming() {
  const el = $('#upcoming-games');
  // Upcoming = startTime >= now only. Status alone is not trusted because
  // providers (and demo fixtures) can carry stale 'upcoming' on past games.
  const upcoming = state.games.filter((g) => g.status === 'upcoming'
    && !isPast(g.startTime)
    && !isToday(g.startTime));
  if (!upcoming.length) {
    renderEmpty(el, 'No upcoming events in the current data source.');
    return;
  }
  el.innerHTML = upcoming.map((g) => cardHtml(g, { showMovement: true })).join('');
  bindCards(el);
}

function renderMovement() {
  const el = $('#line-movement');
  const rows = state.odds?.biggestMovement || [];
  if (!rows.length) {
    renderEmpty(el, state.meta?.mode === 'live'
      ? 'No movement yet — needs two observed line snapshots per event.'
      : 'No movement data in the current data source.');
    return;
  }
  el.innerHTML = rows.slice(0, 5).map((row) => {
    const cls = movementClass(row.movement);
    const badge = BADGES[row.dataConfidence] || BADGES.unavailable;
    return `
      <div class="sd-move-row">
        <span class="sd-move-row__matchup">${row.matchup}
          <span class="sd-flag sd-flag--mini ${badge.cls}">${badge.label}</span>
        </span>
        <span class="sd-move-row__delta ${cls}">${row.movement > 0 ? '+' : ''}${row.movement}</span>
      </div>`;
  }).join('');
}

function renderRecent() {
  const el = $('#recent-games');
  if (!state.history.length) {
    renderEmpty(el, state.meta?.mode === 'live'
      ? 'No stored historical outcomes yet — finals are recorded as they complete.'
      : 'No completed games in the current data source.');
    return;
  }
  el.innerHTML = state.history.slice(0, 6).map((g) => cardHtml(g, { showScore: true })).join('');
  bindCards(el);
}

/* ----------------------------------------------------------------- detail */

function findGame(gameId) {
  return state.games.find((g) => g.gameId === gameId)
    || state.history.find((g) => g.gameId === gameId);
}

function selectGame(gameId) {
  state.selectedId = gameId;
  const game = findGame(gameId);
  renderToday();
  renderUpcoming();
  renderRecent();
  renderDetail(game);
  renderDebug();
}

function renderDetail(game) {
  const meta = $('#detail-meta');
  const detailBadge = $('#detail-badge');
  const matchup = $('#detail-matchup');
  const spreadEl = $('#detail-spread');
  const spreadMove = $('#detail-spread-move');
  const totalEl = $('#detail-total');
  const mlEl = $('#detail-ml');
  const closeBlock = $('#close-result');
  const closeGrid = $('#close-result-grid');

  if (!game) {
    meta.textContent = 'Select an event';
    detailBadge.hidden = true;
    matchup.textContent = '—';
    spreadEl.textContent = '—';
    spreadMove.textContent = '';
    totalEl.textContent = '—';
    mlEl.textContent = '—';
    closeBlock.hidden = true;
    renderChart(null);
    renderComparisonChart(null);
    document.querySelectorAll('.sd-card.is-selected').forEach((c) => c.classList.remove('is-selected'));
    return;
  }

  meta.textContent = game.status === 'final' ? 'Final · historical outcome' : 'Market watch';
  const badge = BADGES[game.dataConfidence] || BADGES.unavailable;
  detailBadge.hidden = false;
  detailBadge.textContent = badge.label;
  detailBadge.className = `sd-flag ${badge.cls}`;

  matchup.textContent = matchupLabel(game);

  const spreadVal = game.status === 'final'
    ? (game.closingSpread ?? game.currentSpread ?? game.spread)
    : (game.currentSpread ?? game.spread);
  spreadEl.textContent = spreadVal != null ? fmtSpread(spreadVal, game.homeTeam) : UNAVAILABLE;
  totalEl.textContent = fmt(game.status === 'final'
    ? (game.closingTotal ?? game.currentTotal ?? game.total)
    : (game.currentTotal ?? game.total));

  const movement = game.spreadMovement;
  if (movement != null) {
    spreadMove.textContent = `${movement > 0 ? '+' : ''}${movement} vs open`;
    spreadMove.className = `sd-stat__move ${movementClass(movement)}`;
  } else {
    spreadMove.textContent = '';
    spreadMove.className = 'sd-stat__move';
  }

  if (game.impliedProbHome != null && game.impliedProbAway != null) {
    mlEl.textContent = `${game.homeTeam} ${game.impliedProbHome.toFixed(0)}% · ${game.awayTeam} ${game.impliedProbAway.toFixed(0)}%`;
  } else if (game.moneylineHome != null || game.moneylineAway != null) {
    mlEl.textContent = `${fmtAmerican(game.moneylineHome)} / ${fmtAmerican(game.moneylineAway)}`;
  } else {
    mlEl.textContent = UNAVAILABLE;
  }

  renderChart(game);
  renderComparisonChart(game);

  if (game.status === 'final') {
    closeBlock.hidden = false;
    const closing = game.closingSpread ?? game.currentSpread ?? game.spread;
    const margin = game.finalMargin;
    const marginText = margin == null
      ? UNAVAILABLE
      : margin > 0 ? `Home +${margin}` : margin < 0 ? `Away +${Math.abs(margin)}` : 'Even';
    const combined = (game.homeScore != null && game.awayScore != null)
      ? game.homeScore + game.awayScore
      : UNAVAILABLE;
    const scoreText = (game.homeScore != null && game.awayScore != null)
      ? `${game.awayScore} – ${game.homeScore}`
      : UNAVAILABLE;
    closeGrid.innerHTML = `
      <dt>Final score</dt><dd>${scoreText}</dd>
      <dt>Final margin</dt><dd>${marginText}</dd>
      <dt>Closing line</dt><dd>${closing != null ? fmtSpread(closing, game.homeTeam) : UNAVAILABLE}</dd>
      <dt>Line result</dt><dd>${game.lineResult ?? UNAVAILABLE}</dd>
      <dt>Closing total</dt><dd>${fmt(game.closingTotal ?? game.total)}</dd>
      <dt>Combined pts</dt><dd>${combined}</dd>`;
  } else {
    closeBlock.hidden = true;
  }
}

/* ----------------------------------------------------------------- charts */

function validHistoryPoints(game) {
  return (game?.lineHistory || [])
    .map((p) => ({ ...p, _ts: parseTs(p.ts), _spread: p.spread != null ? Number(p.spread) : null }))
    .filter((p) => p._ts != null && Number.isFinite(p._spread));
}

function ohlcPoints(game) {
  const points = game?.lineHistory || [];
  if (!points.length) return null;
  const ok = points.every((p) => ['open', 'high', 'low', 'close'].every((k) => p[k] != null));
  return ok ? points : null;
}

/**
 * Chart selection per source-data support:
 *   candles  — only when genuine OHLC fields exist
 *   line     — two or more real snapshots
 *   margin   — final scores only
 *   none     — nothing chartable; show unavailable message
 */
function chartModel(game) {
  if (!game) return { type: 'none' };
  const candles = ohlcPoints(game);
  if (candles && candles.length >= 2) return { type: 'candles', points: candles };
  const points = validHistoryPoints(game);
  if (points.length >= 2) return { type: 'line', points };
  if (game.homeScore != null && game.awayScore != null) return { type: 'margin' };
  return { type: 'none' };
}

function setupCanvas() {
  const canvas = $('#line-chart');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, w: rect.width, h: rect.height };
}

function renderChart(game) {
  const empty = $('#chart-empty');
  const caption = $('#chart-caption');
  const model = chartModel(game);
  const { ctx, w, h } = setupCanvas();

  empty.style.display = model.type === 'none' ? 'flex' : 'none';
  caption.hidden = model.type === 'none';

  if (model.type === 'line') {
    caption.textContent = `Line history — ${model.points.length} observed snapshots`;
    drawLine(ctx, w, h, model.points);
  } else if (model.type === 'candles') {
    caption.textContent = `Candles — ${model.points.length} OHLC periods from source data`;
    drawCandles(ctx, w, h, model.points);
  } else if (model.type === 'margin') {
    caption.textContent = 'Final margin (no line history available for this event)';
    drawMarginBar(ctx, w, h, game);
  }
}

function drawGrid(ctx, w, h, pad) {
  ctx.strokeStyle = 'rgba(61, 139, 130, 0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad + (i / 4) * (h - pad * 2);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
  }
}

function drawLine(ctx, w, h, points) {
  const pad = 12;
  const minTs = Math.min(...points.map((p) => p._ts));
  const maxTs = Math.max(...points.map((p) => p._ts));
  const spreads = points.map((p) => p._spread);
  const minY = Math.min(...spreads) - 0.5;
  const maxY = Math.max(...spreads) + 0.5;

  const xScale = (ts) => pad + ((ts - minTs) / (maxTs - minTs || 1)) * (w - pad * 2);
  const yScale = (v) => pad + (1 - (v - minY) / (maxY - minY || 1)) * (h - pad * 2);

  drawGrid(ctx, w, h, pad);

  ctx.beginPath();
  ctx.strokeStyle = '#5da396';
  ctx.lineWidth = 2;
  points.forEach((p, i) => {
    const x = xScale(p._ts);
    const y = yScale(p._spread);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const last = points[points.length - 1];
  ctx.fillStyle = '#5da396';
  ctx.beginPath();
  ctx.arc(xScale(last._ts), yScale(last._spread), 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawCandles(ctx, w, h, points) {
  const pad = 14;
  const values = points.flatMap((p) => [Number(p.high), Number(p.low)]);
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const yScale = (v) => pad + (1 - (v - minY) / (maxY - minY || 1)) * (h - pad * 2);
  const slot = (w - pad * 2) / points.length;
  const bodyW = Math.max(3, Math.min(14, slot * 0.5));

  drawGrid(ctx, w, h, pad);

  points.forEach((p, i) => {
    const x = pad + slot * i + slot / 2;
    const open = Number(p.open);
    const close = Number(p.close);
    const up = close >= open;
    const color = up ? '#6dd4a8' : '#f08080';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yScale(Number(p.high)));
    ctx.lineTo(x, yScale(Number(p.low)));
    ctx.stroke();
    const top = yScale(Math.max(open, close));
    const bottom = yScale(Math.min(open, close));
    ctx.fillRect(x - bodyW / 2, top, bodyW, Math.max(1, bottom - top));
  });
}

function drawMarginBar(ctx, w, h, game) {
  const margin = game.finalMargin;
  if (margin == null) return;
  const pad = 16;
  const mid = w / 2;
  const maxAbs = Math.max(Math.abs(margin), 10);
  const barLen = (Math.abs(margin) / maxAbs) * (w / 2 - pad * 2);
  const barH = 26;
  const y = h / 2 - barH / 2;

  ctx.strokeStyle = 'rgba(236, 234, 228, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mid, pad);
  ctx.lineTo(mid, h - pad);
  ctx.stroke();

  ctx.fillStyle = margin >= 0 ? '#6dd4a8' : '#f08080';
  if (margin >= 0) ctx.fillRect(mid, y, barLen, barH);
  else ctx.fillRect(mid - barLen, y, barLen, barH);

  ctx.fillStyle = 'rgba(236, 234, 228, 0.8)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${game.awayTeam}`, pad, h / 2 + 4);
  ctx.textAlign = 'right';
  ctx.fillText(`${game.homeTeam}`, w - pad, h / 2 + 4);
  ctx.textAlign = 'center';
  ctx.fillText(
    margin > 0 ? `Home +${margin}` : margin < 0 ? `Away +${Math.abs(margin)}` : 'Even',
    mid, y - 6,
  );
}

/* ---------------------------------------------------- competitor comparison */

function allFinalEvents() {
  const byId = new Map();
  [...state.history, ...state.games.filter((g) => g.status === 'final')].forEach((g) => {
    if (g.status === 'final' && g.homeScore != null && g.awayScore != null) {
      byId.set(g.gameId, g);
    }
  });
  return [...byId.values()];
}

function comparisonEventsForMode(game) {
  const finals = allFinalEvents();
  if (state.meta?.mode === 'demo') {
    return finals.filter((g) => g.source === 'demo');
  }
  return finals.filter((g) => g.source !== 'demo');
}

function comparisonModel(game) {
  if (!game?.awayTeam || !game?.homeTeam) return null;
  const mode = state.graphMode === 'upcoming' && game.status === 'final' ? 'success' : state.graphMode;
  const beforeTime = mode === 'upcoming' ? game.startTime : null;
  return buildComparisonModel({
    events: comparisonEventsForMode(game),
    awayTeam: game.awayTeam,
    homeTeam: game.homeTeam,
    mode,
    range: state.graphRange,
    beforeTime,
    league: game.league || 'nba',
    dataMode: state.meta?.mode || 'live',
  });
}

function renderComparisonLegend(model, game) {
  const legend = $('#compare-legend');
  const badge = $('#compare-badge');
  if (!model?.hasData) {
    legend.hidden = true;
    badge.hidden = true;
    return;
  }
  legend.hidden = false;
  badge.hidden = false;
  const conf = BADGES[model.confidence] || BADGES.unavailable;
  badge.textContent = conf.label;
  badge.className = `sd-flag ${conf.cls}`;
  legend.innerHTML = model.competitors.map((c) => {
    const latest = c.latestFormScore;
    const meta = c.gameCount
      ? `Form score ${latest ?? UNAVAILABLE} · ${c.gameCount} game${c.gameCount === 1 ? '' : 's'}`
      : 'Unavailable';
    return `
      <span class="sd-legend-item">
        <span class="sd-legend-swatch" style="background:${c.color}"></span>
        <span>${c.name}</span>
        <span class="sd-legend-meta">${meta}</span>
      </span>`;
  }).join('');
}

function renderComparisonChart(game) {
  const canvas = $('#compare-chart');
  const empty = $('#compare-empty');
  const caption = $('#compare-caption');
  const tooltip = $('#compare-tooltip');
  const model = comparisonModel(game);
  const { ctx, w, h } = setupComparisonCanvas(canvas);

  tooltip.hidden = true;
  state.compareHitAreas = [];

  if (!model?.hasData) {
    empty.style.display = 'flex';
    renderComparisonLegend(model, game);
    if (model?.unavailableTeams?.length && game) {
      caption.textContent = `No stored outcomes for: ${model.unavailableTeams.join(', ')}. Live mode records finals as they complete.`;
    } else {
      caption.textContent = 'Recent success score — derived from observed final outcomes only';
    }
    return;
  }

  empty.style.display = 'none';
  renderComparisonLegend(model, game);

  const modeLabel = GRAPH_MODE_LABELS[state.graphMode] || state.graphMode;
  const rangeLabel = GRAPH_RANGE_LABELS[state.graphRange] || state.graphRange;
  const partial = model.unavailableTeams?.length
    ? ` · missing: ${model.unavailableTeams.join(', ')}`
    : '';
  caption.textContent = `${modeLabel} · ${rangeLabel} · Form score from observed finals${partial}`;

  const result = drawComparisonChart(ctx, w, h, model);
  state.compareHitAreas = result.hitAreas || [];
}

function bindComparisonControls() {
  document.querySelectorAll('[data-graph-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.graphMode = btn.dataset.graphMode;
      document.querySelectorAll('[data-graph-mode]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.graphMode === state.graphMode);
      });
      renderComparisonChart(findGame(state.selectedId));
    });
  });
  document.querySelectorAll('[data-graph-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.graphRange = btn.dataset.graphRange;
      document.querySelectorAll('[data-graph-range]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.graphRange === state.graphRange);
      });
      renderComparisonChart(findGame(state.selectedId));
    });
  });

  const canvas = $('#compare-chart');
  const tooltip = $('#compare-tooltip');
  const wrap = canvas?.closest('.sd-chart-wrap');

  canvas?.addEventListener('mousemove', (e) => {
    if (!state.compareHitAreas.length || !wrap) {
      tooltip.hidden = true;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = findHit(state.compareHitAreas, mx, my);
    if (!hit) {
      tooltip.hidden = true;
      return;
    }
    tooltip.textContent = formatTooltipPoint(hit.tooltip, state.meta?.mode);
    tooltip.hidden = false;
    const wrapRect = wrap.getBoundingClientRect();
    tooltip.style.left = `${e.clientX - wrapRect.left + 12}px`;
    tooltip.style.top = `${e.clientY - wrapRect.top - 8}px`;
  });

  canvas?.addEventListener('mouseleave', () => {
    tooltip.hidden = true;
  });
}

/* ------------------------------------------------------------ debug panel */

function renderDebug() {
  const metaEl = $('#debug-meta');
  const missingEl = $('#debug-missing');
  const timesEl = $('#debug-times');
  const normalizedEl = $('#debug-normalized');

  if (state.meta) {
    const updated = state.meta.cachedAt
      ? new Date(state.meta.cachedAt * 1000).toLocaleString()
      : UNAVAILABLE;
    const errs = (state.meta.errors || []).length
      ? ` · errors: ${state.meta.errors.join('; ')}`
      : '';
    metaEl.textContent = `mode: ${state.meta.mode} · last updated: ${updated}${errs}`;
  }

  const game = findGame(state.selectedId);
  if (!game) {
    missingEl.textContent = 'No event selected.';
    timesEl.textContent = '—';
    normalizedEl.textContent = '—';
    return;
  }
  missingEl.textContent = game.missingFields?.length
    ? `Missing fields: ${game.missingFields.join(', ')}`
    : 'Missing fields: none';
  timesEl.textContent = [
    `raw provider timestamp: ${game.rawStartTime ?? UNAVAILABLE}`,
    `normalized startTime:   ${game.startTime ?? UNAVAILABLE}`,
    `local display time:     ${formatTime(game.startTime)}`,
    `status:                 ${game.status ?? UNAVAILABLE}`,
    `league:                 ${game.league ?? UNAVAILABLE}`,
    `sourceProvider:         ${game.sourceProvider ?? UNAVAILABLE}`,
  ].join('\n');
  normalizedEl.textContent = JSON.stringify(game, null, 2);
}

async function loadDebugProviders() {
  const container = $('#debug-providers');
  try {
    const payload = await fetchJson('/api/debug');
    const providers = payload.providers || {};
    if (!Object.keys(providers).length) {
      container.innerHTML = '<p class="sd-debug__line">No provider responses recorded.</p>';
      return;
    }
    container.innerHTML = Object.entries(providers).map(([key, value]) => {
      let body = JSON.stringify(value, null, 2);
      const truncated = body.length > 20000;
      if (truncated) body = `${body.slice(0, 20000)}\n… (truncated)`;
      return `
        <div class="sd-debug__provider">
          <p class="sd-debug__line">${value.provider ?? key} · fetched ${value.fetchedAt ?? UNAVAILABLE}${value.error ? ` · error: ${value.error}` : ''}</p>
          <pre class="sd-debug__pre">${body.replace(/</g, '&lt;')}</pre>
        </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p class="sd-debug__line">Debug endpoint failed: ${err.message}</p>`;
  }
}

/* ------------------------------------------------------------------- load */

async function loadDashboard() {
  state.errors = [];
  const [gamesRes, oddsRes, historyRes] = await Promise.allSettled([
    fetchJson('/api/games'),
    fetchJson('/api/odds'),
    fetchJson('/api/history'),
  ]);

  if (gamesRes.status === 'fulfilled') {
    state.games = gamesRes.value.games || [];
    state.meta = {
      mode: gamesRes.value.mode,
      errors: gamesRes.value.errors,
      cachedAt: gamesRes.value.cachedAt,
      updatedAt: gamesRes.value.updatedAt,
      refreshSec: gamesRes.value.refreshSec,
    };
  } else {
    state.errors.push('Could not load games.');
    state.games = [];
  }
  state.odds = oddsRes.status === 'fulfilled' ? oddsRes.value : null;
  if (oddsRes.status === 'rejected') state.errors.push('Could not load market lines.');
  state.history = historyRes.status === 'fulfilled' ? (historyRes.value.games || []) : [];
  if (historyRes.status === 'rejected') state.errors.push('Could not load history.');

  renderModeBadge();
  renderLastUpdated();
  renderStatus();
  renderToday();
  renderUpcoming();
  renderMovement();
  renderRecent();

  if (!state.selectedId || !findGame(state.selectedId)) {
    const first = state.games.find((g) => isToday(g.startTime)) || state.games[0] || state.history[0];
    if (first) selectGame(first.gameId);
    else {
      renderDetail(null);
      renderDebug();
    }
  } else {
    renderDetail(findGame(state.selectedId));
    renderDebug();
  }
}

window.addEventListener('resize', () => {
  const game = findGame(state.selectedId);
  renderChart(game);
  renderComparisonChart(game);
});

bindComparisonControls();

$('#debug-panel').addEventListener('toggle', (e) => {
  if (e.target.open) loadDebugProviders();
});

loadDashboard();
setInterval(loadDashboard, 5 * 60 * 1000);
