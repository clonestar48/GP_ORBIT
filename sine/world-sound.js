/**
 * Internal world sound profiles — hidden synthesis recipes per territory.
 * NES / Amiga character; not exposed as user knobs.
 */

/** @typedef {Object} WorldSoundProfile
 * @property {string} id
 * @property {OscillatorType|null} oscA
 * @property {OscillatorType|null} oscB
 * @property {number} oscAGain
 * @property {number} oscBGain
 * @property {number} oscBDetuneCents
 * @property {number} harmonicRatio
 * @property {number} harmonicGain
 * @property {number} attackMs
 * @property {number} releaseMs
 * @property {number} envelopeTight
 * @property {number} filterCutoffHz
 * @property {number} filterQ
 * @property {number} filterEnvAmount
 * @property {number} filterCutoffStart
 * @property {number} filterCutoffEnd
 * @property {number} filterEnvAttackMs
 * @property {number} satAmount
 * @property {number} chorusDepth
 * @property {number} chorusRate
 * @property {number} chorusMix
 * @property {number} delayTimeMs
 * @property {number} delayFeedback
 * @property {number} delayMix
 * @property {number} stereoWidth
 * @property {number|null} toneBias
 */

/** @type {WorldSoundProfile} */
export const DEFAULT_SOUND_PROFILE = {
  id: 'custom',
  oscA: null,
  oscB: 'triangle',
  oscAGain: 0.7,
  oscBGain: 0.22,
  oscBDetuneCents: 3,
  harmonicRatio: 0,
  harmonicGain: 0,
  attackMs: 10,
  releaseMs: 58,
  envelopeTight: 0.5,
  filterCutoffHz: 11800,
  filterQ: 0.62,
  filterEnvAmount: 0.28,
  filterCutoffStart: 0.62,
  filterCutoffEnd: 1,
  filterEnvAttackMs: 42,
  satAmount: 0.1,
  chorusDepth: 0.0028,
  chorusRate: 0.55,
  chorusMix: 0.12,
  delayTimeMs: 92,
  delayFeedback: 0.13,
  delayMix: 0.05,
  stereoWidth: 0.1,
  toneBias: null,
};

