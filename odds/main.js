/**
 * Performance Market — sports performance dashboard.
 * Charts reflect real historical game results only.
 */

import {
  drawMatchupChart,
  drawPerformanceChart,
  findHit,
  formatTooltipHtml,
  setupCanvas,
} from './performanceChart.js';
import { createRange, rangeLabel, rangeToQuery } from './range.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  teams: [],
  meta: null,
  heroMode: 'solo',
  selectedTeamId: 'SAS',
  teamA: 'SAS',
  teamB: 'NYK',
  range: createRange({ preset: 'week', mode: 'franchise', metric: 'winPct' }),
  teamSeries: null,
  teamGames: [],
  matchup: null,
  heroHitAreas: [],
  hoverHit: null,
  loading: false,
  errors: [],
};

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function movementClass(delta) {
  if (delta > 0) return 'is-up';
  if (delta < 0) return 'is-down';
  return '';
}

function findTeam(id) {
  return state.teams.find((t) => t.id === id);
}

function opponentLabel(abbr) {
  const t = findTeam(abbr);
  return t ? `${t.city} ${t.name}` : abbr;
}

function emptyStateHtml({ title, detail = '' }) {
  return `
    <div class="sd-empty-state">
      <p class="sd-empty-state__title">${title}</p>
      ${detail ? `<p class="sd-empty-state__detail">${detail}</p>` : ''}
    </div>`;
}

function setLoading(loading) {
  state.loading = loading;
  const chartSkeleton = $('#hero-chart-skeleton');
  const summarySkeleton = $('#market-summary-skeleton');
  const wrap = $('#hero-chart-wrap');
  const summaryBody = $('#market-summary-body');

  if (loading) {
    chartSkeleton.hidden = false;
    summarySkeleton.hidden = false;
    wrap?.classList.add('is-loading');
    summaryBody?.classList.remove('is-loaded');
    summaryBody.innerHTML = '';
  } else {
    chartSkeleton.hidden = true;
    summarySkeleton.hidden = true;
    wrap?.classList.remove('is-loading');
  }
}

function soloRange() {
  return createRange({
    preset: state.range.preset,
    teams: [state.selectedTeamId],
    mode: 'franchise',
    metric: 'winPct',
  });
}

function matchupRange() {
  return createRange({
    preset: state.range.preset,
    teams: [state.teamA, state.teamB],
    mode: 'matchup',
    metric: 'index',
  });
}

function performanceUrl(teamId, range) {
  const q = rangeToQuery({ ...range, teams: [teamId] });
  return `/api/performance?teamId=${encodeURIComponent(teamId)}&${q}`;
}

function matchupUrl(range) {
  const q = rangeToQuery(range);
  return `/api/matchup?teamA=${encodeURIComponent(state.teamA)}&teamB=${encodeURIComponent(state.teamB)}&${q}`;
}

/* ------------------------------------------------------------- chrome */

function renderHeader() {
  const updated = $('#last-updated');
  if (state.meta?.cachedAt) {
    updated.textContent = `Updated ${new Date(state.meta.cachedAt * 1000).toLocaleTimeString()}`;
  }
  const banner = $('#status-banner');
  if (state.errors.length) {
    banner.hidden = false;
    banner.textContent = state.errors.join(' ');
  } else if (state.meta?.label) {
    banner.hidden = false;
    banner.classList.add('is-notice');
    banner.textContent = state.meta.label;
  } else {
    banner.hidden = true;
  }
}

/* ------------------------------------------------------------- teams */

function teamCardHtml(team) {
  const selected = team.id === state.selectedTeamId;
  return `
    <button type="button" class="sd-card sd-team-card${selected ? ' is-selected' : ''}"
      data-team-id="${team.id}">
      <span class="sd-team-card__swatch" style="background:${team.colors?.primary || '#5da396'}"></span>
      <span class="sd-team-card__name">${team.city} ${team.name}</span>
      <span class="sd-team-card__abbr">${team.abbreviation}</span>
    </button>`;
}

