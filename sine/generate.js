/**
 * Procedural song + patch generation — eight distinct sonic territories.
 */

import { expressionMetaForSequencer } from './world-expression.js';

export const MUTATE_INTENSITY = {
  subtle: { preserve: 0.94, label: 'Nudge' },
  medium: { preserve: 0.6, label: 'Shift' },
  wild: { preserve: 0.18, label: 'Wild' },
};

/** Radar + shuffle pool — each world has a unique compositional voice. */
export const FEATURED_WORLD_KEYS = [
  'space-age',
  'arcade',
  'dungeon',
  'bubble',
  'beach',
  'desert',
  'ice-cave',
  'speedway',
];

export const WORLDS = {
  'space-age': {
    label: 'Space Age',
    mood: 'Optimistic transmission',
    compose: 'beacon',
    mode: 'major',
    noteDensity: 0.78,
    mutateSpread: 0.95,
    params: {
      pitch: [980, 1980], tone: [0, 0.18], decay: [0.18, 0.38], crunch: [0.02, 0.12],
      noise: [0, 0.05], attack: [0, 0.04], bend: [0.62, 0.82], wobble: [0, 0.08],
      detune: [0.12, 0.28], filter: [0, 0.08], volume: [0.44, 0.58], gap: [0.05, 0.14],
    },
    tempo: [138, 178],
    restChance: 0.09,
    leapChance: 0.3,
    homeRow: 5,
  },
  arcade: {
    label: 'Arcade',
    mood: 'Coin-drop hooks',
    compose: 'hook',
    mode: 'major',
    noteDensity: 0.94,
    mutateSpread: 1.05,
    params: {
      pitch: [780, 1560], tone: [0.52, 0.88], decay: [0.02, 0.07], crunch: [0.24, 0.46],
      noise: [0.02, 0.1], attack: [0, 0.02], bend: [0.58, 0.74], wobble: [0, 0.04],
      detune: [0.1, 0.22], filter: [0, 0.06], volume: [0.52, 0.66], gap: [0.02, 0.06],
    },
    tempo: [96, 136],
    restChance: 0.06,
    leapChance: 0.44,
    homeRow: 2,
  },
  dungeon: {
    label: 'Dungeon',
    mood: 'Crypt wander',
    compose: 'wander',
    mode: 'minor',
    noteDensity: 0.52,
    mutateSpread: 0.82,
    params: {
      pitch: [110, 360], tone: [0.08, 0.38], decay: [0.42, 0.78], crunch: [0.12, 0.35],
      noise: [0.2, 0.42], attack: [0.06, 0.2], bend: [0.28, 0.45], wobble: [0.08, 0.28],
      detune: [0.04, 0.16], filter: [0.4, 0.75], volume: [0.34, 0.5], gap: [0.14, 0.3],
    },
    tempo: [215, 295],
    restChance: 0.2,
    leapChance: 0.22,
    homeRow: 7,
  },
  bubble: {
    label: 'Bubble',
    mood: 'Toy bounce',
    compose: 'bounce',
    mode: 'major',
    noteDensity: 0.86,
    mutateSpread: 1.12,
    params: {
      pitch: [440, 920], tone: [0, 0.22], decay: [0.14, 0.32], crunch: [0.02, 0.1],
      noise: [0.02, 0.08], attack: [0.22, 0.48], bend: [0.55, 0.76], wobble: [0.42, 0.68],
      detune: [0.1, 0.22], filter: [0.02, 0.12], volume: [0.42, 0.56], gap: [0.08, 0.18],
    },
    tempo: [155, 205],
    restChance: 0.1,
    leapChance: 0.42,
    homeRow: 3,
  },
  beach: {
    label: 'Beach',
    mood: 'Coastal drift',
    compose: 'wave',
    mode: 'major',
    noteDensity: 0.55,
    mutateSpread: 0.88,
    params: {
      pitch: [380, 760], tone: [0, 0.2], decay: [0.38, 0.68], crunch: [0, 0.1],
      noise: [0.05, 0.14], attack: [0.1, 0.3], bend: [0.4, 0.55], wobble: [0.04, 0.14],
      detune: [0.04, 0.14], filter: [0.06, 0.22], volume: [0.36, 0.5], gap: [0.16, 0.34],
    },
    tempo: [235, 310],
    restChance: 0.18,
    leapChance: 0.06,
    homeRow: 6,
  },
  desert: {
    label: 'Desert',
    mood: 'Mirage echo',
    compose: 'sparse',
    mode: 'minor',
    noteDensity: 0.32,
    mutateSpread: 0.75,
    params: {
      pitch: [260, 520], tone: [0.12, 0.38], decay: [0.52, 0.78], crunch: [0.1, 0.22],
      noise: [0.08, 0.2], attack: [0.02, 0.1], bend: [0.32, 0.46], wobble: [0, 0.06],
      detune: [0.02, 0.1], filter: [0.22, 0.42], volume: [0.32, 0.46], gap: [0.32, 0.52],
    },
    tempo: [275, 355],
    restChance: 0.4,
    leapChance: 0.08,
    homeRow: 7,
  },
  'ice-cave': {
    label: 'Ice Cave',
    mood: 'Crystal shimmer',
    compose: 'crystal',
    mode: 'minor',
    noteDensity: 0.72,
    mutateSpread: 0.92,
    params: {
      pitch: [1180, 2400], tone: [0.08, 0.32], decay: [0.1, 0.28], crunch: [0.06, 0.18],
      noise: [0, 0.04], attack: [0, 0.03], bend: [0.58, 0.74], wobble: [0.04, 0.14],
      detune: [0.28, 0.52], filter: [0, 0.06], volume: [0.42, 0.56], gap: [0.04, 0.12],
    },
    tempo: [172, 222],
    restChance: 0.08,
    leapChance: 0.38,
    homeRow: 0,
  },
  speedway: {
    label: 'Speedway',
    mood: 'Turbo circuit',
    compose: 'race',
    mode: 'major',
    noteDensity: 0.97,
    mutateSpread: 1.2,
    params: {
      pitch: [680, 1280], tone: [0.62, 0.94], decay: [0.03, 0.1], crunch: [0.26, 0.5],
      noise: [0.04, 0.12], attack: [0, 0.02], bend: [0.5, 0.66], wobble: [0, 0.08],
      detune: [0.06, 0.18], filter: [0, 0.08], volume: [0.54, 0.68], gap: [0.02, 0.05],
    },
    tempo: [72, 108],
    restChance: 0.02,
    leapChance: 0.14,
    homeRow: 2,
  },
  /** @deprecated use arcade — kept for shared URLs */
  disco: {
    label: 'Arcade',
    mood: 'Coin-drop hooks',
    compose: 'hook',
    mode: 'major',
    noteDensity: 0.94,
    mutateSpread: 1.05,
    params: {
      pitch: [720, 1480], tone: [0.48, 0.82], decay: [0.04, 0.12], crunch: [0.22, 0.42],
      noise: [0.02, 0.1], attack: [0, 0.03], bend: [0.55, 0.72], wobble: [0, 0.06],
      detune: [0.08, 0.2], filter: [0, 0.08], volume: [0.5, 0.64], gap: [0.02, 0.07],
    },
    tempo: [88, 128],
    restChance: 0.05,
    leapChance: 0.32,
    homeRow: 2,
  },
};

