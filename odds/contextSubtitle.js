/** Concise hero context strip — scope · record · one supporting fact. */

import { STAT_SCOPE_LABELS, archiveSampleLabel } from './range.js';

function formatAsOfShort(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.toLocaleDateString(undefined, { month: 'short' });
  const day = d.getDate();
  const yy = String(d.getFullYear()).slice(-2);
  return `Through ${month} ${day} '${yy}`;
}

function recordFromGames(games) {
  if (!games?.length) return null;
  const wins = games.filter((g) => g.result === 'W').length;
  return `${wins}–${games.length - wins}`;
}

function referenceDay(iso) {
  if (!iso) return new Date();
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday-start calendar week — matches server aggregation. */
function calendarWeekBounds(referenceDate) {
  const ref = referenceDay(referenceDate);
  const weekday = (ref.getDay() + 6) % 7;
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - weekday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { startIso: toIsoDate(start), endIso: toIsoDate(end) };
}

function calendarMonthBounds(referenceDate) {
  const ref = referenceDay(referenceDate);
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { startIso: toIsoDate(start), endIso: toIsoDate(end) };
}

function gamesInDateWindow(games, startIso, endIso) {
  if (!games?.length || !startIso || !endIso) return [];
  return games.filter((g) => {
    const d = g.date?.slice(0, 10);
    return d && d >= startIso && d <= endIso;
  });
}

function scheduledGameLabel(count) {
  const n = Number(count) || 0;
  return `${n} game${n === 1 ? '' : 's'} scheduled`;
}

function nbaSeasonEndingYear(referenceDate) {
  const ref = referenceDay(referenceDate);
  const startYear = ref.getMonth() >= 9 ? ref.getFullYear() : ref.getFullYear() - 1;
  return startYear + 1;
}

function isSeasonComplete(referenceDate, postseasonGames) {
  if (postseasonGames?.length) return true;
  const ref = referenceDay(referenceDate);
  const endYear = nbaSeasonEndingYear(referenceDate);
  if (ref.getFullYear() > endYear) return true;
  if (ref.getFullYear() === endYear && ref.getMonth() >= 6) return true;
  return false;
}

/**
 * Structured Solo > Season subtitle — regular/postseason scope plus per-round series chips.
 * @returns {{ regularGames: number, postseasonNote: 'none'|'no'|'active', roundSegments: Array<{ label: string, record: string, tone: 'win'|'loss'|'neutral' }> }}
 */
export function formatSoloSeasonSubtitle({
  regularGames,
  postseasonGames,
  playoffSeriesResults,
  seasonStatus,
}) {
  const reg = Number(regularGames) || 0;
  const post = Number(postseasonGames) || 0;
  const complete = seasonStatus === 'complete';
  const roundSegments = (playoffSeriesResults || []).map((row) => {
    const record = row.record ?? `${row.wins ?? 0}–${row.losses ?? 0}`;
    let tone = 'neutral';
    if (row.won) tone = 'win';
    else if (row.lost) tone = 'loss';
    return {
      label: row.label ?? 'R?',
      record,
      tone,
    };
  });

  let postseasonNote = 'none';
  if (complete && post === 0 && roundSegments.length === 0) {
    postseasonNote = 'no';
  } else if (post > 0 || roundSegments.length > 0) {
    postseasonNote = 'active';
  }

  return { regularGames: reg, postseasonNote, roundSegments };
}

function soloSeasonRoundToneClass(tone) {
  if (tone === 'win') return 'is-win';
  if (tone === 'loss') return 'is-loss';
  return '';
}

function soloSeasonRoundDisplayLabel(label) {
  const key = String(label || '').trim();
  if (key === 'Finals') return 'FIN';
  return key || 'R?';
}

function escSubtitleHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function buildSoloSeasonSubtitle(scopeLabel, formatted) {
  const { regularGames, postseasonNote, roundSegments } = formatted;
  if (!regularGames && postseasonNote === 'none' && !roundSegments.length) {
    return { caption: scopeLabel || '—', suffix: '', suffixHtml: '', seasonStrip: false };
  }

  const sep = '<span class="sd-season-strip__sep" aria-hidden="true">·</span>';
  const parts = [
    `<span class="sd-season-strip__count">${escSubtitleHtml(`${regularGames} regular`)}</span>`,
  ];

  if (postseasonNote === 'no') {
    parts.push(`${sep}<span class="sd-season-strip__count">${escSubtitleHtml('No postseason')}</span>`);
  } else if (postseasonNote === 'active') {
    parts.push(`${sep}<span class="sd-season-strip__post">POSTSEASON</span>`);
  }

  if (roundSegments.length) {
    const chips = roundSegments.map((round) => {
      const toneCls = soloSeasonRoundToneClass(round.tone);
      const label = escSubtitleHtml(soloSeasonRoundDisplayLabel(round.label));
      const record = escSubtitleHtml(round.record);
      return `<span class="sd-season-round-chip${toneCls ? ` ${toneCls}` : ''}"><span class="sd-season-round-chip__label">${label}</span><span class="sd-season-round-chip__score">${record}</span></span>`;
    }).join('');
    if (postseasonNote !== 'active') {
      parts.push(`${sep}<span class="sd-season-strip__post">POSTSEASON</span>`);
    }
    parts.push(`${sep}<span class="sd-season-strip__rounds">${chips}</span>`);
  }

  const suffixHtml = `<span class="sd-season-strip">${parts.join('')}</span>`;

  return {
    caption: scopeLabel,
    suffix: '',
    suffixHtml,
    seasonStrip: true,
  };
}

function soloSeasonStatus(referenceDate, rangeStats) {
  const postCount = rangeStats?.postseasonGames ?? 0;
  const postseasonStub = postCount > 0 ? [{ seasonType: 'Playoffs' }] : [];
  return isSeasonComplete(referenceDate, postseasonStub) ? 'complete' : 'in_progress';
}

function seasonWindowGames(games, referenceDate) {
  if (!games?.length) return [];
  const ref = referenceDay(referenceDate);
  const startYear = ref.getMonth() >= 9 ? ref.getFullYear() : ref.getFullYear() - 1;
  const seasonStart = `${startYear}-10-01`;
  const end = String(referenceDate || '').slice(0, 10)
    || `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(ref.getDate()).padStart(2, '0')}`;
  return games.filter((g) => {
    const d = g.date?.slice(0, 10);
    return d && d >= seasonStart && d <= end;
  });
}

function splitSeasonType(games) {
  const regular = games.filter((g) => (g.seasonType || '') !== 'Playoffs');
  const postseason = games.filter((g) => (g.seasonType || '') === 'Playoffs');
  return { regular, postseason };
}

function latestGameSummary(game, abbrFor) {
  if (!game) return null;
  const opp = abbrFor?.(game.opponent) ?? game.opponent;
  return `${game.result} ${game.teamScore}–${game.opponentScore} vs ${opp}`;
}

function formatMoveChip(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return null;
  const n = Number(amount);
  if (n === 0) return null;
  return `${n > 0 ? '+' : ''}${n.toFixed(1)} move`;
}

function archiveSeasonCount(seasonBoundaries, games) {
  if (Array.isArray(seasonBoundaries) && seasonBoundaries.length) {
    return seasonBoundaries.length + 1;
  }
  if (!games?.length) return null;
  const years = new Set();
  for (const g of games) {
    const d = referenceDay(g.date);
    const seasonStart = d.getMonth() >= 9 ? d.getFullYear() : d.getFullYear() - 1;
    years.add(seasonStart);
  }
  return years.size || null;
}

function formatDualRecord(abbrA, recordA, abbrB, recordB) {
  if (!recordA && !recordB) return null;
  return `${abbrA} ${recordA ?? '—'} / ${abbrB} ${recordB ?? '—'}`;
}

function formatMatchupLead(h2h, abbrA, abbrB) {
  if (!h2h?.count) return null;
  const wA = h2h.teamAWins ?? 0;
  const wB = h2h.teamBWins ?? 0;
  if (wA === wB) return `Matchup tied ${wA}–${wB}`;
  const leader = wA > wB ? abbrA : abbrB;
  return `Matchup ${leader} ${Math.max(wA, wB)}–${Math.min(wA, wB)}`;
}

function formatPostseasonLine(post, abbrFor) {
  if (!post?.count) return null;
  if (post.leaderId) {
    const abbr = abbrFor?.(post.leaderId) ?? post.leaderId;
    return `Postseason ${abbr} ${post.record ?? post.recordNeutral}`;
  }
  return `Postseason tied ${post.recordNeutral ?? post.record}`;
}

function formatRegSeasonLine(reg, abbrFor) {
  if (!reg?.count) return null;
  if (!reg.leaderId) {
    return `Regular season tied ${reg.recordNeutral ?? reg.record}`;
  }
  const abbr = abbrFor?.(reg.leaderId) ?? reg.leaderId;
  return `Regular season ${abbr} ${reg.record ?? reg.recordNeutral}`;
}

function buildSubtitle(segments) {
  const parts = segments.filter(Boolean);
  if (!parts.length) return { caption: '—', suffix: '' };
  if (parts.length === 1) return { caption: parts[0], suffix: '' };
  if (parts.length === 2) return { caption: parts[0], suffix: parts[1] };
  return { caption: `${parts[0]} · ${parts[1]}`, suffix: parts[2] };
}

function soloContextSubtitle({
  rangePreset,
  rangeStats,
  teamGames,
  seasonBoundaries,
  referenceDate,
  teamAbbr,
  latestGame,
  latestMove,
  todayIdle,
  outlook,
  status,
  abbrFor,
}) {
  const preset = rangePreset || 'week';
  const scope = preset === 'today' && latestGame && !todayIdle
    ? 'Latest result'
    : (STAT_SCOPE_LABELS[preset] ?? preset);

  if (status === 'pick-team') {
    return buildSubtitle(['Select a team']);
  }
  if (status === 'loading') {
    return buildSubtitle([scope, 'Loading…']);
  }
  if (status === 'error') {
    return buildSubtitle([scope, 'Summary unavailable']);
  }
  if (status === 'empty') {
    if (todayIdle && outlook) {
      return buildSubtitle(['Latest', outlook]);
    }
    return buildSubtitle([scope, todayIdle ? 'No recent game on reference date' : 'No games in range']);
  }

  if (preset === 'season') {
    const seasonGames = seasonWindowGames(teamGames, referenceDate);
    const { regular, postseason } = splitSeasonType(seasonGames);
    const seasonStatus = soloSeasonStatus(referenceDate, rangeStats);
    const regularGames = rangeStats?.regularGames ?? regular.length;
    const postseasonGames = rangeStats?.postseasonGames ?? postseason.length;
    const playoffSeriesResults = rangeStats?.playoffSeriesResults ?? [];

    const formatted = formatSoloSeasonSubtitle({
      regularGames,
      postseasonGames,
      playoffSeriesResults,
      seasonStatus,
    });
    return buildSoloSeasonSubtitle(scope, formatted);
  }

  if (preset === 'all') {
    const record = rangeStats?.record ?? recordFromGames(teamGames);
    const seasons = archiveSeasonCount(seasonBoundaries, teamGames);
    const sample = seasons ? `${seasons}-season sample` : 'Loaded archive';
    return buildSubtitle([archiveSampleLabel(seasons), record, sample]);
  }

  if (preset === 'month') {
    const { startIso, endIso } = calendarMonthBounds(referenceDate);
    const monthGames = gamesInDateWindow(teamGames, startIso, endIso);
    return buildSubtitle([scope, scheduledGameLabel(monthGames.length)]);
  }

  if (preset === 'week') {
    const { startIso, endIso } = calendarWeekBounds(referenceDate);
    const weekGames = gamesInDateWindow(teamGames, startIso, endIso);
    return buildSubtitle([scope, scheduledGameLabel(weekGames.length)]);
  }

  if (preset === 'today') {
    if (latestGame) {
      const summary = latestGameSummary(latestGame, abbrFor);
      const move = formatMoveChip(latestMove);
      return buildSubtitle(['Latest result', summary, move]);
    }
    if (todayIdle && outlook) {
      return buildSubtitle(['Latest', outlook]);
    }
    return buildSubtitle(['Latest', 'No recent game on reference date']);
  }

  const record = rangeStats?.record;
  return buildSubtitle([scope, record]);
}

function matchupContextSubtitle({
  rangePreset,
  rangeStats,
  matchupSummary,
  h2hBreakdown,
  teamA,
  teamB,
  abbrFor,
  status,
  archiveMeta,
}) {
  const preset = rangePreset === 'all' ? 'all' : 'season';
  const scope = STAT_SCOPE_LABELS[preset] ?? 'Current Season';
  const abbrA = abbrFor?.(teamA) ?? teamA;
  const abbrB = abbrFor?.(teamB) ?? teamB;
  const statsA = rangeStats?.teamA;
  const statsB = rangeStats?.teamB;
  const core = formatDualRecord(abbrA, statsA?.record, abbrB, statsB?.record);
  const h2h = matchupSummary;
  const breakdown = h2hBreakdown;
  const post = breakdown?.postseason;
  const reg = breakdown?.regularSeason;

  if (status === 'loading') {
    return buildSubtitle([scope, 'Loading…']);
  }
  if (status === 'error') {
    return buildSubtitle([`${abbrA} vs ${abbrB}`, 'Summary unavailable']);
  }
  if (status === 'empty') {
    return buildSubtitle([`${abbrA} vs ${abbrB}`, 'No overlapping games']);
  }

  if (preset === 'all') {
    const suffix = formatMatchupLead(h2h, abbrA, abbrB);
    const seasons = archiveMeta?.seasonCount;
    return buildSubtitle([archiveSampleLabel(seasons), core, suffix]);
  }

  let suffix = formatPostseasonLine(post, abbrFor);
  if (!suffix && reg?.count) {
    suffix = formatRegSeasonLine(reg, abbrFor);
  }
  if (!suffix && h2h?.count) {
    suffix = `${h2h.count} meeting${h2h.count === 1 ? '' : 's'}`;
  }
  return buildSubtitle([scope, core, suffix]);
}

function overviewContextSubtitle({
  teamCount,
  topMover,
  topStreak,
  referenceDate,
  status,
  abbrFor,
  playoffBracket,
}) {
  if (status === 'loading' && !playoffBracket?.champion) {
    return buildSubtitle(['2026 Playoff bracket', 'Loading…']);
  }

  if (playoffBracket?.champion) {
    const abbr = abbrFor?.(playoffBracket.champion.id) ?? playoffBracket.champion.abbr;
    const teams = playoffBracket.teamCount ?? 16;
    return buildSubtitle(['2026 Playoff bracket', `${teams} teams`, `Champion: ${abbr}`]);
  }

  const asOf = formatAsOfShort(referenceDate);
  const teams = teamCount != null ? `${teamCount} teams` : null;
  const mover = topMover?.teamId != null && topMover?.delta != null
    ? (() => {
      const abbr = abbrFor?.(topMover.teamId) ?? topMover.teamId;
      const delta = topMover.delta;
      const deltaText = `${delta > 0 ? '+' : ''}${Number(delta).toFixed(1)}%`;
      return `Biggest mover: ${abbr} ${deltaText}`;
    })()
    : null;
  const streak = topStreak?.teamId && topStreak?.length
    ? (() => {
      const abbr = abbrFor?.(topStreak.teamId) ?? topStreak.teamId;
      return `Top streak: ${abbr} ${topStreak.result}${topStreak.length}`;
    })()
    : null;

  if (mover) {
    return buildSubtitle(['League overview', mover, asOf]);
  }
  if (streak) {
    return buildSubtitle(['League overview', streak, asOf]);
  }
  return buildSubtitle(['League overview', teams, asOf]);
}

/**
 * @returns {{ caption: string, suffix: string }}
 */
export function getContextSubtitle({
  mode,
  range,
  team,
  opponent,
  stats,
  matchupSummary,
  archiveMeta,
  status = 'ready',
  playoffBracket = null,
} = {}) {
  const rangePreset = range?.preset;
  const referenceDate = archiveMeta?.referenceDate;

  if (mode === 'overview') {
    return overviewContextSubtitle({
      teamCount: stats?.teamCount,
      topMover: stats?.topMover,
      topStreak: stats?.topStreak,
      referenceDate: archiveMeta?.asOf ?? referenceDate,
      status,
      abbrFor: archiveMeta?.abbrFor,
      playoffBracket,
    });
  }

  if (mode === 'matchup') {
    return matchupContextSubtitle({
      rangePreset,
      rangeStats: stats?.rangeStats,
      matchupSummary,
      h2hBreakdown: stats?.h2hBreakdown,
      teamA: team?.id ?? team,
      teamB: opponent?.id ?? opponent,
      abbrFor: archiveMeta?.abbrFor,
      status,
      archiveMeta,
    });
  }

  return soloContextSubtitle({
    rangePreset,
    rangeStats: stats?.rangeStats,
    teamGames: stats?.teamGames,
    seasonBoundaries: archiveMeta?.seasonBoundaries,
    referenceDate,
    teamAbbr: team?.abbreviation ?? team,
    latestGame: stats?.latestGame,
    latestMove: stats?.latestMove,
    todayIdle: stats?.todayIdle,
    outlook: stats?.outlook,
    status,
    abbrFor: archiveMeta?.abbrFor,
  });
}

export function applyContextSubtitle({ caption, suffix = '', suffixHtml = null, seasonStrip = false }) {
  const capEl = document.querySelector('#hero-chart-caption');
  const netEl = document.querySelector('#hero-net-summary');
  const metaEl = document.querySelector('.sd-hero__chart-meta');
  const introEl = document.querySelector('.sd-hero__chart-intro');
  if (capEl) {
    capEl.textContent = caption || '—';
    capEl.classList.toggle('is-season-scope', seasonStrip);
  }
  if (netEl) {
    if (suffixHtml) {
      netEl.innerHTML = suffixHtml;
    } else {
      netEl.innerHTML = suffix
        ? `<span class="sd-hero__net-line--muted">${suffix}</span>`
        : '';
    }
    netEl.classList.toggle('is-season-strip', seasonStrip);
    netEl.classList.toggle('is-loaded', Boolean(suffix || suffixHtml));
  }
  if (metaEl) {
    metaEl.classList.toggle('is-season-context', seasonStrip);
  }
  if (introEl) {
    introEl.classList.toggle('is-season-context', seasonStrip);
  }
}
