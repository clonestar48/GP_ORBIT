# Orbit UX & Data Audit

**Date:** June 2026  
**Scope:** Solo, Matchup, and future League architecture (`odds/`, `lib/performance/`, APIs)  
**Intent:** Polish, consistency, and future-proofing — not a redesign.

The real NBA archive integration and current UX direction are sound (~85% there). This document inventories inconsistencies, prototype-era leftovers, simplification opportunities, and expansion paths.

---

## Executive summary

| Area | Health | Top issue |
|------|--------|-----------|
| State management | Good structure, some races | Async writers lack generation guards after fetch |
| Range logic | Aligned JS/Python | Duplicated labels + parallel `rangeLabel` implementations |
| Game Log | Solid | Ledger uses undeduped games; scope label mismatch |
| Tooltips | Functional | `tooltipMode` profiles unused; aggregated points misclassified |
| Opponent chips | Visually strong | Display-only; misleading note in Matchup mode |
| Performance | Acceptable for demo | Up to 4 performance fetches per Solo/Today load |
| League mode | Scaffolded only | Provider + resolution profile exist; no API or UI wiring |

**Recommended next passes (low risk):** dead-code removal, generation checks inside fetch writers, dedupe ledger input, fix copy/label mismatches, tooltip branch for aggregated points.

---

## 1. State management audit

### Architecture

Single mutable `state` object in `odds/main.js` (~50 fields). No store/reducer. `loadGeneration` counter partially guards concurrent `loadData()` calls.

**Core fields**

| Field | Role |
|-------|------|
| `heroMode` | `solo` \| `matchup` (default `matchup` in JS; HTML defaults differ) |
| `selectedTeamId`, `teamA`, `teamB` | Solo vs matchup team selection |
| `range` | Shared preset or custom `startDate`/`endDate` |
| `teamSeries`, `teamGames`, `gameLogGames` | Panel + solo hero data |
| `matchup` | Matchup hero payload |
| `contextOpponentId`, `contextSeries` | Ghost opponent overlay (solo) |
| `focusedGameLogKey`, `logFocusOpponent`, `logFocusDate` | Game Log drill-down |
| `lastPlayedGame` | Solo idle-today fallback |
| `homepageFeature` | Marquee headline (matchup) |
| `hoverHit`, `ghostHover`, `heroHitAreas` | Chart interaction |

### Transitions

**Solo → Matchup (`setHeroMode`)**

- Clears log focus; clears `homepageFeature` when entering solo.
- Rebuilds `range` with same preset but swaps `mode`/`metric` (`franchise`/`winPct` ↔ `matchup`/`index`).
- Matchup → Solo copies `teamA` → `selectedTeamId`.

**Matchup → Solo**

- `loadData` nulls `matchup`; ghost context cleared in matchup branch only.

**Team changes**

- Solo: `selectTeam` clears log focus → `loadData`.
- Matchup pickers: clear log focus, null `homepageFeature` → `loadData`.
- Game Log click (matchup): sets `teamA`/`teamB` + date window; does not change `heroMode`.

**Range changes**

- `setRange` clears log focus, rebuilds range, syncs preset buttons, `loadData`.
- Custom ranges (`preset: null` from Game Log): no preset button stays active (`syncRangeUi` matches `data-range` only).

**Game Log clicks (`focusGameFromLog`)**

- Sets `focusedGameLogKey`, `logFocusOpponent`, `logFocusDate`.
- Solo: `createRangeForGameDate` + franchise/winPct.
- Matchup: reassigns teams + matchup/index range for game window.
- Post-load: `applyLogGameChartFocus()` may trigger **double `renderHeroChart`**.

**Ghost opponent**

- Enabled in solo when `logFocusOpponent` is set **or** preset is `today` (`resolution.js`).
- Log focus **forces** ghost on any preset (intentional override of profile).
- `loadContextOpponent`: extra fetch; on **today without log focus**, uses full opponent franchise series (not H2H-filtered).
- `flipToContextOpponent` (chart click): swaps `selectedTeamId` to ghost team — **does not `clearLogFocus()`** (stale log-focus state possible).

**Reference date**

- Set once at init from `/api/teams` → `setReferenceDate` (`odds/range.js`).
- Client fallback: `new Date()` if unset — can drift from server after midnight or long-lived tabs.
- Server: `ORBIT_REFERENCE_DATE` explicit \| archive `auto` \| UTC `live` (`lib/performance/range.py`).