/** @deprecated use WORLDS */
export const FAMILIES = WORLDS;

const PHRASE_STEPS = [8, 12, 16, 24, 32];

const STEP_PREF = {
  arcade: [8, 8, 12, 12, 16],
  speedway: [16, 24, 24, 32],
};

/**
 * Tile a pattern to target length and fill rests so every step has a note.
 * @param {number[]} pattern
 * @param {number} targetSteps
 * @returns {number[]}
 */
export function normalizePattern(pattern, targetSteps) {
  if (targetSteps <= 0) return [];
  if (!pattern.length) return Array(targetSteps).fill(-1);

  const tiled = new Array(targetSteps);
  for (let i = 0; i < targetSteps; i++) {
    tiled[i] = pattern[i % pattern.length];
  }

  const fallback = tiled.find((n) => n >= 0);
  if (fallback === undefined) return tiled;

  for (let i = 0; i < targetSteps; i++) {
    if (tiled[i] >= 0) continue;
    for (let off = 1; off < targetSteps; off++) {
      const v = tiled[(i - off + targetSteps) % targetSteps];
      if (v >= 0) {
        tiled[i] = v;
        break;
      }
    }
    if (tiled[i] < 0) tiled[i] = fallback;
  }
  return tiled;
}
const MAJOR_PENT = [0, 2, 3, 5, 6, 7];
const MINOR_PENT = [1, 3, 4, 5, 7];

/** @typedef {Object} WorldComposition
 * @property {number} barLen
 * @property {number[]} progression scale-degree roots per bar
 * @property {number} chordBias 0–1 soft pull toward active chord tones
 */

/** @type {WorldComposition} */
const DEFAULT_COMPOSITION = {
  barLen: 4,
  progression: [0, 3, 4, 0],
  chordBias: 0.24,
};

/** Per-world soft harmonic hints — keyed by compose style. */
const COMPOSE_STYLES = {
  beacon: { progression: [0, 4, 2, 5], chordBias: 0.22 },
  hook: { progression: [0, 2, 0, 3], chordBias: 0.28 },
  wander: { progression: [0, 4, 2, 5], chordBias: 0.22 },
  bounce: { progression: [0, 2, 0, 3], chordBias: 0.28 },
  wave: { progression: [0, 2, 4, 3], chordBias: 0.24 },
  sparse: { progression: [0, 0, 4, 0], chordBias: 0.2 },
  crystal: { progression: [0, 3, 0, 2], chordBias: 0.24 },
  race: { progression: [0, 3, 0, 3], chordBias: 0.26 },
};

function compositionFor(world) {
  const style = COMPOSE_STYLES[world.compose] || {};
  return { ...DEFAULT_COMPOSITION, ...style };
}

function chordTones(scale, degree) {
  const len = scale.length;
  const root = ((degree % len) + len) % len;
  const tones = [
    scale[root],
    scale[(root + 2) % len],
    scale[(root + 4) % len],
  ];
  return [...new Set(tones)];
}

function chordAtStep(comp, step) {
  const bar = Math.floor(step / comp.barLen);
  return comp.progression[bar % comp.progression.length];
}

function nearestChordTone(note, scale, chord) {
  if (chord.includes(note)) return note;
  let best = chord[0];
  let dist = Math.abs(scaleIndex(scale, note) - scaleIndex(scale, best));
  for (const tone of chord) {
    const d = Math.abs(scaleIndex(scale, note) - scaleIndex(scale, tone));
    if (d < dist) { dist = d; best = tone; }
  }
  return best;
}

function biasToChord(rng, note, scale, chord, amount) {
  if (note < 0 || rng() > amount) return note;
  return nearestChordTone(note, scale, chord);
}

function snapToScale(row, scale) {
  if (scale.includes(row)) return row;
  let best = scale[0];
  let dist = Math.abs(row - best);
  for (const s of scale) {
    const d = Math.abs(row - s);
    if (d < dist) { dist = d; best = s; }
  }
  return best;
}

function transposeScaleSteps(note, scale, steps) {
  if (note < 0) return note;
  const idx = scaleIndex(scale, snapToScale(note, scale));
  const next = Math.max(0, Math.min(scale.length - 1, idx + steps));
  return scale[next];
}

function collectNoteCells(pattern, minLen, maxLen, end = pattern.length) {
  const cells = [];
  for (let s = 0; s <= end - minLen; s++) {
    for (let len = minLen; len <= maxLen && s + len <= end; len++) {
      const notes = [];
      let ok = true;
      for (let j = 0; j < len; j++) {
        if (pattern[s + j] < 0) { ok = false; break; }
        notes.push(pattern[s + j]);
      }
      if (ok) cells.push({ start: s, notes });
    }
  }
  return cells;
}

function restFillTargets(pattern, len, start = 0, end = pattern.length) {
  const targets = [];
  for (let t = start; t <= end - len; t++) {
    let restSlots = 0;
    for (let j = 0; j < len; j++) if (pattern[t + j] < 0) restSlots++;
    if (restSlots > 0) targets.push(t);
  }
  return targets;
}

function pasteCellOntoRests(pattern, target, notes) {
  for (let j = 0; j < notes.length; j++) {
    if (pattern[target + j] < 0) pattern[target + j] = notes[j];
  }
}

