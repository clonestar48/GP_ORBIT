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
      pitch: [110, 360], tone: [0.08, 0.38], decay: [0.42, 0.78], crunch: [0.08, 0.22],
      noise: [0.14, 0.34], attack: [0.06, 0.2], bend: [0.28, 0.45], wobble: [0.08, 0.28],
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
  neon: {
    label: 'Neon',
    mood: 'Beverly Hills Cop groove',
    compose: 'ascend',         // composeRetrowave — motif-based, loops cleanly
    mode: 'minor',             // Axel F is in F minor — dark and driving
    noteDensity: 0.65,
    mutateSpread: 0.75,
    params: {
      pitch: [195, 440],       // D3–A4: mid register, not alarm territory
      tone: [0.04, 0.14],      // square-wave territory
      decay: [0.28, 0.48], crunch: [0, 0.03],
      noise: [0, 0.01], attack: [0.03, 0.09], bend: [0.04, 0.14], wobble: [0.01, 0.06],
      detune: [0.04, 0.10], filter: [0.16, 0.36], volume: [0.44, 0.58], gap: [0.08, 0.20],
    },
    tempo: [108, 120],         // 125–138 BPM — Axel F groove
    restChance: 0.24,          // breathing room in the groove
    leapChance: 0.18,
    homeRow: 2,
  },
  'music-box': {
    label: 'Music Box',
    mood: 'Clockwork lullaby',
    compose: 'musicbox',
    mode: 'major',
    noteDensity: 0.70,
    mutateSpread: 0.72,
    params: {
      pitch: [1280, 2200], tone: [0, 0.14], decay: [0.22, 0.42], crunch: [0, 0.06],
      noise: [0, 0.02], attack: [0, 0.03], bend: [0.78, 0.92], wobble: [0, 0.06],
      detune: [0.10, 0.24], filter: [0, 0.06], volume: [0.40, 0.54], gap: [0.03, 0.08],
    },
    tempo: [185, 245],
    restChance: 0.22,
    leapChance: 0.05,
    homeRow: 1,
  },
  western: {
    label: 'Western',
    mood: 'Dusty trail',
    compose: 'hook',
    mode: 'major',
    noteDensity: 0.54,
    mutateSpread: 0.95,
    params: {
      // Pitch: 160–400 Hz — real banjo register (open G3–G4 range).
      // Upper end was the buzz source: 500+ Hz K-S plucks sound insect-like.
      pitch: [160, 400],
      tone: [0.04, 0.18], decay: [0.04, 0.10], crunch: [0, 0.06],
      noise: [0, 0.02], attack: [0, 0.01], bend: [0.52, 0.66], wobble: [0, 0.02],
      detune: [0.02, 0.10], filter: [0, 0.02], volume: [0.52, 0.66], gap: [0.06, 0.16],
    },
    tempo: [190, 260],
    restChance: 0.30,
    leapChance: 0.14,
    homeRow: 4,
  },
  forest: {
    label: 'Forest',
    mood: 'Dappled light',
    compose: 'wander',
    mode: 'major',
    noteDensity: 0.55,
    mutateSpread: 0.88,
    params: {
      pitch: [260, 680], tone: [0, 0.22], decay: [0.38, 0.68], crunch: [0, 0.08],
      noise: [0.04, 0.12], attack: [0.08, 0.24], bend: [0.44, 0.58], wobble: [0.04, 0.18],
      detune: [0.06, 0.18], filter: [0.08, 0.28], volume: [0.38, 0.52], gap: [0.12, 0.28],
    },
    tempo: [198, 268],
    restChance: 0.26,
    leapChance: 0.10,
    homeRow: 4,
  },
  medieval: {
    label: 'Medieval',
    mood: 'Court and cobblestone',
    compose: 'crystal',
    mode: 'minor',
    noteDensity: 0.72,
    mutateSpread: 0.85,
    params: {
      pitch: [420, 980], tone: [0.58, 0.88], decay: [0.06, 0.18], crunch: [0, 0.04],
      noise: [0, 0.01], attack: [0, 0.02], bend: [0.54, 0.68], wobble: [0, 0.04],
      detune: [0.08, 0.22], filter: [0.04, 0.18], volume: [0.44, 0.58], gap: [0.04, 0.12],
    },
    tempo: [148, 198],
    restChance: 0.14,
    leapChance: 0.24,
    homeRow: 3,
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
  arcade:   [8, 8, 12, 12, 16],
  speedway: [16, 24, 24, 32],
  neon:       [16, 24, 32, 32],
  'music-box': [16, 16, 24, 24],
  western:    [8, 12, 16, 16],   // tight, punchy — short country phrases
  medieval:   [12, 16, 16, 24],
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
  race:   { progression: [0, 3, 0, 3], chordBias: 0.26 },
  ascend: { progression: [0, 4, 2, 3], chordBias: 0.30 }, // I–V–III–IV: textbook 80s chord run
  musicbox: { progression: [0, 0, 4, 0], chordBias: 0.18 }, // simple lullaby — home chord, brief visit to IV
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
  race:   { restFill: 0.32, beatWeight: [1, 0.9, 0.86, 0.88] },
  ascend: { restFill: 0.28, beatWeight: [0.92, 0.44, 0.88, 0.40] }, // downbeat-heavy, lots of space
  musicbox: { restFill: 0.0, beatWeight: [1, 1, 1, 1] }, // motif has fixed rests already — don't add more
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
    case 'ascend': {
      // Retrowave hook: one step up from anchor, then resolve cleanly to home
      out[hookAt] = stepInScale(rng, scale, anchor, 1);
      if (hookAt + 1 < steps) out[hookAt + 1] = world.homeRow;
      break;
    }
    case 'musicbox': {
      // Lullaby landing: step down to home, hold the tonic
      out[hookAt] = stepInScale(rng, scale, anchor, -1);
      if (hookAt + 1 < steps) out[hookAt + 1] = world.homeRow;
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
    'music-box': 0.0,   // no echo — tines ring once and stop
    western:     0.04,  // nearly dry — a distant creek echo, not a hall reverb
    forest:      0.10,  // gentle natural echo
    medieval:    0.18,  // light stone hall echo
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

    const isDesert    = worldKey === 'desert';
    const isIceCave   = worldKey === 'ice-cave';
    const isSpeedway  = worldKey === 'speedway';
    const isMusicBox  = worldKey === 'music-box';
    events[target].push({
      note: melody[i],
      vol:    isDesert    ? 0.22 + rng() * 0.08
            : isIceCave   ? 0.28 + rng() * 0.10   // slightly quieter — high-register ping
            : isSpeedway  ? 0.20 + rng() * 0.08   // very quiet — motion and distance
            : isMusicBox  ? 0.18 + rng() * 0.06   // faint box resonance — one soft repeat
            :               0.36 + rng() * 0.16,
      decay:  isDesert    ? 0.28 + rng() * 0.12
            : isIceCave   ? 0.30 + rng() * 0.12   // shorter — snappy crystal reflection
            : isSpeedway  ? 0.16 + rng() * 0.08   // tight — blur of motion, not a tail
            : isMusicBox  ? 0.22 + rng() * 0.10   // short wooden-box tail
            :               0.42 + rng() * 0.22,
      octave: isIceCave ? (rng() < 0.62 ? 1 : 0) : 0,
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
    'music-box': 0.02,
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
  // Mechanical drivetrain cycle: root, root, fifth, root — repeating 4-step engine pattern.
  const cycle = [0, 0, 2, 0];
  for (let i = 0; i < steps && placed.count < maxCount; i += 2) {
    if (bass[i] >= 0) continue;
    const root  = scaleDegreeRoot(scale, comp, i);
    const shift = cycle[Math.floor(i / 2) % cycle.length];
    placeBassNote(bass, i, transposeScaleSteps(root, scale, shift), placed, maxCount);
  }
}

function generateDungeonBass(rng, world, scale, comp, melody, steps, bass, maxCount, meta) {
  const placed = { count: 0 };
  const barLen = comp.barLen;

  // Phrase-boundary anchor — one deep note at the very start
  placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps);

  // Bar-boundary hits with a 55% skip — most bars get no bass hit at all.
  // No decayMap override — use the world's natural short envelope so notes
  // don't ring into each other and create a continuous rumble.
  for (let i = barLen; i < steps && placed.count < maxCount; i += barLen) {
    if (bass[i] >= 0 || rng() < 0.55) continue;
    const root  = scaleDegreeRoot(scale, comp, i);
    const moved = transposeScaleSteps(root, scale, rng() < 0.55 ? 0 : -1);
    placeBassNote(bass, i, moved, placed, maxCount);
  }

  // One rare off-beat hit per phrase, 20% chance — a solitary footstep.
  for (let i = barLen + 5; i < steps && placed.count < maxCount; i += 12 + Math.floor(rng() * 5)) {
    if (bass[i] >= 0 || rng() < 0.80) continue;
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

function generateNeonBass(rng, world, scale, comp, melody, steps, bass, maxCount, _meta) {
  const placed = { count: 0 };
  placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps);
  // Root–fifth–octave walking pattern, locked to every 4 steps.
  // Feels like a synthwave bass sequencer: steady, pulsing, driving beneath the pads.
  const barLen = comp.barLen;
  for (let bar = 0; bar < steps; bar += barLen) {
    const root  = scaleDegreeRoot(scale, comp, bar);
    const fifth = transposeScaleSteps(root, scale, 2);
    const walk  = [root, root, fifth, root];
    for (let j = 0; j < walk.length && placed.count < maxCount; j++) {
      const step = bar + j * Math.floor(barLen / 4);
      if (step >= steps || bass[step] >= 0) continue;
      placeBassNote(bass, step, walk[j], placed, maxCount);
    }
  }
}

function generateWesternBass(rng, world, scale, comp, melody, steps, bass, maxCount, _meta) {
  const placed = { count: 0 };
  // Boom-chick pattern: root on beat 1, fifth on beat 3 — classic country stride
  for (let i = 0; i < steps && placed.count < maxCount; i++) {
    if (bass[i] >= 0) continue;
    const beat = i % comp.barLen;
    const root = scaleDegreeRoot(scale, comp, i);
    if (beat === 0) placeBassNote(bass, i, root, placed, maxCount);
    else if (beat === 2) placeBassNote(bass, i, transposeScaleSteps(root, scale, 2), placed, maxCount);
  }
}

function generateForestBass(rng, world, scale, comp, melody, steps, bass, maxCount, _meta) {
  const placed = { count: 0 };
  // Sparse, irregular — occasional low root anchors, like a distant log drum
  placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps);
  for (let i = comp.barLen; i < steps && placed.count < maxCount; i += 3 + Math.floor(rng() * 5)) {
    if (bass[i] >= 0) continue;
    if (rng() < 0.55) placeBassNote(bass, i, scaleDegreeRoot(scale, comp, i), placed, maxCount);
  }
}

function generateMedievalBass(rng, world, scale, comp, melody, steps, bass, maxCount, _meta) {
  const placed = { count: 0 };
  // Simple modal bass — root and occasional fifth, 2-step stride
  placePhraseBoundaryBass(bass, placed, maxCount, scale, comp, steps);
  for (let i = 0; i < steps && placed.count < maxCount; i += 2 + Math.floor(rng() * 2)) {
    if (bass[i] >= 0) continue;
    const root = scaleDegreeRoot(scale, comp, i);
    placeBassNote(bass, i, rng() < 0.7 ? root : transposeScaleSteps(root, scale, 2), placed, maxCount);
  }
}

function generateMusicBoxBass(rng, world, scale, comp, melody, steps, bass, maxCount, _meta) {
  const placed = { count: 0 };
  // Music boxes are essentially monophonic — only a few phrase-anchor undertones
  const limit = Math.min(maxCount, 3);
  for (let i = 0; i < steps && placed.count < limit; i += comp.barLen * 2) {
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
  neon: generateNeonBass,
  'music-box': generateMusicBoxBass,
  western: generateWesternBass,
  forest: generateForestBass,
  medieval: generateMedievalBass,
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
 * Speedway acceleration burst — 3 quick ascending melody notes near phrase end.
 * Fires ~60% of patterns, only on empty steps. Reads as "overtaking" — a brief
 * moment of speed, not a melodic flourish.
 */
function addSpeedwayBursts(rng, world, melody, steps, events) {
  if (rng() > 0.60) return events; // only ~60% of patterns get a burst

  const scale = scaleFor(world.mode);
  const comp  = compositionFor(world);

  // Target: last 3 steps before the pattern loops — the "floor it before the restart" moment
  const burstStart = steps - 3;
  if (burstStart < 1) return events;

  const root = scaleDegreeRoot(scale, comp, burstStart);

  for (let j = 0; j < 3; j++) {
    const step = burstStart + j;
    if (step >= steps) break;
    if (melody[step] >= 0) continue; // don't stack on existing melody notes
    events[step].push({
      note:   transposeScaleSteps(root, scale, j + 1), // +1, +2, +3 scale steps up
      vol:    0.65 + rng() * 0.18, // punchy — this is the moment of speed
      decay:  0.13 + rng() * 0.07, // short and snappy
      octave: 0,
      lane:   'melody',
    });
  }

  return events;
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
  if (worldKey === 'speedway') {
    events = addSpeedwayBursts(rng, world, melody, steps, events);
  }
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
  'music-box': { a: ['Tiny', 'Golden', 'Wind', 'Pocket', 'Brass', 'Ivory'], b: ['Waltz', 'Turn', 'Tune', 'Spring', 'Chime', 'Lullaby'] },
  western:    { a: ['Dusty', 'Lone', 'Prairie', 'Saddle', 'Sundown', 'Tumbleweed'], b: ['Trail', 'Draw', 'Range', 'Ride', 'Creek', 'Canyon'] },
  forest:     { a: ['Mossy', 'Birch', 'Fern', 'Hollow', 'Dappled', 'Root'], b: ['Path', 'Canopy', 'Creek', 'Glade', 'Grove', 'Clearing'] },
  medieval:   { a: ['Cobble', 'Torch', 'Guild', 'Iron', 'Winding', 'Stone'], b: ['Court', 'Gate', 'March', 'Tower', 'Tavern', 'Road'] },
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

/**
 * Retrowave lead melody — builds a short 4-note motif and tiles/varies it across the phrase.
 * The motif stays stepwise and resolves to the tonic, giving it that "catchy synth hook" feel.
 * Think Kavinsky, FM-84, Gunship: a simple idea, repeated with small variations.
 */
function composeRetrowave(rng, world, steps) {
  const scale    = scaleFor(world.mode);
  const motifLen = 4;
  const motif    = [];
  let prev = world.homeRow;
  if (!scale.includes(prev)) prev = scale[Math.floor(scale.length / 2)];

  // Build motif: mostly stepwise, one occasional small leap, always lands on a scale tone
  for (let i = 0; i < motifLen; i++) {
    if (i === 0) { motif.push(prev); continue; }
    const leap = rng() < 0.2;
    const dir  = rng() < 0.62 ? 1 : -1;
    prev = leap
      ? transposeScaleSteps(prev, scale, dir * 2)
      : stepInScale(rng, scale, prev, dir);
    motif.push(prev);
  }
  // Resolve motif back toward home so each loop lands cleanly
  motif[motifLen - 1] = world.homeRow;

  // Tile the motif across the full phrase, adding slight variation every 2nd repeat
  const out = [];
  for (let i = 0; i < steps; i++) {
    if (rng() < effectiveRestChance(world) * 0.55) { out.push(-1); continue; }
    const rep  = Math.floor(i / motifLen);
    const slot = i % motifLen;
    if (rep % 2 === 0 || rng() < 0.72) {
      out.push(motif[slot]);
    } else {
      // Variation: step one above/below the motif note
      const varied = stepInScale(rng, scale, motif[slot], rng() < 0.5 ? 1 : -1);
      out.push(varied);
    }
  }
  out[steps - 1] = world.homeRow;
  return out;
}

/**
 * Music box melody — short repeating lullaby motif in the high register.
 * Stepwise, mostly descending, tiles cleanly: the mechanical "same phrase again" feel.
 */
/**
 * Music box melody — 16-step syncopated motif that tiles exactly.
 * The irregular rest pattern gives a "staggered clockwork" feel:
 * quick paired notes, unexpected gaps, and a longer pause near the end.
 * Notes descend from high register toward home, in the spirit of a real comb.
 *
 * Rest map (X = note, . = rest):
 *   X X . X X . . X . X X . X . . X
 *   0 1 2 3 4 5 6 7 8 9 A B C D E F
 * Pairs at (0,1), (3,4), (9,A), (C) with gaps of 1–3 steps between groups.
 */
function composeMusicBox(rng, world, steps) {
  const scale = scaleFor(world.mode);
  const hi = scale[Math.min(scale.length - 1, 4 + Math.floor(rng() * 2))];

  // Fixed syncopated rhythm mask — 1 = note slot, 0 = rest
  const mask = [1,1,0,1,1,0,0,1,0,1,1,0,1,0,0,1];
  const motifLen = mask.length; // 16

  // Melodic shape: a descending arch across the 16 slots
  // We assign pitches only to the note slots, stepping mostly downward
  const noteSlots = mask.map((m, i) => m ? i : -1).filter((i) => i >= 0);
  const pitchMap  = {};
  let pos = hi;
  noteSlots.forEach((slot, k) => {
    // Mostly descend, but step up once in the middle for shape
    const dir = k < noteSlots.length / 2 ? -1 : (k === Math.floor(noteSlots.length / 2) ? 1 : -1);
    if (k > 0) pos = stepInScale(rng, scale, pos, dir);
    pitchMap[slot] = pos;
  });
  // Last note always resolves to home
  pitchMap[noteSlots[noteSlots.length - 1]] = world.homeRow;

  const motif = Array(motifLen).fill(-1);
  for (const slot of noteSlots) motif[slot] = pitchMap[slot];

  // Tile exactly — mechanical repeat
  const out = [];
  for (let i = 0; i < steps; i++) out.push(motif[i % motifLen]);
  out[steps - 1] = world.homeRow;
  return out;
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
  ascend: composeRetrowave,
  musicbox: composeMusicBox,
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