### Issues found

| Severity | Issue | Location |
|----------|-------|----------|
| **High** | `loadGeneration` checked before `finally` render, **not after fetch writers**. Stale `loadPanelData` / `loadContextOpponent` / `loadMatchupHero` can overwrite `state.*` after a newer interaction. No `AbortController`. | `main.js` `loadData` |
| Medium | Old chart data visible under loading skeleton (`setLoading` does not clear series). | `setLoading` |
| Medium | `flipToContextOpponent` leaves `logFocusOpponent` / `logFocusDate` on wrong team. | `main.js` |
| Low | HTML initial toggles: Solo + Week active; JS boots `matchup` + `today` until marquee + `sync*Ui`. | `index.html` vs `main.js` init |
| Low | `mode`/`metric` sent in query (`rangeToQuery`) but API ignores them; server hardcodes in provider. | `range.js`, `api/performance.py`, `local.py` |

### Dead / unused state paths

- `enterMatchupFromGame` — defined, never called.
- `opponentLabel` — unused helper.
- `GAME_LOG_VISIBLE` constant — unused (CSS variable `--sd-game-log-visible` drives layout).

### Duplicate fetches per `loadData`

| Mode | Sequential API calls |
|------|----------------------|
| Solo | Panel range + optional month (game log) + optional context opponent + optional `all` (last played) |
| Matchup | Panel (franchise winPct for `teamA`, game log only) + matchup hero |

Matchup panel fetch is required for Game Log but not for hero chart.

---

## 2. Range logic audit

### Presets (client ↔ server)

Both `odds/range.js` and `lib/performance/range.py` define aligned windows anchored to `reference_date()`:

| Preset | Window |
|--------|--------|
| Today | Reference day only |
| Week | Reference − 6 days → reference |
| Month | Reference − 29 days → reference |
| Season | Oct 1 of season-start year → reference |
| All | `1900-01-01` → reference (effective start = first game in archive) |

`RANGE_LABELS` duplicated in both files.

### Custom windows (Game Log)

`createRangeForGameDate` (`odds/range.js`):

- Game on reference “today” → `preset: 'today'`.
- Otherwise → **7-day window ending on game date**, `preset: null` (not smallest containing preset).

Chart resolution falls back to **week profile** when `preset` is null (`chartProfileForRange` → `resolveProfile('week')`). API `_apply_resolution` also uses `time_range or 'week'` for custom dates — fine for 7-day windows; wrong profile if custom spans widen later.

### Game Log scope split

On **Today** or **Week** presets, Game Log list uses **month** fetch (`gameLogGames`) while chart uses actual preset. Intentional UX decoupling; costs an extra fetch.

### Edge cases

| Scenario | Behavior |
|----------|----------|
| Offseason / no games in range | Solo idle-today + `loadLastPlayedGame`; empty states; flatline daily series still returned from API |
| Historical archive | `ORBIT_REFERENCE_DATE` / `auto` anchors presets to archive end (e.g. 2025-04-13) |
| Future machine date without env | `live` reference may query empty ranges |
| Empty custom window | API returns flatline points; chart draws; `gameCount` 0 |
| Custom range UI | No preset button highlighted; caption shows `YYYY-MM-DD – YYYY-MM-DD` |

### Cleanup opportunities

- Single source for `RANGE_LABELS` / `presetDates` (shared JSON or codegen).
- Unify `rangeLabel()` (client) with `RangeQuery.to_dict()['rangeLabel']` (server).
- Infer chart/API resolution profile from date span when `preset` is null.

---

## 3. Game Log audit

### Current behavior (end-to-end)

1. **Data:** `loadPanelData` → `teamGames` (chart range); optional `gameLogGames` (month when preset is today/week).
2. **Render:** `gamesForGameLog()` → sort → `dedupeGameLogEntries` → row buttons with badges (streak peak, blowout, largest move).
3. **Click:** delegated on `#recent-results` → `focusGameFromLog` → range + teams + `loadData`.
4. **Focus row:** `focusedGameLogKey` = `date|opponent` (uppercase opp on set; compare uses raw `g.opponent`).

### Verified good