/** Light post-pass: motif echoes and soft harmony — never thins the pattern. */
function refineMelody(rng, world, pattern) {
  const comp = compositionFor(world);
  const scale = scaleFor(world.mode);
  const steps = pattern.length;
  const out = [...pattern];

  for (let i = 0; i < steps; i++) {
    if (out[i] < 0) continue;
    if (rng() < 0.18) {
      const chord = chordTones(scale, chordAtStep(comp, i));
      out[i] = biasToChord(rng, out[i], scale, chord, comp.chordBias);
    }
  }

  if (rng() < 0.32 && steps >= 6) {
    const cellLen = 2 + Math.floor(rng() * 3);
    const cells = collectNoteCells(out, cellLen, cellLen);
    const targets = cells.length ? restFillTargets(out, cellLen) : [];
    if (cells.length && targets.length) {
      pasteCellOntoRests(out, pick(rng, targets), pick(rng, cells).notes);
    }
  }

  if (rng() < 0.25 && steps >= 8) {
    const echoLen = 2 + Math.floor(rng() * 2);
    const half = Math.floor(steps / 2);
    const calls = collectNoteCells(out, echoLen, echoLen, half).map((c) => c.notes);
    const responses = calls.length ? restFillTargets(out, echoLen, half) : [];
    if (calls.length && responses.length) {
      const transpose = rng() < 0.34 ? 0 : (rng() < 0.5 ? 1 : -1);
      const echoed = pick(rng, calls).map((n) => transposeScaleSteps(n, scale, transpose));
      pasteCellOntoRests(out, pick(rng, responses), echoed);
    }
  }

  return out;
}

/** Soft rhythmic lean per compose style — fills rests only, never thins. */
const GROOVE_PREFS = {
  beacon: { restFill: 0.12, beatWeight: [0.78, 0.58, 0.72, 0.52] },
  hook: { restFill: 0.22, beatWeight: [0.52, 1, 0.48, 0.96] },
  wander: { restFill: 0.06, beatWeight: [1, 0.38, 0.52, 0.32] },
  bounce: { restFill: 0.14, beatWeight: [0.55, 0.92, 0.52, 0.88] },
  wave: { restFill: 0.08, beatWeight: [0.88, 0.48, 0.82, 0.42] },
  sparse: { restFill: 0.03, beatWeight: [0.95, 0.22, 0.28, 0.18] },
  crystal: { restFill: 0.14, beatWeight: [0.94, 0.48, 0.92, 0.44] },
  race: { restFill: 0.32, beatWeight: [1, 0.9, 0.86, 0.88] },
};

function neighborMelodyNote(pattern, index) {
  for (let off = 1; off < pattern.length; off++) {
    const prev = pattern[(index - off + pattern.length) % pattern.length];
    if (prev >= 0) return prev;
    const next = pattern[(index + off) % pattern.length];
    if (next >= 0) return next;
  }
  return -1;
}

/** Prefer certain beats when filling rests — groove hint, not a hard lock. */
function applyGroovePreference(rng, world, pattern) {
  const pref = GROOVE_PREFS[world.compose] || GROOVE_PREFS.beacon;
  const out = [...pattern];

  for (let i = 0; i < out.length; i++) {
    if (out[i] >= 0) continue;
    const beat = i % 4;
    const weight = pref.beatWeight[beat] ?? 0.5;
    if (rng() > pref.restFill * weight) continue;
    const neighbor = neighborMelodyNote(out, i);
    if (neighbor >= 0) out[i] = neighbor;
  }

  return out;
}

function hookStepIndex(steps, comp) {
  const bar = comp.barLen;
  const half = Math.floor(steps / 2);
  const midBar = Math.round(half / bar) * bar;
  const spot = steps >= bar * 3 ? midBar : bar;
  return Math.min(steps - 2, Math.max(1, spot));
}

function stepTowardLanding(note, scale, target) {
  if (note < 0) return target;
  const snapped = snapToScale(note, scale);
  const idx = scaleIndex(scale, snapped);
  const targetIdx = scaleIndex(scale, snapToScale(target, scale));
  if (idx === targetIdx) return snapped;
  return scale[idx + (targetIdx > idx ? 1 : -1)];
}

/** One intentional memorable gesture near midpoint / phrase turn. */
function applyHookStep(rng, world, pattern) {
  const scale = scaleFor(world.mode);
  const comp = compositionFor(world);
  const steps = pattern.length;
  if (steps < 4) return pattern;

  const out = [...pattern];
  const hookAt = hookStepIndex(steps, comp);
  const prevIdx = hookAt > 0 ? hookAt - 1 : steps - 1;
  const anchor = out[prevIdx] >= 0 ? snapToScale(out[prevIdx], scale) : world.homeRow;
  const anchorIdx = scaleIndex(scale, anchor);

  switch (world.compose) {
    case 'hook': {
      const leap = Math.min(3, scale.length - 1 - anchorIdx);
      const high = transposeScaleSteps(anchor, scale, Math.max(2, leap));
      out[hookAt] = high;
      if (hookAt + 1 < steps) out[hookAt + 1] = high;
      if (hookAt + 2 < steps) out[hookAt + 2] = stepInScale(rng, scale, high, -1);
      break;
    }
    case 'race': {
      let n = anchor;
      for (let j = 0; j < 3 && hookAt + j < steps; j++) {
        n = stepInScale(rng, scale, n, 1);
        out[hookAt + j] = n;
      }
      break;
    }
    case 'crystal': {
      const shardPool = scale.filter((row) => row <= 1);
      const ping = shardPool.length ? pick(rng, shardPool) : scale[0];
      out[hookAt] = ping;
      if (hookAt + 1 < steps) {
        out[hookAt + 1] = transposeScaleSteps(ping, scale, rng() < 0.5 ? 2 : -1);
      }
      if (hookAt + 2 < steps) out[hookAt + 2] = ping;
      break;
    }
    case 'beacon': {
      const leap = 2 + Math.floor(rng() * 2);
      out[hookAt] = transposeScaleSteps(anchor, scale, leap);
      if (hookAt + 1 < steps) {
        out[hookAt + 1] = stepInScale(rng, scale, out[hookAt], rng() < 0.5 ? -1 : 0);
      }
      break;
    }
    case 'wander': {
      const lowTarget = scale[Math.max(0, anchorIdx - 2)];
      out[hookAt] = lowTarget;
      if (hookAt + 1 < steps) out[hookAt + 1] = stepTowardLanding(anchor, scale, lowTarget);
      break;
    }
    case 'wave': {
      out[hookAt] = stepInScale(rng, scale, anchor, 1);
      if (hookAt + 1 < steps) out[hookAt + 1] = stepInScale(rng, scale, out[hookAt], 1);
      break;
    }
    case 'bounce': {
      out[hookAt] = transposeScaleSteps(anchor, scale, 2);
      if (hookAt + 1 < steps) out[hookAt + 1] = transposeScaleSteps(out[hookAt], scale, -1);
      break;
    }
    case 'sparse': {
      out[hookAt] = anchor;
      if (hookAt + 1 < steps) out[hookAt + 1] = anchor;
      break;
    }
    default:
      out[hookAt] = transposeScaleSteps(anchor, scale, 2);
  }

  return out;
}

