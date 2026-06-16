/** Home/away matchup labels — Event Tape, comparison rows, tooltips. */

const MATCHUP_TOKEN_RE = /^([A-Z]{2,3})\s+(?:@|vs\.?)\s+([A-Z]{2,3})$/i;

export function parseMatchupHomeFromString(matchup, teamId) {
  const m = String(matchup || '').trim();
  const team = String(teamId || '').toUpperCase();
  if (!m || !team) return null;

  const match = m.match(MATCHUP_TOKEN_RE);
  if (!match) return null;

  const first = match[1].toUpperCase();
  const second = match[2].toUpperCase();
  if (team !== first && team !== second) return null;

  if (/@/.test(m)) {
    if (team === first) return false;
    if (team === second) return true;
    return null;
  }
  if (/vs\.?/i.test(m)) {
    if (team === first) return true;
    if (team === second) return false;
  }
  return null;
}

export function resolveGameIsHome(game, selectedTeamId) {
  if (!game) return null;
  if (typeof game.isHome === 'boolean') return game.isHome;

  const team = String(selectedTeamId || game.team || '').toUpperCase();
  if (!team) return null;

  const homeId = game.homeTeamId ?? game.homeTeam ?? game.home_abbr;
  if (homeId) return team === String(homeId).toUpperCase();

  const awayId = game.awayTeamId ?? game.awayTeam ?? game.away_abbr;
  if (awayId) return team !== String(awayId).toUpperCase();

  const fromMatchup = parseMatchupHomeFromString(game.matchup, team);
  if (fromMatchup !== null) return fromMatchup;

  return null;
}

export function formatGameMatchupLabel(game, selectedTeamId, { abbrev = (id) => id, soloCompact = false } = {}) {
  const teamId = String(selectedTeamId || game?.team || '').toUpperCase();
  const oppId = String(game?.opponent || game?.opponentId || '').toUpperCase();
  const teamAbbr = abbrev(teamId || game?.team);
  const oppAbbr = abbrev(oppId);

  if (!teamId || !oppId) {
    if (soloCompact && oppId) return `vs ${oppAbbr}`;
    if (teamId && oppId) return `${teamAbbr} vs ${oppAbbr}`;
    return teamAbbr || oppAbbr || '—';
  }

  const isHome = resolveGameIsHome(game, teamId);
  if (isHome === true) return `${teamAbbr} vs ${oppAbbr}`;
  if (isHome === false) return `${teamAbbr} at ${oppAbbr}`;

  if (soloCompact) return `vs ${oppAbbr}`;
  return `${teamAbbr} vs ${oppAbbr}`;
}
