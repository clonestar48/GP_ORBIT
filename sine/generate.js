/**
 * Procedural song + patch generation — playful monophonic worlds.
 */

export const MUTATE_INTENSITY = {
  subtle: { preserve: 0.9, label: 'Subtle' },
  medium: { preserve: 0.7, label: 'Medium' },
  wild: { preserve: 0.4, label: 'Wild' },
};

export const WORLDS = {
  'space-age': {
    label: 'Space Age',
    mood: 'Neon glide',
    mode: 'major',
    noteDensity: 0.82,
    mutateSpread: 1,
    params: { pitch: [720, 1680], tone: [0, 0.45], decay: [0.06, 0.22], crunch: [0.1, 0.35], noise: [0, 0.12], attack: [0, 0.08], bend: [0.55, 0.82], wobble: [0, 0.15], detune: [0.08, 0.28], filter: [0, 0.15], volume: [0.42, 0.58], gap: [0.02, 0.1] },
    tempo: [120, 175],
    restChance: 0.12,
    leapChance: 0.18,
    homeRow: 0,
  },
  disco: {
    label: 'Disco',
    mood: 'Mirror ball',
    mode: 'major',
    noteDensity: 0.92,
    mutateSpread: 1.05,
    params: { pitch: [520, 1180], tone: [0.42, 0.88], decay: [0.12, 0.32], crunch: [0.2, 0.45], noise: [0.04, 0.18], attack: [0, 0.06], bend: [0.48, 0.65], wobble: [0.2, 0.55], detune: [0.15, 0.38], filter: [0, 0.2], volume: [0.48, 0.62], gap: [0.04, 0.14] },
    tempo: [130, 190],
    restChance: 0.08,
    leapChance: 0.22,
    homeRow: 5,
  },
  dungeon: {
    label: 'Dungeon',
    mood: 'Torch echo',
    mode: 'minor',
    noteDensity: 0.58,
    mutateSpread: 0.85,
    params: { pitch: [140, 420], tone: [0.05, 0.42], decay: [0.35, 0.72], crunch: [0.15, 0.4], noise: [0.18, 0.45], attack: [0.04, 0.22], bend: [0.32, 0.48], wobble: [0.1, 0.35], detune: [0.05, 0.2], filter: [0.35, 0.72], volume: [0.35, 0.52], gap: [0.12, 0.28] },
    tempo: [190, 290],
    restChance: 0.18,
    leapChance: 0.12,
    homeRow: 7,
  },
  bubble: {
    label: 'Bubble',
    mood: 'Bouncy pop',
    mode: 'major',
    noteDensity: 0.88,
    mutateSpread: 1.15,
    params: { pitch: [380, 920], tone: [0, 0.35], decay: [0.1, 0.38], crunch: [0.05, 0.22], noise: [0.04, 0.14], attack: [0.12, 0.42], bend: [0.55, 0.78], wobble: [0.05, 0.22], detune: [0.1, 0.3], filter: [0.05, 0.25], volume: [0.4, 0.55], gap: [0.08, 0.2] },
    tempo: [150, 220],
    restChance: 0.1,
    leapChance: 0.35,
    homeRow: 3,
  },
  beach: {
    label: 'Beach',
    mood: 'Tidal sway',
    mode: 'major',
    noteDensity: 0.62,
    mutateSpread: 0.9,
    params: { pitch: [440, 880], tone: [0, 0.28], decay: [0.28, 0.58], crunch: [0.04, 0.18], noise: [0.06, 0.16], attack: [0.08, 0.28], bend: [0.42, 0.58], wobble: [0.04, 0.18], detune: [0.05, 0.18], filter: [0.08, 0.28], volume: [0.38, 0.52], gap: [0.14, 0.32] },
    tempo: [200, 300],
    restChance: 0.16,
    leapChance: 0.1,
    homeRow: 7,
  },
  desert: {
    label: 'Desert',
    mood: 'Dry mirage',
    mode: 'minor',
    noteDensity: 0.48,
    mutateSpread: 0.8,
    params: { pitch: [300, 680], tone: [0.08, 0.48], decay: [0.22, 0.55], crunch: [0.1, 0.3], noise: [0.08, 0.22], attack: [0.02, 0.15], bend: [0.38, 0.52], wobble: [0.02, 0.15], detune: [0.04, 0.16], filter: [0.12, 0.35], volume: [0.36, 0.5], gap: [0.18, 0.38] },
    tempo: [210, 320],
    restChance: 0.28,
    leapChance: 0.14,
    homeRow: 7,
  },
  'ice-cave': {
    label: 'Ice Cave',
    mood: 'Crystal ring',
    mode: 'minor',
    noteDensity: 0.7,
    mutateSpread: 0.95,
    params: { pitch: [880, 1980], tone: [0, 0.38], decay: [0.32, 0.68], crunch: [0.06, 0.22], noise: [0.02, 0.1], attack: [0.02, 0.12], bend: [0.5, 0.68], wobble: [0.08, 0.28], detune: [0.18, 0.42], filter: [0.05, 0.22], volume: [0.4, 0.54], gap: [0.1, 0.22] },
    tempo: [170, 250],
    restChance: 0.14,
    leapChance: 0.2,
    homeRow: 0,
  },
  speedway: {
    label: 'Speedway',
    mood: 'Racing pulse',
    mode: 'major',
    noteDensity: 0.96,
    mutateSpread: 1.25,
    params: { pitch: [620, 1420], tone: [0.55, 0.95], decay: [0.06, 0.2], crunch: [0.22, 0.48], noise: [0.06, 0.16], attack: [0, 0.05], bend: [0.52, 0.72], wobble: [0.05, 0.2], detune: [0.12, 0.32], filter: [0, 0.12], volume: [0.5, 0.65], gap: [0.02, 0.08] },
    tempo: [90, 150],
    restChance: 0.05,
    leapChance: 0.42,
    homeRow: 2,
  },
  arcade: {
    label: 'Arcade',
    mood: '8-bit blips',
    mode: 'major',
    noteDensity: 0.94,
    mutateSpread: 1.1,
    params: { pitch: [680, 1560], tone: [0.38, 0.72], decay: [0.04, 0.14], crunch: [0.18, 0.42], noise: [0.02, 0.1], attack: [0, 0.04], bend: [0.58, 0.78], wobble: [0, 0.08], detune: [0.08, 0.22], filter: [0, 0.1], volume: [0.46, 0.6], gap: [0.02, 0.08] },
    tempo: [100, 165],
    restChance: 0.07,
    leapChance: 0.38,
    homeRow: 2,
  },
  lullaby: {
    label: 'Lullaby',
    mood: 'Soft hush',
    mode: 'major',
    noteDensity: 0.42,
    mutateSpread: 0.75,
    params: { pitch: [260, 520], tone: [0, 0.18], decay: [0.45, 0.78], crunch: [0, 0.12], noise: [0, 0.08], attack: [0.18, 0.45], bend: [0.35, 0.52], wobble: [0.02, 0.12], detune: [0.04, 0.14], filter: [0.1, 0.32], volume: [0.32, 0.46], gap: [0.2, 0.38] },
    tempo: [240, 340],
    restChance: 0.32,
    leapChance: 0.08,
    homeRow: 7,
  },
  noir: {
    label: 'Noir',
    mood: 'Smoky filter',
    mode: 'minor',
    noteDensity: 0.55,
    mutateSpread: 0.88,
    params: { pitch: [200, 480], tone: [0.12, 0.48], decay: [0.22, 0.48], crunch: [0.12, 0.32], noise: [0.14, 0.32], attack: [0.06, 0.2], bend: [0.38, 0.55], wobble: [0.08, 0.22], detune: [0.06, 0.18], filter: [0.45, 0.75], volume: [0.34, 0.48], gap: [0.16, 0.3] },
    tempo: [160, 240],
    restChance: 0.22,
    leapChance: 0.14,
    homeRow: 6,
  },
  haunted: {
    label: 'Haunted',
    mood: 'Ghost wobble',
    mode: 'minor',
    noteDensity: 0.52,
    mutateSpread: 0.92,
    params: { pitch: [100, 320], tone: [0.02, 0.28], decay: [0.48, 0.82], crunch: [0.08, 0.28], noise: [0.28, 0.55], attack: [0.22, 0.48], bend: [0.42, 0.62], wobble: [0.35, 0.65], detune: [0.12, 0.28], filter: [0.28, 0.58], volume: [0.3, 0.44], gap: [0.18, 0.34] },
    tempo: [200, 280],
    restChance: 0.24,
    leapChance: 0.1,
    homeRow: 7,
  },
  circuit: {
    label: 'Circuit',
    mood: 'Digital zip',
    mode: 'major',
    noteDensity: 0.9,
    mutateSpread: 1.15,
    params: { pitch: [1200, 2200], tone: [0.48, 0.82], decay: [0.05, 0.12], crunch: [0.35, 0.55], noise: [0.1, 0.22], attack: [0, 0.03], bend: [0.62, 0.82], wobble: [0, 0.1], detune: [0.15, 0.35], filter: [0, 0.08], volume: [0.44, 0.58], gap: [0.02, 0.06] },
    tempo: [110, 180],
    restChance: 0.06,
    leapChance: 0.32,
    homeRow: 0,
  },
  temple: {
    label: 'Temple',
    mood: 'Sparse ritual',
    mode: 'minor',
    noteDensity: 0.38,
    mutateSpread: 0.78,
    params: { pitch: [220, 560], tone: [0, 0.22], decay: [0.38, 0.68], crunch: [0.04, 0.18], noise: [0.06, 0.16], attack: [0.14, 0.35], bend: [0.4, 0.55], wobble: [0.04, 0.14], detune: [0.05, 0.16], filter: [0.18, 0.42], volume: [0.34, 0.48], gap: [0.22, 0.4] },
    tempo: [260, 360],
    restChance: 0.34,
    leapChance: 0.08,
    homeRow: 7,
  },
  meadow: {
    label: 'Meadow',
    mood: 'Sunny leaps',
    mode: 'major',
    noteDensity: 0.68,
    mutateSpread: 0.95,
    params: { pitch: [500, 920], tone: [0, 0.25], decay: [0.18, 0.42], crunch: [0.02, 0.14], noise: [0.04, 0.12], attack: [0.1, 0.28], bend: [0.45, 0.6], wobble: [0.03, 0.12], detune: [0.06, 0.18], filter: [0.05, 0.2], volume: [0.38, 0.52], gap: [0.12, 0.26] },
    tempo: [170, 260],
    restChance: 0.14,
    leapChance: 0.28,
    homeRow: 5,
  },
  volcano: {
    label: 'Volcano',
    mood: 'Bass rumble',
    mode: 'minor',
    noteDensity: 0.44,
    mutateSpread: 0.82,
    params: { pitch: [90, 240], tone: [0.22, 0.58], decay: [0.32, 0.62], crunch: [0.45, 0.72], noise: [0.22, 0.42], attack: [0.08, 0.22], bend: [0.28, 0.45], wobble: [0.04, 0.16], detune: [0.04, 0.14], filter: [0.22, 0.48], volume: [0.42, 0.58], gap: [0.2, 0.36] },
    tempo: [220, 320],
    restChance: 0.26,
    leapChance: 0.1,
    homeRow: 7,
  },
};