/** Gently resolve phrase endings toward landing tones. */
function applyAnswerCadence(rng, world, pattern, hookAt = -1) {
  const scale = scaleFor(world.mode);
  const comp = compositionFor(world);
  const out = [...pattern];
  const barLen = comp.barLen;

  for (let bar = 0; bar < Math.ceil(out.length / barLen); bar++) {
    const start = bar * barLen;
    const end = Math.min(start + barLen, out.length);
    const degree = chordAtStep(comp, end - 1);
    const chord = chordTones(scale, degree);
    const landings = [chord[0], chord[2] ?? chord[1], world.homeRow];

    const active = [];
    for (let i = end - 1; i >= start && active.length < 2; i--) {
      if (i === hookAt) continue;
      if (out[i] >= 0) active.push(i);
    }

    active.forEach((idx, rank) => {
      const chance = rank === 0 ? 0.82 : 0.58;
      if (rng() > chance) return;
      const target = pick(rng, landings);
      out[idx] = rng() < 0.68
        ? stepTowardLanding(out[idx], scale, target)
        : snapToScale(target, scale);
    });
  }

  const last = out.length - 1;
  if (last !== hookAt) {
    const finalChord = chordTones(scale, chordAtStep(comp, last));
    out[last] = rng() < 0.72
      ? snapToScale(pick(rng, [world.homeRow, finalChord[0], finalChord[2] ?? finalChord[1]]), scale)
      : out[last] >= 0 ? out[last] : world.homeRow;
  }

  if (last > 0 && out[last - 1] >= 0 && last - 1 !== hookAt && rng() < 0.55) {
    out[last - 1] = stepTowardLanding(out[last - 1], scale, out[last]);
  }

  return out;
}

/** @typedef {Object} SequencerEvent
 * @property {number} note row index 0–7
 * @property {number} [vol=1] volume multiplier vs melody
 * @property {number} [decay=1] decay multiplier
 * @property {number} [octave=0] semitone offset in octaves
 * @property {'echo'|'harmony'} [lane]
 */

/** @typedef {Object} SequencerLanes
 * @property {number[]} bass sparse bass row indices (-1 = rest)
 * @property {number} bassVol 0–1 relative to melody
 * @property {number} bassOctave -1 or -2 octaves below melody
 * @property {number} [bassDecay=1] decay multiplier for bass lane
 * @property {SequencerEvent[][]} events extra per-step note events
 */

function bassTargetCount(rng, steps) {
  const per32 = 4 + Math.floor(rng() * 5);
  return Math.max(2, Math.round((steps * per32) / 32));
}

function scaleDegreeRoot(scale, comp, step) {
  const degree = chordAtStep(comp, step);
  return chordTones(scale, degree)[0];
}

function placeBassNote(bass, step, note, placed, maxCount) {
  if (placed.count >= maxCount || bass[step] >= 0) return false;
  bass[step] = note;
  placed.count += 1;
  return true;
}

/** Anchor bass to chord roots at phrase boundaries before world fill. */
function placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps) {
  const barLen = comp.barLen;
  for (let i = 0; i < steps && placed.count < maxCount; i += barLen) {
    placeBassNote(bass, i, scaleDegreeRoot(scale, comp, i), placed, maxCount);
  }
}

/** Phrase memory — tile a 2–5 note cell with ~75% repeat, ~25% variation. */
function applyPhraseMemory(rng, world, pattern) {
  const scale = scaleFor(world.mode);
  const steps = pattern.length;
  if (steps < 4) return pattern;

  const cellLen = 2 + Math.floor(rng() * 4);
  const cells = collectNoteCells(pattern, cellLen, Math.min(5, cellLen + 1));
  if (!cells.length) return pattern;

  const cell = pick(rng, cells).notes;
  const out = [...pattern];
  const passes = Math.ceil(steps / cellLen);

  for (let pass = 0; pass < passes; pass++) {
    const base = pass * cellLen;
    if (base >= steps) break;

    for (let j = 0; j < cellLen && base + j < steps; j++) {
      const idx = base + j;
      const repeat = rng() < 0.76;

      if (repeat) {
        if (out[idx] < 0) out[idx] = cell[j];
        else if (rng() < 0.22) out[idx] = cell[j];
      } else {
        let variant = cell[j];
        if (rng() < 0.55) {
          variant = transposeScaleSteps(variant, scale, rng() < 0.5 ? 1 : -1);
        } else {
          variant = stepInScale(rng, scale, variant, rng() < 0.5 ? 1 : -1);
        }
        if (out[idx] < 0 || rng() < 0.28) out[idx] = variant;
      }
    }
  }

  return out;
}

function emptyStepEvents(steps) {
  return Array.from({ length: steps }, () => []);
}

function echoRateForWorld(worldKey) {
  const key = worldKey === 'disco' ? 'arcade' : worldKey;
  const rates = {
    desert: 0.03,
    speedway: 0.06,
    arcade: 0.26,
    'ice-cave': 0.34,
    bubble: 0.08,
    'space-age': 0.1,
    beach: 0.12,
    dungeon: 0.05,
  };
  return rates[key] ?? 0.16;
}

/** Sequencer echo — duplicate melody hits 1–3 steps later (not audio delay). */
function addEchoEvents(rng, worldKey, melody, steps) {
  const events = emptyStepEvents(steps);
  const rate = echoRateForWorld(worldKey);

  for (let i = 0; i < steps; i++) {
    if (melody[i] < 0) continue;
    if (rng() > rate) continue;

    const offset = 1 + Math.floor(rng() * 3);
    const target = i + offset;
    if (target >= steps) continue;

    const isDesert = worldKey === 'desert';
    events[target].push({
      note: melody[i],
      vol: isDesert ? 0.22 + rng() * 0.08 : 0.36 + rng() * 0.16,
      decay: isDesert ? 0.28 + rng() * 0.12 : 0.42 + rng() * 0.22,
      octave: 0,
      lane: 'echo',
    });
  }

  return events;
}

function harmonyCapForWorld(worldKey, steps) {
  const key = worldKey === 'disco' ? 'arcade' : worldKey;
  const ratios = {
    desert: 0,
    speedway: 0.04,
    arcade: 0.09,
    'ice-cave': 0.11,
    bubble: 0.05,
    'space-age': 0.07,
  };
  return Math.max(0, Math.floor(steps * (ratios[key] ?? 0.09)));
}

