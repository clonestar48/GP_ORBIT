/**
 * Performance Market — sports performance dashboard.
 * Charts reflect real historical game results only.
 */

import {
  drawMatchupChart,
  drawPerformanceChart,
  findContextHit,
  findHit,
  formatContextTooltipHtml,
  formatTooltipHtml,
  setupCanvas,
} from './performanceChart.js';
import { createRange, rangeLabel, rangeToQuery } from './range.js';
import { ghostOpponentEnabled as isGhostOpponentRange, resolveProfile } from './resolution.js';
import { TeamPicker } from './teamPicker.js';

const $ = (sel) => document.querySelector(sel);

const teamPickers = {};

const GAME_LOG_VISIBLE = 4;
const GAME_LOG_MAX = 10;

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
  contextOpponentId: null,
  contextSeries: null,
  matchup: null,
  heroHitAreas: [],
  hoverHit: null,
  ghostHover: false,
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
  const wrap = $('#hero-chart-wrap');
  const netSummary = $('#hero-net-summary');

  if (loading) {
    chartSkeleton.hidden = false;
    wrap?.classList.add('is-loading');
    if (netSummary) {
      netSummary.textContent = '';
      netSummary.classList.remove('is-loaded');
    }
  } else {
    chartSkeleton.hidden = true;
    wrap?.classList.remove('is-loading');
  }
}

function ghostOpponentEnabled() {
  return isGhostOpponentRange(state.range.preset, state.heroMode === 'solo');
}

