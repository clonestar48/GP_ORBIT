/**
 * Per-world note articulation and step accent dynamics — playback only.
 */

/** @typedef {Object} ArticulationProfile
 * @property {number} gateMul sustain length multiplier (<1 = staccato, >1 = legato)
 * @property {number} releaseMul release tail multiplier
 * @property {number} punchBias transient emphasis
 * @property {'alternate'|'steady'} [gateMode]
 * @property {number} [gateShort] short gate when alternating
 * @property {number} [gateLong] longer gate when alternating
 */

/** @type {Record<string, ArticulationProfile>} */
const ARTICULATION = {
  arcade: {
    gateMul: 0.46,
    releaseMul: 0.58,
    punchBias: 1.2,
    gateMode: 'steady',
  },
  speedway: {
    gateMul: 0.7,
    releaseMul: 0.72,
    punchBias: 1.02,
    gateMode: 'steady',
  },
  beach: {
    gateMul: 1.44,
    releaseMul: 1.38,
    punchBias: 0.9,
    gateMode: 'steady',
  },
  dungeon: {
    gateMul: 1.58,
    releaseMul: 1.42,
    punchBias: 0.94,
    gateMode: 'steady',
  },
  'ice-cave': {
    gateMul: 0.62,
    releaseMul: 0.72,
    punchBias: 1.18,
    gateMode: 'steady',
  },
  bubble: {
    gateMul: 0.92,
    releaseMul: 1.08,
    punchBias: 0.96,
    gateMode: 'alternate',
    gateShort: 0.78,
    gateLong: 1.22,
  },
  desert: {
    gateMul: 1.38,
    releaseMul: 1.12,
    punchBias: 0.86,
    gateMode: 'steady',
  },
  'space-age': {
    gateMul: 1.58,
    releaseMul: 1.48,
    punchBias: 0.78,
    gateMode: 'steady',
  },
};

const DEFAULT_ARTICULATION = {
  gateMul: 1,
  releaseMul: 1,
  punchBias: 1,
  gateMode: 'steady',
};

function resolveWorldKey(worldKey) {
  if (!worldKey) return null;
  return worldKey === 'disco' ? 'arcade' : worldKey;
}

function hookStepIndex(steps, barLen = 4) {
  const half = Math.floor(steps / 2);
  const midBar = Math.round(half / barLen) * barLen;
  const spot = steps >= barLen * 3 ? midBar : barLen;
  return Math.min(steps - 2, Math.max(1, spot));
}

function gateForProfile(art, step) {
  if (art.gateMode === 'alternate') {
    return step % 2 === 0 ? (art.gateShort ?? 0.7) : (art.gateLong ?? 1.1);
  }
  return art.gateMul;
}

/**
 * @param {string|null|undefined} worldKey
 * @param {{ step: number, steps: number, barLen?: number, hookStep?: number, lane?: 'melody'|'bass'|'echo'|'harmony' }} ctx
 */
export function resolveStepExpression(worldKey, ctx) {
  const key = resolveWorldKey(worldKey);
  const art = (key && ARTICULATION[key]) || DEFAULT_ARTICULATION;
  const barLen = ctx.barLen ?? 4;
  const hookStep = ctx.hookStep ?? hookStepIndex(ctx.steps, barLen);
  const beat = ctx.step % barLen;
  const isPhraseEnd = beat >= barLen - 2;
  const isLoopEnd = ctx.step === ctx.steps - 1;

  let volMul = 1;
  if (beat === 0) volMul *= 1.12;
  else if (beat === 2) volMul *= 1.06;
  else volMul *= 0.93;

  if (ctx.step === hookStep) volMul *= 1.14;
  if (isPhraseEnd) volMul *= 1.08;
  if (isLoopEnd) volMul *= 1.1;

  volMul = Math.max(0.85, Math.min(1.15, volMul));

  let gateMul = gateForProfile(art, ctx.step);
  let releaseMul = art.releaseMul;
  let punchBias = art.punchBias;

  if (ctx.lane === 'bass') {
    gateMul *= 1.08;
    releaseMul *= 1.12;
    volMul = 0.92 + (volMul - 1) * 0.35;
  } else if (ctx.lane === 'echo') {
    gateMul *= 0.82;
    releaseMul *= 0.78;
    volMul *= 0.96;
  } else if (ctx.lane === 'harmony') {
    gateMul *= 0.9;
    volMul *= 0.94;
  }

  return { gateMul, releaseMul, volMul, punchBias };
}

export function expressionMetaForSequencer(steps, barLen = 4) {
  return { hookStep: hookStepIndex(steps, barLen), barLen };
}
