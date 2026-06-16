/**
 * Derived regular-season standings from local archive games.
 * Playoff games are excluded from all rank calculations.
 */

const REGULAR_GAMES_URL = '/data/games-2026.json';
const PLAYOFF_SEASON_TYPE = 'Playoffs';

export const NBA_EAST = new Set([
  'BOS', 'NYK', 'PHI', 'BKN', 'TOR', 'MIA', 'ORL', 'ATL', 'CHI', 'CLE', 'DET', 'IND', 'MIL', 'CHA', 'WAS',
]);

let regularGamesCache = null;
let standingsCache = null;

function fetchJson(url) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`Failed to load ${url}`);
    return res.json();
  });
}

/** NBA season ending year for a reference calendar date (e.g. 2026 for 2025–26). */
export function nbaSeasonEndingYear(referenceDate) {
  const ref = referenceDate
    ? new Date(`${String(referenceDate).slice(0, 10)}T12:00:00`)
    : new Date();
  if (Number.isNaN(ref.getTime())) return new Date().getFullYear();
  const year = ref.getFullYear();
  return ref.getMonth() >= 9 ? year + 1 : year;
}

export function teamConference(teamId) {
  return NBA_EAST.has(String(teamId || '').toUpperCase()) ? 'east' : 'west';
}

/** One row per game — league JSON stores both team perspectives. */
export function dedupeRegularSeasonGames(games) {
  const seen = new Set();
  const deduped = [];
  for (const game of games || []) {
    if ((game.seasonType || '') === PLAYOFF_SEASON_TYPE) continue;
    const id = game.id || '';
    const key = id.includes('-')
      ? id.slice(0, id.lastIndexOf('-'))
      : `${game.date}|${[game.team, game.opponent].sort().join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(game);
  }
  return deduped;
}

/**
 * Wins/losses map from deduped regular-season game rows.
 * @returns {{ wins: Record<string, number>, losses: Record<string, number> }}
 */
export function computeStandingsFromGames(games) {
  const wins = {};
  const losses = {};
  const deduped = dedupeRegularSeasonGames(games);
  for (const g of deduped) {
    const team = g.team;
    const opp = g.opponent;
    wins[team] = wins[team] ?? 0;
    losses[team] = losses[team] ?? 0;
    wins[opp] = wins[opp] ?? 0;
    losses[opp] = losses[opp] ?? 0;
    if (g.result === 'W') {
      wins[team] += 1;
      losses[opp] += 1;
    } else {
      losses[team] += 1;
      wins[opp] += 1;
    }
  }
  return { wins, losses };
}

function filterGamesForSeason(games, seasonYear) {
  const endingYear = Number(seasonYear);
  const startYear = endingYear - 1;
  const seasonLabel = `${startYear}-${String(endingYear).slice(-2)}`;
  return (games || []).filter((g) => {
    if ((g.seasonType || '') === PLAYOFF_SEASON_TYPE) return false;
    if (g.seasonLabel === seasonLabel) return true;
    if (Number(g.season) === startYear) return true;
    return false;
  });
}

function compareStandingsRows(a, b) {
  if (b.winPct !== a.winPct) return b.winPct - a.winPct;
  if (b.regularSeasonWins !== a.regularSeasonWins) return b.regularSeasonWins - a.regularSeasonWins;
  return a.regularSeasonLosses - b.regularSeasonLosses;
}

/**
 * Regular-season standings for one NBA season.
 * @param {number} seasonYear — season ending year (e.g. 2026 for 2025–26)
 * @param {object[]} [games] — optional preloaded game rows
 * @param {{ abbrFor?: (teamId: string) => string }} [opts]
 */
export function getSeasonStandings(seasonYear, games, { abbrFor } = {}) {
  const scoped = filterGamesForSeason(games, seasonYear);
  const { wins, losses } = computeStandingsFromGames(scoped);
  const teamIds = new Set([...Object.keys(wins), ...Object.keys(losses)]);

  const rows = [];
  for (const teamId of teamIds) {
    const regularSeasonWins = wins[teamId] ?? 0;
    const regularSeasonLosses = losses[teamId] ?? 0;
    const played = regularSeasonWins + regularSeasonLosses;
    const winPct = played ? regularSeasonWins / played : 0;
    const conference = teamConference(teamId);
    rows.push({
      teamId,
      teamAbbr: abbrFor?.(teamId) ?? teamId,
      conference,
      regularSeasonWins,
      regularSeasonLosses,
      winPct,
      conferenceRank: null,
      leagueRank: null,
    });
  }

  const east = rows.filter((r) => r.conference === 'east').sort(compareStandingsRows);
  const west = rows.filter((r) => r.conference === 'west').sort(compareStandingsRows);
  east.forEach((row, i) => { row.conferenceRank = i + 1; });
  west.forEach((row, i) => { row.conferenceRank = i + 1; });

  const league = [...rows].sort(compareStandingsRows);
  league.forEach((row, i) => { row.leagueRank = i + 1; });

  const byTeamId = Object.fromEntries(rows.map((row) => [row.teamId.toUpperCase(), row]));

  return {
    seasonYear: Number(seasonYear),
    teams: rows,
    byTeamId,
    east,
    west,
  };
}

export function getTeamStandingsRow(standings, teamId) {
  if (!standings?.byTeamId || !teamId) return null;
  return standings.byTeamId[String(teamId).toUpperCase()] ?? null;
}

/** Top N per conference for compact overview panels. */
export function conferenceStandingsSnapshot(standings, limit = 4) {
  if (!standings) return { east: [], west: [] };
  return {
    east: standings.east.slice(0, limit),
    west: standings.west.slice(0, limit),
  };
}

async function loadRegularSeasonGames() {
  if (regularGamesCache) return regularGamesCache;
  const doc = await fetchJson(REGULAR_GAMES_URL).catch(() => ({ games: [] }));
  regularGamesCache = doc?.games ?? [];
  return regularGamesCache;
}

/**
 * Load standings from the local regular-season archive (cached).
 * @param {number} [seasonYear]
 * @param {{ abbrFor?: (teamId: string) => string }} [opts]
 */
export async function ensureSeasonStandingsLoaded(seasonYear, opts = {}) {
  const year = Number(seasonYear) || nbaSeasonEndingYear();
  const games = await loadRegularSeasonGames();
  if (!standingsCache || standingsCache.seasonYear !== year) {
    standingsCache = getSeasonStandings(year, games, opts);
  } else if (opts.abbrFor) {
    for (const row of standingsCache.teams) {
      row.teamAbbr = opts.abbrFor(row.teamId) ?? row.teamId;
    }
  }
  return standingsCache;
}

/** Share regular-season games with bracket loader (deduped). */
export async function loadRegularSeasonArchiveGames() {
  return loadRegularSeasonGames();
}
