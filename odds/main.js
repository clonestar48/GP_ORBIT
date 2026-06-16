/**
 * Performance Market — sports performance dashboard.
 * Charts reflect real historical game results only.
 */

import {
  drawMatchupChart,
  drawPerformanceChart,
  findContextHit,
  findHit,
  findNearestChartHover,
  formatChartTooltipHtml,
  formatContextTooltipHtml,
  setupCanvas,
} from './performanceChart.js';
import {
  createRange,
  createRangeForGameDate,
  jumpPresetForLastPlayed,
  MATCHUP_DEFAULT_PRESET,
  MATCHUP_RANGE_PRESETS,
  FRANCHISE_RANGE_PRESETS,
  FRANCHISE_RANGE_CONTROLS,
  MATCHUP_RANGE_CONTROLS,
  normalizeMatchupPreset,
  presetContainsDate,
  rangeLabel,
  rangeToQuery,
  setReferenceDate,
  STAT_SCOPE_LABELS,
} from './range.js';
import { ghostModeForPreset, resolveProfile } from './resolution.js';
import { TeamPicker } from './teamPicker.js';
import {
  applyArchiveLogPayload,
  applyChartPayload,
  applyRangeStatsPayload,
  gameLogRowsFromSet,
} from './gameSet.js';
import { applyContextSubtitle, getContextSubtitle } from './contextSubtitle.js';
import {
  ensurePlayoffBracketLoaded,
  hidePlayoffBracket,
  renderPlayoffBracket,
  scheduleBracketLineRedraw,
} from './playoffBracket.js';
import {
  conferenceStandingsSnapshot,
  ensureSeasonStandingsLoaded,
  getTeamStandingsRow,
  nbaSeasonEndingYear,
} from './standings.js';

const $ = (sel) => document.querySelector(sel);

const teamPickers = {};

const GAME_LOG_VISIBLE = 5;
const TEAM_EXPLORER_VISIBLE = 8;

const HOME_DEFAULT_RANGE = 'season';
const MATCHUP_DEFAULT_RANGE = MATCHUP_DEFAULT_PRESET;

const state = {
  teams: [],
  meta: null,
  orbitOverview: true,
  homePayload: null,
  heroMode: 'solo',
  selectedTeamId: null,
  teamA: 'BOS',
  teamB: 'NYK',
  range: createRange({ preset: HOME_DEFAULT_RANGE, mode: 'franchise', metric: 'winPct' }),
  teamSeries: null,
  chartSet: null,
  archiveLog: null,
  gameSet: null,
  teamGames: [],
  lastPlayedGame: null,
  contextLayers: [],
  contextHoverId: null,
  opponentMarkerIds: null,
  opponentMarkerColors: null,
  matchup: null,
  matchupGames: [],
  homepageFeature: null,
  featuredMarquee: null,
  teamContext: null,
  chartFallback: null,
  focusedGameLogKey: null,
  logFocusOpponent: null,
  logFocusDate: null,
  heroHitAreas: [],
  heroChartPlot: null,
  hoverHit: null,
  lastTooltipAnchorKey: null,
  ghostHover: false,
  rangeStats: null,
  seasonStandings: null,
  playoffBracket: null,
  loading: false,
  panelLoading: false,
  overviewLoading: false,
  workspaceReady: false,
  errors: [],
};

let overviewLoadGen = 0;

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
  const needle = String(id || '').toUpperCase();
  if (!needle) return undefined;
  return state.teams.find((t) => t.id === id || t.id.toUpperCase() === needle);
}

let loadGeneration = 0;

function clearLogFocus() {
  state.focusedGameLogKey = null;
  state.logFocusOpponent = null;
  state.logFocusDate = null;
}

function normalizePresetForMode(preset, mode) {
  const key = preset || HOME_DEFAULT_RANGE;
  if (mode === 'matchup') {
    if (key === 'today' || key === 'week' || key === 'month') return MATCHUP_DEFAULT_PRESET;
    const normalized = normalizeMatchupPreset(key);
    return MATCHUP_RANGE_PRESETS.includes(normalized) ? normalized : MATCHUP_DEFAULT_PRESET;
  }
  if (FRANCHISE_RANGE_PRESETS.includes(key)) return key;
  if (key === 'matchup' || key === 'series') return HOME_DEFAULT_RANGE;
  return HOME_DEFAULT_RANGE;
}

function rangeControlsForMode() {
  if (state.orbitOverview || state.heroMode !== 'matchup') {
    return FRANCHISE_RANGE_CONTROLS;
  }
  return MATCHUP_RANGE_CONTROLS;
}

function matchupRangePreset(preset = state.range?.preset) {
  return normalizeMatchupPreset(preset);
}

function statScopeLabel(preset = state.range?.preset) {
  return STAT_SCOPE_LABELS[preset] ?? rangeLabel(state.range) ?? preset ?? '';
}

function rangeControlSet() {
  if (state.orbitOverview) return 'franchise';
  return state.heroMode === 'matchup' ? 'matchup' : 'franchise';
}

function ensureActiveRange(mode = state.heroMode) {
  const preset = normalizePresetForMode(state.range?.preset, mode === 'matchup' ? 'matchup' : 'solo');
  state.range = createRange({
    preset,
    mode: mode === 'matchup' ? 'matchup' : 'franchise',
    metric: mode === 'matchup' ? 'index' : 'winPct',
  });
  syncRangeUi();
}

function clearPanelGameData() {
  state.chartSet = null;
  state.archiveLog = null;
  state.gameSet = null;
  state.teamSeries = null;
  state.teamGames = [];
  state.rangeStats = null;
  state.matchup = null;
  state.matchupGames = [];
  state.chartFallback = null;
  state.contextLayers = [];
  state.contextHoverId = null;
  state.opponentMarkerIds = null;
  state.opponentMarkerColors = null;
  state.lastPlayedGame = null;
  state.heroChartPlot = null;
}

function clearTeamScopedState() {
  clearPanelGameData();
  state.teamContext = null;
  clearLogFocus();
}

function chartProfileForRange(range = state.range) {
  if (state.heroMode === 'matchup') {
    const preset = matchupRangePreset(range?.preset);
    if (preset === 'season') return resolveProfile('matchupSeason');
    if (preset === 'all') return resolveProfile('matchupAll');
  }
  if (state.heroMode === 'solo') {
    if (range?.preset === 'season') return resolveProfile('soloSeason');
    if (range?.preset === 'all') return resolveProfile('soloAll');
  }
  if (range?.preset) return resolveProfile(range.preset);
  return resolveProfile('week');
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

function setLoading(loading, { forceOverlay = false, refreshing = false } = {}) {
  state.loading = loading;
  const chartSkeleton = $('#hero-chart-skeleton');
  const wrap = $('#hero-chart-wrap');
  const netSummary = $('#hero-net-summary');
  const showOverlay = loading && (forceOverlay || !state.workspaceReady);

  if (loading) {
    wrap?.classList.add('is-loading');
    wrap?.classList.toggle('is-refreshing', refreshing && state.workspaceReady);
    if (showOverlay) {
      chartSkeleton.hidden = false;
      if (netSummary) {
        netSummary.textContent = '';
        netSummary.classList.remove('is-loaded');
      }
    }
    return;
  }

  chartSkeleton.hidden = true;
  wrap?.classList.remove('is-loading', 'is-refreshing');
  if (netSummary && !state.panelLoading) {
    netSummary.classList.remove('is-loaded');
  }
}

function markWorkspaceReady() {
  state.workspaceReady = true;
  $('#hero-chart-wrap')?.classList.add('is-workspace-ready');
  setLoading(false);
}

function resolveGhostMode() {
  if (state.heroMode !== 'solo') return 'none';
  if (state.logFocusOpponent) {
    if (state.range.preset === 'today') return 'full';
    if (state.range.preset === 'week') return 'segments';
    return 'none';
  }
  return ghostModeForPreset(state.range.preset, true);
}

function ghostOpponentEnabled() {
  return resolveGhostMode() !== 'none';
}

function ghostOverlayEnabled() {
  const mode = resolveGhostMode();
  return mode === 'full' || mode === 'segments';
}

/** Today's single opponent — full ghost franchise line. */
function resolveContextOpponentSingle(games) {
  if (!games?.length) return null;
  const sorted = [...games].sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0]?.opponent ?? null;
}

/** Week: all opponents in range (typically 3–5), ranked by recency. */
function resolveContextOpponents(games) {
  const mode = resolveGhostMode();
  const profile = resolveProfile(state.range.preset);
  const max = profile.maxGhostOpponents ?? 5;

  if (mode === 'full') {
    const single = state.logFocusOpponent || resolveContextOpponentSingle(games);
    return single ? [String(single).toUpperCase()] : [];
  }

  if (mode !== 'segments' && mode !== 'markers') return [];

  const byOpp = new Map();
  for (const g of games) {
    if (!g.opponent) continue;
    const id = String(g.opponent).toUpperCase();
    let entry = byOpp.get(id);
    if (!entry) entry = { id, count: 0, lastDate: g.date };
    entry.count += 1;
    if (g.date > entry.lastDate) entry.lastDate = g.date;
    byOpp.set(id, entry);
  }

  return [...byOpp.values()]
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.count - a.count)
    .slice(0, max)
    .map((row) => row.id);
}

function syncOpponentMarkers() {
  state.opponentMarkerIds = null;
  state.opponentMarkerColors = null;
  if (resolveGhostMode() !== 'markers') return;
  const ids = resolveContextOpponents(state.teamGames);
  if (!ids.length) return;
  state.opponentMarkerIds = new Set(ids);
  const colors = {};
  for (const id of ids) {
    colors[id] = findTeam(id)?.colors?.primary || '#5da396';
  }
  state.opponentMarkerColors = colors;
}