/** @deprecated use WORLDS */
export const FAMILIES = WORLDS;

const WORLD_KEYS = Object.keys(WORLDS);
const PHRASE_STEPS = [8, 16, 24, 32];

const MAJOR_PENT = [0, 2, 3, 5, 6, 7];
const MINOR_PENT = [1, 3, 4, 5, 7];

const TITLE_BITS = {
  'space-age': { a: ['Neon', 'Star', 'Cosmic', 'Lunar', 'Lost', 'Solar'], b: ['Beacon', 'Radar', 'Relay', 'Signal', 'Highway', 'Probe'] },
  disco: { a: ['Mirror', 'Velvet', 'Chrome', 'Glitter', 'Electric', 'Midnight'], b: ['Groove', 'Flash', 'Pulse', 'Slide', 'Hook', 'Boogie'] },
  dungeon: { a: ['Hollow', 'Crypt', 'Shadow', 'Rust', 'Pixel', 'Lost'], b: ['Hall', 'Caverns', 'Whisper', 'Torch', 'Chain', 'Drift'] },
  bubble: { a: ['Pop', 'Bouncy', 'Gummy', 'Silly', 'Jelly', 'Bubble'], b: ['Kingdom', 'Hop', 'Blob', 'Bounce', 'Loop', 'Plop'] },
  beach: { a: ['Sandy', 'Tidal', 'Seafoam', 'Sunny', 'Palm', 'Salt'], b: ['Shore', 'Wave', 'Radio', 'Lagoon', 'Shell', 'Glow'] },
  desert: { a: ['Dust', 'Mirage', 'Dune', 'Dry', 'Sage', 'Lost'], b: ['Signal', 'Trail', 'Echo', 'Wind', 'Bloom', 'Wander'] },
  'ice-cave': { a: ['Frost', 'Crystal', 'Frozen', 'Glacier', 'Polar', 'Shiver'], b: ['Chime', 'Relay', 'Gleam', 'Shard', 'Spark', 'Drift'] },
  speedway: { a: ['Turbo', 'Neon', 'Rapid', 'Blitz', 'Rocket', 'Hyper'], b: ['Dash', 'Lap', 'Rush', 'Sprint', 'Heat', 'Line'] },
  arcade: { a: ['Pixel', 'Bonus', 'Insert', 'High', 'Token', 'Level'], b: ['Run', 'Blip', 'Quest', 'Score', 'Start', 'Loop'] },
  lullaby: { a: ['Sleepy', 'Moon', 'Soft', 'Dream', 'Quiet', 'Star'], b: ['Hush', 'Drift', 'Cradle', 'Glow', 'Nest', 'Sway'] },
  noir: { a: ['Smoke', 'Velvet', 'Rain', 'Neon', 'Midnight', 'Jazz'], b: ['Alley', 'Cipher', 'Shadow', 'Sax', 'Case', 'Blue'] },
  haunted: { a: ['Phantom', 'Spectral', 'Eerie', 'Pale', 'Wisp', 'Ghost'], b: ['Hall', 'Moan', 'Shade', 'Creak', 'Mist', 'Veil'] },
  circuit: { a: ['Logic', 'Binary', 'Pulse', 'Data', 'Wire', 'Cache'], b: ['Gate', 'Spark', 'Node', 'Burst', 'Trace', 'Flux'] },
  temple: { a: ['Sacred', 'Stone', 'Ancient', 'Quiet', 'Lotus', 'Deep'], b: ['Bell', 'Chant', 'Pool', 'Echo', 'Path', 'Glow'] },
  meadow: { a: ['Sunny', 'Wild', 'Green', 'Daisy', 'Breeze', 'Bright'], b: ['Field', 'Hop', 'Trail', 'Bloom', 'Song', 'Glade'] },
  volcano: { a: ['Magma', 'Ash', 'Rumble', 'Ember', 'Basalt', 'Deep'], b: ['Core', 'Surge', 'Fault', 'Roar', 'Vent', 'Pulse'] },
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
  return Math.min(0.42, world.restChance * (1.35 - world.noteDensity));
}