/** Pick a single opponent for the ghost layer — today or week only. */
function resolveContextOpponent(games) {
  if (!games?.length) return null;

  if (state.range.preset === 'today') {
    const sorted = [...games].sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0]?.opponent ?? null;
  }

  const counts = {};
  for (const g of games) {
    if (!g.opponent) continue;
    counts[g.opponent] = (counts[g.opponent] || 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  if (ranked.length === 1) return ranked[0][0];
  const [top, second] = ranked;
  if (top[1] > second[1]) return top[0];
  return null;
}

function seriesWithTeamColor(series, teamId) {
  const team = findTeam(teamId);
  return {
    ...series,
    teamId,
    teamName: team ? `${team.city} ${team.name}` : teamId,
    color: series?.color || team?.colors?.primary || '#5da396',
  };
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
  const banner = $('#status-banner');
  if (state.errors.length) {
    banner.hidden = false;
    banner.classList.remove('is-notice');
    banner.textContent = state.errors.join(' ');
  } else {
    banner.hidden = true;
    banner.classList.remove('is-notice');
  }
}

/* ------------------------------------------------------------- teams */

function teamCardHtml(team) {
  const color = team.colors?.primary || '#5da396';
  const selected = team.id === state.selectedTeamId;
  return `
    <button type="button" class="sd-team-chip${selected ? ' is-selected' : ''}"
      data-team-id="${team.id}" data-league="${team.league || 'NBA'}"
      style="--team-color: ${color}"
      title="${team.city} ${team.name}"
      aria-pressed="${selected ? 'true' : 'false'}"
      aria-label="${team.city} ${team.name}">
      <span class="sd-team-chip__swatch" aria-hidden="true"></span>
      <span class="sd-team-chip__abbr">${team.abbreviation}</span>
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
  el.querySelectorAll('.sd-team-chip').forEach((btn) => {
    btn.addEventListener('click', () => selectTeam(btn.dataset.teamId));
  });
  el.querySelector('.sd-team-chip.is-selected')
    ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  requestAnimationFrame(updateTeamExplorerScroll);
}

function initTeamPickers() {
  teamPickers.matchupA = new TeamPicker('#matchup-team-a', {
    label: 'Team A',
    teams: state.teams,
    value: state.teamA,
    onChange: (id) => {
      state.teamA = id;
      loadData();
    },
  });
  teamPickers.matchupB = new TeamPicker('#matchup-team-b', {
    label: 'Team B',
    teams: state.teams,
    value: state.teamB,
    onChange: (id) => {
      state.teamB = id;
      loadData();
    },
  });
}

function syncTeamPickers() {
  if (!teamPickers.matchupA) return;
  teamPickers.matchupA.setTeams(state.teams);
  teamPickers.matchupB.setTeams(state.teams);
  teamPickers.matchupA.setValue(state.teamA, { silent: true });
  teamPickers.matchupB.setValue(state.teamB, { silent: true });
}

function updateTeamExplorerScroll() {
  const list = $('#team-list');
  const wrap = list?.closest('.sd-team-explorer__scroll-wrap');
  if (!list || !wrap) return;

  const maxScroll = Math.max(0, list.scrollWidth - list.clientWidth);
  const overflowing = maxScroll > 4;
  wrap.classList.toggle('is-overflowing', overflowing);
  wrap.classList.toggle('is-at-start', !overflowing || list.scrollLeft <= 4);
  wrap.classList.toggle('is-at-end', !overflowing || list.scrollLeft >= maxScroll - 4);
}

function bindTeamExplorerScroll() {
  const list = $('#team-list');
  const wrap = list?.closest('.sd-team-explorer__scroll-wrap');
  if (!list || !wrap || list.dataset.scrollBound === '1') return;
  list.dataset.scrollBound = '1';

  list.addEventListener('scroll', updateTeamExplorerScroll, { passive: true });
  window.addEventListener('resize', updateTeamExplorerScroll);

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => updateTeamExplorerScroll());
    observer.observe(list);
  }

  list.addEventListener('wheel', (event) => {
    if (list.scrollWidth <= list.clientWidth) return;
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    event.preventDefault();
    list.scrollLeft += event.deltaY;
  }, { passive: false });

  requestAnimationFrame(updateTeamExplorerScroll);
}

function teamDisplayName(id) {
  const team = findTeam(id);
  return team ? `${team.city} ${team.name}` : id ?? '—';
}

function teamAbbrev(id) {
  const team = findTeam(id);
  return team?.abbreviation ?? id ?? '—';
}

function teamMatchupTitle(teamAId, teamBId) {
  return `${teamAbbrev(teamAId)} vs ${teamAbbrev(teamBId)}`;
}

function renderHeroContext() {
  const isSolo = state.heroMode === 'solo';
  const isMatchup = state.heroMode === 'matchup';

  $('#team-explorer').hidden = !isSolo;
  $('#solo-stats').hidden = !isSolo;
  $('#matchup-row').hidden = !isMatchup;

  if (isSolo) requestAnimationFrame(updateTeamExplorerScroll);

  if (isSolo) {
    const title = $('#hero-title');
    title.textContent = teamDisplayName(state.selectedTeamId);
    title.removeAttribute('title');
  } else if (isMatchup) {
    const title = $('#hero-title');
    title.textContent = teamMatchupTitle(state.teamA, state.teamB);
    title.title = `${teamDisplayName(state.teamA)} vs ${teamDisplayName(state.teamB)}`;
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

function gamePointsEnriched() {
  const raw = (state.teamSeries?.points || [])
    .filter((p) => p.gameId && !p.flatline)
    .sort((a, b) => a.date.localeCompare(b.date));
  return raw.map((p, i) => {
    const prevVal = p.previousValue ?? (i > 0 ? raw[i - 1].value : p.value);
    const move = p.movementAmount ?? Number((p.value - prevVal).toFixed(2));
    return { ...p, previousValue: prevVal, movementAmount: move };
  });
}

function gamePointLookup() {
  const byId = new Map();
  const byDate = new Map();
  for (const p of gamePointsEnriched()) {
    byId.set(p.gameId, p);
    byDate.set(p.date, p);
  }
  return { byId, byDate };
}

function formatMovePct(amount) {
  if (amount == null || Number.isNaN(Number(amount)) || amount === 0) return null;
  return `${amount > 0 ? '+' : ''}${Number(amount).toFixed(1)}%`;
}

function significantPoint(gamePoints) {
  if (!gamePoints.length) return null;
  return [...gamePoints].sort((a, b) =>
    Math.abs(b.movementAmount ?? 0) - Math.abs(a.movementAmount ?? 0))[0];
}

function netMetricChange(gamePoints, metric) {
  if (gamePoints.length < 1) return null;
  const first = gamePoints[0].previousValue ?? gamePoints[0].value;
  const last = gamePoints[gamePoints.length - 1].value;
  if (first == null || last == null) return null;
  const delta = Number((last - first).toFixed(metric === 'winPct' ? 1 : 2));
  return { start: first, end: last, delta };
}

function aggregateOpponents(games, limit = 5) {
  const map = new Map();
  for (const g of games) {
    if (!g.opponent) continue;
    let entry = map.get(g.opponent);
    if (!entry) {
      entry = { id: g.opponent, wins: 0, losses: 0, lastDate: g.date };
      map.set(g.opponent, entry);
    }
    if (g.result === 'W') entry.wins += 1;
    else entry.losses += 1;
    if (g.date > entry.lastDate) entry.lastDate = g.date;
  }
  return [...map.values()]
    .sort((a, b) => {
      const diff = (b.wins + b.losses) - (a.wins + a.losses);
      return diff !== 0 ? diff : b.lastDate.localeCompare(a.lastDate);
    })
    .slice(0, limit);
}

function buildSoloNetLine() {
  const label = rangeLabel(state.range);
  const series = state.teamSeries;

  if (series?.error) {
    return `<span class="sd-hero__net-line--muted">Summary unavailable — ${series.error}</span>`;
  }

  const gamePoints = (series?.points || []).filter((p) => p.gameId && !p.flatline);
  if (!gamePoints.length) {
    const isToday = state.range.preset === 'today';
    return `<span class="sd-hero__net-line--muted">${isToday
      ? 'No games scheduled today — performance holds at the current level.'
      : 'No games in this range — the chart shows a flat performance line.'}</span>`;
  }

  const net = netMetricChange(gamePoints, 'winPct');
  const sig = significantPoint(gamePoints);
  const parts = [];

  if (net?.delta != null && net.delta !== 0) {
    const cls = movementClass(net.delta);
    parts.push(`Net <em class="${cls}">${net.delta > 0 ? '+' : ''}${net.delta}%</em>`);
  } else {
    parts.push('Net unchanged');
  }

  if (sig && Math.abs(sig.movementAmount ?? 0) > 0) {
    const opp = sig.opponentId ?? '—';
    const move = formatMovePct(sig.movementAmount);
    const cls = movementClass(sig.movementAmount ?? 0);
    parts.push(`Largest swing vs ${opp} <em class="${cls}">${move}</em>`);
  }

  if (!parts.length) {
    return `<span class="sd-hero__net-line--muted">${label} · No net movement in this range.</span>`;
  }

  return parts.join(' · ');
}

function buildMatchupNetLine() {
  const teamA = findTeam(state.teamA);
  const teamB = findTeam(state.teamB);
  const label = rangeLabel(state.range);
  const matchup = state.matchup;

  if (matchup?.error) {
    return `<span class="sd-hero__net-line--muted">Matchup summary unavailable — ${matchup.error}</span>`;
  }

  if (!matchup?.series?.length) {
    return '<span class="sd-hero__net-line--muted">Select two teams and a range with overlapping games.</span>';
  }

  const allGamePoints = matchup.series.flatMap((s) =>
    (s.points || []).filter((p) => p.gameId && !p.flatline),
  );

  if (!allGamePoints.length) {
    return `<span class="sd-hero__net-line--muted">${teamA?.abbreviation ?? state.teamA} vs ${teamB?.abbreviation ?? state.teamB} · No games in this range.</span>`;
  }

  const parts = [];
  for (const s of matchup.series) {
    const pts = (s.points || []).filter((p) => p.gameId && !p.flatline);
    const net = netMetricChange(pts, 'index');
    const abbr = findTeam(s.teamId)?.abbreviation ?? s.teamId;
    if (net?.delta != null && net.delta !== 0) {
      const cls = movementClass(net.delta);
      parts.push(`${abbr} index <em class="${cls}">${net.delta > 0 ? '+' : ''}${net.delta}</em>`);
    } else {
      parts.push(`${abbr} index unchanged`);
    }
  }

  return parts.join(' · ');
}

function renderMarketSummary() {
  const el = $('#hero-net-summary');
  if (!el) return;

  if (state.loading) {
    el.textContent = '';
    el.classList.remove('is-loaded');
    return;
  }

  el.innerHTML = state.heroMode === 'matchup'
    ? buildMatchupNetLine()
    : buildSoloNetLine();

  requestAnimationFrame(() => el.classList.add('is-loaded'));
}

function heroEmptyState({ title, detail }) {
  const empty = $('#hero-chart-empty');
  empty.innerHTML = emptyStateHtml({ title, detail });
  empty.style.display = 'flex';
}

function renderHeroLegend() {
  const legend = $('#hero-legend');
  if (!legend) return;

  if (state.heroMode === 'matchup' && state.matchup?.series?.length) {
    legend.innerHTML = state.matchup.series.map((s) => `
    <span class="sd-legend-item">
      <span class="sd-legend-swatch" style="background:${s.color}"></span>
      <span>${s.teamName}</span>
      <span class="sd-legend-meta">Index · ${s.gameCount} game${s.gameCount === 1 ? '' : 's'}</span>
    </span>`).join('');
    return;
  }

  legend.innerHTML = '';
}

function renderHeroChart() {
  const canvas = $('#hero-chart');
  const empty = $('#hero-chart-empty');
  const caption = $('#hero-chart-caption');
  const tooltip = $('#hero-tooltip');
  const { ctx, w, h } = setupCanvas(canvas);
  const chartWrap = canvas.closest('.sd-chart-wrap');

  if (!state.hoverHit) tooltip.hidden = true;
  state.heroHitAreas = [];
  chartWrap?.classList.remove('has-ghost-opponent');
  renderHeroContext();
  renderHeroLegend();
  renderMarketSummary();

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
    const colored = seriesWithTeamColor(series, state.selectedTeamId);
    const contextColored = state.contextSeries && state.contextOpponentId
      ? seriesWithTeamColor(state.contextSeries, state.contextOpponentId)
      : null;
    const wrap = chartWrap;
    wrap?.classList.toggle('has-ghost-opponent', !!contextColored);
    const primaryHover = state.hoverHit?.layer === 'context' ? null : state.hoverHit;
    const chartProfile = resolveProfile(state.range.preset);
    const result = drawPerformanceChart(ctx, w, h, colored, primaryHover, {
      contextSeries: contextColored,
      ghostHover: state.ghostHover,
      rangePreset: chartProfile.preset,
      profile: chartProfile,
    });
    state.heroHitAreas = (result.hitAreas || []).map((hit) => ({
      ...hit,
      metric: hit.metric || 'winPct',
    }));
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
  const gameCount = Math.max(0, ...matchup.series.map((s) => s.gameCount ?? 0));
  const hasGames = matchup.series.some((s) =>
    (s.points || []).some((p) => p.gameId && !p.flatline));
  caption.textContent = hasGames
    ? `${rangeLabel(state.range)} · Performance index · ${gameCount} game${gameCount === 1 ? '' : 's'}`
    : 'No games in this range for either team';
  const chartProfile = resolveProfile(state.range.preset);
  const result = drawMatchupChart(ctx, w, h, matchup, state.hoverHit, {
    rangePreset: chartProfile.preset,
    profile: chartProfile,
  });
  state.heroHitAreas = (result.hitAreas || []).map((hit) => ({ ...hit, metric: 'index' }));
}

function formatResultDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ledgerOpponents(games, recentGames, limit = 5) {
  const recentIds = new Set(recentGames.map((g) => g.opponent));
  return aggregateOpponents(games, 12).filter((row) => {
    const gp = row.wins + row.losses;
    if (gp > 1) return true;
    return !recentIds.has(row.id);
  }).slice(0, limit);
}

function opponentSwatchHtml(opponentId) {
  const team = findTeam(opponentId);
  const color = team?.colors?.primary || '#5da396';
  return `<span class="sd-log-swatch" style="--team-color: ${color}" aria-hidden="true"></span>`;
}

function opponentChipHtml(row, { isContext = false } = {}) {
  const team = findTeam(row.id);
  const fullName = team ? `${team.city} ${team.name}` : row.id;
  const label = team?.abbreviation ?? row.id;
  const color = team?.colors?.primary || '#5da396';
  const gp = row.wins + row.losses;
  const recordCls = row.wins > row.losses ? 'is-up' : row.wins < row.losses ? 'is-down' : '';
  const tip = `${fullName} · ${row.wins}–${row.losses} (${gp} gp) · last ${formatResultDate(row.lastDate)}`;
  const safeTip = tip.replace(/"/g, '&quot;');
  return `
    <div class="sd-opp-chip${isContext ? ' sd-opp-chip--context' : ''}" style="--team-color: ${color}" title="${safeTip}">
      <span class="sd-log-swatch" style="--team-color: ${color}" aria-hidden="true"></span>
      <span class="sd-opp-chip__abbr">${label}</span>
      <span class="sd-opp-chip__record ${recordCls}">${row.wins}–${row.losses}</span>
      ${isContext ? '<span class="sd-opp-chip__tag">Chart</span>' : ''}
    </div>`;
}

const GAME_LOG_LEDGER_NOTE = 'Single-game opponents appear above.';

function renderGameLogLedger({ games, recent, isSolo }) {
  const oppEl = $('#key-opponents');
  const ledgerEl = $('#game-log-ledger');
  if (!oppEl || !ledgerEl) return;

  if (!isSolo) {
    oppEl.innerHTML = `<p class="sd-game-log__note">${GAME_LOG_LEDGER_NOTE}</p>`;
    return;
  }

  const ledger = ledgerOpponents(games, recent);
  if (!ledger.length) {
    oppEl.innerHTML = `<p class="sd-game-log__note">${GAME_LOG_LEDGER_NOTE}</p>`;
    return;
  }

  oppEl.innerHTML = ledger.map((row) => {
    const isContext = ghostOpponentEnabled() && state.contextOpponentId === row.id;
    return opponentChipHtml(row, { isContext });
  }).join('');
}

function renderGameLog() {
  const recentEl = $('#recent-results');
  const isSolo = state.heroMode === 'solo';

  const games = [...state.teamGames].sort((a, b) => b.date.localeCompare(a.date));
  const recent = games.slice(0, GAME_LOG_MAX);

  if (!recent.length) {
    const isToday = state.range.preset === 'today';
    recentEl.innerHTML = emptyStateHtml({
      title: isToday ? 'No games today' : 'No results in this range',
      detail: isToday
        ? 'Check back when the schedule has final scores.'
        : 'Widen the timeline or pick another team.',
    });
    renderGameLogLedger({ games, recent, isSolo });
    return;
  }

  const { byId, byDate } = gamePointLookup();
  const gamePoints = [...byId.values()];
  const sigPoint = significantPoint(gamePoints);

  recentEl.innerHTML = recent.map((g) => {
    const pt = byId.get(g.id) || byDate.get(g.date);
    const cls = g.result === 'W' ? 'is-up' : 'is-down';
    const move = pt?.movementAmount;
    const moveText = formatMovePct(move);
    const moveCls = movementClass(move ?? 0);
    const isSwing = sigPoint && pt && sigPoint.gameId === pt.gameId
      && Math.abs(move ?? 0) > 0;
    const score = g.teamScore != null ? `${g.teamScore} – ${g.opponentScore}` : `${pt?.pointsFor ?? '—'} – ${pt?.pointsAgainst ?? '—'}`;
    const opp = findTeam(g.opponent);
    const oppShort = opp ? `${opp.city} ${opp.name}` : g.opponent;

    return `
      <div class="sd-log-row sd-log-row--game${isSwing ? ' sd-log-row--swing' : ''}">
        ${opponentSwatchHtml(g.opponent)}
        <span class="sd-log-row__badge ${cls}">${g.result === 'W' ? 'W' : 'L'}</span>
        <div class="sd-log-row__main">
          <span class="sd-log-row__title">${oppShort}</span>
          <span class="sd-log-row__sub ${cls}">${score}</span>
          ${isSwing ? '<span class="sd-log-row__tag">Largest swing</span>' : ''}
        </div>
        <div class="sd-log-row__stat">
          <span class="sd-log-row__value ${moveText ? moveCls : 'is-flat'}">${moveText ?? '—'}</span>
          <span class="sd-log-row__stat-label">move</span>
        </div>
        <time class="sd-log-row__date" datetime="${g.date}">${formatResultDate(g.date)}</time>
      </div>`;
  }).join('');

  renderGameLogLedger({ games, recent, isSolo });
}

function renderPanels() {
  renderGameLog();
  renderTeamList();
}

async function loadContextOpponent() {
  state.contextOpponentId = null;
  state.contextSeries = null;
  if (!ghostOpponentEnabled()) return;

  const oppId = resolveContextOpponent(state.teamGames);
  if (!oppId || oppId === state.selectedTeamId) return;

  try {
    const payload = await fetchJson(performanceUrl(oppId, soloRange()));
    if (payload.error && !payload.series) return;
    if (payload.series?.points?.length) {
      state.contextOpponentId = oppId;
      state.contextSeries = payload.series;
    }
  } catch {
    state.contextOpponentId = null;
    state.contextSeries = null;
  }
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
  state.ghostHover = false;
  setLoading(true);
  try {
    await loadPanelData();
    if (state.heroMode === 'solo') {
      await loadContextOpponent();
      state.matchup = null;
    } else if (state.heroMode === 'matchup') {
      state.contextOpponentId = null;
      state.contextSeries = null;
      await loadMatchupHero();
    } else {
      state.matchup = null;
      state.contextOpponentId = null;
      state.contextSeries = null;
    }
  } finally {
    setLoading(false);
    renderHeroChart();
    renderPanels();
    renderHeader();
  }
}

function selectTeam(teamId) {
  state.selectedTeamId = teamId;
  loadData();
}

function flipToContextOpponent() {
  const nextId = state.contextOpponentId;
  if (!nextId || state.heroMode !== 'solo') return;
  state.selectedTeamId = nextId;
  loadData();
}

function setHeroMode(mode) {
  if (mode !== 'solo' && mode !== 'matchup') return;
  state.heroMode = mode;
  document.querySelectorAll('[data-hero-mode]:not(:disabled)').forEach((btn) => {
    const active = btn.dataset.heroMode === mode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  loadData();
}

function setRange(preset) {
  state.range = createRange({ preset, mode: state.heroMode === 'solo' ? 'franchise' : 'matchup', metric: state.heroMode === 'solo' ? 'winPct' : 'index' });
  document.querySelectorAll('[data-range]').forEach((btn) => {
    const active = btn.dataset.range === preset;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
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

  const canvas = $('#hero-chart');
  const tooltip = $('#hero-tooltip');
  const wrap = canvas?.closest('.sd-chart-wrap');
  let hoverRaf = null;

  function chartPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  }

  function positionTooltip(e) {
    const wrapRect = wrap.getBoundingClientRect();
    const tipW = tooltip.offsetWidth;
    const tipH = tooltip.offsetHeight;
    let left = e.clientX - wrapRect.left + 14;
    let top = e.clientY - wrapRect.top - tipH - 10;
    if (left + tipW > wrapRect.width - 8) left = e.clientX - wrapRect.left - tipW - 14;
    if (left < 8) left = 8;
    if (top < 8) top = e.clientY - wrapRect.top + 14;
    if (top + tipH > wrapRect.height - 8) top = wrapRect.height - tipH - 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function clearChartHover() {
    tooltip.hidden = true;
    canvas.style.cursor = 'default';
    const needsRedraw = state.hoverHit || state.ghostHover;
    state.hoverHit = null;
    state.ghostHover = false;
    if (needsRedraw) {
      cancelAnimationFrame(hoverRaf);
      hoverRaf = requestAnimationFrame(() => renderHeroChart());
    }
  }

  function updateChartHover(e) {
    if (!wrap) return;

    const { mx, my } = chartPoint(e);
    const hit = state.heroHitAreas.length ? findHit(state.heroHitAreas, mx, my) : null;
    const contextHit = !hit && state.contextOpponentId
      ? findContextHit(state.heroHitAreas, mx, my)
      : null;

    if (!hit && !contextHit) {
      clearChartHover();
      return;
    }

    if (hit) {
      canvas.style.cursor = 'crosshair';
      tooltip.innerHTML = formatTooltipHtml(hit);
      tooltip.hidden = false;
      positionTooltip(e);
      const changed = state.hoverHit?.point !== hit.point
        || state.hoverHit?.teamId !== hit.teamId
        || state.ghostHover;
      state.hoverHit = { point: hit.point, teamId: hit.teamId, layer: 'primary' };
      state.ghostHover = false;
      if (changed) {
        cancelAnimationFrame(hoverRaf);
        hoverRaf = requestAnimationFrame(() => renderHeroChart());
      }
      return;
    }

    canvas.style.cursor = 'pointer';
    tooltip.innerHTML = formatContextTooltipHtml(contextHit.teamName);
    tooltip.hidden = false;
    positionTooltip(e);
    if (!state.ghostHover) {
      state.ghostHover = true;
      state.hoverHit = null;
      cancelAnimationFrame(hoverRaf);
      hoverRaf = requestAnimationFrame(() => renderHeroChart());
    }
  }

  canvas?.addEventListener('pointermove', updateChartHover);
  canvas?.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    canvas.setPointerCapture(e.pointerId);
    updateChartHover(e);
  });
  canvas?.addEventListener('pointerup', (e) => {
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (e.pointerType !== 'mouse') clearChartHover();
  });
  canvas?.addEventListener('pointerleave', clearChartHover);
  canvas?.addEventListener('pointercancel', clearChartHover);

  canvas?.addEventListener('click', (e) => {
    if (state.heroMode !== 'solo' || !state.contextOpponentId) return;
    const { mx, my } = chartPoint(e);
    if (findHit(state.heroHitAreas, mx, my)) return;
    if (findContextHit(state.heroHitAreas, mx, my)) flipToContextOpponent();
  });

  document.querySelectorAll('[data-hero-mode]:not(:disabled)').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.classList.contains('is-active') ? 'true' : 'false');
  });
  document.querySelectorAll('[data-range]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.classList.contains('is-active') ? 'true' : 'false');
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

  initTeamPickers();
  syncTeamPickers();
  bindTeamExplorerScroll();
  bindControls();
  await loadData();
}

window.addEventListener('resize', () => {
  renderHeroChart();
});

init();
