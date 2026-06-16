/**
 * 2026 NBA playoff bracket — derived from local archive JSON.
 * Structure supports future replacement with generated playoff data.
 */

import { computeStandingsFromGames, loadRegularSeasonArchiveGames, NBA_EAST } from './standings.js';

const PLAYOFF_GAMES_URL = '/data/games-2026-playoffs.json';
const BRACKET_SEASON = '2026';

/** seriesId suffix → round + conference (NBA CommonPlayoffSeries layout). */
const SERIES_LAYOUT = {
  '010': { round: 1, conference: 'east', slot: 0 },
  '011': { round: 1, conference: 'east', slot: 1 },
  '012': { round: 1, conference: 'east', slot: 2 },
  '013': { round: 1, conference: 'east', slot: 3 },
  '014': { round: 1, conference: 'west', slot: 0 },
  '015': { round: 1, conference: 'west', slot: 1 },
  '016': { round: 1, conference: 'west', slot: 2 },
  '017': { round: 1, conference: 'west', slot: 3 },
  '020': { round: 2, conference: 'east', slot: 0 },
  '021': { round: 2, conference: 'east', slot: 1 },
  '022': { round: 2, conference: 'west', slot: 0 },
  '023': { round: 2, conference: 'west', slot: 1 },
  '030': { round: 3, conference: 'east', slot: 0 },
  '031': { round: 3, conference: 'west', slot: 0 },
  '040': { round: 4, conference: null, slot: 0 },
};

const R1_ROW_STARTS = [1, 3, 5, 7];
const R2_ROW_STARTS = [2, 6];
const CF_ROW_START = 4;

let bracketLoadPromise = null;

function parseSeriesMeta(seriesId) {
  const suffix = String(seriesId || '').slice(-3);
  return SERIES_LAYOUT[suffix] ?? null;
}

function seriesRowSpan(round, slot) {
  if (round === 1) return R1_ROW_STARTS[slot] ?? 1;
  if (round === 2) return R2_ROW_STARTS[slot] ?? 2;
  if (round === 3) return CF_ROW_START;
  return CF_ROW_START;
}

function gridColumnFor(round, conference) {
  if (round === 4) return 4;
  if (conference === 'west') {
    if (round === 1) return 1;
    if (round === 2) return 2;
    return 3;
  }
  if (conference === 'east') {
    if (round === 1) return 7;
    if (round === 2) return 6;
    return 5;
  }
  return 4;
}

function computeStandings(games) {
  return computeStandingsFromGames(games);
}

function seedMapFromStandings(standings, playoffTeamIds) {
  const byConf = { east: [], west: [] };
  for (const id of playoffTeamIds) {
    const conf = NBA_EAST.has(id) ? 'east' : 'west';
    byConf[conf].push({
      id,
      wins: standings.wins[id] ?? 0,
      losses: standings.losses[id] ?? 0,
    });
  }
  const seeds = {};
  for (const conf of ['east', 'west']) {
    byConf[conf].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    byConf[conf].forEach((row, i) => {
      seeds[row.id] = i + 1;
    });
  }
  return seeds;
}

function computeSeriesOutcome(games) {
  const teams = [...new Set(games.map((g) => g.team))];
  const byGame = new Map();
  for (const g of games) {
    const n = g.seriesGameNumber ?? 0;
    if (!byGame.has(n)) byGame.set(n, {});
    byGame.get(n)[g.team] = g.result;
  }
  const wins = Object.fromEntries(teams.map((t) => [t, 0]));
  for (const row of byGame.values()) {
    for (const [team, result] of Object.entries(row)) {
      if (result === 'W') wins[team] += 1;
    }
  }
  const maxW = Math.max(...Object.values(wins));
  const winner = teams.find((t) => wins[t] === maxW) ?? null;
  return {
    teams: teams.map((id) => ({
      id,
      wins: wins[id] ?? 0,
      winner: id === winner,
    })),
    winner,
    wins,
  };
}

/**
 * @typedef {Object} BracketTeam
 * @property {string} id
 * @property {string} abbr
 * @property {string} name
 * @property {number|null} seed
 * @property {number} seriesWins
 * @property {boolean} winner
 * @property {string|null} nextSeriesId
 */

/**
 * @typedef {Object} BracketSeries
 * @property {string} seriesId
 * @property {number} round 1–4
 * @property {'east'|'west'|null} conference
 * @property {number} slot
 * @property {BracketTeam[]} teams
 * @property {string|null} winnerId
 * @property {string|null} nextSeriesId
 */