function pickNote(rng, scale, prev, world) {
  const restChance = effectiveRestChance(world);
  if (rng() < restChance) return -1;
  if (prev < 0) return pick(rng, scale);

  const idx = scaleIndex(scale, prev);
  if (rng() < world.leapChance) {
    return pick(rng, scale);
  }
  const step = rng() < 0.5 ? -1 : 1;
  const next = Math.max(0, Math.min(scale.length - 1, idx + step));
  return scale[next];
}

function generatePhrase(rng, scale, len, world) {
  const out = [];
  let prev = world.homeRow;
  if (!scale.includes(prev)) prev = scale[0];
  for (let i = 0; i < len; i++) {
    const n = pickNote(rng, scale, prev, world);
    out.push(n);
    if (n >= 0) prev = n;
  }
  return out;
}

function varyPhrase(rng, phrase, scale, len, world) {
  const out = [];
  for (let i = 0; i < len; i++) {
    const src = phrase[i % phrase.length];
    if (rng() < 0.55) {
      out.push(src);
    } else {
      const prev = out.length ? out[out.length - 1] : src;
      out.push(pickNote(rng, scale, prev >= 0 ? prev : world.homeRow, world));
    }
  }
  return out;
}

function generateMelody(rng, world, steps) {
  const scale = scaleFor(world.mode);
  const half = steps / 2;
  const a = generatePhrase(rng, scale, half, world);
  const b = varyPhrase(rng, a, scale, half, world);
  const pattern = [...a, ...b];
  pattern[steps - 1] = world.homeRow;
  if (steps > 1 && rng() < 0.6) {
    pattern[steps - 2] = pickNote(rng, scale, pattern[steps - 1], { ...world, restChance: 0, leapChance: 0.35 });
  }
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
    volume: lerp(rng, p.volume),
    gap: lerp(rng, p.gap),
  };
}