- Dedupe by `gameLogKey` (id or `date|opp|scores`).
- No prototype row padding / filler duplication in render path.
- Matchup drill-down sets `teamA` + opponent + date window.
- Solo focus sets ghost opponent + date window + chart point hover.
- `setRange`, team pickers, `setHeroMode`, `selectTeam` clear log focus.

### Issues

| Issue | Detail |
|-------|--------|
| Ledger vs list | `renderGameLogLedger` receives raw `games`; list uses deduped `recent` — VS RECORD can disagree with visible rows |
| Scope label | Chip tooltips use `rangeLabel(state.range)` (Today/Week) while data may be **month-scoped** |
| Key schemes | Focus highlight `date\|opp` vs `gameLogKey` `date\|opp\|scores` — different purposes, easy to confuse |
| `focusedLogGame` | Reads `state.teamGames` (chart range), not `gameLogGames` — OK after `createRangeForGameDate` includes clicked date |
| Double sort | `renderGameLog` sorts before dedupe, which sorts again internally |
| Duplicate markup | Solo vs matchup row HTML identical except `aria-label` |
| Misleading copy | `GAME_LOG_LEDGER_NOTE`: “Head-to-head records appear in Matchup mode” shown **when already in Matchup** (ledger hidden; note only) |

### Future enhancements (not implemented)

- Click chip → filter Game Log to that opponent or launch matchup.
- Dedupe ledger input; align ledger label with month scope (“Past month” when widened).
- Unify row template; normalize opponent casing in focus compare.
- Optional: keep log list on month scope after Game Log click (don’t shrink to 7-day window in list only).

---

## 4. Tooltip / flyaway audit

**Do not redesign yet.** Inventory and hierarchy recommendations only.

### Current formatters

- `formatTooltipHtml(hit)` — primary game / flatline points.
- `formatContextTooltipHtml(teamName)` — static ghost line (“click to switch”); no point data.

`resolution.js` defines `tooltipMode` per preset (`game`, `game-or-day`, `period`, `league-summary`) but **`formatTooltipHtml` never reads it**.

### Point fields available (from `lib/performance/series.py` + aggregation)

| Field | Game | Flatline | Aggregated period |
|-------|------|----------|-------------------|
| `date`, `value`, `previousValue`, `movementAmount` | ✓ | ✓ | ✓ |
| `gameId`, `opponentId`, `result`, `pointsFor`, `pointsAgainst`, `margin` | ✓ | — | — |
| `cumulativeWins`, `cumulativeLosses`, `winPct`, `label` | winPct only | — | — |
| `movementReason`, `flatline` | ✓ | ✓ | ✓ |
| `periodStart`, `periodEnd`, `gamesInPeriod`, `winsInPeriod`, `lossesInPeriod`, `aggregated` | — | — | ✓ |

### What tooltips show today

**Game branch:** team, date, result vs opponent, score, Previous/New/Movement, optional reason, cumulative record.

**“Flatline” branch:** triggered by `flatline || !gameId` — **aggregated period points also lack `gameId`** and incorrectly use this branch (shows “No game — flat performance line”).

**Not shown:** margin, `gameId`, period bounds, games-in-period stats, landmark metadata beyond kind label.

### Recommended information hierarchy (future)

1. **Primary line:** Team · date · opponent · score · result badge  
2. **Movement:** Previous → New (Δ) — keep as is for game mode  
3. **Context line:** `movementReason` (human-readable)  
4. **Period mode (season/all):** “Week of … · 3 games (2–1) · index +2” using `periodStart`/`periodEnd`, `gamesInPeriod`, W-L  
5. **League mode (future):** rank / percentile slot — profile already has `league-summary` mode  
6. **Hide from user UI:** `gameId`, `resolution`, raw `aggregated` flag, internal `flatline`

### Implementation/debug-oriented fields

`gameId`, `aggregated`, `resolution`, `flatline` — useful for hit-testing and QA, not for default tooltip body.

---

## 5. Opponent chips (VS RECORD) audit

### Data source

- **Solo only:** `aggregateOpponents(games)` on Game Log `games` array.
- **Matchup:** static note (ledger not populated with chips).

Aggregation: group by `opponent`, W/L counts, `lastDate`; sort by **game frequency (desc)**, then **recency (desc)**; limit 5.

### What works

- Visual treatment (`sd-opp-chip`, team color, record coloring) reads well.
- “Chart” tag when row matches `contextOpponentId` and ghost enabled.
- Tooltip includes team record string + `rangeLabel(state.range)`.