/** Occasional harmony on strong beats — third or fifth, under ~10% density. */
function addHarmonyEvents(rng, worldKey, world, melody, steps, events) {
  const scale = scaleFor(world.mode);
  const comp = compositionFor(world);
  const cap = harmonyCapForWorld(worldKey, steps);
  if (cap <= 0) return events;
  let added = 0;

  for (let i = 0; i < steps; i++) {
    if (melody[i] < 0) continue;
    if (i % comp.barLen !== 0) continue;
    if (added >= cap) break;
    if (rng() > 0.11) continue;

    const interval = rng() < 0.52 ? 2 : 1;
    const harmNote = transposeScaleSteps(melody[i], scale, interval);
    events[i].push({
      note: harmNote,
      vol: 0.4 + rng() * 0.14,
      decay: 0.72 + rng() * 0.18,
      octave: 0,
      lane: 'harmony',
    });
    added += 1;
  }

  return events;
}

function generateArcadeBass(rng, world, scale, comp, melody, steps, bass, maxCount, meta) {
  const placed = { count: 0 };
  placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps);
  let lowOct = true;
  for (let i = 0; i < steps && placed.count < maxCount; i += 2) {
    if (bass[i] >= 0) { lowOct = !lowOct; continue; }
    const root = scaleDegreeRoot(scale, comp, i);
    if (!placeBassNote(bass, i, root, placed, maxCount)) continue;
    meta.octaveMap[i] = lowOct ? -1 : -2;
    lowOct = !lowOct;
    if (placed.count < maxCount && i + 1 < steps && rng() < 0.68 && bass[i + 1] < 0) {
      bass[i + 1] = root;
      meta.octaveMap[i + 1] = lowOct ? -2 : -1;
      lowOct = !lowOct;
      placed.count += 1;
    }
  }
}

function generateSpeedwayBass(rng, world, scale, comp, melody, steps, bass, maxCount, _meta) {
  const placed = { count: 0 };
  placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps);
  for (let i = 0; i < steps && placed.count < maxCount; i += 1) {
    if (bass[i] >= 0) continue;
    const root = scaleDegreeRoot(scale, comp, i);
    const note = i % 2 === 0 ? root : transposeScaleSteps(root, scale, 2);
    placeBassNote(bass, i, note, placed, maxCount);
  }
}

function generateDungeonBass(rng, world, scale, comp, melody, steps, bass, maxCount, meta) {
  const placed = { count: 0 };
  const barLen = comp.barLen;
  placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps);

  for (let i = barLen; i < steps && placed.count < maxCount; i += barLen) {
    if (bass[i] >= 0) continue;
    const root = scaleDegreeRoot(scale, comp, i);
    const moved = transposeScaleSteps(root, scale, rng() < 0.55 ? 0 : -1);
    if (placeBassNote(bass, i, moved, placed, maxCount)) {
      meta.decayMap[i] = 1.45 + rng() * 0.35;
    }
  }

  for (let i = 2; i < steps && placed.count < maxCount; i += 3 + Math.floor(rng() * 2)) {
    if (bass[i] >= 0) continue;
    const root = scaleDegreeRoot(scale, comp, i);
    placeBassNote(bass, i, root, placed, maxCount);
  }
}

function generateBeachBass(rng, world, scale, comp, melody, steps, bass, maxCount, _meta) {
  const placed = { count: 0 };
  placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps);
  for (let i = 0; i < steps && placed.count < maxCount; i += 4 + Math.floor(rng() * 3)) {
    if (bass[i] >= 0) continue;
    placeBassNote(bass, i, scaleDegreeRoot(scale, comp, i), placed, maxCount);
  }
}

function generateIceCaveBass(rng, world, scale, comp, melody, steps, bass, maxCount, _meta) {
  const placed = { count: 0 };
  placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps);
  for (let i = 0; i < steps && placed.count < maxCount; i += 2) {
    if (bass[i] >= 0) continue;
    const root = scaleDegreeRoot(scale, comp, i);
    const third = transposeScaleSteps(root, scale, 1);
    placeBassNote(bass, i, i % 4 < 2 ? root : third, placed, maxCount);
  }
}

function generateSpaceAgeBass(rng, world, scale, comp, melody, steps, bass, maxCount, _meta) {
  const placed = { count: 0 };
  placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps);
  let useFifth = false;
  for (let i = 0; i < steps && placed.count < maxCount; i += 2 + Math.floor(rng() * 2)) {
    if (bass[i] >= 0) { useFifth = !useFifth; continue; }
    const root = scaleDegreeRoot(scale, comp, i);
    const note = useFifth ? transposeScaleSteps(root, scale, 2) : root;
    useFifth = !useFifth;
    placeBassNote(bass, i, note, placed, maxCount);
  }
}

function generateBubbleBass(rng, world, scale, comp, melody, steps, bass, maxCount, _meta) {
  const placed = { count: 0 };
  placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps);
  for (let i = 0; i < steps && placed.count < maxCount; i += 3 + Math.floor(rng() * 4)) {
    if (bass[i] >= 0) continue;
    const root = scaleDegreeRoot(scale, comp, i);
    const note = rng() < 0.45 ? root : transposeScaleSteps(root, scale, 2);
    placeBassNote(bass, i, note, placed, maxCount);
  }
}

function generateDesertBass(rng, world, scale, comp, melody, steps, bass, maxCount, _meta) {
  const placed = { count: 0 };
  placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps);
  for (let i = 0; i < steps && placed.count < maxCount; i += 6 + Math.floor(rng() * 4)) {
    if (bass[i] >= 0) continue;
    placeBassNote(bass, i, scaleDegreeRoot(scale, comp, i), placed, maxCount);
  }
}

const BASS_GENERATORS = {
  arcade: generateArcadeBass,
  disco: generateArcadeBass,
  speedway: generateSpeedwayBass,
  dungeon: generateDungeonBass,
  beach: generateBeachBass,
  'ice-cave': generateIceCaveBass,
  'space-age': generateSpaceAgeBass,
  bubble: generateBubbleBass,
  desert: generateDesertBass,
};

function generateBassLane(rng, worldKey, world, melody, steps) {
  const scale = scaleFor(world.mode);
  const comp = compositionFor(world);
  const bass = Array(steps).fill(-1);
  const maxCount = bassTargetCount(rng, steps);
  const meta = { octaveMap: {}, decayMap: {} };
  const gen = BASS_GENERATORS[worldKey] || generateBeachBass;
  gen(rng, world, scale, comp, melody, steps, bass, maxCount, meta);

  return {
    bass,
    bassVol: 0.25 + rng() * 0.15,
    bassOctave: rng() < 0.62 ? -1 : -2,
    bassOctaveMap: meta.octaveMap,
    bassDecayMap: meta.decayMap,
  };
}