function renderTeamList() {
  const el = $('#team-list');
  if (!state.teams.length) {
    el.innerHTML = emptyStateHtml({
      title: 'No teams available',
      detail: 'Team data could not be loaded. Refresh to try again.',
    });
    return;
  }
  el.innerHTML = state.teams.map(teamCardHtml).join('');
  el.querySelectorAll('.sd-team-card').forEach((btn) => {
    btn.addEventListener('click', () => selectTeam(btn.dataset.teamId));
  });
}

function populateTeamSelects() {
  const opts = state.teams.map((t) =>
    `<option value="${t.id}">${t.city} ${t.name}</option>`,
  ).join('');
  $('#solo-team').innerHTML = opts;
  $('#solo-team').value = state.selectedTeamId;
  $('#matchup-team-a').innerHTML = opts;
  $('#matchup-team-b').innerHTML = opts;
  $('#matchup-team-a').value = state.teamA;
  $('#matchup-team-b').value = state.teamB;
}

function renderHeroContext() {
  const isSolo = state.heroMode === 'solo';
  const isMatchup = state.heroMode === 'matchup';

  $('#solo-context').hidden = !isSolo;
  $('#matchup-context').hidden = !isMatchup;

  if (isSolo) {
    const team = findTeam(state.selectedTeamId);
    $('#hero-title').textContent = 'Franchise Trend';
    $('#hero-meta').textContent = team
      ? `${team.city} ${team.name} · ${rangeLabel(state.range)}`
      : 'Select a team';
  } else if (isMatchup) {
    const teamA = findTeam(state.teamA);
    const teamB = findTeam(state.teamB);
    $('#hero-title').textContent = 'Head-to-Head';
    $('#hero-meta').textContent = `${teamA?.abbreviation ?? state.teamA} vs ${teamB?.abbreviation ?? state.teamB} · ${rangeLabel(state.range)}`;
  }
  // Future: heroMode === 'league' → show league context, hide solo + matchup
}

function latestGameStats(games) {
  if (!games.length) return { winPct: null, record: null, games: 0 };
  const wins = games.filter((g) => g.result === 'W').length;
  const losses = games.length - wins;
  return {
    winPct: ((wins / games.length) * 100).toFixed(1),
    record: `${wins}–${losses}`,
    games: games.length,
  };
}

function renderSoloStats() {
  const stats = latestGameStats(state.teamGames);
  $('#stat-winpct').textContent = stats.winPct != null ? `${stats.winPct}%` : '—';
  $('#stat-record').textContent = stats.record ?? '—';
  $('#stat-games').textContent = stats.games ?? '—';

  const moveEl = $('#stat-winpct-move');
  const gamePoints = (state.teamSeries?.points || []).filter((p) => p.gameId && !p.flatline);
  if (gamePoints.length >= 1) {
    const last = gamePoints[gamePoints.length - 1];
    const delta = last.movementAmount ?? 0;
    if (delta !== 0) {
      moveEl.textContent = `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% last game`;
      moveEl.className = movementClass(delta);
    } else {
      moveEl.textContent = '';
    }
  } else {
    moveEl.textContent = '';
  }
}

function significantPoint(gamePoints) {
  if (!gamePoints.length) return null;
  return [...gamePoints].sort((a, b) =>
    Math.abs(b.movementAmount ?? 0) - Math.abs(a.movementAmount ?? 0))[0];
}

function formSnippet(games, limit = 4) {
  const streak = games
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((g) => g.result);
  if (!streak.length) return null;
  return streak.join(' · ');
}

function netMetricChange(gamePoints, metric) {
  if (gamePoints.length < 1) return null;
  const first = gamePoints[0].previousValue ?? gamePoints[0].value;
  const last = gamePoints[gamePoints.length - 1].value;
  if (first == null || last == null) return null;
  const delta = Number((last - first).toFixed(metric === 'winPct' ? 1 : 2));
  return { start: first, end: last, delta };
}

function renderMarketSummary() {
  const body = $('#market-summary-body');
  const skeleton = $('#market-summary-skeleton');
  if (!body) return;

  if (state.loading) {
    body.innerHTML = '';
    body.classList.remove('is-loaded');
    skeleton.hidden = false;
    return;
  }

  skeleton.hidden = true;

  if (state.heroMode === 'matchup') {
    body.innerHTML = buildMatchupSummary();
  } else {
    body.innerHTML = buildSoloSummary();
  }

  requestAnimationFrame(() => body.classList.add('is-loaded'));
}