### Edge cases

| Case | Behavior |
|------|----------|
| Month-scoped log + Today/Week label | Records reflect month; tooltip says “Today” / “Past Week” |
| Tied opponent frequency | `resolveContextOpponent` returns `null`; chips still show all |
| Undeduped games in ledger | Inflated counts if duplicate rows exist in source |
| Matchup mode | Chips hidden; note text inverted vs intent |

### Chips are display-only

No click handlers. Context switch is **chart ghost line click** → `flipToContextOpponent`.

### Future interaction ideas (not implemented)

| Action | Reuse existing |
|--------|----------------|
| Chip click → Matchup vs opponent | `focusGameFromLog` / `enterMatchupFromGame` pattern |
| Chip click → filter Game Log | `logFocusOpponent` + scroll |
| Chip click → set ghost opponent | `loadContextOpponent` with explicit opp |
| Highlight chip on log focus | Already partial via `contextOpponentId` |

---

## 6. Performance audit

### API fan-out (worst case: Solo + Today + ghost + idle)

1. `/api/performance` — panel range  
2. `/api/performance` — month (game log)  
3. `/api/performance` — opponent series (ghost)  
4. `/api/performance` — `all` (last played game only)

All `cache: 'no-store'`. No client response cache. Server `_meta_cache` ~1h for provider meta.

### Chart rerenders

`renderHeroChart()` on every `loadData` completion (sometimes **twice** for log focus), plus hover (`requestAnimationFrame`) and `resize`.

Each call also runs `renderHeroContext`, `renderHeroLegend`, `renderMarketSummary`, `renderSoloStats`, full canvas `setupCanvas` clear — not a cheap paint-only path.

### Duplicate calculation

- Server: daily walk + `aggregate_points` per profile.
- Client: `normalizeSeriesPoints` → `downsampleSeriesPoints` → `aggregatePointsByX` (pixel bucketing) — independent second aggregation layer.

### Low-risk optimizations

| Optimization | Risk | Impact |
|--------------|------|--------|
| Generation check **inside** each async loader before writing `state` | Low | Fixes stale data race |
| `Promise.all` for independent matchup panel + hero fetches | Low | Latency |
| Month game-log: request `games` only endpoint (no series build) | Medium | Cuts server work |
| `loadLastPlayedGame`: dedicated “latest game” meta or games-only `all` | Medium | Avoids full series for one row |
| Hover redraw: canvas-only path without DOM stat updates | Medium | Smoother hover |
| `AbortController` on `fetchJson` when generation bumps | Low | Cancel in-flight stale requests |
| Skip `loadPanelData` franchise series in matchup if game log could use cached month payload | Medium | One fewer heavy fetch |

### Large loops

Archive ~2460 games; per-team filters are O(n) in provider — fine for NBA scale. `build_multi_team_series` for league would be O(teams × games) — acceptable for 30 teams; cap resolution (`league` profile: 10 pts/series).

---

## 7. League mode planning

**Do not build yet.** Lightweight plan for reusing existing systems.

### What exists today

| Layer | Status |
|-------|--------|
| UI | Disabled “League” toggle (`data-hero-mode="league"`) |
| `main.js` | Comment stub; `setHeroMode` blocks league |
| Chart | `drawMultiSeriesChart` — N-series ready |
| Provider | `get_league_performance_series()` + `build_multi_team_series()` |
| Resolution | `league` profile: season buckets, 10 pts/series, `league-summary` tooltip mode |
| Data | `league` field on games; `get_teams(league)`; `generate_demo_league.py` stress script |

### What’s missing

- `/api/league` (or extend `/api/performance` with `mode=league`)
- `get_league_performance_payload()` + `_apply_resolution(..., 'league')`
- `league` preset in `range.js` / `range.py` `preset_dates`
- `heroMode === 'league'` load path in `main.js`
- League tooltip template (`tooltipMode: 'league-summary'`)
- Team colors/names on multi-team series return shape (matchup path adds them; league builder returns bare series)

### Future views (reuse, don’t reinvent)