/**
 * Build hidden accompaniment lanes after melody is composed.
 * @param {() => number} rng
 * @param {string} worldKey
 * @param {object} world
 * @param {number[]} melody
 * @param {number} steps
 * @returns {SequencerLanes}
 */
export function buildSequencer(rng, worldKey, world, melody, steps) {
  const bassLane = generateBassLane(rng, worldKey, world, melody, steps);
  let events = addEchoEvents(rng, worldKey, melody, steps);
  events = addHarmonyEvents(rng, worldKey, world, melody, steps, events);
  const comp = compositionFor(world);

  return {
    bass: bassLane.bass,
    bassVol: bassLane.bassVol,
    bassOctave: bassLane.bassOctave,
    bassDecayMap: bassLane.bassDecayMap,
    bassOctaveMap: bassLane.bassOctaveMap,
    events,
    expression: expressionMetaForSequencer(steps, comp.barLen),
  };
}

const TITLE_BITS = {
  'space-age': { a: ['Solar', 'Orbital', 'Beacon', 'Relay', 'Cosmic', 'Uplink'], b: ['Signal', 'Probe', 'Scan', 'Rise', 'Pulse', 'Trail'] },
  arcade: { a: ['Bonus', 'High', 'Token', 'Pixel', 'Insert', 'Level'], b: ['Score', 'Run', 'Blip', 'Loop', 'Start', 'Coin'] },
  dungeon: { a: ['Crypt', 'Hollow', 'Shadow', 'Lost', 'Ancient', 'Rust'], b: ['Hall', 'Depths', 'Whisper', 'Gate', 'Maze', 'Echo'] },
  bubble: { a: ['Bouncy', 'Gummy', 'Pop', 'Float', 'Jelly', 'Wobble'], b: ['Hop', 'Blob', 'Drift', 'Plop', 'Ring', 'Bounce'] },
  beach: { a: ['Tidal', 'Sandy', 'Coastal', 'Seafoam', 'Palm', 'Salt'], b: ['Drift', 'Shore', 'Glow', 'Lagoon', 'Breeze', 'Wave'] },
  desert: { a: ['Mirage', 'Dune', 'Dust', 'Dry', 'Caravan', 'Sage'], b: ['Echo', 'Trail', 'Bloom', 'Wind', 'Wander', 'Haze'] },
  'ice-cave': { a: ['Frost', 'Crystal', 'Frozen', 'Aurora', 'Glacier', 'Shimmer'], b: ['Chime', 'Shard', 'Gleam', 'Spark', 'Bell', 'Glint'] },
  speedway: { a: ['Turbo', 'Rapid', 'Blitz', 'Neon', 'Rocket', 'Hyper'], b: ['Lap', 'Dash', 'Circuit', 'Rush', 'Sprint', 'Heat'] },
  disco: { a: ['Bonus', 'High', 'Token', 'Pixel', 'Insert', 'Level'], b: ['Score', 'Run', 'Blip', 'Loop', 'Start', 'Coin'] },
};

export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function lerp(rng, [lo, hi]) {
  return lo + rng() * (hi - lo);
}

function scaleFor(mode) {
  return mode === 'minor' ? MINOR_PENT : MAJOR_PENT;
}

function scaleIndex(scale, row) {
  const i = scale.indexOf(row);
  return i >= 0 ? i : 0;
}

function effectiveRestChance(world) {
  return Math.min(0.48, world.restChance * (1.4 - world.noteDensity));
}

function resolveWorldKey(worldKey) {
  if (worldKey === 'disco') return 'arcade';
  return worldKey;
}

function rest(rng, world) {
  return rng() < effectiveRestChance(world) ? -1 : null;
}

function stepInScale(rng, scale, prev, delta) {
  const idx = scaleIndex(scale, prev);
  const next = Math.max(0, Math.min(scale.length - 1, idx + delta));
  return scale[next];
}

function pickLeap(rng, scale, prev, world) {
  const idx = scaleIndex(scale, prev);
  const jump = 2 + Math.floor(rng() * 2);
  const dir = rng() < 0.5 ? -1 : 1;
  const next = Math.max(0, Math.min(scale.length - 1, idx + dir * jump));
  return scale[next];
}

function composeBeacon(rng, world, steps) {
  const scale = scaleFor(world.mode);
  const half = steps / 2;
  let prev = world.homeRow;
  if (!scale.includes(prev)) prev = scale[0];
  const a = [];
  for (let i = 0; i < half; i++) {
    const r = rest(rng, world);
    if (r !== null) { a.push(r); continue; }
    const dir = rng() < 0.72 ? 1 : (rng() < 0.4 ? 0 : -1);
    prev = stepInScale(rng, scale, prev, dir);
    a.push(prev);
  }
  const motif = a.filter((n) => n >= 0).slice(-3);
  const b = [];
  for (let i = 0; i < half; i++) {
    if (rng() < 0.15 && motif.length) {
      b.push(motif[i % motif.length]);
    } else if (rng() < effectiveRestChance(world) * 0.6) {
      b.push(-1);
    } else {
      prev = stepInScale(rng, scale, prev, rng() < 0.6 ? 1 : 0);
      b.push(prev);
    }
  }
  return stitchPhrase(a, b, steps, world, scale, rng);
}

function composeHook(rng, world, steps) {
  const scale = scaleFor(world.mode);
  const motifLen = Math.min(4, Math.max(3, Math.floor(steps / 4)));
  const motif = [];
  let prev = world.homeRow;
  for (let i = 0; i < motifLen; i++) {
    if (rng() < 0.08) { motif.push(-1); continue; }
    if (rng() < world.leapChance) prev = pickLeap(rng, scale, prev, world);
    else prev = stepInScale(rng, scale, prev, rng() < 0.55 ? 1 : -1);
    motif.push(prev);
  }
  const out = [];
  for (let i = 0; i < steps; i++) {
    if (rng() < 0.04) { out.push(-1); continue; }
    out.push(motif[i % motifLen]);
  }
  out[steps - 1] = world.homeRow;
  return out;
}

function composeWander(rng, world, steps) {
  const scale = scaleFor(world.mode);
  let prev = world.homeRow;
  const out = [];
  for (let i = 0; i < steps; i++) {
    const r = rest(rng, world);
    if (r !== null) { out.push(r); continue; }
    if (rng() < world.leapChance) {
      prev = pick(rng, scale);
    } else {
      const dir = rng() < 0.62 ? -1 : (rng() < 0.35 ? 1 : 0);
      prev = stepInScale(rng, scale, prev, dir);
    }
    out.push(prev);
  }
  return stitchPhrase(out.slice(0, steps / 2), out.slice(steps / 2), steps, world, scale, rng);
}