/** Ghost layer: opponent win % only on days the selected team played them — not a full franchise week. */
function buildContextSeries(teamGames, oppId, opponentSeries) {
  if (!opponentSeries?.points?.length) return null;

  const h2hDates = new Set(
    teamGames.filter((g) => g.opponent === oppId).map((g) => g.date.slice(0, 10)),
  );
  if (!h2hDates.size) return null;

  const points = opponentSeries.points.filter((p) => h2hDates.has(p.date.slice(0, 10)));
  if (!points.length) return null;

  return { ...opponentSeries, points };
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

function panelTeamId() {
  return state.heroMode === 'matchup' ? state.teamA : state.selectedTeamId;
}

function soloRange() {
  const base = {
    teams: [panelTeamId()],
    mode: 'franchise',
    metric: 'winPct',
  };
  if (state.range.preset) {
    return createRange({ preset: state.range.preset, ...base });
  }
  return createRange({
    startDate: state.range.startDate,
    endDate: state.range.endDate,
    ...base,
  });
}

function matchupRange() {
  const base = {
    teams: [state.teamA, state.teamB],
    mode: 'matchup',
    metric: 'index',
  };
  if (state.range.preset) {
    return createRange({ preset: state.range.preset, ...base });
  }
  return createRange({
    startDate: state.range.startDate,
    endDate: state.range.endDate,
    ...base,
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

function contextUrl(teamId) {
  return `/api/context?teamId=${encodeURIComponent(teamId)}&league=NBA`;
}

function contextualPanelHtml({ title, detail = '', action = '' }) {
  return `
    <div class="sd-empty-state sd-empty-state--context">
      <p class="sd-empty-state__title">${title}</p>
      ${detail ? `<p class="sd-empty-state__detail">${detail}</p>` : ''}
      ${action ? `<p class="sd-empty-state__action">${action}</p>` : ''}
    </div>`;
}

function heroContextualPanel({ title, detail, action = '' }) {
  const empty = $('#hero-chart-empty');
  empty.innerHTML = contextualPanelHtml({ title, detail, action });
  empty.style.display = 'flex';
}

function soloSeriesEmpty(series) {
  if (!series?.points?.length) return true;
  return !rangeHasGames(series) && !series.points.some((p) => p.gameId && !p.flatline);
}

function effectiveSoloSeries() {
  if (state.chartFallback?.series?.points?.length) return state.chartFallback.series;
  return state.teamSeries;
}

function homeOverviewRange() {
  return state.range?.preset || HOME_DEFAULT_RANGE;
}

function gamesInActiveRange(games, preset = state.range?.preset) {
  if (!Array.isArray(games) || !games.length) return [];
  const key = preset || HOME_DEFAULT_RANGE;
  return games.filter((g) => g?.date && presetContainsDate(key, g.date));
}

function rangeScopedRecord(games) {
  if (state.rangeStats) {
    return {
      winPct: state.rangeStats.winPct,
      record: state.rangeStats.record,
      games: state.rangeStats.games,
      scopeLabel: state.rangeStats.scopeLabel ?? statScopeLabel(),
    };
  }
  const scoped = gamesInActiveRange(games);
  return latestGameStats(scoped.length ? scoped : games);
}

function applyPanelPayload(payload, mode) {
  const chart = applyChartPayload(payload, mode);
  const archive = applyArchiveLogPayload(payload, mode);
  const rangeStats = applyRangeStatsPayload(payload);
  state.chartSet = chart.chartSet;
  state.gameSet = chart.chartSet;
  state.archiveLog = archive.archiveLog;
  state.teamGames = archive.games;
  state.rangeStats = rangeStats.rangeStats;
  if (mode === 'matchup') {
    state.matchupGames = archive.games;
    state.teamSeries = null;
  } else {
    state.matchupGames = [];
    state.teamSeries = chart.series ?? payload?.series ?? null;
  }
  return { chart, archive, rangeStats };
}

function getGameLogRows() {
  if (state.orbitOverview) {
    const archive = state.homePayload?.archiveLog ?? null;
    const fallbackGames = state.homePayload?.recentGames ?? [];
    const resolved = gameLogRowsFromSet(
      archive ?? (fallbackGames.length
        ? { games: fallbackGames, metric: 'winPct', mode: 'overview', count: fallbackGames.length }
        : null),
      { dedupeFn: dedupeGameLogEntries },
    );
    return { ...resolved, mode: 'overview' };
  }
  if (state.heroMode === 'league') {
    return { games: [], metric: 'winPct', mode: 'league' };
  }
  if (state.heroMode === 'matchup') {
    const archive = state.archiveLog
      ?? state.matchup?.archiveLog
      ?? (state.matchupGames?.length
        ? { games: state.matchupGames, metric: 'index', mode: 'matchup', count: state.matchupGames.length }
        : null);
    const resolved = gameLogRowsFromSet(archive, { dedupeFn: dedupeGameLogEntries });
    return { ...resolved, metric: resolved.metric || 'index', mode: 'matchup' };
  }
  if (!state.selectedTeamId) {
    return { games: [], metric: 'winPct', mode: 'solo' };
  }
  const archive = state.archiveLog
    ?? (state.teamGames?.length
      ? { games: state.teamGames, metric: 'winPct', mode: 'solo', count: state.teamGames.length }
      : null);
  const resolved = gameLogRowsFromSet(archive, { dedupeFn: dedupeGameLogEntries });
  return { ...resolved, metric: resolved.metric || 'winPct', mode: 'solo' };
}

function chartFallbackCaption() {
  const fb = state.chartFallback;
  if (!fb?.preset) return '';
  return rangeLabel(createRange({ preset: fb.preset, mode: 'franchise', metric: 'winPct' }));
}

function applyTeamContextHeadline() {
  const featuredEl = $('#hero-featured-headline');
  const ctx = state.teamContext;
  if (!featuredEl || state.heroMode !== 'solo') return;
  if (state.homepageFeature?.headline) return;
  if (!ctx?.headline) {
    featuredEl.hidden = true;
    featuredEl.innerHTML = '';
    return;
  }
  featuredEl.hidden = false;
  featuredEl.innerHTML = ctx.subheadline
    ? `<span class="sd-hero__featured-label">${ctx.headline}</span><span class="sd-hero__featured-sub">${ctx.subheadline}</span>`
    : `<span class="sd-hero__featured-label">${ctx.headline}</span>`;
}

async function ensureTeamContext(teamId, gen = null) {
  if (!teamId) return null;
  try {
    const payload = await fetchJson(contextUrl(teamId));
    if (gen != null && gen !== loadGeneration) return null;
    if (payload.context) state.teamContext = payload.context;
    if (payload.referenceDate) state.meta = { ...state.meta, referenceDate: payload.referenceDate };
    return payload;
  } catch {
    return null;
  }
}

async function loadSoloFallbacks(gen) {
  state.chartFallback = null;
  const teamId = state.selectedTeamId;
  if (!teamId) return;

  const seriesEmpty = soloSeriesEmpty(state.teamSeries);
  if (!seriesEmpty && state.teamContext) return;

  const payload = await ensureTeamContext(teamId, gen);
  if (gen !== loadGeneration || !payload) return;

  const ctx = payload.context;
  const suggested = payload.suggestedPreset || ctx?.suggestedPreset || 'season';

  if (seriesEmpty && payload.series?.points?.length) {
    state.chartFallback = {
      series: payload.series,
      preset: suggested,
      note: ctx?.headline,
    };
  }

  if (soloTodayIdle() && ctx?.lastGame && !state.lastPlayedGame) {
    state.lastPlayedGame = {
      ...ctx.lastGame,
      opponent: ctx.lastGame.opponent,
    };
  }
}

function standingsAbbrFor(teamId) {
  const team = findTeam(teamId);
  return team?.abbreviation ?? teamId;
}

function currentSeasonEndingYear() {
  return nbaSeasonEndingYear(state.meta?.referenceDate);
}

async function loadSeasonStandings() {
  try {
    state.seasonStandings = await ensureSeasonStandingsLoaded(
      currentSeasonEndingYear(),
      { abbrFor: standingsAbbrFor },
    );
  } catch (err) {
    console.error('Season standings load failed:', err);
    state.seasonStandings = null;
  }
  if (state.orbitOverview) {
    renderOverviewLedger();
  } else {
    renderGameLog();
  }
}

function postseasonRecordFromSeries(results) {
  if (!results?.length) return null;
  let wins = 0;
  let losses = 0;
  for (const row of results) {
    wins += Number(row.wins) || 0;
    losses += Number(row.losses) || 0;
  }
  if (!wins && !losses) return null;
  return `${wins}–${losses}`;
}

function teamPrimaryColor(teamId) {
  return findTeam(teamId)?.colors?.primary ?? '#5da396';
}

function matchupH2hBreakdown(matchup = state.matchup) {
  return matchup?.h2hBreakdown ?? matchup?.chartSet?.h2hBreakdown ?? null;
}

function matchupMiniChipHtml({
  prefix,
  value,
  leaderId = null,
  muted = false,
  valueTeam = null,
  valueAccent = null,
  accentKind = 'win',
}) {
  const safePrefix = String(prefix || '').replace(/"/g, '&quot;');
  const chipStyle = leaderId ? ` style="--team-color: ${teamPrimaryColor(leaderId)}"` : '';

  if (valueTeam != null && valueAccent != null) {
    const safeTeam = String(valueTeam).replace(/"/g, '&quot;');
    const safeAccent = String(valueAccent).replace(/"/g, '&quot;');
    const teamCls = leaderId
      ? 'sd-matchup-chip__value is-team-color'
      : 'sd-matchup-chip__value';
    const accentCls = accentKind === 'loss'
      ? 'sd-matchup-chip__accent is-loss'
      : 'sd-matchup-chip__accent is-win';
    return `<span class="sd-matchup-chip"${chipStyle}><span class="sd-matchup-chip__prefix">${safePrefix}</span><span class="${teamCls}">${safeTeam}</span><span class="${accentCls}">${safeAccent}</span></span>`;
  }

  if (valueAccent != null && value == null) {
    const safeAccent = String(valueAccent).replace(/"/g, '&quot;');
    const accentCls = accentKind === 'loss'
      ? 'sd-matchup-chip__accent is-loss'
      : 'sd-matchup-chip__accent is-win';
    return `<span class="sd-matchup-chip"><span class="sd-matchup-chip__prefix">${safePrefix}</span><span class="${accentCls}">${safeAccent}</span></span>`;
  }

  const safeValue = String(value ?? '—').replace(/"/g, '&quot;');
  const valueCls = leaderId
    ? 'sd-matchup-chip__value is-team-color'
    : (muted ? 'sd-matchup-chip__value is-muted' : 'sd-matchup-chip__value');
  return `<span class="sd-matchup-chip"${chipStyle}><span class="sd-matchup-chip__prefix">${safePrefix}</span><span class="${valueCls}">${safeValue}</span></span>`;
}

function buildSoloContextChips() {
  if (state.range?.preset !== 'season' || !state.selectedTeamId) return [];
  const row = getTeamStandingsRow(state.seasonStandings, state.selectedTeamId);
  if (!row) return [];

  const chips = [];
  const confLabel = row.conference === 'east' ? 'EAST' : 'WEST';
  chips.push({
    prefix: confLabel,
    value: `#${row.conferenceRank}`,
    leaderId: state.selectedTeamId,
  });
  chips.push({
    prefix: 'NBA',
    value: `#${row.leagueRank}`,
    leaderId: state.selectedTeamId,
  });
  chips.push({
    prefix: 'REG',
    value: `${row.regularSeasonWins}–${row.regularSeasonLosses}`,
    leaderId: state.selectedTeamId,
  });

  const postRecord = postseasonRecordFromSeries(state.rangeStats?.playoffSeriesResults);
  if (postRecord) {
    chips.push({
      prefix: 'POST',
      valueAccent: postRecord,
      accentKind: 'win',
      leaderId: state.selectedTeamId,
    });
  }

  return chips;
}

function buildMatchupRankingChips() {
  if (matchupRangePreset(state.range?.preset) !== 'season') return [];
  const standings = state.seasonStandings;
  if (!standings) return [];

  const teamA = findTeam(state.teamA);
  const teamB = findTeam(state.teamB);
  const abbrA = teamA?.abbreviation ?? state.teamA;
  const abbrB = teamB?.abbreviation ?? state.teamB;
  const rowA = getTeamStandingsRow(standings, state.teamA);
  const rowB = getTeamStandingsRow(standings, state.teamB);
  if (!rowA && !rowB) return [];

  const chips = [];
  if (rowA) {
    const confA = rowA.conference === 'east' ? 'EAST' : 'WEST';
    chips.push({
      prefix: `${abbrA} ${confA}`,
      value: `#${rowA.conferenceRank}`,
      leaderId: state.teamA,
    });
  }
  if (rowB) {
    const confB = rowB.conference === 'east' ? 'EAST' : 'WEST';
    chips.push({
      prefix: `${abbrB} ${confB}`,
      value: `#${rowB.conferenceRank}`,
      leaderId: state.teamB,
    });
  }
  if (rowA && rowB) {
    chips.push({
      prefix: 'NBA',
      value: `#${rowA.leagueRank} vs #${rowB.leagueRank}`,
    });
  }
  return chips;
}

function buildMatchupContextChips() {
  const preset = matchupRangePreset(state.range?.preset);
  const breakdown = matchupH2hBreakdown();
  const h2h = matchupH2hSummary();
  const reg = breakdown?.regularSeason;
  const post = breakdown?.postseason;
  const chips = [];

  if (preset === 'season') {
    chips.push(...buildMatchupRankingChips());
    if (reg?.count) {
      chips.push({
        prefix: 'REG',
        value: reg.recordNeutral ?? reg.record,
        leaderId: reg.leaderId,
      });
    }
    if (post?.count) {
      chips.push({
        prefix: 'POST',
        value: post.record ?? post.recordNeutral,
        leaderId: post.leaderId,
      });
    }
  } else if (h2h?.count) {
    const leaderId = (h2h.teamAWins ?? 0) > (h2h.teamBWins ?? 0)
      ? (h2h.teamAId || state.teamA)
      : (h2h.teamBWins ?? 0) > (h2h.teamAWins ?? 0)
        ? (h2h.teamBId || state.teamB)
        : null;
    const w = Math.max(h2h.teamAWins ?? 0, h2h.teamBWins ?? 0);
    const l = Math.min(h2h.teamAWins ?? 0, h2h.teamBWins ?? 0);
    chips.push({
      prefix: 'ARCHIVE',
      value: leaderId ? `${w}–${l}` : `${h2h.teamAWins ?? 0}–${h2h.teamBWins ?? 0}`,
      leaderId,
    });
  }
  return chips;
}

function overviewStandingsSectionHtml() {
  const snap = conferenceStandingsSnapshot(state.seasonStandings, 4);
  if (!snap.east.length && !snap.west.length) return '';

  const rowHtml = (row) => {
    const abbr = standingsAbbrFor(row.teamId);
    return `<div class="sd-standings-panel__row"><span class="sd-standings-panel__rank">${row.conferenceRank}</span><span class="sd-standings-panel__team">${abbr}</span><span class="sd-standings-panel__record">${row.regularSeasonWins}–${row.regularSeasonLosses}</span></div>`;
  };

  const cardHtml = (label, rows) => `
    <div class="sd-standings-panel__card">
      <div class="sd-standings-panel__label">${label}</div>
      <div class="sd-standings-panel__body">${rows.map(rowHtml).join('')}</div>
    </div>`;

  return `
    <section class="sd-home-module sd-home-module--standings">
      <div class="sd-standings-panel">
        ${cardHtml('EAST', snap.east)}
        ${cardHtml('WEST', snap.west)}
      </div>
    </section>`;
}

function ledgerNoteHtml(text) {
  return `<p class="sd-game-log__note sd-game-log__note--ledger">${text}</p>`;
}

function syncGameLogLayout({ idle = false } = {}) {
  const layout = $('#game-log-layout');
  if (!layout) return;
  layout.classList.toggle('is-data-idle', idle);
}

function overviewNeedsHomePayload() {
  return !state.homePayload;
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

function isOrbitOverview() {
  return state.orbitOverview;
}

/* ------------------------------------------------------------- Orbit Overview (default workspace) */

function formatAsOfDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const month = d.toLocaleDateString(undefined, { month: 'short' });
  const day = d.getDate();
  const yy = String(d.getFullYear()).slice(-2);
  return `${month} ${day} '${yy}`;
}

function overviewIntro() {
  return state.homePayload?.intro ?? {
    kicker: 'NBA performance index',
    title: 'Orbit Overview',
    detail: 'League-wide results, movers, and streaks from the game archive.',
  };
}

function homeIntro() {
  return overviewIntro();
}

function updateGameLogHeading() {
  const heading = $('#game-log-heading');
  if (!heading) return;
  const eraLabel = rangeLabel(state.range);
  if (state.orbitOverview) {
    heading.textContent = `Recent results · ${eraLabel}`;
    return;
  }
  if (state.heroMode === 'matchup') {
    const preset = state.range?.preset;
    const count = state.archiveLog?.honestCount
      ?? state.archiveLog?.count
      ?? state.matchupGames?.length
      ?? 0;
    if (preset === 'series') {
      if (count > 0) {
        heading.textContent = `Series · ${count} head-to-head meeting${count === 1 ? '' : 's'}`;
        return;
      }
      heading.textContent = 'Series · Head-to-head';
      return;
    }
    const lensLabel = preset === 'all' ? 'Archive comparison' : 'Season comparison';
    if (count > 0) {
      heading.textContent = `${lensLabel} · ${count} head-to-head meeting${count === 1 ? '' : 's'}`;
      return;
    }
    heading.textContent = `${lensLabel} · Head-to-head`;
    return;
  }
  if (state.heroMode === 'solo' && state.selectedTeamId) {
    const team = findTeam(state.selectedTeamId);
    const abbr = team?.abbreviation ?? state.selectedTeamId;
    heading.textContent = `Event tape · ${abbr} · ${eraLabel}`;
    return;
  }
  if (state.heroMode === 'matchup') {
    heading.textContent = `Event tape · ${eraLabel}`;
    return;
  }
  heading.textContent = `Event tape · ${eraLabel}`;
}

function updateLedgerLabel() {
  const label = $('#game-log-ledger-label');
  const ledger = $('#game-log-ledger');
  if (!label || !ledger) return;
  ledger.classList.toggle('is-orbit-overview-ledger', state.orbitOverview);
  if (state.orbitOverview) {
    label.hidden = true;
    return;
  }
  label.hidden = false;
  label.textContent = 'VS RECORD';
}

function renderHomeStats() {
  const statsEl = $('#solo-stats');
  const moveEl = $('#stat-winpct-move');
  const winEl = $('#stat-winpct');
  const recordEl = $('#stat-record');
  const gamesEl = $('#stat-games');
  const labels = soloStatLabels();
  const home = state.homePayload;

  statsEl?.classList.remove('is-idle-today', 'is-today-event');
  if (labels[0]) labels[0].textContent = 'Teams';
  if (labels[1]) labels[1].textContent = 'Games logged';
  if (labels[2]) labels[2].textContent = 'As of';

  winEl.textContent = home?.teamCount ?? state.teams.length ?? '—';
  winEl.className = '';
  recordEl.textContent = home?.gameCount ?? state.meta?.gameCount ?? '—';
  recordEl.className = '';
  gamesEl.textContent = formatAsOfDate(home?.asOf ?? state.meta?.referenceDate);
  gamesEl.className = 'is-context';
  moveEl.textContent = '';
  moveEl.className = '';
}

function homeMoverChipHtml(mover) {
  const team = findTeam(mover.teamId);
  const abbr = team?.abbreviation ?? mover.teamId;
  const color = team?.colors?.primary || '#5da396';
  const delta = mover.delta ?? 0;
  const deltaCls = movementClass(delta);
  const deltaText = `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
  const tip = `${abbr} · ${deltaText} this week`.replace(/"/g, '&quot;');
  return `
    <button type="button" class="sd-opp-chip sd-opp-chip--action"
      data-home-mover="${mover.teamId}"
      style="--team-color: ${color}"
      title="${tip}" aria-label="${abbr} ${deltaText} this week">
      <span class="sd-log-swatch" style="--team-color: ${color}" aria-hidden="true"></span>
      <span class="sd-opp-chip__abbr">${abbr}</span>
      <span class="sd-opp-chip__record ${deltaCls}">${deltaText}</span>
    </button>`;
}

function homeStreakChipHtml(streak) {
  const team = findTeam(streak.teamId);
  const abbr = team?.abbreviation ?? streak.teamId;
  const color = team?.colors?.primary || '#5da396';
  const cls = streak.result === 'W' ? 'is-up' : 'is-down';
  const label = `${streak.result}${streak.length}`;
  const tip = `${abbr} · ${label} this week`.replace(/"/g, '&quot;');
  return `
    <button type="button" class="sd-opp-chip sd-opp-chip--action"
      data-home-mover="${streak.teamId}"
      style="--team-color: ${color}"
      title="${tip}" aria-label="${abbr} on a ${label} run">
      <span class="sd-log-swatch" style="--team-color: ${color}" aria-hidden="true"></span>
      <span class="sd-opp-chip__abbr">${abbr}</span>
      <span class="sd-opp-chip__record ${cls}">${label}</span>
    </button>`;
}

function renderOverviewLedger() {
  const oppEl = $('#key-opponents');
  if (!oppEl) return;

  const home = state.homePayload;
  const movers = home?.topMovers ?? [];
  const streaks = home?.activeStreaks ?? [];

  if (!movers.length && !streaks.length) {
    oppEl.innerHTML = contextualPanelHtml({
      title: 'League snapshot loading',
      detail: 'Top movers and active streaks appear once the archive is ready.',
    });
    return;
  }

  const sections = [];

  if (movers.length) {
    sections.push(`
      <section class="sd-home-ledger__section">
        <h3 class="sd-home-ledger__heading">Top movers</h3>
        <div class="sd-game-log__chips">${movers.map(homeMoverChipHtml).join('')}</div>
      </section>`);
  }

  if (streaks.length) {
    sections.push(`
      <section class="sd-home-ledger__section">
        <h3 class="sd-home-ledger__heading">Active streaks</h3>
        <div class="sd-game-log__chips">${streaks.map(homeStreakChipHtml).join('')}</div>
      </section>`);
  }

  const standingsSection = overviewStandingsSectionHtml();
  if (standingsSection) sections.unshift(standingsSection);

  oppEl.innerHTML = `<div class="sd-home-ledger">${sections.join('')}</div>`;

  oppEl.querySelectorAll('[data-home-mover]').forEach((btn) => {
    btn.addEventListener('click', () => openHomeMover(btn.dataset.homeMover));
  });
}

function renderHomeLedger() {
  renderOverviewLedger();
}

function renderHomeGameLog() {
  const recentEl = $('#recent-results');
  const { games } = getGameLogRows();

  if (!games.length) {
    recentEl.innerHTML = contextualPanelHtml({
      title: 'Archive syncing',
      detail: 'League-wide results will populate here from the historical game archive.',
    });
    renderHomeLedger();
    requestAnimationFrame(updateGameLogScroll);
    return;
  }

  recentEl.innerHTML = games.map((g, index) => {
    const gameDate = (g.date || '').slice(0, 10);
    const emphasizeLatest = state.range?.preset === 'today' && index === 0;
    const latestCls = emphasizeLatest ? ' sd-log-row--latest' : '';
    const cls = g.result === 'W' ? 'is-up' : 'is-down';
    const score = formatGameScore(g, null);
    const matchupLabel = gameLogMatchupLabel(g, { isHome: true });
    const sparkHtml = gameLogSparklineHtml(g, [], null);
    const label = `View ${teamAbbrev(g.team)} vs ${teamAbbrev(g.opponent)} on ${formatResultDate(g.date)}`
      .replace(/"/g, '&quot;');
    const rowInner = buildGameLogRowInner({
      game: g,
      cls,
      matchupLabel,
      score,
      moveText: null,
      moveCls: 'is-flat',
      sparkHtml,
      dateIso: g.date,
    });
    return `
      <button type="button" class="sd-log-row sd-log-row--game sd-log-row--action${latestCls}"
        data-home-team="${g.team}"
        data-game-date="${gameDate}"
        data-opponent="${g.opponent}"
        aria-label="${label}">
        ${rowInner}
      </button>`;
  }).join('');

  renderHomeLedger();
  requestAnimationFrame(updateGameLogScroll);
}

function renderOverviewHeroContext() {
  const intro = overviewIntro();
  const title = $('#hero-title');
  title.textContent = intro.title || 'Orbit Overview';
  title.removeAttribute('title');

  const featuredEl = $('#hero-featured-headline');
  if (featuredEl) {
    featuredEl.hidden = false;
    featuredEl.innerHTML = intro.detail
      ? `<span class="sd-hero__featured-label">${intro.detail}</span>`
      : '';
  }

  const prompt = $('#overview-team-prompt');
  if (prompt) prompt.hidden = false;

  syncModePanels();
}

function renderHomeHeroContext() {
  renderOverviewHeroContext();
}

function renderHomeChart() {
  const canvas = $('#hero-chart');
  const empty = $('#hero-chart-empty');
  const tooltip = $('#hero-tooltip');
  const chartWrap = canvas?.closest('.sd-chart-wrap');
  const { ctx, w, h } = setupCanvas(canvas);

  if (!state.hoverHit) tooltip.hidden = true;
  state.heroHitAreas = [];
  state.heroChartPlot = null;
  chartWrap?.classList.remove('has-ghost-opponent');
  renderHomeHeroContext();
  renderHomeStats();
  renderHeroLegend();

  const netEl = $('#hero-net-summary');
  if (netEl) {
    netEl.textContent = '';
    netEl.classList.remove('is-loaded');
  }

  const lastPlayed = $('#hero-last-played');
  if (lastPlayed) {
    lastPlayed.hidden = true;
    lastPlayed.innerHTML = '';
  }

  if (overviewNeedsHomePayload() && !state.playoffBracket) {
    renderPlayoffBracket({
      wrap: chartWrap,
      bracket: null,
      teamMeta: findTeam,
      onMatchupSelect: openBracketMatchup,
    });
    renderHeroContextSubtitle();
    ctx.clearRect(0, 0, w, h);
    return;
  }

  renderPlayoffBracket({
    wrap: chartWrap,
    bracket: state.playoffBracket,
    teamMeta: findTeam,
    onMatchupSelect: openBracketMatchup,
  });
  renderHeroContextSubtitle();
  ctx.clearRect(0, 0, w, h);
  scheduleBracketLineRedraw();
}

function renderHomeWorkspace() {
  updateGameLogHeading();
  updateLedgerLabel();
  renderHomeChart();
  renderHomeGameLog();
  renderTeamList();
}

async function loadOrbitOverview() {
  const gen = ++overviewLoadGen;
  state.panelLoading = false;
  state.orbitOverview = true;
  state.selectedTeamId = null;
  state.homepageFeature = null;
  state.hoverHit = null;
  state.ghostHover = false;
  state.heroHitAreas = [];
  state.heroChartPlot = null;
  state.errors = [];

  ensurePlayoffBracketLoaded()
    .then((bracket) => {
      state.playoffBracket = bracket;
      if (state.orbitOverview) {
        renderHeroContextSubtitle();
        renderHomeChart();
      }
    })
    .catch((err) => {
      console.error('Playoff bracket load failed:', err);
    });

  loadSeasonStandings();

  syncHeroModeUi();
  syncRangeUi();
  syncTeamPickers();

  const preset = homeOverviewRange();
  const hasCachedOverview = state.homePayload?.range === preset
    && (state.homePayload?.recentGames?.length || state.homePayload?.archiveLog?.games?.length);
  state.overviewLoading = !hasCachedOverview;

  setLoading(true, { refreshing: state.workspaceReady && hasCachedOverview });
  if (!hasCachedOverview) {
    renderHomeWorkspace();
    renderHeader();
  }

  try {
    const payload = await fetchJson(`/api/home?league=NBA&range=${encodeURIComponent(preset)}`);
    if (gen !== overviewLoadGen) return;
    clearPanelGameData();
    state.teamContext = null;
    state.homePayload = payload;
    if (payload.range && payload.range !== state.range.preset) {
      state.range = createRange({
        preset: payload.range,
        mode: 'franchise',
        metric: 'winPct',
      });
      syncRangeUi();
    }
    if (payload.referenceDate) setReferenceDate(payload.referenceDate);
    state.meta = { ...state.meta, ...payload };
    if (payload.featuredMatchup) {
      state.featuredMarquee = payload.featuredMatchup;
    }
  } catch (err) {
    if (gen !== overviewLoadGen) return;
    state.errors = [`Home: ${err.message}`];
    state.homePayload = null;
  } finally {
    if (gen !== overviewLoadGen) return;
    state.overviewLoading = false;
    markWorkspaceReady();
    setLoading(false);
    syncHeroModeUi();
    syncRangeUi();
    syncTeamPickers();
    renderHomeWorkspace();
    renderHeader();
  }
}

function orderBracketMatchupTeams(teams) {
  const sorted = [...(teams || [])].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
  return {
    teamA: sorted[0]?.id ?? null,
    teamB: sorted[1]?.id ?? null,
  };
}

function openBracketMatchup(seriesId) {
  const series = state.playoffBracket?.series?.find((s) => s.seriesId === seriesId);
  if (!series?.teams?.length || series.teams.length < 2) return;

  const { teamA, teamB } = orderBracketMatchupTeams(series.teams);
  if (!teamA || !teamB || !findTeam(teamA) || !findTeam(teamB)) return;

  clearTeamScopedState();
  state.orbitOverview = false;
  state.heroMode = 'matchup';
  state.teamA = teamA;
  state.teamB = teamB;
  state.homepageFeature = null;

  const lastDate = series.lastGameDate;
  if (lastDate) {
    const gameDate = lastDate.slice(0, 10);
    state.focusedGameLogKey = `${gameDate}|${teamB}`;
    state.logFocusOpponent = teamB;
    state.logFocusDate = gameDate;
    state.range = createRangeForGameDate(lastDate, {
      mode: 'matchup',
      metric: 'index',
    });
  } else {
    state.range = createRange({
      preset: MATCHUP_DEFAULT_RANGE,
      mode: 'matchup',
      metric: 'index',
    });
  }

  syncHeroModeUi();
  syncRangeUi();
  syncTeamPickers();
  hidePlayoffBracket($('#hero-chart')?.closest('.sd-chart-wrap'));
  loadData();
}

function openHomeMatchup(teamA, teamB) {
  const a = String(teamA || '').toUpperCase();
  const b = String(teamB || '').toUpperCase();
  if (!findTeam(a) || !findTeam(b)) return;
  clearTeamScopedState();
  state.orbitOverview = false;
  state.teamA = a;
  state.teamB = b;
  state.heroMode = 'matchup';
  ensureActiveRange('matchup');
  state.range = createRange({
    preset: MATCHUP_DEFAULT_RANGE,
    mode: 'matchup',
    metric: 'index',
  });
  const feat = state.homePayload?.featuredMatchup ?? state.featuredMarquee;
  if (feat?.headline && frozensetMatch(a, b, feat)) {
    state.homepageFeature = {
      headline: feat.headline,
      subheadline: feat.subheadline,
    };
  } else {
    state.homepageFeature = null;
  }
  syncHeroModeUi();
  syncRangeUi();
  syncTeamPickers();
  loadData();
}

function frozensetMatch(a, b, feat) {
  const fa = String(feat.teamA || '').toUpperCase();
  const fb = String(feat.teamB || '').toUpperCase();
  return (a === fa && b === fb) || (a === fb && b === fa);
}

function openHomeMover(teamId) {
  const id = String(teamId || '').toUpperCase();
  if (!id || !findTeam(id)) return;
  clearTeamScopedState();
  state.orbitOverview = false;
  state.heroMode = 'solo';
  ensureActiveRange('solo');
  state.selectedTeamId = id;
  state.teamA = id;
  state.homepageFeature = null;
  state.range = createRange({
    preset: HOME_DEFAULT_RANGE,
    mode: 'franchise',
    metric: 'winPct',
  });
  syncHeroModeUi();
  syncRangeUi();
  syncTeamPickers();
  loadData();
}

function focusGameFromHomeLog(game) {
  if (!game?.team || !game?.date) return;
  const teamId = String(game.team).toUpperCase();
  if (!findTeam(teamId)) return;
  clearTeamScopedState();
  state.orbitOverview = false;
  state.heroMode = 'solo';
  state.selectedTeamId = teamId;
  state.teamA = teamId;
  state.homepageFeature = null;
  state.range = createRangeForGameDate(game.date, {
    mode: 'franchise',
    metric: 'winPct',
  });
  syncHeroModeUi();
  syncRangeUi();
  syncTeamPickers();
  loadData();
}

function returnToOverview() {
  loadGeneration += 1;
  state.panelLoading = false;
  state.overviewLoading = false;
  clearLogFocus();
  state.heroMode = 'solo';
  state.range = createRange({
    preset: HOME_DEFAULT_RANGE,
    mode: 'franchise',
    metric: 'winPct',
  });
  loadOrbitOverview();
}

function returnToHome() {
  returnToOverview();
}

function renderTeamList() {
  const el = $('#team-list');
  if (!el) return;
  if (!state.teams.length) {
    el.innerHTML = emptyStateHtml({
      title: 'No teams available',
      detail: 'Team data could not be loaded. Refresh to try again.',
    });
    requestAnimationFrame(updateTeamExplorerScroll);
    return;
  }
  el.innerHTML = state.teams.map(teamCardHtml).join('');
  el.querySelectorAll('.sd-team-chip').forEach((btn) => {
    btn.addEventListener('click', () => selectTeam(btn.dataset.teamId));
  });
  requestAnimationFrame(updateTeamExplorerScroll);
}

function updateTeamExplorerWidthCap() {
  const list = $('#team-list');
  const wrap = list?.closest('.sd-team-explorer__scroll-wrap');
  if (!list || !wrap) return;

  const chips = [...list.querySelectorAll('.sd-team-chip')];
  if (!chips.length) {
    wrap.style.removeProperty('--team-explorer-cap-width');
    return;
  }

  const count = Math.min(TEAM_EXPLORER_VISIBLE, chips.length);
  const gap = parseFloat(getComputedStyle(list).columnGap || getComputedStyle(list).gap) || 0;
  let width = 0;
  for (let i = 0; i < count; i += 1) {
    width += chips[i].getBoundingClientRect().width;
  }
  width += gap * Math.max(0, count - 1);
  wrap.style.setProperty('--team-explorer-cap-width', `${Math.ceil(width)}px`);
}

function initTeamPickers() {
  teamPickers.matchupA = new TeamPicker('#matchup-team-a', {
    label: 'Team A',
    teams: state.teams,
    value: state.teamA,
    onChange: (id) => {
      clearLogFocus();
      state.teamA = id;
      state.homepageFeature = null;
      loadData();
    },
  });
  teamPickers.matchupB = new TeamPicker('#matchup-team-b', {
    label: 'Team B',
    teams: state.teams,
    value: state.teamB,
    onChange: (id) => {
      clearLogFocus();
      state.teamB = id;
      state.homepageFeature = null;
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

  updateTeamExplorerWidthCap();

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

function updateGameLogScroll() {
  const list = $('#recent-results');
  const wrap = list?.closest('.sd-game-log__scroll-wrap');
  if (!list || !wrap) return;

  const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
  const overflowing = maxScroll > 4;
  wrap.classList.toggle('is-overflowing', overflowing);
  wrap.classList.toggle('is-at-start', !overflowing || list.scrollTop <= 4);
  wrap.classList.toggle('is-at-end', !overflowing || list.scrollTop >= maxScroll - 4);
}

function bindGameLogScroll() {
  const list = $('#recent-results');
  const wrap = list?.closest('.sd-game-log__scroll-wrap');
  if (!list || !wrap || list.dataset.scrollBound === '1') return;
  list.dataset.scrollBound = '1';

  list.addEventListener('scroll', updateGameLogScroll, { passive: true });
  window.addEventListener('resize', updateGameLogScroll);

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => updateGameLogScroll());
    observer.observe(list);
  }

  list.addEventListener('click', (event) => {
    const row = event.target.closest('.sd-log-row--action');
    if (!row?.dataset.gameDate) return;
    if (row.dataset.homeTeam) {
      focusGameFromHomeLog({
        team: row.dataset.homeTeam,
        date: row.dataset.gameDate,
        opponent: row.dataset.opponent,
      });
      return;
    }
    focusGameFromLog({
      date: row.dataset.gameDate,
      opponent: row.dataset.opponent,
    });
  });

  list.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('.sd-log-row--action');
    if (!row?.dataset.gameDate) return;
    event.preventDefault();
    if (row.dataset.homeTeam) {
      focusGameFromHomeLog({
        team: row.dataset.homeTeam,
        date: row.dataset.gameDate,
        opponent: row.dataset.opponent,
      });
      return;
    }
    focusGameFromLog({
      date: row.dataset.gameDate,
      opponent: row.dataset.opponent,
    });
  });

  requestAnimationFrame(updateGameLogScroll);
}

function gameLogKey(game) {
  if (game.id) return String(game.id).split('__log')[0];
  const date = (game.date || '').slice(0, 10);
  const opp = game.opponent || '';
  const teamScore = game.teamScore ?? '';
  const opponentScore = game.opponentScore ?? '';
  return `${date}|${opp}|${teamScore}|${opponentScore}`;
}

/** Real games only — sorted newest first, deduped, no visual padding. */
function dedupeGameLogEntries(games) {
  const sorted = [...games].sort((a, b) => b.date.localeCompare(a.date));
  const seen = new Set();
  const out = [];
  for (const game of sorted) {
    const key = gameLogKey(game);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(game);
  }
  return out;
}

const GAME_LOG_STREAK_MIN = 4;
const GAME_LOG_BLOWOUT_MARGIN = 25;
const PLAYOFF_SERIES_WIN_TARGET = 4;

const PLAYOFF_SERIES_ROUND = {
  '010': 1, '011': 1, '012': 1, '013': 1,
  '014': 1, '015': 1, '016': 1, '017': 1,
  '020': 2, '021': 2, '022': 2, '023': 2,
  '030': 3, '031': 3,
  '040': 4,
};

/** Streak badge only on the newest game that completes each W4+/L4+ run. */
function computeGameStreakPeaks(games) {
  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date));
  const peaks = new Map();
  let run = 0;
  let runResult = null;
  let runGames = [];

  const flushRun = () => {
    if (run >= GAME_LOG_STREAK_MIN && runGames.length) {
      const last = runGames[runGames.length - 1];
      peaks.set(gameLogKey(last), { result: runResult, length: run });
    }
    run = 0;
    runResult = null;
    runGames = [];
  };

  for (const game of sorted) {
    const result = game.result;
    if (result === runResult) {
      run += 1;
      runGames.push(game);
    } else {
      flushRun();
      run = 1;
      runResult = result;
      runGames = [game];
    }
  }
  flushRun();
  return peaks;
}

function gameMargin(game, pt) {
  if (game.teamScore != null && game.opponentScore != null) {
    return game.teamScore - game.opponentScore;
  }
  if (pt?.margin != null) return pt.margin;
  if (pt?.pointsFor != null && pt?.pointsAgainst != null) {
    return pt.pointsFor - pt.pointsAgainst;
  }
  return null;
}

/** Badge on the first game that breaks a W4+/L4+ run (win streak → loss, drought → win). */
function computeGameStreakEnds(games) {
  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date));
  const ends = new Map();
  let run = 0;
  let runResult = null;
  let runGames = [];

  const flushRun = (breakingGame) => {
    if (run >= GAME_LOG_STREAK_MIN && runGames.length && breakingGame) {
      ends.set(gameLogKey(breakingGame), { endedResult: runResult, length: run });
    }
    run = 0;
    runResult = null;
    runGames = [];
  };

  for (const game of sorted) {
    const result = game.result;
    if (result === runResult) {
      run += 1;
      runGames.push(game);
    } else {
      flushRun(game);
      run = 1;
      runResult = result;
      runGames = [game];
    }
  }
  return ends;
}

function eventContextGames(teamId = null) {
  if (state.heroMode === 'solo' && state.teamGames?.length) {
    const games = [...state.teamGames];
    if (teamId) {
      return games.filter((g) => String(g.team || state.selectedTeamId).toUpperCase() === String(teamId).toUpperCase());
    }
    return games;
  }
  return gamesForStreakLookup(teamId);
}

function gamesForStreakLookup(teamId = null) {
  if (state.heroMode === 'solo' && state.teamGames?.length) {
    return [...state.teamGames].sort((a, b) => a.date.localeCompare(b.date));
  }
  const games = [];
  const seen = new Set();
  for (const hit of state.heroHitAreas) {
    if (hit.layer === 'context') continue;
    if (teamId && hit.teamId !== teamId) continue;
    const p = hit.point;
    if (!p?.gameId || !p.result) continue;
    const key = gameLogKey({
      id: p.gameId,
      date: p.date,
      opponent: p.opponentId,
      teamScore: p.pointsFor,
      opponentScore: p.pointsAgainst,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    games.push({
      id: p.gameId,
      date: p.date,
      opponent: p.opponentId,
      result: p.result,
      teamScore: p.pointsFor,
      opponentScore: p.pointsAgainst,
      seasonType: p.seasonType,
      seriesId: p.seriesId,
    });
  }
  return games.sort((a, b) => a.date.localeCompare(b.date));
}

function streakEndInfoForPoint(point, teamId = null) {
  if (!point?.gameId || !point.result) return null;
  const list = gamesForStreakLookup(teamId);
  if (!list.length) return null;
  const key = gameLogKey({
    id: point.gameId,
    date: point.date,
    opponent: point.opponentId,
    teamScore: point.pointsFor,
    opponentScore: point.pointsAgainst,
  });
  return computeGameStreakEnds(list).get(key) ?? null;
}

function seriesRoundFromId(seriesId) {
  return PLAYOFF_SERIES_ROUND[String(seriesId || '').slice(-3)] ?? null;
}

function teamSeriesGamesOrdered(game, allGames) {
  const seriesId = game.seriesId;
  const teamId = String(game.team || '').toUpperCase();
  return (allGames || [])
    .filter((g) => g.seriesId === seriesId && String(g.team || '').toUpperCase() === teamId)
    .sort((a, b) =>
      (a.seriesGameNumber || 0) - (b.seriesGameNumber || 0)
      || a.date.localeCompare(b.date));
}

function isSameSeriesGame(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  return (a.date || '').slice(0, 10) === (b.date || '').slice(0, 10)
    && String(a.team || '').toUpperCase() === String(b.team || '').toUpperCase()
    && (a.seriesGameNumber || 0) === (b.seriesGameNumber || 0);
}

function seriesRecordThroughGame(game, teamGames) {
  let wins = 0;
  let losses = 0;
  for (const g of teamGames) {
    if (g.result === 'W') wins += 1;
    else losses += 1;
    if (isSameSeriesGame(g, game)) break;
  }
  return { wins, losses };
}

function opponentWinsThroughGame(game, allGames) {
  const opp = String(game.opponent || '').toUpperCase();
  const oppGames = teamSeriesGamesOrdered({ seriesId: game.seriesId, team: opp }, allGames);
  const dateKey = (game.date || '').slice(0, 10);
  const gameNum = game.seriesGameNumber || 0;
  let wins = 0;
  for (const g of oppGames) {
    if (g.result === 'W') wins += 1;
    if ((g.date || '').slice(0, 10) === dateKey && (g.seriesGameNumber || 0) === gameNum) break;
  }
  return wins;
}

function resolveArchiveGame(gameOrPartial, games) {
  if (!gameOrPartial) return null;
  const list = games || [];
  if (gameOrPartial.id) {
    const exact = list.find((g) => g.id === gameOrPartial.id);
    if (exact) return exact;
  }
  const date = (gameOrPartial.date || '').slice(0, 10);
  const team = String(gameOrPartial.team || '').toUpperCase();
  return list.find((g) =>
    (g.date || '').slice(0, 10) === date
    && String(g.team || '').toUpperCase() === team) ?? gameOrPartial;
}

function playoffEventForGame(game, games = null) {
  if ((game.seasonType || '') !== 'Playoffs' || !game.seriesId) return null;
  const list = games ?? eventContextGames(game.team || state.selectedTeamId);
  const resolved = resolveArchiveGame(game, list);
  const teamGames = teamSeriesGamesOrdered(resolved, list);
  if (!teamGames.length) return null;

  const { wins, losses } = seriesRecordThroughGame(resolved, teamGames);
  const round = seriesRoundFromId(resolved.seriesId);

  if (resolved.result === 'W' && wins === PLAYOFF_SERIES_WIN_TARGET) {
    return round === 4
      ? { kind: 'won-title', label: 'Won Title' }
      : { kind: 'won-series', label: 'Won Series' };
  }

  if (resolved.result === 'L') {
    const oppWins = opponentWinsThroughGame(resolved, list);
    if (oppWins === PLAYOFF_SERIES_WIN_TARGET) {
      return { kind: 'eliminated', label: 'Eliminated' };
    }
  }

  return null;
}

function playoffEventForPoint(point, teamId = null) {
  if (!point?.gameId) return null;
  const list = eventContextGames(teamId || point.teamId);
  const game = resolveArchiveGame({
    id: point.gameId,
    date: point.date,
    opponent: point.opponentId,
    result: point.result,
    team: teamId || point.teamId,
    seasonType: point.seasonType,
    seriesId: point.seriesId,
    seriesGameNumber: point.seriesGameNumber,
  }, list);
  return playoffEventForGame(game, list);
}

function streakBadge(streakInfo) {
  if (!streakInfo || streakInfo.length < GAME_LOG_STREAK_MIN) return null;
  const cls = streakInfo.result === 'W' ? 'is-up' : 'is-down';
  return {
    kind: 'streak',
    label: `${streakInfo.result}${streakInfo.length}`,
    cls: `sd-log-row__tag--streak ${cls}`,
  };
}

function streakEndedBadge(streakEndInfo) {
  if (!streakEndInfo || streakEndInfo.length < GAME_LOG_STREAK_MIN) return null;
  const endedWinStreak = streakEndInfo.endedResult === 'W';
  const cls = endedWinStreak ? 'is-down' : 'is-up';
  return {
    kind: 'streak-ended',
    label: endedWinStreak ? 'Streak Ended' : 'Drought Ended',
    cls: `sd-log-row__tag--streak-end ${cls}`,
  };
}

function playoffEventBadge(playoffEvent) {
  if (!playoffEvent?.kind) return null;
  switch (playoffEvent.kind) {
    case 'won-title':
      return { kind: 'playoff', label: 'Won Title', cls: 'is-up sd-log-row__tag--playoff' };
    case 'won-series':
      return { kind: 'playoff', label: 'Won Series', cls: 'is-up sd-log-row__tag--playoff' };
    case 'eliminated':
      return { kind: 'playoff', label: 'Eliminated', cls: 'is-down sd-log-row__tag--playoff' };
    default:
      return null;
  }
}

function blowoutBadge(game, pt) {
  const margin = gameMargin(game, pt);
  if (margin == null) return null;
  if (game.result === 'W' && margin >= GAME_LOG_BLOWOUT_MARGIN) {
    return { kind: 'blowout', label: 'Blowout Win', cls: 'is-up' };
  }
  if (game.result === 'L' && margin <= -GAME_LOG_BLOWOUT_MARGIN) {
    return { kind: 'blowout', label: 'Blowout Loss', cls: 'is-down' };
  }
  return null;
}

function largestMoveBadge(isSwing) {
  if (!isSwing) return null;
  return { kind: 'swing', label: 'Largest Move', cls: '' };
}

/** Priority: Won Title → Eliminated → Won Series → streak ended → largest move → blowout → W/L streak. Max 2. */
function pickGameLogBadges(game, pt, isSwing, streakInfo, streakEndInfo, playoffEvent) {
  const ranked = [];
  const add = (priority, badge) => {
    if (badge) ranked.push({ priority, badge });
  };

  const playoff = playoffEventBadge(playoffEvent);
  if (playoffEvent?.kind === 'won-title') add(1, playoff);
  else if (playoffEvent?.kind === 'eliminated') add(2, playoff);
  else if (playoffEvent?.kind === 'won-series') add(3, playoff);

  add(4, streakEndedBadge(streakEndInfo));
  add(5, largestMoveBadge(isSwing));
  add(6, blowoutBadge(game, pt));
  add(7, streakBadge(streakInfo));

  ranked.sort((a, b) => a.priority - b.priority);
  return ranked.slice(0, 2).map((entry) => entry.badge);
}

function gameLogTagsHtml(badges) {
  if (!badges?.length) return '';
  return badges.map((badge) => {
    const tone = badge.cls ? ` ${badge.cls}` : '';
    return `<span class="sd-log-row__tag${tone}">${badge.label}</span>`;
  }).join('');
}

function formatGameScore(game, pt) {
  const forScore = game.teamScore ?? pt?.pointsFor;
  const againstScore = game.opponentScore ?? pt?.pointsAgainst;
  if (forScore == null || againstScore == null) return '—';
  return `${forScore}–${againstScore}`;
}

function gameLogMatchupLabel(game, { isSolo, isHome = false } = {}) {
  if (isHome) {
    return `${teamAbbrev(game.team)} vs ${teamAbbrev(game.opponent)}`;
  }
  if (isSolo) {
    return `vs ${teamAbbrev(game.opponent)}`;
  }
  const teamId = game.team || state.teamA;
  return `${teamAbbrev(teamId)} vs ${teamAbbrev(game.opponent)}`;
}

function gameLogSparklineSlice(gamePoints, idx) {
  const lookBack = 7;
  const lookAhead = 2;
  let start = Math.max(0, idx - lookBack);
  let end = Math.min(gamePoints.length, idx + lookAhead + 1);
  let slice = gamePoints.slice(start, end);

  if (slice.length < 4 && idx >= 0) {
    start = Math.max(0, idx - 7);
    end = idx + 1;
    slice = gamePoints.slice(start, end);
  }
  return { slice, activeIdx: idx - start };
}

function gameLogSparklineHtml(game, gamePoints, move) {
  const w = 84;
  const h = 20;
  const empty = `<span class="sd-log-row__spark sd-log-row__spark--empty" style="width:${w}px;height:${h}px" aria-hidden="true"></span>`;
  if (!gamePoints?.length) return empty;

  let idx = -1;
  if (game.id) {
    idx = gamePoints.findIndex((p) => p.gameId === game.id);
  }
  if (idx < 0) {
    const date = (game.date || '').slice(0, 10);
    const opp = String(game.opponent || '').toUpperCase();
    idx = gamePoints.findIndex((p) =>
      (p.date || '').slice(0, 10) === date
      && String(p.opponentId || '').toUpperCase() === opp);
  }
  if (idx < 0) return empty;

  const { slice, activeIdx } = gameLogSparklineSlice(gamePoints, idx);
  if (slice.length < 2) return empty;

  const values = slice.map((p) => Number(p.value));
  if (values.some((v) => !Number.isFinite(v))) return empty;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padX = 2;
  const padY = 2;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const points = values.map((v, i) => {
    const x = padX + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
    const y = padY + innerH - ((v - min) / span) * innerH;
    return { x, y };
  });
  const coords = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const baselineY = (padY + innerH / 2).toFixed(1);
  const active = points[activeIdx];
  const dotHtml = active
    ? `<circle class="sd-log-row__spark-dot" cx="${active.x.toFixed(1)}" cy="${active.y.toFixed(1)}" r="1.6" fill="currentColor"/>`
    : '';

  let tone = 'is-flat';
  if (move != null && move !== 0) tone = move > 0 ? 'is-up' : 'is-down';
  else if (game.result === 'W') tone = 'is-up';
  else if (game.result === 'L') tone = 'is-down';

  return `<svg class="sd-log-row__spark ${tone}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><line class="sd-log-row__spark-base" x1="${padX}" y1="${baselineY}" x2="${w - padX}" y2="${baselineY}"/><polyline class="sd-log-row__spark-line" points="${coords}" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>${dotHtml}</svg>`;
}

function buildGameLogRowInner({
  game,
  cls,
  matchupLabel,
  score,
  moveText,
  moveCls,
  tagsHtml = '',
  sparkHtml,
  dateIso,
}) {
  return `
    <div class="sd-log-row__lead">
      <span class="sd-log-row__badge ${cls}">${game.result === 'W' ? 'W' : 'L'}</span>
      <div class="sd-log-row__matchup">
        <span class="sd-log-row__label">${matchupLabel}</span>
        ${tagsHtml ? `<span class="sd-log-row__tags">${tagsHtml}</span>` : ''}
      </div>
    </div>
    ${sparkHtml}
    <div class="sd-log-row__trail">
      <span class="sd-log-row__score">${score}</span>
      <span class="sd-log-row__move ${moveText ? moveCls : 'is-flat'}">${moveText ?? '—'}</span>
      <time class="sd-log-row__date" datetime="${dateIso}">${formatResultDate(dateIso)}</time>
    </div>`;
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
  if (state.orbitOverview) {
    renderOverviewHeroContext();
    return;
  }

  syncModePanels();

  const isSolo = state.heroMode === 'solo';
  const isMatchup = state.heroMode === 'matchup';
  if (isSolo) {
    const title = $('#hero-title');
    title.textContent = teamDisplayName(state.selectedTeamId);
    title.removeAttribute('title');
    applyTeamContextHeadline();
  } else if (isMatchup) {
    const title = $('#hero-title');
    title.textContent = teamMatchupTitle(state.teamA, state.teamB);
    title.title = `${teamDisplayName(state.teamA)} vs ${teamDisplayName(state.teamB)}`;
  }

  const featuredEl = $('#hero-featured-headline');
  if (featuredEl) {
    const feat = state.homepageFeature;
    if (feat?.headline && isMatchup) {
      featuredEl.hidden = false;
      featuredEl.innerHTML = feat.subheadline
        ? `<span class="sd-hero__featured-label">${feat.headline}</span><span class="sd-hero__featured-sub">${feat.subheadline}</span>`
        : `<span class="sd-hero__featured-label">${feat.headline}</span>`;
    } else {
      featuredEl.hidden = true;
      featuredEl.innerHTML = '';
    }
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

/** Game row targeted by a Game Log click — used for stats + chart focus. */
function focusedLogGame() {
  if (!state.logFocusOpponent || !state.teamGames?.length) return null;
  const date = state.logFocusDate || state.focusedGameLogKey?.split('|')[0];
  const opp = state.logFocusOpponent;
  if (date) {
    const exact = state.teamGames.find((g) =>
      g.date.slice(0, 10) === date
      && String(g.opponent || '').toUpperCase() === opp);
    if (exact) return exact;
  }
  return state.teamGames.find((g) => String(g.opponent || '').toUpperCase() === opp);
}

function applyLogGameChartFocus() {
  if (!state.logFocusDate) return false;
  const date = state.logFocusDate;
  const primaryTeamId = state.heroMode === 'solo' ? state.selectedTeamId : state.teamA;
  const hit = state.heroHitAreas.find((h) =>
    h.layer !== 'context'
    && h.isGame
    && (h.point?.date || '').slice(0, 10) === date
    && h.teamId === primaryTeamId);
  if (!hit) return false;
  state.hoverHit = {
    point: hit.point,
    teamId: hit.teamId,
    layer: 'primary',
    guideX: hit.x,
    relatedHits: [hit],
    hoverKey: `${(hit.point?.date || '').slice(0, 10)}|${hit.teamId}`,
  };
  return true;
}

function formatMatchupH2hStat(h2h) {
  if (!h2h?.count) return '—';
  const winsA = h2h.teamAWins ?? 0;
  const winsB = h2h.teamBWins ?? 0;
  if (winsA === winsB) return `${winsA}–${winsB}`;
  const leaderAbbr = winsA > winsB
    ? (findTeam(h2h.teamAId || state.teamA)?.abbreviation ?? h2h.teamAId)
    : (findTeam(h2h.teamBId || state.teamB)?.abbreviation ?? h2h.teamBId);
  return `${leaderAbbr} ${Math.max(winsA, winsB)}–${Math.min(winsA, winsB)}`;
}

function soloHasGameActivity() {
  if (state.rangeStats?.games > 0) return true;
  const count = state.archiveLog?.honestCount ?? state.teamGames?.length ?? 0;
  return count > 0;
}

function contextTeamAbbr(id) {
  return findTeam(id)?.abbreviation ?? id;
}

function soloLatestGameForSubtitle() {
  if (!state.teamGames?.length) return null;
  const sorted = [...state.teamGames].sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0] ?? null;
}

function soloLatestMoveForSubtitle(game) {
  if (!game) return null;
  const lookup = gamePointLookup('solo');
  const pt = pointForGame(game, lookup);
  return movementForGame(game, pt);
}

function resolveContextSubtitleStatus() {
  if (state.orbitOverview) {
    if (overviewNeedsHomePayload() && !state.homePayload?.teamCount) return 'loading';
    return 'ready';
  }
  if (state.heroMode === 'solo') {
    if (!state.selectedTeamId) return 'pick-team';
    if (state.panelLoading && soloSeriesEmpty(effectiveSoloSeries())) return 'loading';
    const series = effectiveSoloSeries();
    if (series?.error && soloSeriesEmpty(series)) return 'error';
    if (soloSeriesEmpty(series)) return 'empty';
    return 'ready';
  }
  if (state.heroMode === 'matchup') {
    if (state.matchup?.error) return 'error';
    if (!matchupHasGames(state.matchup)) return 'empty';
    return 'ready';
  }
  return 'ready';
}

function renderHeroContextSubtitle() {
  if (state.loading && !state.workspaceReady) {
    applyContextSubtitle({ caption: '—', suffix: '' });
    return;
  }

  const status = resolveContextSubtitleStatus();
  const archiveMeta = {
    referenceDate: state.meta?.referenceDate,
    asOf: state.homePayload?.asOf ?? state.meta?.referenceDate,
    seasonBoundaries: state.chartSet?.seasonBoundaries,
    abbrFor: contextTeamAbbr,
  };

  if (state.orbitOverview) {
    const home = state.homePayload;
    applyContextSubtitle(getContextSubtitle({
      mode: 'overview',
      stats: {
        teamCount: home?.teamCount ?? state.teams.length,
        topMover: home?.topMovers?.[0] ?? null,
        topStreak: home?.activeStreaks?.[0] ?? null,
      },
      archiveMeta,
      status,
      playoffBracket: state.playoffBracket,
    }));
    return;
  }

  if (state.heroMode === 'solo') {
    const todayGame = soloTodayWithGame() ? soloLatestGameForSubtitle() : null;
    applyContextSubtitle(getContextSubtitle({
      mode: 'solo',
      range: state.range,
      team: findTeam(state.selectedTeamId),
      stats: {
        rangeStats: state.rangeStats,
        teamGames: state.teamGames,
        latestGame: state.range.preset === 'today' ? todayGame : null,
        latestMove: todayGame ? soloLatestMoveForSubtitle(todayGame) : null,
        todayIdle: soloTodayIdle(),
      },
      archiveMeta,
      status,
    }));
    return;
  }

  if (state.heroMode === 'matchup') {
    applyContextSubtitle(getContextSubtitle({
      mode: 'matchup',
      range: state.range,
      team: { id: state.teamA },
      opponent: { id: state.teamB },
      stats: {
        rangeStats: state.rangeStats,
        h2hBreakdown: matchupH2hBreakdown(),
      },
      matchupSummary: matchupH2hSummary(),
      archiveMeta,
      status,
    }));
  }
}

function renderMatchupStats() {
  const statsEl = $('#solo-stats');
  const moveEl = $('#stat-winpct-move');
  const winEl = $('#stat-winpct');
  const recordEl = $('#stat-record');
  const gamesEl = $('#stat-games');
  const labels = soloStatLabels();
  const teamA = findTeam(state.teamA);
  const teamB = findTeam(state.teamB);
  const matchup = state.matchup;
  const h2h = matchupH2hSummary(matchup);
  const breakdown = matchupH2hBreakdown(matchup);
  const third = matchupThirdStatColumn(breakdown, h2h, matchupRangePreset(state.range?.preset));

  statsEl?.classList.remove('is-idle-today', 'is-today-event');
  statsEl?.classList.add('is-matchup-stats');

  const scopeHint = matchupRangePreset(state.range?.preset) === 'all'
    ? STAT_SCOPE_LABELS.all
    : STAT_SCOPE_LABELS.season;
  if (labels[0]) labels[0].textContent = teamA?.abbreviation ?? state.teamA;
  if (labels[1]) labels[1].textContent = teamB?.abbreviation ?? state.teamB;
  if (labels[2]) labels[2].textContent = third.label;

  const teamAStats = state.rangeStats?.teamA;
  const teamBStats = state.rangeStats?.teamB;
  winEl.textContent = teamAStats?.record ?? matchup?.teamARecord ?? '—';
  winEl.title = `${teamA?.abbreviation ?? state.teamA} · ${scopeHint}`;
  winEl.className = '';
  recordEl.textContent = teamBStats?.record ?? matchup?.teamBRecord ?? '—';
  recordEl.title = `${teamB?.abbreviation ?? state.teamB} · ${scopeHint}`;
  recordEl.className = '';
  gamesEl.textContent = third.record ?? '—';
  gamesEl.className = 'is-context';
  if (third.title) gamesEl.title = third.title;
  moveEl.textContent = '';
  moveEl.className = '';
}

function matchupThirdStatColumn(breakdown, h2h, preset = matchupRangePreset()) {
  const isAll = preset === 'all';
  const post = breakdown?.postseason;
  const reg = breakdown?.regularSeason;

  if (isAll && h2h?.count) {
    const winsA = h2h.teamAWins ?? 0;
    const winsB = h2h.teamBWins ?? 0;
    const leaderId = winsA > winsB
      ? (h2h.teamAId || state.teamA)
      : winsB > winsA
        ? (h2h.teamBId || state.teamB)
        : null;
    const leaderWins = Math.max(winsA, winsB);
    const trailerWins = Math.min(winsA, winsB);
    return {
      label: 'Matchup',
      record: leaderId ? `${leaderWins}–${trailerWins}` : `${winsA}–${winsB}`,
      leaderId,
      title: leaderId
        ? `${findTeam(leaderId)?.abbreviation ?? leaderId} leads all-time ${leaderWins}–${trailerWins}`
        : `All-time tied ${winsA}–${winsB}`,
    };
  }

  if (post?.count > 0) {
    return {
      label: 'Postseason',
      record: post.record ?? post.recordNeutral ?? '—',
      leaderId: post.leaderId ?? null,
      title: post.leaderId
        ? `${findTeam(post.leaderId)?.abbreviation ?? post.leaderId} won postseason ${post.record}`
        : `Postseason tied ${post.recordNeutral ?? post.record}`,
    };
  }
  if (reg?.count > 0) {
    return {
      label: 'Reg season',
      record: reg.record ?? reg.recordNeutral ?? '—',
      leaderId: reg.leaderId ?? null,
      title: reg.leaderId
        ? `${findTeam(reg.leaderId)?.abbreviation ?? reg.leaderId} leads reg-season ${reg.record}`
        : `Reg-season tied ${reg.recordNeutral ?? reg.record}`,
    };
  }
  if (h2h?.count) {
    return {
      label: 'Head-to-head',
      record: formatMatchupH2hStat(h2h),
      leaderId: null,
      title: formatMatchupH2hLine(h2h),
    };
  }
  return { label: 'Head-to-head', record: '—', leaderId: null, title: '' };
}

function renderSoloStats() {
  const statsEl = $('#solo-stats');
  const moveEl = $('#stat-winpct-move');
  const winEl = $('#stat-winpct');
  const recordEl = $('#stat-record');
  const gamesEl = $('#stat-games');
  const labels = soloStatLabels();

  if (soloTodayIdle()) {
    statsEl?.classList.add('is-idle-today');
    statsEl?.classList.remove('is-today-event');
    const ctx = state.teamContext;
    const season = ctx?.seasonSummary;

    if (ctx?.todayGame) {
      if (labels[0]) labels[0].textContent = 'Result';
      if (labels[1]) labels[1].textContent = 'Opponent';
      if (labels[2]) labels[2].textContent = 'Final';
      const g = ctx.todayGame;
      winEl.textContent = g.result === 'W' ? 'W' : 'L';
      winEl.className = g.result === 'W' ? 'is-up' : 'is-down';
      recordEl.textContent = findTeam(g.opponent)?.abbreviation ?? g.opponent;
      recordEl.className = 'is-context';
      gamesEl.textContent = `${g.teamScore}–${g.opponentScore}`;
      gamesEl.className = '';
      moveEl.textContent = '';
      moveEl.className = '';
      return;
    }

    if (season?.games) {
      if (labels[0]) labels[0].textContent = 'Season';
      if (labels[1]) labels[1].textContent = 'Record';
      if (labels[2]) labels[2].textContent = 'Win %';
      winEl.textContent = season.seasonLabel ?? 'Season';
      winEl.className = 'is-context';
      recordEl.textContent = season.record;
      recordEl.className = '';
      gamesEl.textContent = `${season.winPct}%`;
      gamesEl.className = '';
      moveEl.textContent = ctx?.streak ? `${ctx.streak.result}${ctx.streak.length} streak` : '';
      moveEl.className = ctx?.streak?.result === 'W' ? 'is-up' : ctx?.streak?.result === 'L' ? 'is-down' : '';
      return;
    }

    if (labels[0]) labels[0].textContent = 'Status';
    if (labels[1]) labels[1].textContent = 'Last result';
    if (labels[2]) labels[2].textContent = 'Last played';

    winEl.textContent = 'Idle';
    winEl.className = 'is-idle';

    const last = state.lastPlayedGame;
    if (last) {
      recordEl.textContent = `${last.result} ${last.teamScore}–${last.opponentScore}`;
      recordEl.className = last.result === 'W' ? 'is-up' : 'is-down';
      const opp = findTeam(last.opponent);
      gamesEl.textContent = `${formatResultDate(last.date)} vs ${opp?.abbreviation ?? last.opponent}`;
      gamesEl.className = 'is-context';
    } else {
      recordEl.textContent = '—';
      recordEl.className = '';
      gamesEl.textContent = '—';
      gamesEl.className = '';
    }
    moveEl.textContent = '';
    moveEl.className = '';
    return;
  }

  if (soloTodayWithGame() && !state.logFocusOpponent) {
    statsEl?.classList.remove('is-idle-today');
    statsEl?.classList.add('is-today-event');
    if (labels[0]) labels[0].textContent = 'Result';
    if (labels[1]) labels[1].textContent = 'Opponent';
    if (labels[2]) labels[2].textContent = 'Final';

    const todayGame = [...state.teamGames].sort((a, b) => b.date.localeCompare(a.date))[0];
    const result = todayGame?.result === 'W' ? 'W' : 'L';
    winEl.textContent = result;
    winEl.className = result === 'W' ? 'is-up' : 'is-down';

    const opp = findTeam(todayGame?.opponent);
    recordEl.textContent = opp?.abbreviation ?? todayGame?.opponent ?? '—';
    recordEl.className = 'is-context';

    if (todayGame?.teamScore != null && todayGame?.opponentScore != null) {
      gamesEl.textContent = `${todayGame.teamScore}–${todayGame.opponentScore}`;
    } else {
      gamesEl.textContent = '—';
    }
    gamesEl.className = '';

    moveEl.textContent = '';
    moveEl.className = '';
    return;
  }

  const logGame = focusedLogGame();
  if (logGame) {
    statsEl?.classList.remove('is-idle-today');
    statsEl?.classList.add('is-today-event');
    if (labels[0]) labels[0].textContent = 'Result';
    if (labels[1]) labels[1].textContent = 'Opponent';
    if (labels[2]) labels[2].textContent = 'Final';

    const result = logGame.result === 'W' ? 'W' : 'L';
    winEl.textContent = result;
    winEl.className = result === 'W' ? 'is-up' : 'is-down';

    const opp = findTeam(logGame.opponent);
    recordEl.textContent = opp?.abbreviation ?? logGame.opponent ?? '—';
    recordEl.className = 'is-context';

    if (logGame.teamScore != null && logGame.opponentScore != null) {
      gamesEl.textContent = `${logGame.teamScore}–${logGame.opponentScore}`;
    } else {
      gamesEl.textContent = '—';
    }
    gamesEl.className = '';

    moveEl.textContent = '';
    moveEl.className = '';
    return;
  }

  statsEl?.classList.remove('is-idle-today', 'is-today-event');
  const scope = statScopeLabel(state.range?.preset);
  if (labels[0]) labels[0].textContent = 'Win %';
  if (labels[1]) labels[1].textContent = 'Record';
  if (labels[2]) labels[2].textContent = 'Games';

  const stats = state.rangeStats ?? {
    winPct: null,
    record: null,
    games: 0,
    scopeLabel: scope,
  };
  winEl.textContent = stats.winPct != null ? `${Number(stats.winPct).toFixed(1)}%` : '—';
  winEl.className = '';
  winEl.title = `${scope} win %`;
  recordEl.textContent = stats.record ?? '—';
  recordEl.className = '';
  recordEl.title = `${scope} record`;
  gamesEl.textContent = stats.games ?? '—';
  gamesEl.className = '';
  gamesEl.title = `${scope} games`;

  const gamePoints = (state.teamSeries?.points || []).filter((p) => p.gameId && !p.flatline);
  let moveText = '';
  let moveClassName = '';
  if (gamePoints.length >= 1) {
    const last = gamePoints[gamePoints.length - 1];
    const delta = last.movementAmount ?? 0;
    if (delta !== 0) {
      moveText = `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% last game`;
      moveClassName = movementClass(delta);
    }
  }
  if (!moveText && stats.scopeLabel) {
    moveText = stats.scopeLabel;
    moveClassName = '';
  }
  moveEl.textContent = moveText;
  moveEl.className = moveClassName;
}

function enrichSeriesPoints(raw = []) {
  const sorted = [...raw]
    .filter((p) => p.gameId && !p.flatline)
    .sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p, i) => {
    const prevVal = p.previousValue ?? (i > 0 ? sorted[i - 1].value : null);
    if (prevVal == null || p.value == null) {
      return { ...p, previousValue: prevVal ?? p.value, movementAmount: null };
    }
    const move = Number((p.value - prevVal).toFixed(2));
    return { ...p, previousValue: prevVal, movementAmount: move === 0 ? null : move };
  });
}

function seriesForGameLogMode(mode) {
  if (mode === 'matchup') {
    return state.matchup?.series?.find((s) => s.teamId === state.teamA)
      ?? state.matchup?.series?.[0]
      ?? null;
  }
  return state.teamSeries;
}

function gamePointLookup(mode) {
  const series = seriesForGameLogMode(mode);
  const byId = new Map();
  const byDateOpp = new Map();
  for (const p of enrichSeriesPoints(series?.points || [])) {
    byId.set(p.gameId, p);
    const date = (p.date || '').slice(0, 10);
    const opp = String(p.opponentId || '').toUpperCase();
    if (date && opp) byDateOpp.set(`${date}|${opp}`, p);
  }
  return { byId, byDateOpp };
}

function pointForGame(game, lookup) {
  if (!game) return null;
  if (game.id && lookup.byId.has(game.id)) {
    return lookup.byId.get(game.id);
  }
  const date = (game.date || '').slice(0, 10);
  const opp = String(game.opponent || '').toUpperCase();
  return lookup.byDateOpp.get(`${date}|${opp}`) ?? null;
}

function movementForGame(game, pt) {
  if (!pt || pt.gameId !== game.id) return null;
  if (pt.value == null || pt.previousValue == null) return null;
  const move = Number((pt.value - pt.previousValue).toFixed(2));
  if (!Number.isFinite(move) || move === 0) return null;
  return move;
}

function formatMoveValue(amount, metric = 'winPct') {
  if (amount == null || Number.isNaN(Number(amount))) return null;
  const n = Number(amount);
  if (n === 0) return null;
  const suffix = metric === 'winPct' ? '%' : '';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}${suffix}`;
}

function significantPoint(gamePoints) {
  if (!gamePoints.length) return null;
  return [...gamePoints].sort((a, b) =>
    Math.abs(b.movementAmount ?? 0) - Math.abs(a.movementAmount ?? 0))[0];
}

function gamePointsForMode(mode) {
  return enrichSeriesPoints(seriesForGameLogMode(mode)?.points || []);
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
      const gamesA = a.wins + a.losses;
      const gamesB = b.wins + b.losses;
      if (gamesB !== gamesA) return gamesB - gamesA;
      return b.lastDate.localeCompare(a.lastDate);
    })
    .slice(0, limit);
}

/** Most frequent opponents in the active range — selected team's record vs each. */
function rangeOpponentRecords(games, limit = 5) {
  return aggregateOpponents(games, limit);
}


function rangeHasGames(series) {
  if (!series) return false;
  if ((series.gameCount ?? 0) > 0) return true;
  if (series.hasGames) return true;
  return false;
}

function matchupHasGames(matchup) {
  return matchup?.series?.some((s) => (s.gameCount ?? 0) > 0) ?? false;
}

function matchupH2hSummary(matchup = state.matchup) {
  return matchup?.h2h ?? matchup?.chartSet?.h2h ?? null;
}

function matchupIndexLabel() {
  const preset = state.range?.preset;
  if (preset === 'series') return 'series index';
  if (preset === 'season') return 'season index';
  if (preset === 'all') return 'archive index';
  return 'index';
}

function formatMatchupH2hLine(h2h) {
  if (!h2h?.count) return '';
  const teamA = findTeam(h2h.teamAId || state.teamA);
  const teamB = findTeam(h2h.teamBId || state.teamB);
  const winsA = h2h.teamAWins ?? 0;
  const winsB = h2h.teamBWins ?? 0;
  const prefix = state.range?.preset === 'series' ? 'Series' : 'Head-to-head';
  if (winsA === winsB) {
    return `${prefix}: ${winsA}–${winsB}`;
  }
  const leader = winsA > winsB ? teamA : teamB;
  const leaderW = Math.max(winsA, winsB);
  const trailerW = Math.min(winsA, winsB);
  const leaderName = leader?.abbreviation ?? leader?.name ?? (winsA > winsB ? h2h.teamAId : h2h.teamBId);
  return `${prefix}: ${leaderName} ${leaderW}–${trailerW}`;
}

function matchupChartCaption(matchup) {
  const preset = state.range?.preset;
  const h2hCount = matchup?.h2h?.count ?? matchup?.honestCount ?? 0;

  if (preset === 'series') {
    if (!h2hCount) return 'Series · Head-to-head';
    return `Series · Head-to-head · ${h2hCount} meeting${h2hCount === 1 ? '' : 's'}`;
  }

  const gameCount = Math.max(0, ...(matchup?.series || []).map((s) => s.gameCount ?? 0));
  if (preset === 'all') {
    if (!matchupHasGames(matchup)) return 'Archive comparison · Multi-season trajectories';
    return `Archive comparison · Multi-season trajectories · ${gameCount} games each`;
  }

  if (!matchupHasGames(matchup)) {
    return 'Season comparison · Full season trajectories';
  }
  return `Season comparison · Full season trajectories · ${gameCount} games each`;
}

/** Chart points for net/swing — game-level when available, else aggregated period points. */
function seriesActivityPoints(series) {
  const points = series?.points || [];
  const gamePoints = points.filter((p) => p.gameId && !p.flatline);
  if (gamePoints.length) return gamePoints;
  const aggregated = points.filter((p) => p.aggregated && (p.gamesInPeriod ?? 0) > 0);
  if (aggregated.length) return aggregated;
  return points.filter((p) => !p.flatline);
}

function netMetricChangeFromSeries(series, metric) {
  const points = series?.points || [];
  if (!points.length) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const start = first.previousValue ?? first.value;
  const end = last.value;
  if (start == null || end == null) return null;
  const delta = Number((end - start).toFixed(metric === 'winPct' ? 1 : 2));
  return { start, end, delta };
}

function soloTodayIdle() {
  return state.heroMode === 'solo'
    && state.range.preset === 'today'
    && !soloHasGameActivity();
}

function soloTodayWithGame() {
  return state.heroMode === 'solo'
    && state.range.preset === 'today'
    && soloHasGameActivity();
}

function soloStatLabels() {
  return $('#solo-stats')?.querySelectorAll('.sd-hero__stat em') ?? [];
}

function formatLastPlayedLabel(game) {
  if (!game) return '';
  const date = formatResultDate(game.date);
  const opp = findTeam(game.opponent);
  const oppLabel = opp?.abbreviation ?? game.opponent;
  const result = game.result === 'W' ? 'W' : 'L';
  return `Last played ${date} vs ${oppLabel} · ${result} ${game.teamScore}–${game.opponentScore}`;
}

async function loadLastPlayedGame(gen) {
  state.lastPlayedGame = null;
  if (state.heroMode !== 'solo' || soloHasGameActivity()) return;

  try {
    const payload = await fetchJson(performanceUrl(
      state.selectedTeamId,
      createRange({ preset: 'all', mode: 'franchise', metric: 'winPct' }),
    ));
    if (gen !== loadGeneration) return;
    const games = payload.games || [];
    if (!games.length) return;
    const sorted = [...games].sort((a, b) => b.date.localeCompare(a.date));
    state.lastPlayedGame = sorted[0];
  } catch {
    if (gen !== loadGeneration) return;
    state.lastPlayedGame = null;
  }
}

function renderLastPlayedContext() {
  const el = $('#hero-last-played');
  if (!el) return;

  if ((state.loading && !state.workspaceReady) || state.heroMode !== 'solo' || soloHasGameActivity()) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }

  const game = state.lastPlayedGame;
  if (!game) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }

  const label = formatLastPlayedLabel(game);
  const jumpPreset = jumpPresetForLastPlayed(state.range.preset, game.date);

  if (jumpPreset) {
    const jumpLabel = rangeLabel(createRange({ preset: jumpPreset }));
    el.innerHTML = `
      <button type="button" class="sd-hero__last-played-btn"
        data-jump-preset="${jumpPreset}"
        aria-label="${label}. Jump to ${jumpLabel}.">
        ${label}
      </button>`;
  } else {
    el.innerHTML = `<span class="sd-hero__last-played-static">${label}</span>`;
  }
  el.hidden = false;
}

function jumpToActivityRange(preset) {
  if (!preset || state.heroMode !== 'solo') return;
  setRange(preset);
}

function buildSoloNetLine() {
  const label = rangeLabel(state.range);
  const series = effectiveSoloSeries();

  if (!state.selectedTeamId) {
    return '<span class="sd-hero__net-line--muted">Select a team to explore solo form and event tape.</span>';
  }

  if (state.panelLoading && soloSeriesEmpty(series)) {
    return '<span class="sd-hero__net-line--muted">Loading franchise history from the archive…</span>';
  }

  if (series?.error) {
    return `<span class="sd-hero__net-line--muted">Summary unavailable — ${series.error}</span>`;
  }

  if (!rangeHasGames(series)) {
    if (soloTodayIdle()) {
      const ctx = state.teamContext;
      if (ctx?.outlook) {
        return `<span class="sd-hero__net-line--muted">${ctx.outlook}</span>`;
      }
      return '<span class="sd-hero__net-line--muted">No game today · showing latest available trend</span>';
    }
    if (state.chartFallback?.note) {
      return `<span class="sd-hero__net-line--muted">${state.chartFallback.note}</span>`;
    }
    if (state.teamContext?.headline) {
      return `<span class="sd-hero__net-line--muted">${state.teamContext.headline}</span>`;
    }
    if (state.range.preset === 'today') {
      return '<span class="sd-hero__net-line--muted">No game today · see recent trend below</span>';
    }
    return `<span class="sd-hero__net-line--muted">Showing ${chartFallbackCaption() || 'recent'} performance</span>`;
  }

  const activityPoints = seriesActivityPoints(series);
  const net = netMetricChangeFromSeries(series, 'winPct')
    ?? netMetricChange(activityPoints, 'winPct');
  const sig = significantPoint(activityPoints);
  const parts = [];

  if (net?.delta != null && net.delta !== 0) {
    const cls = movementClass(net.delta);
    parts.push(`Net <em class="${cls}">${net.delta > 0 ? '+' : ''}${net.delta}%</em>`);
  } else {
    parts.push('Net unchanged');
  }

  if (sig?.opponentId && Math.abs(sig.movementAmount ?? 0) > 0) {
    const opp = sig.opponentId;
    const move = formatMoveValue(sig.movementAmount, 'winPct');
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
  const matchup = state.matchup;

  if (matchup?.error) {
    return `<span class="sd-hero__net-line--muted">Matchup summary unavailable — ${matchup.error}</span>`;
  }

  if (!matchup?.series?.length) {
    return '<span class="sd-hero__net-line--muted">Select two teams and a range with overlapping games.</span>';
  }

  const h2hLine = formatMatchupH2hLine(matchupH2hSummary(matchup));
  if (h2hLine) {
    return `<span class="sd-hero__net-line--muted">${h2hLine}</span>`;
  }

  if (!matchupHasGames(matchup)) {
    return `<span class="sd-hero__net-line--muted">${teamA?.abbreviation ?? state.teamA} vs ${teamB?.abbreviation ?? state.teamB} · ${state.range?.preset === 'series' ? 'no series history in archive' : 'try Season or All for full trajectories'}</span>`;
  }

  const parts = [];
  for (const s of matchup.series) {
    const pts = seriesActivityPoints(s);
    const net = netMetricChangeFromSeries(s, 'index')
      ?? netMetricChange(pts, 'index');
    const abbr = findTeam(s.teamId)?.abbreviation ?? s.teamId;
    if (net?.delta != null && net.delta !== 0) {
      const cls = movementClass(net.delta);
      parts.push(`${abbr} ${matchupIndexLabel()} <em class="${cls}">${net.delta > 0 ? '+' : ''}${net.delta}</em>`);
    } else {
      parts.push(`${abbr} ${matchupIndexLabel()} unchanged`);
    }
  }

  return parts.join(' · ');
}

function renderMarketSummary() {
  const el = $('#hero-net-summary');
  if (!el) return;

  if (state.loading && !state.workspaceReady) {
    el.textContent = '';
    el.classList.remove('is-loaded');
    return;
  }

  el.innerHTML = state.heroMode === 'matchup'
    ? buildMatchupNetLine()
    : buildSoloNetLine();

  renderLastPlayedContext();

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
    const indexLabel = matchupIndexLabel();
    legend.innerHTML = state.matchup.series.map((s) => `
    <span class="sd-legend-item">
      <span class="sd-legend-swatch" style="background:${s.color}"></span>
      <span>${s.teamName}</span>
      <span class="sd-legend-meta">${indexLabel} · ${s.gameCount} game${s.gameCount === 1 ? '' : 's'}</span>
    </span>`).join('');
    return;
  }

  legend.innerHTML = '';
}

function renderHeroChart() {
  if (state.orbitOverview) {
    renderHomeChart();
    return;
  }

  const canvas = $('#hero-chart');
  const empty = $('#hero-chart-empty');
  const caption = $('#hero-chart-caption');
  const tooltip = $('#hero-tooltip');
  const { ctx, w, h } = setupCanvas(canvas);
  const chartWrap = canvas.closest('.sd-chart-wrap');

  if (!state.hoverHit) tooltip.hidden = true;
  state.heroHitAreas = [];
  state.heroChartPlot = null;
  chartWrap?.classList.remove('has-ghost-opponent');
  renderHeroContext();
  renderHeroLegend();
  renderMarketSummary();
  renderHeroContextSubtitle();

  if (state.heroMode === 'solo') {
    renderSoloStats();
    const series = effectiveSoloSeries();
    const primary = state.teamSeries;
    if (primary?.error && !series?.points?.length) {
      heroContextualPanel({
        title: state.teamContext?.headline || 'Performance archive',
        detail: primary.error,
        action: 'Try another timeline or team.',
      });
      caption.textContent = state.teamContext?.subheadline || 'Showing latest available context';
      return;
    }
    if (state.panelLoading && soloSeriesEmpty(series)) {
      heroContextualPanel({
        title: teamDisplayName(state.selectedTeamId),
        detail: 'Loading franchise history from the archive.',
      });
      caption.textContent = 'Loading…';
      return;
    }
    if (soloSeriesEmpty(series)) {
      heroContextualPanel({
        title: state.teamContext?.headline || teamDisplayName(state.selectedTeamId),
        detail: state.teamContext?.subheadline || 'Loading franchise history from the archive.',
        action: state.teamContext?.outlook || '',
      });
      caption.textContent = 'Latest available context';
      return;
    }
    empty.style.display = 'none';
    const hasRangeGames = rangeHasGames(series);
    const vsLabel = state.logFocusOpponent
      ? ` vs ${teamAbbrev(state.logFocusOpponent)}`
      : '';
    const fbCaption = state.chartFallback ? chartFallbackCaption() : null;
    const rangeCaption = fbCaption && fbCaption !== rangeLabel(state.range)
      ? `${rangeLabel(state.range)} · showing ${fbCaption}`
      : rangeLabel(state.range);
    caption.textContent = hasRangeGames
      ? `${rangeCaption}${vsLabel} · Win % · ${series.gameCount} game${series.gameCount === 1 ? '' : 's'}`
      : (soloTodayIdle() ? `${rangeCaption}${vsLabel} · Win %` : `${rangeCaption}${vsLabel} · Win %`);
    const colored = seriesWithTeamColor(series, state.selectedTeamId);
    const contextColored = state.contextLayers.map((layer) =>
      seriesWithTeamColor(layer.series, layer.teamId),
    );
    chartWrap?.classList.toggle('has-ghost-opponent', contextColored.length > 0);
    const primaryHover = state.hoverHit?.layer === 'context' ? null : state.hoverHit;
    const chartProfile = chartProfileForRange(state.range);
    const result = drawPerformanceChart(ctx, w, h, colored, primaryHover, {
      contextSeriesList: contextColored,
      ghostHover: state.ghostHover,
      ghostHoverId: state.contextHoverId,
      rangePreset: chartProfile.preset,
      profile: chartProfile,
      opponentMarkerIds: state.opponentMarkerIds,
      opponentColors: state.opponentMarkerColors,
    });
    state.heroHitAreas = (result.hitAreas || []).map((hit) => ({
      ...hit,
      metric: hit.metric || 'winPct',
    }));
    state.heroChartPlot = result.plot ?? null;
    return;
  }

  const matchup = state.matchup;
  if (matchup?.error) {
    heroContextualPanel({
      title: 'Matchup context',
      detail: matchup.error,
      action: 'Pick two teams with games in this range.',
    });
    caption.textContent = 'Showing available head-to-head context';
    renderMatchupStats();
    return;
  }
  if (!matchup?.series?.length || !matchupHasGames(matchup)) {
    const action = state.range?.preset === 'series'
      ? 'These teams have not met in the archive.'
      : 'Try Season or All for full trajectories.';
    heroContextualPanel({
      title: `${teamMatchupTitle(state.teamA, state.teamB)}`,
      detail: state.range?.preset === 'series'
        ? 'No head-to-head games between these teams in the loaded archive.'
        : 'No overlapping franchise history in this comparison lens.',
      action,
    });
    caption.textContent = state.range?.preset === 'series'
      ? 'Series · Head-to-head'
      : 'Season comparison · Full season trajectories';
    renderMatchupStats();
    return;
  }
  renderMatchupStats();
  empty.style.display = 'none';
  caption.textContent = matchupChartCaption(matchup);
  const chartProfile = chartProfileForRange(state.range);
  const result = drawMatchupChart(ctx, w, h, matchup, state.hoverHit, {
    rangePreset: chartProfile.preset,
    profile: chartProfile,
  });
  state.heroHitAreas = (result.hitAreas || []).map((hit) => ({ ...hit, metric: 'index' }));
  state.heroChartPlot = result.plot ?? null;
}

function formatResultDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ledgerOpponents(games, limit = 5) {
  return rangeOpponentRecords(games, limit);
}

function opponentChipHtml(row, { isContext = false } = {}) {
  const team = findTeam(row.id);
  const oppAbbr = team?.abbreviation ?? row.id;
  const fullName = team ? `${team.city} ${team.name}` : row.id;
  const selectedAbbr = teamAbbrev(state.selectedTeamId);
  const range = rangeLabel(state.range);
  const record = `${row.wins}–${row.losses}`;
  const color = team?.colors?.primary || '#5da396';
  const recordCls = row.wins > row.losses ? 'is-up' : row.wins < row.losses ? 'is-down' : '';
  const tip = `${selectedAbbr} ${record} vs ${fullName} · ${range}`;
  const safeTip = tip.replace(/"/g, '&quot;');
  const ariaLabel = `${selectedAbbr} ${record} vs ${oppAbbr} in ${range}`;
  return `
    <div class="sd-opp-chip${isContext ? ' sd-opp-chip--context' : ''}" style="--team-color: ${color}" title="${safeTip}" aria-label="${ariaLabel}">
      <span class="sd-log-swatch" style="--team-color: ${color}" aria-hidden="true"></span>
      <span class="sd-opp-chip__abbr">${oppAbbr}</span>
      <span class="sd-opp-chip__record ${recordCls}">${record}</span>
      ${isContext ? '<span class="sd-opp-chip__tag">Chart</span>' : ''}
    </div>`;
}


function renderGameLogLedger({ games, isSolo, hidden = false }) {
  const oppEl = $('#key-opponents');
  const ledgerEl = $('#game-log-ledger');
  if (!oppEl || !ledgerEl) return;

  if (hidden) {
    oppEl.innerHTML = '';
    ledgerEl.hidden = true;
    ledgerEl.classList.remove('is-compact');
    return;
  }

  ledgerEl.hidden = false;

  if (!isSolo) {
    ledgerEl.classList.remove('is-compact');
    const chips = buildMatchupContextChips();
    oppEl.innerHTML = chips.length
      ? chips.map((chip) => matchupMiniChipHtml(chip)).join('')
      : '';
    return;
  }

  if (state.panelLoading && isSolo) {
    ledgerEl.classList.remove('is-compact');
    oppEl.innerHTML = ledgerNoteHtml('Loading season opponents…');
    return;
  }

  const contextChips = buildSoloContextChips();
  const contextHtml = contextChips.map((chip) => matchupMiniChipHtml(chip)).join('');

  const ledger = ledgerOpponents(games);
  if (!ledger.length) {
    const keyOpps = state.teamContext?.keyOpponents ?? [];
    if (keyOpps.length) {
      ledgerEl.classList.remove('is-compact');
      const oppHtml = keyOpps.map((row) => opponentChipHtml(row)).join('');
      oppEl.innerHTML = contextHtml ? `${contextHtml}${oppHtml}` : oppHtml;
      return;
    }
    const range = rangeLabel(state.range);
    const opponentLabel = state.teamContext?.seasonSummary
      ? `${state.teamContext.seasonSummary.seasonLabel} opponents`
      : 'Season opponents';
    ledgerEl.classList.add('is-compact');
    oppEl.innerHTML = contextHtml || ledgerNoteHtml(
      `${opponentLabel} · No head-to-head games in ${range} yet.`,
    );
    return;
  }

  ledgerEl.classList.remove('is-compact');
  const oppHtml = ledger.map((row) => {
    const contextIds = new Set(state.contextLayers.map((l) => l.teamId));
    const isContext = contextIds.has(row.id)
      || (ghostOpponentEnabled() && state.logFocusOpponent === row.id);
    return opponentChipHtml(row, { isContext });
  }).join('');
  oppEl.innerHTML = contextHtml ? `${contextHtml}${oppHtml}` : oppHtml;
}

function renderGameLog() {
  if (state.orbitOverview) {
    renderHomeGameLog();
    return;
  }

  updateGameLogHeading();
  updateLedgerLabel();

  const recentEl = $('#recent-results');
  const { games: recent, metric, mode } = getGameLogRows();
  const isSolo = mode === 'solo';

  if (state.panelLoading && isSolo && state.selectedTeamId) {
    syncGameLogLayout({ idle: true });
    recentEl.innerHTML = contextualPanelHtml({
      title: 'Event tape',
      detail: 'Loading recent games from the archive…',
    });
    renderGameLogLedger({ games: [], isSolo, hidden: true });
    requestAnimationFrame(updateGameLogScroll);
    return;
  }

  if (!recent.length) {
    syncGameLogLayout({ idle: true });
    const isToday = state.range.preset === 'today';
    const isMatchup = state.heroMode === 'matchup';
    const preset = state.range?.preset;
    let title = isToday ? 'No game today' : 'No games in this range';
    let detail = isToday
      ? 'No completed game on the reference date for this team.'
      : 'Try a wider timeline to find games in the archive.';
    if (isMatchup) {
      title = preset === 'series' ? 'No series history' : 'No head-to-head meetings';
      detail = preset === 'series'
        ? 'These teams have not played each other in the loaded archive.'
        : preset === 'all'
          ? 'No head-to-head games across the full archive for this pairing.'
          : 'No head-to-head games in the current season between these teams.';
    }
    recentEl.innerHTML = contextualPanelHtml({ title, detail });
    renderGameLogLedger({ games: recent, isSolo });
    requestAnimationFrame(updateGameLogScroll);
    return;
  }

  syncGameLogLayout({ idle: false });

  const lookup = gamePointLookup(mode);
  const gamePoints = gamePointsForMode(mode);
  const sigPoint = significantPoint(gamePoints);
  const contextGames = eventContextGames();
  const streaksByKey = computeGameStreakPeaks(contextGames);
  const streakEndsByKey = computeGameStreakEnds(contextGames);

  recentEl.innerHTML = recent.map((g, index) => {
    const gameDate = (g.date || '').slice(0, 10);
    const emphasizeLatest = state.range?.preset === 'today' && index === 0;
    const latestCls = emphasizeLatest ? ' sd-log-row--latest' : '';
    const pt = pointForGame(g, lookup);
    const cls = g.result === 'W' ? 'is-up' : 'is-down';
    const move = movementForGame(g, pt);
    const moveText = formatMoveValue(move, metric);
    const moveCls = movementClass(move ?? 0);
    const isSwing = sigPoint && pt && sigPoint.gameId === pt.gameId
      && move != null && Math.abs(move) > 0;
    const score = formatGameScore(g, pt);
    const matchupLabel = gameLogMatchupLabel(g, { isSolo });
    const focusCls = state.focusedGameLogKey === `${gameDate}|${g.opponent || ''}`
      ? ' sd-log-row--focused' : '';
    const swingCls = isSwing ? ' sd-log-row--swing' : '';
    const streakInfo = streaksByKey.get(gameLogKey(g));
    const streakEndInfo = streakEndsByKey.get(gameLogKey(g));
    const playoffEvent = playoffEventForGame(g, contextGames);
    const tagsHtml = gameLogTagsHtml(
      pickGameLogBadges(g, pt, isSwing, streakInfo, streakEndInfo, playoffEvent),
    );
    const sparkHtml = gameLogSparklineHtml(g, gamePoints, move);
    const rowInner = buildGameLogRowInner({
      game: g,
      cls,
      matchupLabel,
      score,
      moveText,
      moveCls,
      tagsHtml,
      sparkHtml,
      dateIso: g.date,
    });

    if (isSolo) {
      const label = `View ${formatResultDate(g.date)} ${matchupLabel}`.replace(/"/g, '&quot;');
      return `
      <button type="button" class="sd-log-row sd-log-row--game sd-log-row--action${swingCls}${focusCls}${latestCls}"
        data-game-date="${gameDate}"
        data-opponent="${g.opponent}"
        aria-label="${label}">
        ${rowInner}
      </button>`;
    }

    const label = `View matchup on ${formatResultDate(g.date)} ${matchupLabel}`.replace(/"/g, '&quot;');
    return `
      <button type="button" class="sd-log-row sd-log-row--game sd-log-row--action${swingCls}${focusCls}${latestCls}"
        data-game-date="${gameDate}"
        data-opponent="${g.opponent}"
        aria-label="${label}">
        ${rowInner}
      </button>`;
  }).join('');

  renderGameLogLedger({ games: recent, isSolo });
  requestAnimationFrame(updateGameLogScroll);
}

function renderPanels() {
  renderGameLog();
  renderTeamList();
}

async function loadContextOpponents(gen) {
  state.contextLayers = [];
  state.contextHoverId = null;

  if (ghostOverlayEnabled()) {
    const opponents = resolveContextOpponents(state.teamGames)
      .filter((id) => id && id !== state.selectedTeamId);
    if (!opponents.length) return;

    const mode = resolveGhostMode();
    const results = await Promise.all(
      opponents.map(async (oppId) => {
        try {
          const payload = await fetchJson(performanceUrl(oppId, soloRange()));
          if (gen !== loadGeneration) return null;
          if (payload.error && !payload.series) return null;
          let contextSeries;
          if (mode === 'full') {
            contextSeries = payload.series;
          } else {
            contextSeries = buildContextSeries(state.teamGames, oppId, payload.series);
          }
          if (!contextSeries?.points?.length) return null;
          return { teamId: oppId, series: contextSeries };
        } catch {
          return null;
        }
      }),
    );
    if (gen !== loadGeneration) return;
    state.contextLayers = results.filter(Boolean);
    return;
  }

  syncOpponentMarkers();
}

async function loadSoloPanelData(gen) {
  const teamId = state.selectedTeamId;
  if (!teamId) return;
  try {
    const payload = await fetchJson(performanceUrl(teamId, soloRange()));
    if (gen !== loadGeneration) return;
    if (payload.error && !payload.chartSet && !payload.archiveLog && !payload.series) {
      throw new Error(payload.error);
    }
    applyPanelPayload(payload, 'solo');
    if (payload.mode) state.meta = { ...state.meta, ...payload };
    if (state.teamSeries?.error) {
      state.errors = [`Panel data: ${state.teamSeries.error}`];
    }
  } catch (err) {
    if (gen !== loadGeneration) return;
    state.errors = [`Panel data: ${err.message}`];
    state.chartSet = null;
    state.archiveLog = null;
    state.gameSet = null;
    state.teamSeries = null;
    state.teamGames = [];
    state.rangeStats = null;
  }
}

async function loadMatchupHero(gen) {
  try {
    const payload = await fetchJson(matchupUrl(matchupRange()));
    if (gen !== loadGeneration) return;
    if (payload.error && !payload.chartSet && !payload.archiveLog && !payload.series) {
      throw new Error(payload.error);
    }
    applyPanelPayload(payload, 'matchup');
    state.matchup = payload;
    state.teamSeries = null;
    state.teamGames = [];
    if (payload.error) {
      state.errors = [`Matchup data: ${payload.error}`];
    }
  } catch (err) {
    if (gen !== loadGeneration) return;
    state.errors = [`Matchup data: ${err.message}`];
    state.matchup = null;
    state.chartSet = null;
    state.archiveLog = null;
    state.gameSet = null;
    state.matchupGames = [];
    state.rangeStats = null;
  }
}

async function loadData() {
  if (state.orbitOverview) state.orbitOverview = false;
  if (state.heroMode === 'solo' && !state.selectedTeamId) return;
  if (state.heroMode === 'matchup') {
    const a = String(state.teamA || '').toUpperCase();
    const b = String(state.teamB || '').toUpperCase();
    if (!a || !b || a === b) return;
  }

  const gen = ++loadGeneration;
  ensureActiveRange(state.heroMode);
  state.errors = [];
  state.hoverHit = null;
  state.ghostHover = false;
  state.lastTooltipAnchorKey = null;
  state.panelLoading = true;

  syncHeroModeUi();
  syncTeamPickers();

  setLoading(true, { refreshing: state.workspaceReady });
  renderPanels();
  state.chartSet = null;
  state.archiveLog = null;
  state.gameSet = null;
  state.teamSeries = null;
  state.teamGames = [];
  state.rangeStats = null;
  state.matchupGames = [];
  try {
    if (state.heroMode === 'solo') {
      await loadSoloPanelData(gen);
      if (gen !== loadGeneration) return;
      state.chartFallback = null;
      await loadContextOpponents(gen);
      if (gen !== loadGeneration) return;
      await loadSoloFallbacks(gen);
      if (gen !== loadGeneration) return;
      if (!soloHasGameActivity()) {
        await loadLastPlayedGame(gen);
      } else {
        state.lastPlayedGame = null;
      }
    } else if (state.heroMode === 'matchup') {
      state.contextLayers = [];
      state.contextHoverId = null;
      state.opponentMarkerIds = null;
      state.opponentMarkerColors = null;
      state.lastPlayedGame = null;
      state.chartFallback = null;
      await loadMatchupHero(gen);
    }
  } finally {
    if (gen !== loadGeneration) return;
    state.panelLoading = false;
    loadSeasonStandings();
    markWorkspaceReady();
    setLoading(false);
    renderHeroChart();
    if (applyLogGameChartFocus()) renderHeroChart();
    renderPanels();
    renderHeader();
  }
}

function selectTeam(teamId) {
  clearTeamScopedState();
  state.orbitOverview = false;
  hidePlayoffBracket($('#hero-chart')?.closest('.sd-chart-wrap'));
  state.heroMode = 'solo';
  state.selectedTeamId = teamId;
  state.teamA = teamId;
  state.homepageFeature = null;
  ensureActiveRange('solo');
  syncHeroModeUi();
  loadData();
}

function flipToContextOpponent(teamId) {
  const nextId = teamId || state.contextHoverId;
  if (!nextId || state.heroMode !== 'solo' || !ghostOverlayEnabled()) return;
  clearPanelGameData();
  state.teamContext = null;
  clearLogFocus();
  state.selectedTeamId = nextId;
  state.teamA = nextId;
  loadData();
}

function focusGameFromLog(game) {
  if (!game?.date) return;
  const gameDate = game.date.slice(0, 10);
  const opp = String(game.opponent || '').toUpperCase();
  const teamId = panelTeamId();

  if (!opp || opp === teamId || !findTeam(opp)) return;

  state.homepageFeature = null;
  state.focusedGameLogKey = `${gameDate}|${opp}`;
  state.logFocusOpponent = opp;
  state.logFocusDate = gameDate;

  if (state.heroMode === 'solo') {
    state.range = createRangeForGameDate(game.date, {
      mode: 'franchise',
      metric: 'winPct',
    });
    syncRangeUi();
    loadData();
    return;
  }

  state.teamA = teamId;
  state.teamB = opp;
  syncTeamPickers();
  state.range = createRangeForGameDate(game.date, {
    mode: 'matchup',
    metric: 'index',
  });
  syncRangeUi();
  loadData();
}

function enterMatchupFromGame(opponentId) {
  const opp = String(opponentId || '').toUpperCase();
  const teamA = state.selectedTeamId;
  if (!opp || opp === teamA || !findTeam(opp)) return;

  state.homepageFeature = null;
  state.teamA = teamA;
  state.teamB = opp;
  syncTeamPickers();
  setHeroMode('matchup');
}

function syncModePanels() {
  const overview = state.orbitOverview;
  const showSolo = overview || state.heroMode === 'solo';
  const showMatchup = !overview && state.heroMode === 'matchup';
  const showStats = overview || state.heroMode === 'solo' || state.heroMode === 'matchup';
  const explorer = $('#team-explorer');
  const matchupRow = $('#matchup-row');
  const soloStats = $('#solo-stats');
  if (explorer) explorer.hidden = !showSolo;
  if (matchupRow) matchupRow.hidden = !showMatchup;
  if (soloStats) soloStats.hidden = !showStats;
  if (showSolo) requestAnimationFrame(updateTeamExplorerScroll);
}

function syncHeroModeUi() {
  const inOverview = state.orbitOverview;
  document.querySelectorAll('[data-hero-mode]:not(:disabled)').forEach((btn) => {
    const active = !inOverview && btn.dataset.heroMode === state.heroMode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  document.body.classList.toggle('is-orbit-overview', inOverview);
  const prompt = $('#overview-team-prompt');
  if (prompt) prompt.hidden = !inOverview;
  syncModePanels();
}

function renderRangeControls() {
  const group = $('#hero-range-group');
  if (!group) return;

  const isMatchup = state.heroMode === 'matchup' && !state.orbitOverview;
  const options = rangeControlsForMode();
  const activePreset = normalizePresetForMode(
    state.range?.preset,
    state.heroMode === 'matchup' ? 'matchup' : 'solo',
  );

  group.classList.toggle('is-range-compact', isMatchup);
  group.style.setProperty('--orbit-range-slot-count', String(options.length));

  group.replaceChildren(...options.map(({ preset, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sd-toggle';
    btn.dataset.range = preset;
    btn.textContent = label;
    const active = preset === activePreset;
    if (active) btn.classList.add('is-active');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    return btn;
  }));

  group.setAttribute(
    'aria-label',
    isMatchup ? 'Matchup comparison range' : 'Timeline',
  );
}

function syncRangeUi() {
  renderRangeControls();
}

function applyFeaturedHomepage(featured) {
  if (!featured?.teamA || !featured?.teamB) return;
  state.homepageFeature = {
    headline: featured.headline,
    subheadline: featured.subheadline,
    context: featured.context,
  };
  state.heroMode = featured.heroMode || 'matchup';
  state.teamA = featured.teamA;
  state.teamB = featured.teamB;
  state.selectedTeamId = featured.selectedTeamId || featured.teamA;
  state.range = createRange({
    preset: normalizePresetForMode(featured.range || MATCHUP_DEFAULT_RANGE, 'matchup'),
    mode: 'matchup',
    metric: 'index',
  });
  syncHeroModeUi();
  syncRangeUi();
}

function setHeroMode(mode) {
  if (mode !== 'solo' && mode !== 'matchup') return;
  const wasMatchup = state.heroMode === 'matchup';
  clearLogFocus();
  if (mode === 'matchup') {
    const a = String(state.teamA || '').toUpperCase();
    const b = String(state.teamB || '').toUpperCase();
    if (a && b && a === b) {
      state.errors = ['Choose two different teams for a matchup.'];
      syncHeroModeUi();
      return;
    }
  }
  if (mode === 'solo') state.homepageFeature = null;
  if (mode === 'matchup') {
    const feat = state.homePayload?.featuredMatchup ?? state.featuredMarquee;
    if (state.orbitOverview && feat?.teamA && feat?.teamB) {
      state.teamA = feat.teamA;
      state.teamB = feat.teamB;
    }
  }
  if (state.orbitOverview && mode === 'matchup') {
    state.orbitOverview = false;
    hidePlayoffBracket($('#hero-chart')?.closest('.sd-chart-wrap'));
  } else if (!state.orbitOverview || mode !== 'solo') {
    state.orbitOverview = false;
  }
  if (state.orbitOverview && mode === 'solo') {
    ensureActiveRange('solo');
    syncHeroModeUi();
    return;
  }
  if (mode === 'solo' && !state.range?.preset) {
    ensureActiveRange('solo');
  }
  state.heroMode = mode;
  syncHeroModeUi();
  const preset = normalizePresetForMode(state.range?.preset, mode);
  state.range = createRange({
    preset,
    mode: mode === 'solo' ? 'franchise' : 'matchup',
    metric: mode === 'solo' ? 'winPct' : 'index',
  });
  syncRangeUi();
  if (mode === 'solo' && wasMatchup) {
    state.selectedTeamId = state.teamA;
  }
  syncTeamPickers();
  clearPanelGameData();
  if (mode === 'solo') state.teamContext = null;
  loadData();
}

function setRange(presetArg) {
  if (state.orbitOverview) {
    state.range = createRange({
      preset: normalizePresetForMode(presetArg, 'solo'),
      mode: 'franchise',
      metric: 'winPct',
    });
    syncRangeUi();
    loadOrbitOverview();
    return;
  }
  clearLogFocus();
  const preset = normalizePresetForMode(
    presetArg,
    state.heroMode === 'matchup' ? 'matchup' : 'solo',
  );
  state.range = createRange({
    preset,
    mode: state.heroMode === 'solo' ? 'franchise' : 'matchup',
    metric: state.heroMode === 'solo' ? 'winPct' : 'index',
  });
  syncRangeUi();
  loadData();
}

/* ------------------------------------------------------------- binds */

function bindBrandLink() {
  $('#orbit-brand')?.addEventListener('click', (event) => {
    if (!window.location.pathname.includes('/odds')) return;
    event.preventDefault();
    if (!state.orbitOverview) returnToOverview();
  });
}

function bindControls() {
  bindBrandLink();
  document.querySelectorAll('[data-hero-mode]:not(:disabled)').forEach((btn) => {
    btn.addEventListener('click', () => setHeroMode(btn.dataset.heroMode));
  });

  document.querySelectorAll('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => setRange(btn.dataset.range));
  });

  $('#hero-range-group')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-range]');
    if (!btn || btn.disabled) return;
    setRange(btn.dataset.range);
  });

  $('#hero-last-played')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-jump-preset]');
    if (!btn) return;
    jumpToActivityRange(btn.dataset.jumpPreset);
  });

  const canvas = $('#hero-chart');
  const tooltip = $('#hero-tooltip');
  const wrap = canvas?.closest('.sd-chart-wrap');
  let hoverRaf = null;

  function chartPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  }

  function positionTooltipAtAnchor(guideX, hits, plot) {
    if (!wrap || !tooltip || !plot) return;
    const tipW = tooltip.offsetWidth;
    const tipH = tooltip.offsetHeight;
    const anchorY = hits?.length
      ? Math.min(...hits.map((h) => h.y))
      : plot.top + plot.height / 2;

    let left = guideX + 14;
    let top = anchorY - tipH - 12;
    if (left + tipW > wrap.clientWidth - 8) left = guideX - tipW - 14;
    if (left < 8) left = 8;
    if (top < 8) top = anchorY + 16;
    if (top + tipH > wrap.clientHeight - 8) top = wrap.clientHeight - tipH - 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
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
    state.lastTooltipAnchorKey = null;
    state.ghostHover = false;
    state.contextHoverId = null;
    if (needsRedraw) {
      cancelAnimationFrame(hoverRaf);
      hoverRaf = requestAnimationFrame(() => renderHeroChart());
    }
  }

  function updateChartHover(e) {
    if (!wrap) return;

    const { mx, my } = chartPoint(e);
    const plot = state.heroChartPlot;
    const nearest = plot && state.heroHitAreas.length
      ? findNearestChartHover(state.heroHitAreas, plot, mx, my)
      : null;
    const contextHit = !nearest && state.contextLayers.length
      ? findContextHit(state.heroHitAreas, mx, my)
      : null;

    if (!nearest && !contextHit) {
      clearChartHover();
      return;
    }

    if (nearest) {
      canvas.style.cursor = 'crosshair';
      const matchupMode = state.heroMode === 'matchup';
      tooltip.innerHTML = formatChartTooltipHtml(nearest, {
        matchupMode,
        allHitAreas: state.heroHitAreas,
        streakEndForPoint: streakEndInfoForPoint,
        playoffEventForPoint,
      });
      tooltip.hidden = false;

      const anchorKey = `${nearest.dateKey}|${Math.round(nearest.guideX)}`;
      if (state.lastTooltipAnchorKey !== anchorKey) {
        state.lastTooltipAnchorKey = anchorKey;
        positionTooltipAtAnchor(nearest.guideX, nearest.hits, plot);
      }

      const hoverKey = `${nearest.dateKey}|${nearest.hits.map((h) => h.teamId).join(',')}`;
      const changed = state.hoverHit?.hoverKey !== hoverKey || state.ghostHover;
      const primary = nearest.primary;
      state.hoverHit = {
        point: primary.point,
        teamId: primary.teamId,
        layer: 'primary',
        guideX: nearest.guideX,
        relatedHits: nearest.hits,
        hoverKey,
      };
      state.ghostHover = false;
      state.contextHoverId = null;
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
    const hoverId = contextHit.teamId || null;
    const changed = !state.ghostHover || state.contextHoverId !== hoverId;
    state.contextHoverId = hoverId;
    if (!state.ghostHover || changed) {
      state.ghostHover = true;
      state.hoverHit = null;
      state.lastTooltipAnchorKey = null;
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
    if (state.heroMode !== 'solo' || !state.contextLayers.length || !ghostOverlayEnabled()) return;
    const { mx, my } = chartPoint(e);
    const plot = state.heroChartPlot;
    if (plot && findNearestChartHover(state.heroHitAreas, plot, mx, my)) return;
    const contextHit = findContextHit(state.heroHitAreas, mx, my);
    if (contextHit) flipToContextOpponent(contextHit.teamId);
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
  try {
    const [teamsPayload, marqueePayload] = await Promise.all([
      fetchJson('/api/teams?league=NBA'),
      fetchJson('/api/marquee?league=NBA'),
    ]);
    if (teamsPayload.error) throw new Error(teamsPayload.error);
    state.teams = teamsPayload.teams || [];
    state.meta = teamsPayload;
    if (teamsPayload.referenceDate) {
      setReferenceDate(teamsPayload.referenceDate);
    }
    if (!marqueePayload.error) {
      state.featuredMarquee = marqueePayload;
    }
  } catch (err) {
    state.errors = [`Teams: ${err.message}`];
    state.teams = [];
  }

  // Future: pinned team from storage → selectTeam(pinnedId) and skip home.

  initTeamPickers();
  syncTeamPickers();
  syncHeroModeUi();
  syncRangeUi();
  bindTeamExplorerScroll();
  bindGameLogScroll();
  bindControls();
  renderHeader();
  loadSeasonStandings();
  await loadOrbitOverview();
}

window.addEventListener('resize', () => {
  if (state.orbitOverview) {
    renderHomeChart();
    scheduleBracketLineRedraw();
  } else {
    renderHeroChart();
  }
});

init();