/** @type {Record<string, Partial<WorldSoundProfile> & { id: string }>} */
const WORLD_OVERRIDES = {
  beach: {
    id: 'beach',
    oscA: 'sine',
    oscB: 'triangle',
    oscAGain: 0.68,
    oscBGain: 0.32,
    oscBDetuneCents: -2.8,
    attackMs: 13,
    releaseMs: 76,
    envelopeTight: 0.35,
    filterCutoffHz: 9200,
    filterQ: 0.55,
    filterEnvAmount: 0.42,
    filterCutoffStart: 0.48,
    filterCutoffEnd: 1,
    filterEnvAttackMs: 68,
    satAmount: 0.06,
    chorusDepth: 0.0042,
    chorusRate: 0.42,
    chorusMix: 0.2,
    delayTimeMs: 112,
    delayFeedback: 0.15,
    delayMix: 0.075,
    stereoWidth: 0.16,
    toneBias: 0.12,
  },
  'ice-cave': {
    id: 'ice-cave',
    oscA: 'sine',
    oscB: 'triangle',
    oscAGain: 0.64,
    oscBGain: 0.18,
    oscBDetuneCents: 4.2,
    harmonicRatio: 2,
    harmonicGain: 0.11,
    attackMs: 8,
    releaseMs: 74,
    envelopeTight: 0.42,
    filterCutoffHz: 13200,
    filterQ: 0.45,
    filterEnvAmount: 0.38,
    filterCutoffStart: 0.72,
    filterCutoffEnd: 1.08,
    filterEnvAttackMs: 35,
    satAmount: 0.05,
    chorusDepth: 0.0035,
    chorusRate: 0.62,
    chorusMix: 0.16,
    delayTimeMs: 88,
    delayFeedback: 0.12,
    delayMix: 0.065,
    stereoWidth: 0.14,
    toneBias: 0.1,
  },
  arcade: {
    id: 'arcade',
    oscA: 'square',
    oscB: 'square',
    oscAGain: 0.78,
    oscBGain: 0.16,
    oscBDetuneCents: 4.5,
    attackMs: 6,
    releaseMs: 44,
    envelopeTight: 0.88,
    filterCutoffHz: 10800,
    filterQ: 0.7,
    filterEnvAmount: 0.55,
    filterCutoffStart: 0.38,
    filterCutoffEnd: 1.05,
    filterEnvAttackMs: 18,
    satAmount: 0.18,
    chorusDepth: 0.0016,
    chorusRate: 0.85,
    chorusMix: 0.06,
    delayTimeMs: 72,
    delayFeedback: 0.1,
    delayMix: 0.038,
    stereoWidth: 0.05,
    toneBias: 0.58,
  },
  speedway: {
    id: 'speedway',
    oscA: 'sawtooth',
    oscB: 'square',
    oscAGain: 0.74,
    oscBGain: 0.22,
    oscBDetuneCents: -3.8,
    attackMs: 5,
    releaseMs: 50,
    envelopeTight: 0.9,
    filterCutoffHz: 10200,
    filterQ: 0.68,
    filterEnvAmount: 0.62,
    filterCutoffStart: 0.32,
    filterCutoffEnd: 1.1,
    filterEnvAttackMs: 14,
    satAmount: 0.2,
    chorusDepth: 0.0018,
    chorusRate: 0.95,
    chorusMix: 0.05,
    delayTimeMs: 78,
    delayFeedback: 0.11,
    delayMix: 0.042,
    stereoWidth: 0.1,
    toneBias: 0.78,
  },
  'space-age': {
    id: 'space-age',
    oscA: 'sine',
    oscB: 'sine',
    oscAGain: 0.58,
    oscBGain: 0.38,
    oscBDetuneCents: -4.8,
    attackMs: 9,
    releaseMs: 64,
    envelopeTight: 0.48,
    filterCutoffHz: 11400,
    filterQ: 0.58,
    filterEnvAmount: 0.36,
    filterCutoffStart: 0.55,
    filterCutoffEnd: 1.02,
    filterEnvAttackMs: 52,
    satAmount: 0.08,
    chorusDepth: 0.0048,
    chorusRate: 0.48,
    chorusMix: 0.22,
    delayTimeMs: 104,
    delayFeedback: 0.14,
    delayMix: 0.072,
    stereoWidth: 0.32,
    toneBias: 0.08,
  },
  dungeon: {
    id: 'dungeon',
    oscA: 'triangle',
    oscB: 'sine',
    oscAGain: 0.72,
    oscBGain: 0.2,
    oscBDetuneCents: -2.2,
    attackMs: 11,
    releaseMs: 68,
    envelopeTight: 0.55,
    filterCutoffHz: 5200,
    filterQ: 0.72,
    filterEnvAmount: 0.32,
    filterCutoffStart: 0.42,
    filterCutoffEnd: 0.82,
    filterEnvAttackMs: 55,
    satAmount: 0.14,
    chorusDepth: 0.002,
    chorusRate: 0.35,
    chorusMix: 0.08,
    delayTimeMs: 98,
    delayFeedback: 0.16,
    delayMix: 0.06,
    stereoWidth: 0.08,
    toneBias: 0.22,
  },
  bubble: {
    id: 'bubble',
    oscA: 'sine',
    oscB: 'triangle',
    oscAGain: 0.66,
    oscBGain: 0.28,
    oscBDetuneCents: 3.6,
    attackMs: 12,
    releaseMs: 62,
    envelopeTight: 0.4,
    filterCutoffHz: 10500,
    filterQ: 0.52,
    filterEnvAmount: 0.45,
    filterCutoffStart: 0.5,
    filterCutoffEnd: 1.04,
    filterEnvAttackMs: 48,
    satAmount: 0.07,
    chorusDepth: 0.004,
    chorusRate: 0.58,
    chorusMix: 0.18,
    delayTimeMs: 86,
    delayFeedback: 0.12,
    delayMix: 0.055,
    stereoWidth: 0.18,
    toneBias: 0.14,
  },
  desert: {
    id: 'desert',
    oscA: 'triangle',
    oscB: 'sine',
    oscAGain: 0.7,
    oscBGain: 0.18,
    oscBDetuneCents: 2.4,
    attackMs: 10,
    releaseMs: 72,
    envelopeTight: 0.45,
    filterCutoffHz: 6800,
    filterQ: 0.6,
    filterEnvAmount: 0.3,
    filterCutoffStart: 0.45,
    filterCutoffEnd: 0.88,
    filterEnvAttackMs: 62,
    satAmount: 0.11,
    chorusDepth: 0.0032,
    chorusRate: 0.38,
    chorusMix: 0.14,
    delayTimeMs: 118,
    delayFeedback: 0.17,
    delayMix: 0.08,
    stereoWidth: 0.2,
    toneBias: 0.2,
  },
  disco: {
    id: 'arcade',
    oscA: 'square',
    oscB: 'square',
    oscAGain: 0.78,
    oscBGain: 0.16,
    oscBDetuneCents: 4.5,
    attackMs: 6,
    releaseMs: 44,
    envelopeTight: 0.88,
    filterCutoffHz: 10800,
    filterQ: 0.7,
    filterEnvAmount: 0.55,
    filterCutoffStart: 0.38,
    filterCutoffEnd: 1.05,
    filterEnvAttackMs: 18,
    satAmount: 0.18,
    chorusDepth: 0.0016,
    chorusRate: 0.85,
    chorusMix: 0.06,
    delayTimeMs: 72,
    delayFeedback: 0.1,
    delayMix: 0.038,
    stereoWidth: 0.05,
    toneBias: 0.58,
  },
};

/**
 * @param {string|null|undefined} worldKey
 * @returns {WorldSoundProfile}
 */
export function resolveSoundProfile(worldKey) {
  if (!worldKey) return { ...DEFAULT_SOUND_PROFILE };
  const key = worldKey === 'disco' ? 'arcade' : worldKey;
  const overrides = WORLD_OVERRIDES[key];
  return overrides
    ? { ...DEFAULT_SOUND_PROFILE, ...overrides }
    : { ...DEFAULT_SOUND_PROFILE };
}