function composeBounce(rng, world, steps) {
  const scale = scaleFor(world.mode);
  let prev = world.homeRow;
  const out = [];
  let lastDir = 1;
  for (let i = 0; i < steps; i++) {
    const r = rest(rng, world);
    if (r !== null) { out.push(r); continue; }
    if (rng() < world.leapChance) {
      lastDir *= -1;
      const jump = 2 + Math.floor(rng() * 2);
      prev = stepInScale(rng, scale, prev, lastDir * jump);
    } else {
      prev = stepInScale(rng, scale, prev, lastDir);
      if (rng() < 0.45) lastDir *= -1;
    }
    out.push(prev);
  }
  out[steps - 1] = pick(rng, scale.filter((n) => n <= 4));
  return out;
}

function composeWave(rng, world, steps) {
  const scale = scaleFor(world.mode);
  let prev = world.homeRow;
  const out = [];
  let drift = 1;
  for (let i = 0; i < steps; i++) {
    const r = rest(rng, world);
    if (r !== null) { out.push(r); continue; }
    if (i > 0 && i % 4 === 0) drift *= -1;
    prev = stepInScale(rng, scale, prev, drift);
    out.push(prev);
  }
  return stitchPhrase(out.slice(0, steps / 2), out.slice(steps / 2), steps, world, scale, rng, 0.35);
}

function composeSparse(rng, world, steps) {
  const scale = scaleFor(world.mode);
  const out = Array(steps).fill(-1);
  const noteCount = Math.max(2, Math.floor(steps * world.noteDensity * 0.45));
  const slots = [...Array(steps).keys()].sort(() => rng() - 0.5);
  let prev = world.homeRow;
  for (let i = 0; i < noteCount; i++) {
    const slot = slots[i];
    if (rng() < 0.35) prev = pick(rng, scale);
    else prev = stepInScale(rng, scale, prev, rng() < 0.5 ? -1 : 1);
    out[slot] = prev;
  }
  out[steps - 1] = world.homeRow;
  if (steps > 2 && rng() < 0.5) out[0] = world.homeRow;
  return out;
}

function composeCrystal(rng, world, steps) {
  const scale = scaleFor(world.mode);
  const shardPool = scale.filter((n) => n <= 1);
  const pool = shardPool.length ? shardPool : scale.slice(0, 2);
  const out = [];
  let prev = pool[0];
  for (let i = 0; i < steps; i++) {
    if (rng() < effectiveRestChance(world)) { out.push(-1); continue; }
    if (i % 2 === 0) {
      prev = pick(rng, pool);
      out.push(prev);
    } else if (rng() < 0.62) {
      prev = transposeScaleSteps(prev, scale, rng() < 0.5 ? 2 : -2);
      out.push(prev);
    } else {
      prev = stepInScale(rng, scale, prev, rng() < 0.5 ? 1 : -1);
      out.push(prev);
    }
  }
  return stitchPhrase(out.slice(0, steps / 2), out.slice(steps / 2), steps, world, scale, rng, 0.5);
}

function composeRace(rng, world, steps) {
  const scale = scaleFor(world.mode);
  const out = [];
  let prev = world.homeRow;
  let run = 0;
  for (let i = 0; i < steps; i++) {
    if (rng() < 0.03) { out.push(-1); run = 0; continue; }
    if (run > 0 && run < 4) {
      prev = stepInScale(rng, scale, prev, 1);
      run += 1;
    } else if (rng() < 0.82) {
      prev = stepInScale(rng, scale, prev, 1);
      run = 1;
    } else {
      prev = stepInScale(rng, scale, prev, -1);
      run = 0;
    }
    out.push(prev);
  }
  return stitchPhrase(out.slice(0, steps / 2), out.slice(0, steps / 2), steps, world, scale, rng, 0.75);
}

function stitchPhrase(a, b, steps, world, scale, rng, varyChance = 0.45) {
  const pattern = [...a, ...b].slice(0, steps);
  while (pattern.length < steps) pattern.push(-1);
  pattern[steps - 1] = world.homeRow;
  if (steps > 1 && rng() < varyChance) {
    const idx = steps - 2;
    pattern[idx] = stepInScale(rng, scale, pattern[steps - 1], rng() < 0.5 ? -1 : 1);
  }
  return pattern;
}

const COMPOSERS = {
  beacon: composeBeacon,
  hook: composeHook,
  wander: composeWander,
  bounce: composeBounce,
  wave: composeWave,
  sparse: composeSparse,
  crystal: composeCrystal,
  race: composeRace,
};

function generateMelody(rng, world, steps) {
  const compose = COMPOSERS[world.compose] || composeBeacon;
  const comp = compositionFor(world);
  let pattern = compose(rng, world, steps);
  pattern = refineMelody(rng, world, pattern);
  pattern = applyPhraseMemory(rng, world, pattern);
  pattern = applyGroovePreference(rng, world, pattern);
  const hookAt = hookStepIndex(steps, comp);
  pattern = applyHookStep(rng, world, pattern);
  pattern = applyAnswerCadence(rng, world, pattern, hookAt);
  return pattern;
}

function generateParams(rng, world) {
  const p = world.params;
  return {
    pitch: Math.round(lerp(rng, p.pitch)),
    tone: lerp(rng, p.tone),
    decay: lerp(rng, p.decay),
    crunch: lerp(rng, p.crunch),
    noise: lerp(rng, p.noise),
    attack: lerp(rng, p.attack),
    bend: lerp(rng, p.bend),
    wobble: lerp(rng, p.wobble),
    detune: lerp(rng, p.detune),
    filter: lerp(rng, p.filter),
    gap: lerp(rng, p.gap),
    punch: lerp(rng, p.punch || p.attack),
  };
}

function generateTitle(rng, worldKey) {
  const key = resolveWorldKey(worldKey);
  const bits = TITLE_BITS[key] || TITLE_BITS.bubble;
  return `${pick(rng, bits.a)} ${pick(rng, bits.b)}`;
}

/** Random two-word title for hand-built melodies (no world). */
export function generateCustomTitle(seed = randomSeed()) {
  const rng = mulberry32(seed >>> 0);
  const keys = Object.keys(TITLE_BITS).filter((key) => key !== 'disco');
  const bits = TITLE_BITS[pick(rng, keys)];
  return `${pick(rng, bits.a)} ${pick(rng, bits.b)}`;
}