| View | Reuse |
|------|--------|
| **Eastern / Western Conference** | Filter `get_teams` by conference field (add to `demo-teams.json`); same `build_multi_team_series` with team subset |
| **Standings** | Derive from games in range — W-L per team (table UI, not new chart engine) |
| **Playoff picture** | Season preset + standings math + reference date |
| **Power rankings** | Ordered list from index delta or win% over `season` range |
| **League index** | `build_multi_team_series` with `metric: 'index'`; `drawMultiSeriesChart` with dense profile (no markers) |

### Suggested activation sequence

1. API route + payload wrapper mirroring `get_matchup_payload` structure.  
2. Add `league` range preset (likely alias to `season` or `all` with league resolution).  
3. Enable toggle; `renderHeroContext` branch hides solo/matchup chrome.  
4. `loadLeagueHero()` → `drawMultiSeriesChart` with capped series list.  
5. Period tooltip branch for `aggregated` / `league-summary`.  
6. Conference filters as query param `conference=EAST` without new chart types.

---

## Cleanup opportunities (prioritized)

### Quick wins (no UX change)

1. Remove dead code: `enterMatchupFromGame`, `opponentLabel`, `GAME_LOG_VISIBLE`.  
2. Add `gen !== loadGeneration` checks before **every** `state.*` assignment in async loaders.  
3. `clearLogFocus()` in `flipToContextOpponent`.  
4. Dedupe `games` before `renderGameLogLedger`.  
5. Align HTML default toggles with JS init or marquee-first paint.  
6. Fix `GAME_LOG_LEDGER_NOTE` copy for matchup mode.

### Small polish (minimal UX change)

7. VS RECORD tooltip: “Past month” when `gameLogUsesMonthScope()`.  
8. Tooltip branch for `aggregated` points (season/all).  
9. Unify solo/matchup Game Log row template.  
10. Normalize opponent casing in focus row compare.

### Medium (maintainability)

11. Shared range constants module (JS/Python).  
12. `chartProfileForRange` from date span, not only preset.  
13. Split `renderHeroChart` vs `renderHeroChrome` for hover performance.  
14. Games-only API parameter to skip series build for log/month fetches.

---

## Technical debt summary

| Debt | Why it matters |
|------|----------------|
| Monolithic `state` + `main.js` (~1700 lines) | Harder to test mode-specific flows |
| Parallel client/server range label logic | Drift risk |
| Ghost opponent today = full franchise series | Can look like unintended second team timeline |
| `tooltipMode` profiles unused in formatter | Season/all tooltips misleading |
| League half-wired | Easy to accidentally break when extending provider |
| No fetch abort | Race under fast interaction |
| Query `mode`/`metric` ignored by API | Confusing for future API consumers |

---

## Future opportunities (preserve current UX direction)

- **Conference-scoped league** without new chart architecture.  
- **Chip → matchup / filter** using existing `focusGameFromLog` state.  
- **Reference date refresh** on tab focus (re-sync client clock drift).  
- **Archive picker** (multiple `ORBIT_GAMES_PATH` seasons) — reference date per archive.  
- **Tooltip v2** following hierarchy in §4 without flyaway redesign.  
- **SDK-style range object** exported from one module for any future Orbit surfaces (Sine, etc.).

---

## 8. Small-sample chart rendering audit

**Context:** Matchup → Today → Marquee works as a default state. The issue is that Today and other micro samples use the same canvas framework as Season/Week (252–420px tall, 16 grid lines, 5 Y ticks, full-width time axis).

### Data shape (verified against archive)

| Range | Typical points | Game points | Example |
|-------|----------------|-------------|---------|
| Today | **1** calendar day | 1 | LAC solo win% → `[60.98]` |
| Today matchup | **1** per team | 1 each | LAC index `118`, GSW `114` |
| Week | 7 calendar days | 2–4 | LAC index steps across week |
| Custom 7-day (game log) | 7 calendar days | 1–4 | Same as week profile |

Today delivers **one point per series**. Week delivers **one point per calendar day** (game steps + flatlines).

### Root causes (`odds/performanceChart.js`)

**1. Zero-width X domain (primary bug)**

`createDateXFn` (L62–75) sets `t0 = t1` when all points share a date. `span = Math.max(t1 - t0, 1)` → 1 ms. Every point maps to **x = left padding**. The rest of the chart is empty.

**2. No line for single-point series**

`strokeSeriesLine` (L181) returns when `path.length < 2`. Today never draws a line — only a lone marker at the left edge.

**3. Full historical grid on micro data**