function generateTitle(rng, worldKey) {
  const bits = TITLE_BITS[worldKey];
  return `${pick(rng, bits.a)} ${pick(rng, bits.b)}`;
}

function buildSong(seed, worldKey, rng) {
  const world = WORLDS[worldKey];
  const steps = pick(rng, PHRASE_STEPS);
  const tempo = Math.round(lerp(rng, world.tempo));
  return {
    seed: seed >>> 0,
    worldKey,
    worldLabel: world.label,
    title: generateTitle(rng, worldKey),
    steps,
    tempo,
    pattern: generateMelody(rng, world, steps),
    params: generateParams(rng, world),
  };
}

export function generateFromSeed(seed) {
  const rng = mulberry32(seed >>> 0);
  const worldKey = pick(rng, WORLD_KEYS);
  return buildSong(seed, worldKey, rng);
}

export function generateFromWorld(worldKey, seed = randomSeed()) {
  if (!WORLDS[worldKey]) return generateFromSeed(seed);
  const rng = mulberry32(seed >>> 0);
  return buildSong(seed, worldKey, rng);
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
  const world = WORLDS[current.worldKey] || WORLDS[pick(rng, WORLD_KEYS)];
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
    volume: mutateValue(rng, current.params.volume, 0, 1, paramChange),
    gap: mutateValue(rng, current.params.gap, 0, 1, paramChange),
  };

  const titleBits = TITLE_BITS[current.worldKey] || TITLE_BITS.bubble;
  const retitleChance = intensity === 'wild' ? 0.55 : intensity === 'medium' ? 0.35 : 0.2;
  const title = rng() < retitleChance
    ? `${pick(rng, titleBits.a)} ${pick(rng, titleBits.b)}`
    : current.title;

  return {
    seed: seed >>> 0,
    worldKey: current.worldKey,
    worldLabel: world.label,
    title,
    steps,
    tempo: Math.round(mutateValue(rng, current.tempo, world.tempo[0], world.tempo[1], paramChange)),
    pattern,
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
  if (rng() < 0.22) return -1;
  if (rng() < world.leapChance + 0.15) return pick(rng, scale);
  return pickNote(rng, scale, note >= 0 ? note : world.homeRow, world);
}

export function replayFromSeed(seed, revision = 0, worldKey = null, intensity = 'medium') {
  let song = worldKey ? generateFromWorld(worldKey, seed) : generateFromSeed(seed);
  for (let r = 0; r < revision; r++) {
    song = mutateSong(song, seed, r, intensity);
  }
  return { ...song, seed: seed >>> 0, revision, intensity };
}