function buildSong(seed, worldKey, rng) {
  const key = resolveWorldKey(worldKey);
  const world = WORLDS[key] || WORLDS['space-age'];
  const steps = pick(rng, STEP_PREF[key] || PHRASE_STEPS);
  const tempo = Math.round(lerp(rng, world.tempo));
  const melody = normalizePattern(generateMelody(rng, world, steps), steps);
  return {
    seed: seed >>> 0,
    worldKey: key,
    worldLabel: world.label,
    title: generateTitle(rng, key),
    steps,
    tempo,
    pattern: melody,
    sequencer: buildSequencer(rng, key, world, melody, steps),
    params: generateParams(rng, world),
  };
}

export function generateFromSeed(seed) {
  const rng = mulberry32(seed >>> 0);
  const worldKey = pick(rng, FEATURED_WORLD_KEYS);
  return buildSong(seed, worldKey, rng);
}

export function generateFromWorld(worldKey, seed = randomSeed()) {
  const key = resolveWorldKey(worldKey);
  if (!WORLDS[key]) return generateFromSeed(seed);
  const rng = mulberry32(seed >>> 0);
  return buildSong(seed, key, rng);
}

/** @deprecated use generateFromWorld */
export const generateFromFamily = generateFromWorld;

export function randomSeed() {
  return (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
}

function changeChance(intensity, world, base = 1) {
  const level = MUTATE_INTENSITY[intensity] || MUTATE_INTENSITY.medium;
  const cap = intensity === 'wild' ? 0.92 : intensity === 'subtle' ? 0.28 : 0.68;
  return Math.min(cap, (1 - level.preserve) * (world?.mutateSpread ?? 1) * base);
}

export function mutateSong(current, seed, revision = 0, intensity = 'medium') {
  const rng = mulberry32((seed + revision * 0x9E3779B9) >>> 0);
  const key = resolveWorldKey(current.worldKey);
  const world = WORLDS[key] || WORLDS[pick(rng, FEATURED_WORLD_KEYS)];
  const scale = scaleFor(world.mode);
  const steps = current.steps;
  const noteChange = changeChance(intensity, world, 1);
  const paramChange = changeChance(intensity, world, 0.85);

  const pattern = current.pattern.map((n, i) => {
    if (i === steps - 1) return world.homeRow;
    return mutateNote(rng, n, scale, world, noteChange, i, intensity);
  });

  const p = world.params;
  const params = {
    pitch: Math.round(mutateValue(rng, current.params.pitch, p.pitch[0], p.pitch[1], paramChange, intensity)),
    tone: mutateValue(rng, current.params.tone, 0, 1, paramChange, intensity),
    decay: mutateValue(rng, current.params.decay, 0, 1, paramChange, intensity),
    crunch: mutateValue(rng, current.params.crunch, 0, 1, paramChange, intensity),
    noise: mutateValue(rng, current.params.noise, 0, 1, paramChange, intensity),
    attack: mutateValue(rng, current.params.attack, 0, 1, paramChange, intensity),
    bend: mutateValue(rng, current.params.bend, 0, 1, paramChange, intensity),
    wobble: mutateValue(rng, current.params.wobble, 0, 1, paramChange, intensity),
    detune: mutateValue(rng, current.params.detune, 0, 1, paramChange, intensity),
    filter: mutateValue(rng, current.params.filter, 0, 1, paramChange, intensity),
    volume: current.params.volume,
    gap: mutateValue(rng, current.params.gap, 0, 1, paramChange, intensity),
    punch: mutateValue(rng, current.params.punch ?? current.params.attack, 0, 1, paramChange, intensity),
  };

  const titleBits = TITLE_BITS[key] || TITLE_BITS.bubble;
  const retitleChance = intensity === 'wild' ? 0.72 : intensity === 'medium' ? 0.38 : 0.08;
  const title = rng() < retitleChance
    ? `${pick(rng, titleBits.a)} ${pick(rng, titleBits.b)}`
    : current.title;

  const melody = normalizePattern(pattern, steps);
  return {
    seed: seed >>> 0,
    worldKey: key,
    worldLabel: world.label,
    title,
    steps,
    tempo: Math.round(mutateValue(rng, current.tempo, world.tempo[0], world.tempo[1], paramChange, intensity)),
    pattern: melody,
    sequencer: buildSequencer(rng, key, world, melody, steps),
    params,
    intensity,
  };
}

function mutateValue(rng, value, lo, hi, chance, intensity = 'medium') {
  if (rng() > chance) return value;
  const span = hi - lo;
  const scale = intensity === 'subtle' ? 0.08 : intensity === 'wild' ? 0.52 : 0.3;
  const delta = (rng() - 0.5) * span * scale;
  return Math.max(lo, Math.min(hi, value + delta));
}

function mutateNote(rng, note, scale, world, chance, step = 0, intensity = 'medium') {
  if (rng() > chance) return note;
  const restBoost = intensity === 'wild' ? 0.14 : intensity === 'subtle' ? 0.02 : 0.08;
  if (rng() < effectiveRestChance(world) + restBoost) return -1;
  if (rng() < world.leapChance + 0.12) {
    let next = pick(rng, scale);
    if (step >= 0 && rng() < 0.2) {
      const comp = compositionFor(world);
      const chord = chordTones(scale, chordAtStep(comp, step));
      next = biasToChord(rng, next, scale, chord, comp.chordBias);
    }
    return next;
  }
  const prev = note >= 0 ? note : world.homeRow;
  const composer = COMPOSERS[world.compose];
  let next;
  if (composer === composeWander || composer === composeSparse) {
    next = pick(rng, scale);
  } else if (composer === composeRace) {
    next = stepInScale(rng, scale, prev, 1);
  } else {
    next = stepInScale(rng, scale, prev, rng() < 0.5 ? -1 : 1);
  }
  if (step >= 0 && rng() < 0.15) {
    const comp = compositionFor(world);
    const chord = chordTones(scale, chordAtStep(comp, step));
    next = biasToChord(rng, next, scale, chord, comp.chordBias);
  }
  return next;
}

export function replayFromSeed(seed, revision = 0, worldKey = null, intensity = 'medium') {
  const key = worldKey ? resolveWorldKey(worldKey) : null;
  let song = key ? generateFromWorld(key, seed) : generateFromSeed(seed);
  for (let r = 0; r < revision; r++) {
    song = mutateSong(song, seed, r, intensity);
  }
  return { ...song, seed: seed >>> 0, revision, intensity };
}