function buildSoloSummary() {
  const team = findTeam(state.selectedTeamId);
  const label = rangeLabel(state.range);
  const series = state.teamSeries;

  if (series?.error) {
    return emptyStateHtml({
      title: 'Summary unavailable',
      detail: series.error,
    });
  }

  const gamePoints = (series?.points || []).filter((p) => p.gameId && !p.flatline);
  const stats = latestGameStats(state.teamGames);
  const metricName = 'Win %';
  const suffix = '%';

  if (!gamePoints.length) {
    const isToday = state.range.preset === 'today';
    return `
      <div class="sd-market-summary__content">
        <div class="sd-market-summary__head">
          <strong class="sd-market-summary__team">${team ? `${team.city} ${team.name}` : '—'}</strong>
          <span class="sd-market-summary__range">${label}</span>
        </div>
        <p class="sd-market-summary__note">${isToday
    ? 'No games scheduled today — performance holds at the current level.'
    : 'No games in this range — the chart shows a flat performance line.'}</p>
      </div>`;
  }

  const net = netMetricChange(gamePoints, 'winPct');
  const sig = significantPoint(gamePoints);
  const form = formSnippet(state.teamGames);
  const deltaCls = movementClass(net?.delta ?? 0);
  const sigCls = sig?.result === 'W' ? 'is-up' : 'is-down';
  const sigVerb = sig?.result === 'W' ? 'Win' : 'Loss';

  return `
    <div class="sd-market-summary__content">
      <div class="sd-market-summary__head">
        <strong class="sd-market-summary__team">${team ? `${team.city} ${team.name}` : '—'}</strong>
        <span class="sd-market-summary__range">${label}</span>
      </div>
      <div class="sd-market-summary__stats">
        <span class="sd-market-summary__stat">Record: <strong>${stats.record ?? '—'}</strong></span>
        <span class="sd-market-summary__stat">${metricName}: <strong>${net?.end ?? '—'}${suffix}</strong>${net?.delta != null && net.delta !== 0
    ? ` <em class="${deltaCls}">${net.delta > 0 ? '+' : ''}${net.delta}${suffix}</em>`
    : ''}</span>
      </div>
      ${sig ? `
        <p class="sd-market-summary__event">
          <span class="sd-market-summary__event-label">Most significant event</span>
          <span class="${sigCls}">${sigVerb} vs ${opponentLabel(sig.opponentId)}, ${sig.pointsFor}–${sig.pointsAgainst}</span>
        </p>` : ''}
      ${form ? `<p class="sd-market-summary__form">Recent form · ${form}</p>` : ''}
    </div>`;
}

function buildMatchupSummary() {
  const teamA = findTeam(state.teamA);
  const teamB = findTeam(state.teamB);
  const label = rangeLabel(state.range);
  const matchup = state.matchup;

  if (matchup?.error) {
    return emptyStateHtml({
      title: 'Matchup summary unavailable',
      detail: matchup.error,
    });
  }

  if (!matchup?.series?.length) {
    return emptyStateHtml({
      title: 'No matchup data',
      detail: 'Select two teams and a range with overlapping games.',
    });
  }

  const allGamePoints = matchup.series.flatMap((s) =>
    (s.points || []).filter((p) => p.gameId && !p.flatline).map((p) => ({ ...p, teamName: s.teamName, teamId: s.teamId })),
  );

  if (!allGamePoints.length) {
    return `
      <div class="sd-market-summary__content">
        <div class="sd-market-summary__head">
          <strong class="sd-market-summary__team">${teamA?.abbreviation ?? state.teamA} vs ${teamB?.abbreviation ?? state.teamB}</strong>
          <span class="sd-market-summary__range">${label}</span>
        </div>
        <p class="sd-market-summary__note">No games for either team in this range.</p>
      </div>`;
  }

  const sig = significantPoint(allGamePoints);
  const sigCls = sig?.result === 'W' ? 'is-up' : 'is-down';
  const sigVerb = sig?.result === 'W' ? 'Win' : 'Loss';

  const teamLines = matchup.series.map((s) => {
    const pts = (s.points || []).filter((p) => p.gameId && !p.flatline);
    const net = netMetricChange(pts, 'index');
    const cls = movementClass(net?.delta ?? 0);
    return `<span class="sd-market-summary__stat">${s.teamName}: <strong>${net?.end ?? '—'}</strong>${net?.delta != null && net.delta !== 0
      ? ` <em class="${cls}">${net.delta > 0 ? '+' : ''}${net.delta}</em>`
      : ''}</span>`;
  }).join('');

  return `
    <div class="sd-market-summary__content">
      <div class="sd-market-summary__head">
        <strong class="sd-market-summary__team">${teamA?.abbreviation ?? state.teamA} vs ${teamB?.abbreviation ?? state.teamB}</strong>
        <span class="sd-market-summary__range">${label}</span>
      </div>
      <div class="sd-market-summary__stats sd-market-summary__stats--matchup">
        ${teamLines}
      </div>
      ${sig ? `
        <p class="sd-market-summary__event">
          <span class="sd-market-summary__event-label">Most significant event</span>
          <span class="${sigCls}">${sig.teamName} · ${sigVerb} vs ${opponentLabel(sig.opponentId)}, ${sig.pointsFor}–${sig.pointsAgainst}</span>
        </p>` : ''}
    </div>`;
}

