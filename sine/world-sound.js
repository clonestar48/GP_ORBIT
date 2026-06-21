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
    oscA: 'triangle',
    oscB: 'sine',
    oscAGain: 0.58,
    oscBGain: 0.26,
    oscBDetuneCents: -5,     // was -14 — -14¢ causes audible 7 Hz wobble at 880 Hz; -5¢ = gentle shimmer
    harmonicRatio: 2.756,    // was 2 — bell quint partial (inharmonic); octave is too clean, this is the chime character
    harmonicGain: 0.28,      // was 0.20 — slightly stronger; inharmonic partial carries the bell identity
    attackMs: 1,
    releaseMs: 220,          // was 58 — chimes ring; 58ms is a pluck not a bell
    envelopeTight: 0.42,     // was 0.88 — allows the longer ring
    filterCutoffHz: 18000,
    filterQ: 0.18,           // was 0.28 — less resonance, cleaner
    filterEnvAmount: 0.01,   // was 0.88 — BELOW 0.02 bypass threshold: no filter sweep at all
    filterCutoffStart: 0.95, // stays open; barely moves
    filterCutoffEnd: 1.0,
    filterEnvAttackMs: 4,
    satAmount: 0,            // was 0.02 — zero saturation; bells are pure
    chorusDepth: 0.0018,     // was 0.0038 — subtle
    chorusRate: 0.38,        // was 1.4 — slow drift; not wobble
    chorusMix: 0.05,         // was 0.18 — barely perceptible, not a swimming effect
    delayTimeMs: 38,
    delayFeedback: 0.22,     // was 0.28 — 2 audible echoes then gone
    delayMix: 0.085,
    stereoWidth: 0.48,
    toneBias: 0.04,
  },
  arcade: {
    id: 'arcade',
    // NES/VRC6 chip character: two pulse-wave channels, raw and direct.
    // No filter sweep, no saturation, no chorus — pure digital signal path.
    oscA: 'square',   // overridden to 12.5% pulse wave in synth.js
    oscB: 'square',   // overridden to 25% pulse wave in synth.js
    oscAGain: 0.78,
    oscBGain: 0.28,   // two equal-weight channels, like real NES hardware
    oscBDetuneCents: 0, // precise pitch — no warmth, no wobble
    attackMs: 1,      // near-instant — NES chips had no amplitude envelope
    releaseMs: 20,
    envelopeTight: 0.98,
    filterCutoffHz: 20000, // fully open — raw aliased harmonics, no roll-off
    filterQ: 0.5,
    filterEnvAmount: 0.0,  // no filter sweep — NES had no dynamic filter
    filterCutoffStart: 1.0,
    filterCutoffEnd: 1.0,
    filterEnvAttackMs: 0,
    satAmount: 0.0,   // no saturation — raw digital output
    chorusDepth: 0,
    chorusRate: 0,
    chorusMix: 0.0,   // no chorus — mono hardware output
    delayTimeMs: 48,
    delayFeedback: 0.0,
    delayMix: 0.0,    // fully dry
    stereoWidth: 0.0, // mono — single speaker output
    harmonicGain: 0,  // no harmonic partial — just the raw wave
    toneBias: 0.68,
  },
  speedway: {
    id: 'speedway',
    oscA: 'sawtooth',
    oscB: 'square',
    oscAGain: 0.8,
    oscBGain: 0.18,
    oscBDetuneCents: -5.2,
    attackMs: 4,
    releaseMs: 38,
    envelopeTight: 0.94,
    filterCutoffHz: 9800,
    filterQ: 0.72,
    filterEnvAmount: 0.58,
    filterCutoffStart: 0.28,
    filterCutoffEnd: 1.05,
    filterEnvAttackMs: 11,
    satAmount: 0.24,
    chorusDepth: 0.001,
    chorusRate: 1.05,
    chorusMix: 0.02,
    delayTimeMs: 52,
    delayFeedback: 0.05,
    delayMix: 0.015,
    stereoWidth: 0.06,
    toneBias: 0.82,
  },
  'space-age': {
    id: 'space-age',
    oscA: 'sine',
    oscB: 'sine',
    oscAGain: 0.48,          // melody note sits under the whistle, not over it
    oscBGain: 0.36,
    oscBDetuneCents: -5.8,   // slightly narrower — whistle carries the width
    harmonicRatio: 1.5,
    harmonicGain: 0.06,      // softer — less competing with whistle's pure tone
    attackMs: 18,            // slightly longer attack — notes swell in, not pop
    releaseMs: 110,          // longer tail — floating, notes linger
    envelopeTight: 0.26,     // very loose — spacious
    filterCutoffHz: 14000,   // open and bright but not harsh
    filterQ: 0.38,
    filterEnvAmount: 0.18,   // gentle filter movement — not a wah, just air
    filterCutoffStart: 0.72,
    filterCutoffEnd: 1.04,
    filterEnvAttackMs: 80,
    satAmount: 0.03,         // near-clean — whistle tone needs purity
    chorusDepth: 0.006,
    chorusRate: 0.32,        // very slow drift
    chorusMix: 0.22,
    delayTimeMs: 118,
    delayFeedback: 0.12,
    delayMix: 0.055,         // slightly more delay shimmer
    stereoWidth: 0.38,
    toneBias: 0.04,
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
    oscAGain: 0.74,
    oscBGain: 0.32,
    oscBDetuneCents: 2.8,
    harmonicRatio: 0,
    harmonicGain: 0,
    attackMs: 18,
    releaseMs: 72,
    envelopeTight: 0.28,
    filterCutoffHz: 8800,
    filterQ: 0.42,
    filterEnvAmount: 0.32,
    filterCutoffStart: 0.42,
    filterCutoffEnd: 0.96,
    filterEnvAttackMs: 58,
    satAmount: 0.04,
    chorusDepth: 0.0038,
    chorusRate: 0.48,
    chorusMix: 0.14,
    delayTimeMs: 72,
    delayFeedback: 0.08,
    delayMix: 0.032,
    stereoWidth: 0.14,
    toneBias: 0.08,
  },
  desert: {
    id: 'desert',
    oscA: 'triangle',
    oscB: 'sine',
    oscAGain: 0.74,
    oscBGain: 0.12,
    oscBDetuneCents: 1.2,
    attackMs: 8,
    releaseMs: 52,
    envelopeTight: 0.68,
    filterCutoffHz: 5200,
    filterQ: 0.72,
    filterEnvAmount: 0.14,
    filterCutoffStart: 0.52,
    filterCutoffEnd: 0.72,
    filterEnvAttackMs: 38,
    satAmount: 0.09,
    chorusDepth: 0.0006,
    chorusRate: 0.28,
    chorusMix: 0.008,
    delayTimeMs: 42,
    delayFeedback: 0.04,
    delayMix: 0.008,
    stereoWidth: 0.06,
    toneBias: 0.24,
  },
  neon: {
    id: 'neon',
    // Beverly Hills Cop "Axel F" lead — square-wave synth, punchy and dry.
    // Short release so notes never overlap; resonant filter quack on each hit.
    oscA: 'square',
    oscB: 'square',
    oscAGain: 0.74,
    oscBGain: 0.20,
    oscBDetuneCents: 6,      // subtle thickness, not wide shimmer
    attackMs: 7,             // snap — no bloom
    releaseMs: 82,           // staccato — notes die before the next arrives
    envelopeTight: 0.94,
    filterCutoffHz: 2200,
    filterQ: 3.4,            // resonant peak — gives the "quack" on each hit
    filterEnvAmount: 0.70,   // upward sweep per note — the defining character
    filterCutoffStart: 0.20, // starts dark
    filterCutoffEnd: 1.0,
    filterEnvAttackMs: 32,   // fast sweep — snap, not a slow bloom
    satAmount: 0.03,
    chorusDepth: 0.0006,     // barely any chorus — lead is dry
    chorusRate: 0.25,
    chorusMix: 0.07,
    delayTimeMs: 218,        // ~138 BPM dotted-8th echo (444ms/2 = 222ms ≈ 218)
    delayFeedback: 0.26,
    delayMix: 0.14,
    stereoWidth: 0.34,
    toneBias: 0.04,          // stays square
  },
  'music-box': {
    id: 'music-box',
    // Base oscillators are now intentionally thin — the FM tine voice in synth.js
    // provides the primary character (inharmonic metal-tine spectrum + pin-strike click).
    // These oscillators just supply a faint fundamental body underneath.
    oscA: 'sine',
    oscB: 'sine',
    oscAGain: 0.22,
    oscBGain: 0.06,
    oscBDetuneCents: 1.8,
    harmonicRatio: 0,
    harmonicGain: 0,
    attackMs: 0.5,
    releaseMs: 95,
    envelopeTight: 0.72,
    filterCutoffHz: 14000,
    filterQ: 0.10,
    filterEnvAmount: 0.01,
    filterCutoffStart: 0.98,
    filterCutoffEnd: 1.0,
    filterEnvAttackMs: 2,
    satAmount: 0,
    chorusDepth: 0,
    chorusRate: 0,
    chorusMix: 0,
    delayTimeMs: 32,
    delayFeedback: 0.0,
    delayMix: 0.0,
    stereoWidth: 0.08,
    toneBias: 0.02,
  },
  // ---------------------------------------------------------------------------
  // Western — banjo pluck character. The Karplus-Strong voice in play() carries
  // the fundamental tone; the oscillator layer adds a thin triangle body that
  // reinforces the low-frequency resonance without clouding the pluck transient.
  // Dry as a bone: no chorus, no delay, near-mono — country is an outdoor sound.
  // Western — JS-DSP K-S in play() is the sole voice (oscAGain: 0.0).
  // Profile settings only affect reverb routing and the silent osc envelope.
  western: {
    id: 'western',
    oscA: 'triangle',
    oscAGain: 0.0,
    oscB: 'sine',
    oscBGain: 0.0,
    oscBDetuneCents: 0,
    harmonicRatio: 0,
    harmonicGain: 0,
    attackMs: 0.5,
    releaseMs: 30,
    envelopeTight: 0.98,
    filterCutoffHz: 9500,
    filterQ: 0.18,
    filterEnvAmount: 0.0,
    filterCutoffStart: 1.0,
    filterCutoffEnd: 1.0,
    filterEnvAttackMs: 1,
    satAmount: 0.0,
    chorusDepth: 0,
    chorusRate: 0,
    chorusMix: 0,
    delayTimeMs: 35,
    delayFeedback: 0.0,
    delayMix: 0.0,
    stereoWidth: 0.06,
    toneBias: 0.08,
  },

  // ---------------------------------------------------------------------------
  // Forest — warm, organic, woody. Triangle fundaental with gentle chorus width.
  // K-S in play() adds a dark log-drum bass on every bass lane hit.
  // Soft attack (like a breathy flute or bowed branch) and long natural decay.
  // Forest — the two audibly distinguishable differences from Beach are:
  // 1. Percussive attack (3ms) — wood strikes, not ocean blooms.
  //    Beach has a long soft attack; Forest has an immediate transient.
  // 2. The 3.984 marimba-bar inharmonic partial at harmonicGain 0.34 —
  //    creates the hollow wooden resonance. Audible and distinctive.
  // Everything else (chorus, delay, reverb) is kept light.
  forest: {
    id: 'forest',
    oscA: 'triangle',
    oscAGain: 0.0,        // K-S JS-DSP is the primary voice — silence the generic triangle
    oscB: 'sine',
    oscBGain: 0.0,
    oscBDetuneCents: 0,
    harmonicRatio: 3.984, // inharmonic tine overtone — the metallic shimmer above the fundamental
    harmonicGain: 0.44,   // present but not overpowering — sits above the K-S body
    attackMs: 1,          // instant — mallet strike
    releaseMs: 80,        // shorter tail — wood damps fast
    envelopeTight: 0.62,  // tighter gate = more percussive feel
    filterCutoffHz: 5400,
    filterQ: 0.55,
    filterEnvAmount: 0.32, // bright transient → dark sustain = struck-wood behavior
    filterCutoffStart: 0.42,
    filterCutoffEnd: 0.88,
    filterEnvAttackMs: 4,
    satAmount: 0.06,
    chorusDepth: 0.0006,
    chorusRate: 0.18,
    chorusMix: 0.02,
    delayTimeMs: 68,
    delayFeedback: 0.06,
    delayMix: 0.02,
    stereoWidth: 0.16,
    toneBias: 0.04,
  },

  // ---------------------------------------------------------------------------
  // Medieval — harpsichord pluck character. Sawtooth is the natural waveform of
  // a plucked/quilled string. Double-manual detune (8¢) for the classic harpsichord
  // "chorus" effect. Very short decay — a key drops when the quill releases.
  // Medieval — JS-DSP K-S + quill click in play() are the voice (oscAGain: 0.0).
  // Profile settings only affect reverb routing and the silent osc envelope.
  medieval: {
    id: 'medieval',
    oscA: 'sawtooth',
    oscAGain: 0.0,
    oscB: 'sawtooth',
    oscBGain: 0.0,
    oscBDetuneCents: 0,
    harmonicRatio: 0,
    harmonicGain: 0,
    attackMs: 0.5,
    releaseMs: 52,
    envelopeTight: 0.94,
    filterCutoffHz: 8200,
    filterQ: 0.42,
    filterEnvAmount: 0.26,
    filterCutoffStart: 0.58,
    filterCutoffEnd: 1.12,
    filterEnvAttackMs: 6,
    satAmount: 0.10,
    chorusDepth: 0,
    chorusRate: 0,
    chorusMix: 0,
    delayTimeMs: 72,
    delayFeedback: 0.10,
    delayMix: 0.028,
    stereoWidth: 0.24,
    toneBias: 0.80,
  },

  disco: {
    id: 'arcade',
    oscA: 'square',
    oscB: 'square',
    oscAGain: 0.82,
    oscBGain: 0.14,
    oscBDetuneCents: 6.2,
    attackMs: 3,
    releaseMs: 32,
    envelopeTight: 0.94,
    filterCutoffHz: 11200,
    filterQ: 0.78,
    filterEnvAmount: 0.68,
    filterCutoffStart: 0.28,
    filterCutoffEnd: 1.12,
    filterEnvAttackMs: 10,
    satAmount: 0.22,
    chorusDepth: 0.0008,
    chorusRate: 0.9,
    chorusMix: 0.02,
    delayTimeMs: 48,
    delayFeedback: 0.06,
    delayMix: 0.018,
    stereoWidth: 0.04,
    toneBias: 0.68,
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