`drawGrid` (L425–454) always draws **16** horizontal lines and **5** Y-axis labels. Y labels are computed from `min`/`max` of all point values with only 8% padding (`yScale` L457–464).

When `min === max` (single value), artificial `span = 1` produces nonsense ticks (e.g. win% `60.9, 61.0, 61.1` spread across full height). When two matchup values differ slightly (114 vs 118), ticks are technically valid but the grid still dominates a single marker.

**4. Profile ≠ layout**

`resolution.js` `today` profile sets aggregation (`resolution: 'game'`), markers, ghost opponent — but **does not change** scale, grid density, or canvas size. Custom game-log windows fall back to `week` profile via `chartProfileForRange()` while still having few game points.

**5. Fixed canvas size**

`--sd-chart-min: 252px` / `36vh` (`style.css`) applies equally to 1-point Today and 82-game Season.

### What already works

- Solo **Today with game** stats row switches to Result / Opponent / Final (`renderSoloStats`) — the numeric story is told outside the chart.
- Week and Season paths spread points across time; lines render; charts feel intentional.
- Markers, colors, and ghost opponent language are correct — the issue is **layout math**, not styling.

### Answers to review questions

| Question | Recommendation |
|----------|----------------|
| **1. Should Today use a different chart profile?** | **Yes — add a render mode**, not a new visual language. Keep `today` aggregation profile; add a **`micro` layout flag** triggered by sample size (see below). Profile controls data density; layout controls scale/grid. |
| **2. Should 1–2 point charts use simplified presentation?** | **Yes.** Marker-first, optional short `previousValue → value` segment, no full-width time axis. Treat as an **event snapshot**, not a truncated season chart. |
| **3. Hide Y-axis for very small samples?** | **Yes, or reduce to one label.** Hide tick column when `gamePoints ≤ 2` or calendar span ≤ 1 day. Primary values already live in hero stats / caption. |
| **4. Auto tighter scaling when point count is low?** | **Yes — required.** Fix X zero-span; enforce minimum Y domain per metric (win% ±4–6 pts; index ±3–4 from midpoint). Reduce grid to 2–4 lines in micro mode. |

### Simplest fix (preserves Orbit visual language)

Introduce `isMicroChart(points)` in `performanceChart.js`:

```
micro = calendarDays ≤ 1
     OR (gamePoints ≤ 2 AND calendarDays ≤ 3)
```

When `micro`:

1. **X:** Extend domain synthetically — e.g. `[gameDate − 1 day, gameDate + 1 day]` — or center markers at 50% width with small team offsets. Optionally inject a **render-only** prior-day point from `previousValue` to create a 2-point path.
2. **Y:** `yScaleMicro(metric, values)` — minimum span: win% 8%, index 4. Center on midpoint of values (or `previousValue`→`value` for single game).
3. **Grid:** `drawGridMicro` — 2 horizontal guides, **no Y tick labels** (or one muted current value).
4. **Line:** Allow 2-point paths; for single game draw short horizontal step from prior to current.
5. **No canvas resize required** for v1 — fixing X/Y/grid removes the “broken empty chart” feel without changing hero layout.

Optional v2 (still small scope): slightly lower `--sd-chart-min` when `micro` (e.g. 180px) — only if still feels sparse after scale fix.

### Explicit non-goals

- No new chart type (bar, card, table replacement).
- No change to default Marquee → Today matchup state.
- No server series shape change for v1 (client-side render fix sufficient).

---

## Files reviewed

| Path | Role |
|------|------|
| `odds/main.js` | State, loading, Game Log, chips, hero |
| `odds/range.js` | Client range presets + `createRangeForGameDate` |
| `odds/resolution.js` | Chart profiles, ghost rules |
| `odds/performanceChart.js` | Canvas, tooltips, aggregation |
| `odds/index.html` | Hero chrome, Game Log DOM |
| `odds/style.css` | Game Log, chips, chart loading |
| `lib/performance/range.py` | Server reference date + presets |
| `lib/performance/series.py` | Point schema, series builders |
| `lib/performance/resolution.py` | Server aggregation profiles |
| `lib/providers/local.py` | Data provider, league stub |
| `odds/performance_data.py` | API payload + resolution apply |
| `serve.py`, `api/performance.py`, `api/matchup.py` | Routes |

---

*This audit documents findings only. No major implementation was performed as part of this review.*