/**
 * Build bracket tree from normalized playoff game rows.
 * @param {object[]} playoffGames
 * @param {Record<string, number>} seeds
 * @returns {{ season: string, series: BracketSeries[], champion: object|null, teamCount: number }}
 */
export function buildBracketFromGames(playoffGames, seeds = {}) {
  const bySeries = new Map();
  for (const g of playoffGames) {
    const sid = g.seriesId;
    if (!sid) continue;
    if (!bySeries.has(sid)) bySeries.set(sid, []);
    bySeries.get(sid).push(g);
  }

  /** @type {BracketSeries[]} */
  const series = [];
  for (const [seriesId, games] of bySeries.entries()) {
    const meta = parseSeriesMeta(seriesId);
    if (!meta) continue;
    const outcome = computeSeriesOutcome(games);
    const teamRows = outcome.teams
      .sort((a, b) => (seeds[a.id] ?? 99) - (seeds[b.id] ?? 99))
      .map(({ id, wins, winner }) => ({
        id,
        abbr: id,
        name: id,
        seed: seeds[id] ?? null,
        seriesWins: wins,
        winner,
        nextSeriesId: null,
      }));
    const lastGameDate = games.reduce(
      (max, g) => ((g.date || '') > max ? g.date : max),
      games[0]?.date ?? '',
    );
    series.push({
      seriesId,
      round: meta.round,
      conference: meta.conference,
      slot: meta.slot,
      teams: teamRows,
      winnerId: outcome.winner,
      nextSeriesId: null,
      lastGameDate,
    });
  }

  series.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    if (a.conference !== b.conference) {
      if (a.conference === 'west') return -1;
      if (b.conference === 'west') return 1;
    }
    return a.slot - b.slot;
  });

  for (const s of series) {
    if (!s.winnerId) continue;
    if (s.round === 3) {
      s.nextSeriesId = series.find((c) => c.round === 4)?.seriesId ?? null;
    } else if (s.round < 3) {
      const next = series.find(
        (c) => c.round === s.round + 1
          && c.conference === s.conference
          && c.teams.some((t) => t.id === s.winnerId),
      );
      s.nextSeriesId = next?.seriesId ?? null;
    }
    for (const t of s.teams) {
      t.nextSeriesId = s.nextSeriesId;
    }
  }

  const finals = series.find((s) => s.round === 4);
  const champion = finals?.winnerId
    ? {
      id: finals.winnerId,
      abbr: finals.winnerId,
      seriesWins: finals.teams.find((t) => t.id === finals.winnerId)?.seriesWins ?? 0,
    }
    : null;

  const teamCount = new Set(playoffGames.map((g) => g.team)).size;

  return {
    season: BRACKET_SEASON,
    series,
    champion,
    teamCount,
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

/** Load and derive bracket from local archive files. */
export async function loadPlayoffBracketFromArchive() {
  const [playoffDoc, regularGames] = await Promise.all([
    fetchJson(PLAYOFF_GAMES_URL),
    loadRegularSeasonArchiveGames().catch(() => []),
  ]);
  const playoffGames = playoffDoc?.games ?? [];
  const standings = computeStandings(regularGames);
  const playoffTeamIds = [...new Set(playoffGames.map((g) => g.team))];
  const seeds = seedMapFromStandings(standings, playoffTeamIds);
  return buildBracketFromGames(playoffGames, seeds);
}

export function ensurePlayoffBracketLoaded() {
  if (!bracketLoadPromise) {
    bracketLoadPromise = loadPlayoffBracketFromArchive().catch((err) => {
      bracketLoadPromise = null;
      throw err;
    });
  }
  return bracketLoadPromise;
}

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function teamCardHtml(team, teamMeta) {
  const info = teamMeta?.(team.id) ?? {};
  const color = info.colors?.primary || '#5da396';
  const abbr = info.abbreviation ?? team.abbr ?? team.id;
  const name = info.name ? `${info.city ?? ''} ${info.name}`.trim() : abbr;
  const cls = team.winner ? 'sd-bracket__team is-winner' : 'sd-bracket__team is-loser';
  const seed = team.seed != null ? team.seed : '—';
  return `
    <button type="button" class="${cls}" data-team-id="${esc(team.id)}" style="--team-color:${esc(color)}"
      title="${esc(name)} · ${team.seriesWins} series wins"
      aria-label="View ${esc(abbr)} matchup">
      <span class="sd-bracket__seed">${esc(seed)}</span>
      <span class="sd-bracket__abbr">${esc(abbr)}</span>
      <span class="sd-bracket__wins">${esc(team.seriesWins)}</span>
    </button>`;
}

function seriesHtml(series, teamMeta) {
  const row = seriesRowSpan(series.round, series.slot);
  const col = gridColumnFor(series.round, series.conference);
  const cards = series.teams.map((t) => teamCardHtml(t, teamMeta)).join('');
  return `
    <div class="sd-bracket__series"
      data-series-id="${esc(series.seriesId)}"
      data-round="${series.round}"
      data-conference="${series.conference ?? 'finals'}"
      data-next-series="${esc(series.nextSeriesId ?? '')}"
      style="grid-column:${col};grid-row:${row} / span 2">
      ${cards}
    </div>`;
}

function centerHtml(bracket, teamMeta) {
  const champ = bracket.champion;
  const info = champ ? teamMeta?.(champ.id) : null;
  const abbr = info?.abbreviation ?? champ?.abbr ?? '—';
  const color = info?.colors?.primary || '#5da396';
  const finals = bracket.series.find((s) => s.round === 4);
  const cards = finals
    ? finals.teams.map((t) => teamCardHtml(t, teamMeta)).join('')
    : '';

  return `
    <div class="sd-bracket__center" style="grid-column:4;grid-row:${CF_ROW_START} / span 2">
      <div class="sd-bracket__trophy" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4">
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/>
          <path d="M5 4H3v2a4 4 0 0 0 4 4M19 4h2v2a4 4 0 0 1-4 4"/>
        </svg>
      </div>
      <p class="sd-bracket__center-label">${esc(bracket.season)} Champion</p>
      <p class="sd-bracket__center-champ" style="--team-color:${esc(color)}">${esc(abbr)}</p>
      ${finals ? `<div class="sd-bracket__finals-series" data-series-id="${esc(finals.seriesId)}">${cards}</div>` : ''}
    </div>`;
}

function drawBracketLines(root) {
  const svg = root.querySelector('.sd-bracket__lines');
  const grid = root.querySelector('.sd-bracket__grid');
  if (!svg || !grid) return;

  const rootRect = root.getBoundingClientRect();
  const w = rootRect.width;
  const h = rootRect.height;
  if (w < 10 || h < 10) return;

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = '';

  const midY = (el) => {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2 - rootRect.top;
  };
  const edgeX = (el, side) => {
    const r = el.getBoundingClientRect();
    if (side === 'right') return r.right - rootRect.left;
    if (side === 'left') return r.left - rootRect.left;
    return r.left + r.width / 2 - rootRect.left;
  };

  const paths = [];
  grid.querySelectorAll('.sd-bracket__series[data-next-series]').forEach((fromEl) => {
    const nextId = fromEl.dataset.nextSeries;
    if (!nextId) return;
    const toEl = grid.querySelector(`.sd-bracket__series[data-series-id="${nextId}"]`)
      || grid.querySelector(`.sd-bracket__finals-series[data-series-id="${nextId}"]`);
    if (!toEl) return;

    const conf = fromEl.dataset.conference;
    const fromWinner = fromEl.querySelector('.sd-bracket__team.is-winner') || fromEl;
    const y1 = midY(fromWinner);
    const y2 = midY(toEl.querySelector('.sd-bracket__team.is-winner') || toEl);

    if (conf === 'west') {
      const x1 = edgeX(fromEl, 'right');
      const x2 = edgeX(toEl, 'left');
      const mid = x1 + (x2 - x1) * 0.45;
      paths.push(`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`);
    } else if (conf === 'east') {
      const x1 = edgeX(fromEl, 'left');
      const x2 = edgeX(toEl, 'right');
      const mid = x1 - (x1 - x2) * 0.45;
      paths.push(`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`);
    }
  });

  const westCf = grid.querySelector('.sd-bracket__series[data-round="3"][data-conference="west"]');
  const eastCf = grid.querySelector('.sd-bracket__series[data-round="3"][data-conference="east"]');
  const finalsEl = grid.querySelector('.sd-bracket__finals-series');
  const center = grid.querySelector('.sd-bracket__center');

  function teamMidY(parent, teamId) {
    if (!parent) return null;
    const el = teamId
      ? parent.querySelector(`.sd-bracket__team[data-team-id="${teamId}"]`)
      : parent.querySelector('.sd-bracket__team.is-winner');
    return midY(el || parent);
  }

  if (westCf && (finalsEl || center)) {
    const winnerId = westCf.querySelector('.sd-bracket__team.is-winner')?.dataset.teamId;
    const y1 = teamMidY(westCf, winnerId);
    const y2 = teamMidY(finalsEl || center, winnerId);
    const x1 = edgeX(westCf, 'right');
    const x2 = edgeX(finalsEl || center, 'left');
    const mid = x1 + (x2 - x1) * 0.5;
    paths.push(`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`);
  }
  if (eastCf && (finalsEl || center)) {
    const winnerId = eastCf.querySelector('.sd-bracket__team.is-winner')?.dataset.teamId;
    const y1 = teamMidY(eastCf, winnerId);
    const y2 = teamMidY(finalsEl || center, winnerId);
    const x1 = edgeX(eastCf, 'left');
    const x2 = edgeX(finalsEl || center, 'right');
    const mid = x1 - (x1 - x2) * 0.5;
    paths.push(`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`);
  }

  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'sd-bracket__line');
    svg.appendChild(path);
  }
}