function heroEmptyState({ title, detail }) {
  const empty = $('#hero-chart-empty');
  empty.innerHTML = emptyStateHtml({ title, detail });
  empty.style.display = 'flex';
}

function renderHeroLegend() {
  const legend = $('#hero-legend');
  if (state.heroMode !== 'matchup' || !state.matchup?.series?.length) {
    legend.hidden = true;
    return;
  }
  legend.hidden = false;
  legend.innerHTML = state.matchup.series.map((s) => `
    <span class="sd-legend-item">
      <span class="sd-legend-swatch" style="background:${s.color}"></span>
      <span>${s.teamName}</span>
      <span class="sd-legend-meta">Index · ${s.gameCount} game${s.gameCount === 1 ? '' : 's'}</span>
    </span>`).join('');
}

function renderHeroChart() {
  const canvas = $('#hero-chart');
  const empty = $('#hero-chart-empty');
  const caption = $('#hero-chart-caption');
  const tooltip = $('#hero-tooltip');
  const { ctx, w, h } = setupCanvas(canvas);

  if (!state.hoverHit) tooltip.hidden = true;
  state.heroHitAreas = [];
  renderHeroContext();
  renderHeroLegend();

  if (state.heroMode === 'solo') {
    renderSoloStats();
    const series = state.teamSeries;
    if (series?.error) {
      heroEmptyState({
        title: 'Data unavailable',
        detail: series.error,
      });
      caption.textContent = 'Unable to load performance data';
      return;
    }
    if (!series?.points?.length) {
      heroEmptyState({
        title: 'No data in this range',
        detail: 'Try a wider timeline or another team.',
      });
      caption.textContent = 'Data unavailable';
      return;
    }
    empty.style.display = 'none';
    const gamePoints = (series.points || []).filter((p) => p.gameId && !p.flatline);
    caption.textContent = gamePoints.length
      ? `${rangeLabel(state.range)} · Win % · ${series.gameCount} game${series.gameCount === 1 ? '' : 's'}`
      : 'No games in this range — flat performance line';
    const colored = { ...series, color: series.color || findTeam(state.selectedTeamId)?.colors?.primary };
    const result = drawPerformanceChart(ctx, w, h, colored, state.hoverHit);
    state.heroHitAreas = (result.hitAreas || []).map((hit) => ({ ...hit, metric: 'winPct' }));
    return;
  }

  const matchup = state.matchup;
  if (matchup?.error) {
    heroEmptyState({
      title: 'Matchup unavailable',
      detail: matchup.error,
    });
    caption.textContent = 'Unable to load head-to-head data';
    return;
  }
  if (!matchup?.series?.length) {
    heroEmptyState({
      title: 'No matchup data',
      detail: 'Both teams need games in the selected range.',
    });
    caption.textContent = 'Data unavailable';
    return;
  }
  empty.style.display = 'none';
  const teamA = findTeam(state.teamA);
  const teamB = findTeam(state.teamB);
  const hasGames = matchup.series.some((s) =>
    (s.points || []).some((p) => p.gameId && !p.flatline));
  caption.textContent = hasGames
    ? `${teamA?.abbreviation ?? state.teamA} vs ${teamB?.abbreviation ?? state.teamB} · ${rangeLabel(state.range)} · Performance index`
    : 'No games in this range for either team';
  const result = drawMatchupChart(ctx, w, h, matchup, state.hoverHit);
  state.heroHitAreas = (result.hitAreas || []).map((hit) => ({ ...hit, metric: 'index' }));
}

