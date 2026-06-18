/**
 * Procedural song + patch generation — eight distinct sonic territories.
 */

export const MUTATE_INTENSITY = {
  subtle: { preserve: 0.9, label: 'Subtle' },
  medium: { preserve: 0.7, label: 'Medium' },
  wild: { preserve: 0.4, label: 'Wild' },
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
      pitch: [920, 1760], tone: [0, 0.22], decay: [0.08, 0.22], crunch: [0.04, 0.18],
      noise: [0, 0.08], attack: [0, 0.06], bend: [0.58, 0.78], wobble: [0, 0.1],
      detune: [0.06, 0.18], filter: [0, 0.1], volume: [0.44, 0.58], gap: [0.03, 0.1],
    },
    tempo: [145, 185],
    restChance: 0.1,
    leapChance: 0.14,
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
      pitch: [720, 1480], tone: [0.48, 0.82], decay: [0.04, 0.12], crunch: [0.22, 0.42],
      noise: [0.02, 0.1], attack: [0, 0.03], bend: [0.55, 0.72], wobble: [0, 0.06],
      detune: [0.08, 0.2], filter: [0, 0.08], volume: [0.5, 0.64], gap: [0.02, 0.07],
    },
    tempo: [88, 128],
    restChance: 0.05,
    leapChance: 0.32,
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
      pitch: [420, 980], tone: [0, 0.32], decay: [0.1, 0.28], crunch: [0.04, 0.16],
      noise: [0.03, 0.1], attack: [0.18, 0.45], bend: [0.58, 0.8], wobble: [0.35, 0.62],
      detune: [0.12, 0.28], filter: [0.04, 0.18], volume: [0.42, 0.56], gap: [0.06, 0.16],
    },
    tempo: [155, 205],
    restChance: 0.08,
    leapChance: 0.5,
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
      pitch: [260, 580], tone: [0.1, 0.4], decay: [0.48, 0.82], crunch: [0.08, 0.24],
      noise: [0.06, 0.18], attack: [0.02, 0.12], bend: [0.35, 0.5], wobble: [0.02, 0.1],
      detune: [0.04, 0.14], filter: [0.14, 0.32], volume: [0.34, 0.48], gap: [0.28, 0.48],
    },
    tempo: [265, 345],
    restChance: 0.38,
    leapChance: 0.1,
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
      pitch: [1040, 2200], tone: [0, 0.28], decay: [0.22, 0.48], crunch: [0.04, 0.14],
      noise: [0, 0.06], attack: [0, 0.08], bend: [0.52, 0.68], wobble: [0.1, 0.26],
      detune: [0.22, 0.48], filter: [0.02, 0.14], volume: [0.4, 0.54], gap: [0.08, 0.18],
    },
    tempo: [165, 215],
    restChance: 0.12,
    leapChance: 0.24,
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
      pitch: [640, 1380], tone: [0.58, 0.92], decay: [0.04, 0.14], crunch: [0.24, 0.48],
      noise: [0.05, 0.14], attack: [0, 0.03], bend: [0.54, 0.72], wobble: [0.02, 0.12],
      detune: [0.1, 0.26], filter: [0, 0.1], volume: [0.52, 0.66], gap: [0.02, 0.06],
    },
    tempo: [78, 118],
    restChance: 0.03,
    leapChance: 0.28,
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
  const high = scale.filter((n) => n <= 3);
  const pool = high.length ? high : scale.slice(0, 3);
  const out = [];
  for (let i = 0; i < steps; i++) {
    if (rng() < effectiveRestChance(world)) { out.push(-1); continue; }
    if (i % 2 === 0) {
      out.push(pick(rng, pool));
    } else {
      out.push(stepInScale(rng, scale, out[out.length - 1] >= 0 ? out[out.length - 1] : pool[0], rng() < 0.5 ? 1 : -1));
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
    } else if (rng() < 0.7) {
      prev = stepInScale(rng, scale, prev, 1);
      run = 1;
    } else {
      prev = stepInScale(rng, scale, prev, -2);
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
  return compose(rng, world, steps);
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
  const steps = pick(rng, PHRASE_STEPS);
  const tempo = Math.round(lerp(rng, world.tempo));
  return {
    seed: seed >>> 0,
    worldKey: key,
    worldLabel: world.label,
    title: generateTitle(rng, key),
    steps,
    tempo,
    pattern: normalizePattern(generateMelody(rng, world, steps), steps),
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
  return Math.min(0.85, (1 - level.preserve) * (world?.mutateSpread ?? 1) * base);
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
    return mutateNote(rng, n, scale, world, noteChange);
  });

  const p = world.params;
  const params = {
    pitch: Math.round(mutateValue(rng, current.params.pitch, p.pitch[0], p.pitch[1], paramChange)),
    tone: mutateValue(rng, current.params.tone, 0, 1, paramChange),
    decay: mutateValue(rng, current.params.decay, 0, 1, paramChange),
    crunch: mutateValue(rng, current.params.crunch, 0, 1, paramChange),
    noise: mutateValue(rng, current.params.noise, 0, 1, paramChange),
    attack: mutateValue(rng, current.params.attack, 0, 1, paramChange),
    bend: mutateValue(rng, current.params.bend, 0, 1, paramChange),
    wobble: mutateValue(rng, current.params.wobble, 0, 1, paramChange),
    detune: mutateValue(rng, current.params.detune, 0, 1, paramChange),
    filter: mutateValue(rng, current.params.filter, 0, 1, paramChange),
    volume: current.params.volume,
    gap: mutateValue(rng, current.params.gap, 0, 1, paramChange),
    punch: mutateValue(rng, current.params.punch ?? current.params.attack, 0, 1, paramChange),
  };

  const titleBits = TITLE_BITS[key] || TITLE_BITS.bubble;
  const retitleChance = intensity === 'wild' ? 0.55 : intensity === 'medium' ? 0.35 : 0.2;
  const title = rng() < retitleChance
    ? `${pick(rng, titleBits.a)} ${pick(rng, titleBits.b)}`
    : current.title;

  return {
    seed: seed >>> 0,
    worldKey: key,
    worldLabel: world.label,
    title,
    steps,
    tempo: Math.round(mutateValue(rng, current.tempo, world.tempo[0], world.tempo[1], paramChange)),
    pattern: normalizePattern(pattern, steps),
    params,
    intensity,
  };
}

function mutateValue(rng, value, lo, hi, chance) {
  if (rng() > chance) return value;
  const span = hi - lo;
  const delta = (rng() - 0.5) * span * 0.35;
  return Math.max(lo, Math.min(hi, value + delta));
}

function mutateNote(rng, note, scale, world, chance) {
  if (rng() > chance) return note;
  if (rng() < effectiveRestChance(world) + 0.08) return -1;
  if (rng() < world.leapChance + 0.12) return pick(rng, scale);
  const prev = note >= 0 ? note : world.homeRow;
  const composer = COMPOSERS[world.compose];
  if (composer === composeWander || composer === composeSparse) {
    return pick(rng, scale);
  }
  if (composer === composeRace) {
    return stepInScale(rng, scale, prev, 1);
  }
  return stepInScale(rng, scale, prev, rng() < 0.5 ? -1 : 1);
}

export function replayFromSeed(seed, revision = 0, worldKey = null, intensity = 'medium') {
  const key = worldKey ? resolveWorldKey(worldKey) : null;
  let song = key ? generateFromWorld(key, seed) : generateFromSeed(seed);
  for (let r = 0; r < revision; r++) {
    song = mutateSong(song, seed, r, intensity);
  }
  return { ...song, seed: seed >>> 0, revision, intensity };
}