function bindBracketClicks(root, onMatchupSelect) {
  if (!onMatchupSelect) return;
  root.querySelectorAll('.sd-bracket__team').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const host = btn.closest('[data-series-id]');
      const seriesId = host?.dataset.seriesId;
      const teamId = btn.dataset.teamId;
      if (seriesId && teamId) onMatchupSelect(seriesId, teamId);
    });
  });
}

function bindBracketHover(root) {
  root.querySelectorAll('.sd-bracket__series').forEach((seriesEl) => {
    seriesEl.addEventListener('mouseenter', () => {
      root.classList.add('is-highlighting');
      seriesEl.classList.add('is-active');
      const nextId = seriesEl.dataset.nextSeries;
      if (nextId) {
        root.querySelector(`.sd-bracket__series[data-series-id="${nextId}"]`)?.classList.add('is-path');
      }
    });
    seriesEl.addEventListener('mouseleave', () => {
      root.classList.remove('is-highlighting');
      root.querySelectorAll('.is-active, .is-path').forEach((el) => {
        el.classList.remove('is-active', 'is-path');
      });
    });
  });
}

/**
 * @param {object} opts
 * @param {HTMLElement|null} opts.wrap chart wrap element
 * @param {object|null} opts.bracket
 * @param {function} opts.teamMeta (id) => team record
 * @param {function} [opts.onMatchupSelect] (seriesId, clickedTeamId) => void
 */