function renderRecentResults() {
  const el = $('#recent-results');
  const games = [...state.teamGames].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  if (!games.length) {
    const isToday = state.range.preset === 'today';
    el.innerHTML = emptyStateHtml({
      title: isToday ? 'No games today' : 'No results in this range',
      detail: isToday
        ? 'Check back when the schedule has final scores.'
        : 'Widen the timeline or pick another team.',
    });
    return;
  }
  el.innerHTML = games.map((g) => {
    const cls = g.result === 'W' ? 'is-up' : 'is-down';
    return `
      <div class="sd-card sd-form-card">
        <div class="sd-card__top">
          <span class="sd-card__matchup ${cls}">${g.result === 'W' ? 'W' : 'L'} vs ${g.opponent}</span>
          <span class="sd-card__time">${g.date}</span>
        </div>
        <div class="sd-card__row">
          <span class="sd-card__score ${cls}">${g.teamScore} – ${g.opponentScore}</span>
          <span class="sd-card__status is-final">Final</span>
        </div>
      </div>`;
  }).join('');
}

function renderHistoricalMovement() {
  const el = $('#historical-movement');
  const gamePoints = (state.teamSeries?.points || []).filter((p) => p.gameId && !p.flatline);
  if (!gamePoints.length) {
    el.innerHTML = emptyStateHtml({
      title: 'No movement in this range',
      detail: 'Game-day swings appear here when results shift the trend.',
    });
    return;
  }
  const swings = [...gamePoints]
    .sort((a, b) => Math.abs(b.movementAmount ?? 0) - Math.abs(a.movementAmount ?? 0))
    .slice(0, 5);

  el.innerHTML = swings.map((p) => `
    <div class="sd-move-row">
      <span class="sd-move-row__matchup">${p.date} vs ${p.opponentId}</span>
      <span class="sd-move-row__delta ${movementClass(p.movementAmount)}">${(p.movementAmount ?? 0) > 0 ? '+' : ''}${(p.movementAmount ?? 0).toFixed(1)}%</span>
    </div>`).join('');
}

function renderPanels() {
  renderRecentResults();
  renderHistoricalMovement();
  renderTeamList();
}

async function loadPanelData() {
  try {
    const payload = await fetchJson(performanceUrl(state.selectedTeamId, soloRange()));
    if (payload.error && !payload.series) throw new Error(payload.error);
    state.teamSeries = payload.series ?? null;
    state.teamGames = payload.games || [];
    if (payload.mode) state.meta = { ...state.meta, ...payload };
    if (state.teamSeries?.error) {
      state.errors = [`Panel data: ${state.teamSeries.error}`];
    }
  } catch (err) {
    state.errors = [`Panel data: ${err.message}`];
    state.teamSeries = null;
    state.teamGames = [];
  }
}

async function loadMatchupHero() {
  try {
    const payload = await fetchJson(matchupUrl(matchupRange()));
    if (payload.error && !payload.series) throw new Error(payload.error);
    state.matchup = payload;
    if (payload.error) {
      state.errors = [`Matchup data: ${payload.error}`];
    }
  } catch (err) {
    state.errors = [`Matchup data: ${err.message}`];
    state.matchup = null;
  }
}

async function loadData() {
  state.errors = [];
  state.hoverHit = null;
  setLoading(true);
  try {
    await loadPanelData();
    if (state.heroMode === 'matchup') {
      await loadMatchupHero();
    } else {
      state.matchup = null;
    }
  } finally {
    setLoading(false);
    renderHeroChart();
    renderMarketSummary();
    renderPanels();
    renderHeader();
  }
}

function selectTeam(teamId) {
  state.selectedTeamId = teamId;
  if (state.heroMode === 'solo') {
    $('#solo-team').value = teamId;
  }
  loadData();
}

function setHeroMode(mode) {
  if (mode !== 'solo' && mode !== 'matchup') return;
  state.heroMode = mode;
  document.querySelectorAll('[data-hero-mode]:not(:disabled)').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.heroMode === mode);
  });
  loadData();
}

function setRange(preset) {
  state.range = createRange({ preset, mode: state.heroMode === 'solo' ? 'franchise' : 'matchup', metric: state.heroMode === 'solo' ? 'winPct' : 'index' });
  document.querySelectorAll('[data-range]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.range === preset);
  });
  loadData();
}

/* ------------------------------------------------------------- binds */

function bindControls() {
  document.querySelectorAll('[data-hero-mode]:not(:disabled)').forEach((btn) => {
    btn.addEventListener('click', () => setHeroMode(btn.dataset.heroMode));
  });

  document.querySelectorAll('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => setRange(btn.dataset.range));
  });

  $('#solo-team').addEventListener('change', (e) => {
    state.selectedTeamId = e.target.value;
    loadData();
  });

  $('#matchup-team-a').addEventListener('change', (e) => {
    state.teamA = e.target.value;
    loadData();
  });

  $('#matchup-team-b').addEventListener('change', (e) => {
    state.teamB = e.target.value;
    loadData();
  });

  const canvas = $('#hero-chart');
  const tooltip = $('#hero-tooltip');
  const wrap = canvas?.closest('.sd-chart-wrap');
  let hoverRaf = null;

  canvas?.addEventListener('mousemove', (e) => {
    if (!state.heroHitAreas.length || !wrap) {
      tooltip.hidden = true;
      if (state.hoverHit) {
        state.hoverHit = null;
        renderHeroChart();
      }
      canvas.style.cursor = 'default';
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const hit = findHit(state.heroHitAreas, e.clientX - rect.left, e.clientY - rect.top);
    if (!hit) {
      tooltip.hidden = true;
      canvas.style.cursor = 'default';
      if (state.hoverHit) {
        state.hoverHit = null;
        cancelAnimationFrame(hoverRaf);
        hoverRaf = requestAnimationFrame(() => renderHeroChart());
      }
      return;
    }
    canvas.style.cursor = 'crosshair';
    tooltip.innerHTML = formatTooltipHtml(hit);
    tooltip.hidden = false;
    const wrapRect = wrap.getBoundingClientRect();
    const tipW = tooltip.offsetWidth;
    const tipH = tooltip.offsetHeight;
    let left = e.clientX - wrapRect.left + 14;
    let top = e.clientY - wrapRect.top - tipH - 10;
    if (left + tipW > wrapRect.width - 8) left = e.clientX - wrapRect.left - tipW - 14;
    if (top < 8) top = e.clientY - wrapRect.top + 14;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;

    const changed = state.hoverHit?.point !== hit.point || state.hoverHit?.teamId !== hit.teamId;
    if (changed) {
      state.hoverHit = { point: hit.point, teamId: hit.teamId };
      cancelAnimationFrame(hoverRaf);
      hoverRaf = requestAnimationFrame(() => renderHeroChart());
    }
  });
  canvas?.addEventListener('mouseleave', () => {
    tooltip.hidden = true;
    canvas.style.cursor = 'default';
    if (state.hoverHit) {
      state.hoverHit = null;
      renderHeroChart();
    }
  });
}

/* --------------------------------------------------------------- init */

async function init() {
  state.errors = [];
  setLoading(true);
  try {
    const payload = await fetchJson('/api/teams?league=NBA');
    if (payload.error) throw new Error(payload.error);
    state.teams = payload.teams || [];
    state.meta = payload;
  } catch (err) {
    state.errors = [`Teams: ${err.message}`];
    state.teams = [];
  }

  populateTeamSelects();
  bindControls();
  await loadData();
}

window.addEventListener('resize', () => {
  renderHeroChart();
});

init();