export function renderPlayoffBracket({ wrap, bracket, teamMeta, onMatchupSelect }) {
  const root = wrap?.querySelector('#playoff-bracket');
  const grid = root?.querySelector('.sd-bracket__grid');
  const canvas = wrap?.querySelector('#hero-chart');
  const empty = wrap?.querySelector('#hero-chart-empty');
  if (!root || !grid || !wrap) return;

  wrap.classList.add('has-playoff-bracket');
  if (canvas) canvas.hidden = true;
  if (empty) empty.hidden = true;
  root.hidden = false;

  if (!bracket?.series?.length) {
    grid.innerHTML = '<p class="sd-bracket__loading">Loading playoff bracket…</p>';
    return;
  }

  const roundSeries = bracket.series.filter((s) => s.round < 4);
  grid.innerHTML = roundSeries.map((s) => seriesHtml(s, teamMeta)).join('') + centerHtml(bracket, teamMeta);

  bindBracketHover(root);
  bindBracketClicks(root, onMatchupSelect);
  if (!root.dataset.resizeBound) {
    root.dataset.resizeBound = '1';
    window.addEventListener('resize', scheduleBracketLineRedraw);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => scheduleBracketLineRedraw());
      observer.observe(root);
    }
  }
  requestAnimationFrame(() => {
    drawBracketLines(root);
  });
}

export function hidePlayoffBracket(wrap) {
  const root = wrap?.querySelector('#playoff-bracket');
  const canvas = wrap?.querySelector('#hero-chart');
  if (!wrap) return;
  wrap.classList.remove('has-playoff-bracket');
  if (root) root.hidden = true;
  if (canvas) canvas.hidden = false;
}

export function scheduleBracketLineRedraw() {
  const root = document.querySelector('#playoff-bracket:not([hidden])');
  if (root) requestAnimationFrame(() => drawBracketLines(root));
}
