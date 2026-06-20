/**
 * Retro voice engine — NES / Amiga flavored one-shots via Web Audio API.
 */

import { resolveSoundProfile } from './world-sound.js';

let ctx = null;
let activeWorldKey = null;
/** @type {{ ctx: AudioContext, dry: GainNode, delaySend: GainNode, delay: DelayNode, delayFb: GainNode, delayWet: GainNode, comp: DynamicsCompressorNode } | null} */
let fxBus = null;
/** @type {{ ctx: AudioContext, convolver: ConvolverNode, wetGain: GainNode, decayKey: string } | null} */
let reverbBus = null;

/**
 * Per-world reverb sends — deliberately low wet values.
 * Worlds not listed (Speedway, Desert) stay fully dry.
 */
const WORLD_REVERB = {
  'ice-cave':  { decay: 0.42, preDelayMs: 6,  wet: 0.035 },
  'space-age': { decay: 2.0,  preDelayMs: 20, wet: 0.048 },
  dungeon:     { decay: 0.45, preDelayMs: 18, wet: 0.014 },
  bubble:      { decay: 0.55, preDelayMs: 8,  wet: 0.028 },
  arcade:      { decay: 0.32, preDelayMs: 5,  wet: 0.015 },
  neon:        { decay: 3.2,  preDelayMs: 28, wet: 0.072 }, // long airy diffuse tail — core to retrowave
  'music-box': { decay: 0.28, preDelayMs: 4,  wet: 0.018 }, // tiny wooden-box air — dry and precious
  forest:      { decay: 1.6,  preDelayMs: 22, wet: 0.048 }, // outdoor air — open canopy, not cavernous
  medieval:    { decay: 1.8,  preDelayMs: 22, wet: 0.042 }, // stone hall — present but not huge
};

function getContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 0 = sine, 0.5 = square, 1 = saw */
function waveType(tone) {
  if (tone < 0.34) return 'sine';
  if (tone < 0.67) return 'square';
  return 'sawtooth';
}

function makeSatCurve(amount) {
  const n = 256;
  const curve = new Float32Array(n);
  const drive = 1 + amount * (amount > 0.14 ? 9 : 5);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
}

function makeCrunchCurve(amount) {
  const n = 256;
  const curve = new Float32Array(n);
  const drive = 1 + amount * 28;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
}

function noiseBurst(ac, duration) {
  const len = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  return src;
}

function bendMultiplier(bend) {
  const b = clamp01(bend);
  if (b < 0.5) return 1 - (0.5 - b) * 1;
  return 1 + (b - 0.5) * 2;
}

function humanize() {
  return {
    timeSec: (Math.random() * 2 - 1) * 0.0025,
    pitchMul: 2 ** ((Math.random() * 2 - 1) * 1.4 / 1200),
    volMul: 1 + (Math.random() * 2 - 1) * 0.04,
  };
}

/**
 * Return a shallow copy of profile with lane-specific timbral overrides.
 * Melody lane is unchanged. Other lanes modify filter, envelope, saturation,
 * stereo, and harmonic presence to give each voice a distinct character.
 */
function applyLaneOverlay(profile, lane) {
  if (!lane || lane === 'melody') return profile;
  const p = { ...profile };
  if (lane === 'bass') {
    p.filterCutoffHz = Math.max(3200, profile.filterCutoffHz * 0.52);
    p.filterQ        = Math.max(0.38, profile.filterQ * 0.82);
    p.stereoWidth    = profile.stereoWidth * 0.35;
    p.harmonicGain   = 0;
    p.releaseMs      = profile.releaseMs * 1.3;
    p.satAmount      = Math.min(0.36, profile.satAmount * 1.22);
    p.chorusMix      = profile.chorusMix * 0.22;
    p.oscBGain       = profile.oscBGain * 1.1;
    if (p.oscB === 'square') p.oscB = 'triangle';
  } else if (lane === 'echo') {
    p.filterCutoffHz = Math.min(18000, profile.filterCutoffHz * 1.42);
    p.oscAGain       = profile.oscAGain * 0.70;
    p.oscBGain       = profile.oscBGain * 0.56;
    p.stereoWidth    = Math.min(0.75, profile.stereoWidth * 2.2);
    p.releaseMs      = profile.releaseMs * 0.50;
    p.satAmount      = profile.satAmount * 0.42;
    p.chorusMix      = Math.min(0.32, profile.chorusMix * 1.65);
    p.harmonicGain   = profile.harmonicGain * 1.1;
  } else if (lane === 'harmony') {
    p.filterCutoffHz = profile.filterCutoffHz * 0.74;
    p.oscAGain       = profile.oscAGain * 0.78;
    p.oscBGain       = profile.oscBGain * 0.84;
    p.stereoWidth    = Math.min(0.58, profile.stereoWidth * 1.55);
    p.attackMs       = profile.attackMs * 1.75;
    p.releaseMs      = profile.releaseMs * 1.22;
    p.satAmount      = profile.satAmount * 0.58;
    p.harmonicGain   = profile.harmonicGain * 0.42;
    p.chorusMix      = Math.min(0.28, profile.chorusMix * 1.18);
  }
  return p;
}

/** Algorithmically generated impulse response for a simple exponential reverb tail. */
function makeImpulseResponse(ac, decaySec, preDelayMs) {
  const sr = ac.sampleRate;
  const preDelaySamples = Math.floor((preDelayMs / 1000) * sr);
  const totalLen = Math.max(1, Math.floor(sr * decaySec) + preDelaySamples);
  const buf = ac.createBuffer(2, totalLen, sr);
  const k = 3.5 + 2.5 / decaySec;
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = preDelaySamples; i < totalLen; i++) {
      const t = (i - preDelaySamples) / (totalLen - preDelaySamples);
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * k);
    }
  }
  return buf;
}

/** Lazy-init reverb bus; rebuilds ConvolverNode when world (decay key) changes. */
function ensureReverbBus(ac, worldKey, cfg, masterComp) {
  const decayKey = `${worldKey}_${cfg.decay}_${cfg.preDelayMs}`;
  if (!reverbBus || reverbBus.ctx !== ac || reverbBus.decayKey !== decayKey) {
    const convolver = ac.createConvolver();
    convolver.buffer = makeImpulseResponse(ac, cfg.decay, cfg.preDelayMs);
    const wetGain = ac.createGain();
    wetGain.gain.value = 1;
    convolver.connect(wetGain);
    wetGain.connect(masterComp);
    reverbBus = { ctx: ac, convolver, wetGain, decayKey };
  }
  return reverbBus;
}

function ensureFxBus(ac, profile) {
  if (!fxBus || fxBus.ctx !== ac) {
    reverbBus = null;

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value      = 10;
    comp.ratio.value     = 3;
    comp.attack.value    = 0.008;
    comp.release.value   = 0.1;
    comp.connect(ac.destination);

    const dry = ac.createGain();
    dry.gain.value = 1;
    dry.connect(comp);

    const delaySend = ac.createGain();
    delaySend.gain.value = 1;

    const delay = ac.createDelay(0.4);
    const delayFb = ac.createGain();
    const delayWet = ac.createGain();

    delaySend.connect(delay);
    delay.connect(delayFb);
    delayFb.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(comp);

    fxBus = { ctx: ac, dry, delaySend, delay, delayFb, delayWet, comp };
  }

  fxBus.delay.delayTime.value = profile.delayTimeMs / 1000;
  fxBus.delayFb.gain.value    = profile.delayFeedback;
  fxBus.delayWet.gain.value   = profile.delayMix;
  return fxBus;
}

function schedulePitch(osc, pitch, endPitch, t0, duration, wobble) {
  if (wobble > 0.02) {
    const rate = 8 + wobble * 22;
    const depth = pitch * wobble * 0.09;
    const steps = Math.max(4, Math.floor(duration * rate));
    for (let i = 0; i <= steps; i++) {
      const t = t0 + (duration * 0.85 * i) / steps;
      const progress = i / steps;
      const base = pitch + (endPitch - pitch) * progress;
      const wob = Math.sin(i * 1.7) * depth;
      osc.frequency.setValueAtTime(Math.max(40, base + wob), t);
    }
    return;
  }
  osc.frequency.setValueAtTime(pitch, t0);
  osc.frequency.exponentialRampToValueAtTime(endPitch, t0 + duration * 0.75);
}

// ---------------------------------------------------------------------------
// Arcade bitcrusher — 5-bit quantization (32 levels) applied post-envelope.
// Gives NES-style digital crunch without AudioWorklet complexity.
// ---------------------------------------------------------------------------
let _arcadeBitcrushCurve = null;
function getArcadeBitcrushCurve() {
  if (_arcadeBitcrushCurve) return _arcadeBitcrushCurve;
  const n     = 256;
  const steps = 16; // 5-bit = 32 quantization levels (±16)
  _arcadeBitcrushCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    _arcadeBitcrushCurve[i] = Math.round(x * steps) / steps;
  }
  return _arcadeBitcrushCurve;
}

function addOscVoice(ac, {
  type, pitch, endPitch, t0, duration, wobble, gain, pan, detuneCents = 0,
  periodicWave = null,
}) {
  const osc = ac.createOscillator();
  if (periodicWave) {
    osc.setPeriodicWave(periodicWave);
  } else {
    osc.type = type;
  }
  const freq = pitch * 2 ** (detuneCents / 1200);
  const endFreq = endPitch * 2 ** (detuneCents / 1200);
  schedulePitch(osc, freq, endFreq, t0, duration, wobble);

  const g = ac.createGain();
  g.gain.value = gain;

  const panner = ac.createStereoPanner();
  panner.pan.value = pan;

  osc.connect(g);
  g.connect(panner);
  osc.start(t0);
  osc.stop(t0 + duration + 0.12);
  return panner;
}

function scheduleEnvelope(gain, t0, attackEnd, sustainEnd, releaseEnd, peak, punch) {
  const p = clamp01(punch ?? 0);
  gain.gain.setValueAtTime(0.00008, t0);
  if (p > 0.02) {
    const punchT = Math.min((attackEnd - t0) * 0.4, 0.008);
    const punchPeak = peak * (1 + p * 0.035);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, punchPeak), t0 + punchT);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), attackEnd);
  } else {
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), attackEnd);
  }
  gain.gain.setValueAtTime(Math.max(0.0001, peak), sustainEnd);
  gain.gain.exponentialRampToValueAtTime(0.00008, releaseEnd);
}

function scheduleFilterEnvelope(lpf, t0, attackEnd, sustainEnd, releaseEnd, baseCutoff, profile) {
  const amt = profile.filterEnvAmount;
  if (amt < 0.02) {
    lpf.frequency.setValueAtTime(baseCutoff, t0);
    return;
  }

  const startFreq = Math.max(220, baseCutoff * profile.filterCutoffStart);
  const peakFreq = Math.max(280, baseCutoff * profile.filterCutoffEnd);
  const envAttack = Math.min(
    Math.max(0.008, profile.filterEnvAttackMs / 1000),
    (sustainEnd - t0) * 0.45,
  );
  const closeFreq = Math.max(180, baseCutoff * lerp(profile.filterCutoffEnd, profile.filterCutoffStart, 0.35 * amt));

  lpf.frequency.setValueAtTime(startFreq, t0);
  lpf.frequency.exponentialRampToValueAtTime(peakFreq, t0 + envAttack);
  lpf.frequency.setValueAtTime(peakFreq, attackEnd);
  lpf.frequency.exponentialRampToValueAtTime(closeFreq, sustainEnd);
  lpf.frequency.exponentialRampToValueAtTime(Math.max(140, closeFreq * 0.82), releaseEnd);
}

function attachChorus(ac, source, dest, profile, t0, noteDuration) {
  const dryThru = ac.createGain();
  dryThru.gain.value = profile.chorusMix < 0.02 ? 1 : 1 - profile.chorusMix * 0.28;
  source.connect(dryThru);
  dryThru.connect(dest);

  if (profile.chorusMix < 0.02) return;

  const delay = ac.createDelay(0.04);
  delay.delayTime.value = 0.011;

  const lfo = ac.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = profile.chorusRate;

  const lfoGain = ac.createGain();
  lfoGain.gain.value = profile.chorusDepth;

  const wet = ac.createGain();
  wet.gain.value = profile.chorusMix;

  source.connect(delay);
  lfo.connect(lfoGain);
  lfoGain.connect(delay.delayTime);
  delay.connect(wet);
  wet.connect(dest);

  lfo.start(t0);
  lfo.stop(t0 + noteDuration + 0.12);
}

// ---------------------------------------------------------------------------
// Persistent backing voices — sustained ambient layers that run independently
// of the step sequencer. Each voice glides smoothly to new pitches rather than
// firing discrete one-shots. Lives entirely in synth.js; melody.js only calls
// stopAllBackingVoices() on playback stop.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pulse-wave factory — emulates NES/VRC6 duty cycles via PeriodicWave.
// Cached per AudioContext so each shape is only computed once per session.
// Formula: Fourier coefficients for a bipolar pulse (+1/-1) with duty D.
//   real[n] = (2 / nπ) * sin(2πnD)   ← cosine terms
//   imag[n] = (2 / nπ) * (1 − cos(2πnD))  ← sine terms
// ---------------------------------------------------------------------------
const _pulseWaveCache = new WeakMap();

function getPulseWave(ac, dutyCycle) {
  if (!_pulseWaveCache.has(ac)) _pulseWaveCache.set(ac, new Map());
  const cache = _pulseWaveCache.get(ac);
  const key   = dutyCycle.toFixed(4);
  if (!cache.has(key)) {
    const H    = 28;
    const real = new Float32Array(H + 1);
    const imag = new Float32Array(H + 1);
    for (let n = 1; n <= H; n++) {
      real[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * dutyCycle);
      imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * dutyCycle));
    }
    cache.set(key, ac.createPeriodicWave(real, imag, { disableNormalization: false }));
  }
  return cache.get(key);
}

// ---------------------------------------------------------------------------
// Inharmonic PeriodicWave builder — generalises the pulse-wave approach to any
// additive spectrum. Pass an array of [ratio, amplitude] pairs describing the
// overtone series. Cached per AudioContext + spectrum signature.
//
// Real inharmonic series for common physical sources:
//   Metal tine (music box):  [1, 2.756, 5.404, 8.933]
//   Glass/crystal:           [1, 2.917, 5.599]
//   Marimba bar:             [1, 3.984, 9.723]
//   Bell:                    [1, 2.000, 2.756, 3.600]
// ---------------------------------------------------------------------------
const _inharmonicCache = new WeakMap();

/**
 * Build (and cache) an inharmonic PeriodicWave from a partial series.
 * @param {AudioContext} ac
 * @param {Array<[number, number]>} partials  Array of [frequencyRatio, amplitude]
 * @returns {PeriodicWave}
 */
function getInharmonicWave(ac, partials) {
  if (!_inharmonicCache.has(ac)) _inharmonicCache.set(ac, new Map());
  const cache = _inharmonicCache.get(ac);
  const key   = partials.map(([r, a]) => `${r.toFixed(4)}:${a.toFixed(4)}`).join('|');
  if (!cache.has(key)) {
    // We synthesise the spectrum by treating each partial as a sinusoid:
    // real[n] is the cosine coefficient, imag[n] the sine coefficient.
    // For a single partial at arbitrary ratio r with amplitude a, we distribute
    // energy into the two nearest integer harmonics (linear interpolation).
    const H    = 64;
    const real = new Float32Array(H + 1);
    const imag = new Float32Array(H + 1);
    let totalAmp = 0;
    for (const [ratio, amp] of partials) {
      totalAmp += amp;
      const lo  = Math.floor(ratio);
      const hi  = lo + 1;
      const frac = ratio - lo;
      if (lo >= 1 && lo <= H) imag[lo] += amp * (1 - frac);
      if (hi >= 1 && hi <= H) imag[hi] += amp * frac;
    }
    // Normalise so peak doesn't exceed 1
    const norm = totalAmp > 0 ? 1 / totalAmp : 1;
    for (let n = 1; n <= H; n++) {
      real[n] *= norm;
      imag[n] *= norm;
    }
    cache.set(key, ac.createPeriodicWave(real, imag, { disableNormalization: false }));
  }
  return cache.get(key);
}

// ---------------------------------------------------------------------------
// FM voice helper — two-operator FM synthesis via Web Audio.
// A modulator oscillator drives the carrier's frequency, adding sidebands that
// give metallic, bell, and tine-piano character without additional oscillators.
//
// Key parameters:
//   modRatio  — modulator frequency as multiple of carrier (e.g. 3.5 for bell)
//   modIndex  — modulation depth (higher = brighter/harsher; 0.5–3 is musical)
//
// Typical settings:
//   Music box tine:   modRatio 3.5, modIndex 1.2
//   Ice cave crystal: modRatio 3.1, modIndex 0.8
//   Bell:             modRatio 2.0, modIndex 2.0
//   Metallic clang:   modRatio 1.4, modIndex 3.5
// ---------------------------------------------------------------------------

/**
 * Create a two-op FM voice.  Returns { carrier, modulator, modGain } — caller
 * must connect carrier.output to the audio graph and start/stop both oscillators.
 * @param {AudioContext} ac
 * @param {number} carrierFreq
 * @param {number} modRatio
 * @param {number} modIndex   — scales with carrier freq (Hz deviation = index × carrierFreq)
 * @returns {{ carrier: OscillatorNode, modulator: OscillatorNode, modGain: GainNode }}
 */
function makeFmVoice(ac, carrierFreq, modRatio, modIndex) {
  const carrier   = ac.createOscillator();
  const modulator = ac.createOscillator();
  const modGain   = ac.createGain();

  carrier.type   = 'sine';
  modulator.type = 'sine';
  carrier.frequency.value   = carrierFreq;
  modulator.frequency.value = carrierFreq * modRatio;
  modGain.gain.value        = carrierFreq * modIndex; // absolute Hz deviation

  modulator.connect(modGain);
  modGain.connect(carrier.frequency); // FM: modulator → carrier pitch input
  return { carrier, modulator, modGain };
}

// ---------------------------------------------------------------------------
// Karplus-Strong plucked string synthesis.
// A single period of noise (the "pluck") seeds a feedback delay loop filtered
// by a one-pole low-pass. The loop recirculates at 1/frequency seconds, building
// a pitched resonance that decays naturally as high frequencies damp out first —
// exactly how a plucked string works physically.
//
// brightness (0–1): how much high-frequency content survives each loop.
//   0.0 = very dull/muted (plucking near the bridge)
//   0.5 = natural banjo/guitar
//   1.0 = bright metallic (harpsichord, harp)
// sustain (0–1): feedback gain — higher = longer ring.
//   0.92–0.97 for string instruments
// ---------------------------------------------------------------------------

/**
 * Fire a Karplus-Strong plucked-string voice.
 * Returns a GainNode (output) — connect to the audio graph, start is immediate.
 * @param {AudioContext} ac
 * @param {number} freq        — fundamental frequency in Hz
 * @param {number} t0          — start time (AudioContext.currentTime)
 * @param {number} duration    — how long to let it ring (seconds) before stopping
 * @param {number} brightness  — 0 (dark) to 1 (bright)
 * @param {number} sustain     — feedback coefficient, 0.92–0.98
 * @param {number} gain        — output level
 * @returns {GainNode}
 */
// Safe K-S ceiling: Web Audio DelayNode minimum is 128/sampleRate ≈ 2.67ms at 48kHz,
// but in practice 5–6ms is needed for stability across all browsers. That means
// reliable K-S only works below ~170-200 Hz (1/0.005 = 200 Hz).
// For higher fundamental pitches, callers must pass freq/2 or freq/4 so the delay
// is always in the safe range. K-S then acts as a sub-octave body resonance, and
// the oscillator layer in the world profile carries the actual melody pitch.
function makeKarplusStrong(ac, freq, t0, duration, brightness, sustain, gain) {
  const delayTime = 1 / Math.max(20, freq);

  // Seed: one period of white noise
  const seedLen = Math.max(2, Math.ceil(ac.sampleRate * delayTime));
  const seedBuf = ac.createBuffer(1, seedLen, ac.sampleRate);
  const data    = seedBuf.getChannelData(0);
  for (let i = 0; i < seedLen; i++) data[i] = Math.random() * 2 - 1;

  const seed = ac.createBufferSource();
  seed.buffer = seedBuf;

  // Delay line — sets the pitch
  const delay = ac.createDelay(1.0);
  delay.delayTime.value = delayTime;

  // One-pole low-pass inside the loop — damps high frequencies on each cycle.
  // Cutoff maps from ~400 Hz (dark) to ~12 kHz (bright).
  const loopLpf = ac.createBiquadFilter();
  loopLpf.type = 'lowpass';
  loopLpf.frequency.value = 400 + brightness * 11600;
  loopLpf.Q.value = 0.0; // flat, no resonance

  // Feedback gain — controls how long it rings
  const fb = ac.createGain();
  fb.gain.value = Math.min(0.99, sustain);

  // Output
  const out = ac.createGain();
  out.gain.value = gain;

  // Topology: seed → delay → loopLpf → fb → delay (loop)
  //                                         → out
  seed.connect(delay);
  delay.connect(loopLpf);
  loopLpf.connect(fb);
  fb.connect(delay);      // feedback loop
  loopLpf.connect(out);   // tap output

  seed.start(t0);
  seed.stop(t0 + delayTime + 0.004); // seed fires for exactly one period

  // Fade out cleanly at end of duration
  out.gain.setValueAtTime(gain, t0 + duration);
  out.gain.linearRampToValueAtTime(0, t0 + duration + 0.05);

  return out;
}

// ---------------------------------------------------------------------------
// Pure-JavaScript Karplus-Strong — frequency-unlimited pluck synthesis.
//
// Web Audio's DelayNode has a minimum delay of ~3–5 ms (browser-dependent),
// which means it only works correctly below ~200–330 Hz. Above that the delay
// snaps to its floor, and the feedback loop buzzes at the wrong pitch.
//
// This implementation runs the same K-S algorithm entirely in a Float32Array
// ring buffer in JavaScript. There is no hardware minimum — ringLen is simply
// Math.round(sampleRate / freq), which works at 500 Hz or 900 Hz as cleanly
// as it does at 80 Hz. CPU cost is negligible (~0.1 ms per note at 48 kHz).
//
// brightness (0–1): LP filter coefficient inside feedback loop.
//   0.0 = dark/muted (strings plucked near bridge, or muted)
//   0.7 = warm guitar/banjo
//   0.9 = bright metallic (harpsichord wire, harp)
// sustain (0–1): feedback gain. Higher = longer ring. 0.98–0.995 for strings.
// ---------------------------------------------------------------------------

/**
 * @param {AudioContext} ac
 * @param {number} freq       — fundamental in Hz (any value, no minimum)
 * @param {number} t0         — AudioContext start time
 * @param {number} duration   — how long to render (seconds)
 * @param {number} brightness — 0 dark → 1 bright
 * @param {number} sustain    — feedback coefficient, 0.96–0.998
 * @param {number} gain       — output gain
 * @returns {GainNode}        — connect to audio graph; playback starts at t0
 */
function makeKarplusJsDsp(ac, freq, t0, duration, brightness, sustain, gain) {
  const sr     = ac.sampleRate;
  const len    = Math.ceil(sr * Math.max(0.05, duration));
  const ringLen = Math.max(2, Math.round(sr / freq)); // exact pitch, no floor constraint
  const data   = new Float32Array(len);
  const ring   = new Float32Array(ringLen);

  // Seed the ring buffer with one period of white noise — this is the pluck excitation
  for (let i = 0; i < ringLen; i++) ring[i] = Math.random() * 2 - 1;

  // K-S loop: one-pole LP filter inside feedback
  // 'a' controls how fast high frequencies damp out per cycle
  const a  = 0.5 + brightness * 0.48;
  const fb = Math.min(0.9999, sustain);
  let prev = 0, pos = 0;

  for (let i = 0; i < len; i++) {
    const s   = ring[pos];
    const lp  = a * s + (1 - a) * prev;
    prev       = lp;
    ring[pos]  = lp * fb;
    pos        = (pos + 1) % ringLen;
    data[i]    = s;
  }

  const buf = ac.createBuffer(1, len, sr);
  buf.copyToChannel(data, 0);

  const src = ac.createBufferSource();
  src.buffer = buf;

  const out = ac.createGain();
  out.gain.value = gain;
  src.connect(out);
  src.start(t0);
  return out; // caller: out.connect(fx.dry)
}

/**
 * @typedef {{ ctx: AudioContext, osc: OscillatorNode, gain: GainNode,
 *             lastPitch: number, fadeTimer: ReturnType<typeof setTimeout>|null }} BackingMono
 * @typedef {{ ctx: AudioContext, oscs: Array<{osc: OscillatorNode, gain: GainNode}>,
 *             masterGain: GainNode, lfo: OscillatorNode,
 *             lastPitch: number, fadeTimer: ReturnType<typeof setTimeout>|null }} BackingChoir
 */

/** @type {{ whistle: BackingMono|null, choir: BackingChoir|null, bubble: BackingChoir|null, neonPad: BackingChoir|null, westernWhistle: BackingChoir|null }} */
const BACKING = { whistle: null, choir: null, bubble: null, neonPad: null, westernWhistle: null, medievalDrone: null };

const BACKING_FADE_MS = 2200; // ms of silence before a backing voice dissolves

function stopBackingVoice(key) {
  const v = BACKING[key];
  if (!v) return;
  clearTimeout(v.fadeTimer);
  const ac = v.ctx;
  const now = ac.currentTime;
  try {
    if (key === 'whistle') {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + 0.35);
      setTimeout(() => { try { v.osc.stop(); } catch {} }, 400);
    } else {
      v.masterGain.gain.cancelScheduledValues(now);
      v.masterGain.gain.setValueAtTime(v.masterGain.gain.value, now);
      v.masterGain.gain.linearRampToValueAtTime(0, now + 0.55);
      setTimeout(() => {
        v.oscs.forEach(({ osc }) => { try { osc.stop(); } catch {} });
        try { v.lfo.stop(); } catch {}
        try { v._pitchLfo.stop(); } catch {} // medievalDrone has a second LFO
      }, 650);
    }
  } catch {}
  BACKING[key] = null;
}

export function stopAllBackingVoices() {
  stopBackingVoice('whistle');
  stopBackingVoice('westernWhistle');
  stopBackingVoice('choir');
  stopBackingVoice('bubble');
  stopBackingVoice('neonPad');
  stopBackingVoice('medievalDrone');
}

/**
 * Bubble underwater drone — three quietly detuned sines with a slow LFO drift.
 * Fixed ambient pitch (doesn't track melody), creating the "submerged" feeling
 * that persists between notes. Routed directly to destination.
 */
function updateBubbleDrone(ac, _pitch, _volume) {
  const targetVol = 0.055;
  const now       = ac.currentTime;

  if (!BACKING.bubble || BACKING.bubble.ctx !== ac) {
    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(targetVol, now);
    masterGain.connect(ac.destination);

    // Very slow LFO — gentle underwater swell, 0.3 Hz ≈ one cycle every 3 seconds
    const lfo      = ac.createOscillator();
    const lfoDepth = ac.createGain();
    lfo.frequency.value = 0.3;
    lfoDepth.gain.value = 2.5; // ±2.5 Hz — barely perceptible drift
    lfo.connect(lfoDepth);
    lfo.start(now);

    // Three quiet sines at A2 / slightly detuned variants — ambient undertone
    const basePitch = 110; // A2 — low, unobtrusive
    const detunes   = [0, 18, -22];
    const oscs = detunes.map((cents) => {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = basePitch * 2 ** (cents / 1200);
      lfoDepth.connect(osc.frequency);
      osc.connect(masterGain);
      osc.start(now);
      return { osc };
    });

    BACKING.bubble = { ctx: ac, oscs, masterGain, lfo, lastPitch: basePitch, fadeTimer: null };
  }

  clearTimeout(BACKING.bubble.fadeTimer);
  BACKING.bubble.fadeTimer = setTimeout(() => stopBackingVoice('bubble'), BACKING_FADE_MS);
}

/**
 * Space Age G-Funk whistle — pure sine, glides smoothly between pitches.
 * Called from play() on every Space Age melody note.
 */
function updateSpaceAgeWhistle(ac, pitch, volume, fxComp) {
  const whistlePitch = pitch * 2; // octave above melody — high register, piercing, flute-like
  const targetVol = volume * 0.52;
  const now = ac.currentTime;

  if (!BACKING.whistle || BACKING.whistle.ctx !== ac) {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = whistlePitch;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, now);

    const panner = ac.createStereoPanner();
    panner.pan.value = 0.18;

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(fxComp);
    osc.start(now);

    // Gentle fade-in on creation
    gain.gain.linearRampToValueAtTime(targetVol, now + 0.10);

    BACKING.whistle = { ctx: ac, osc, gain, lastPitch: whistlePitch, fadeTimer: null };
  } else {
    const v = BACKING.whistle;
    // Portamento: glide from last pitch to new pitch over 75ms,
    // then continue drifting upward ~5 semitones over 2s (alien abduction rise)
    const riseTarget = whistlePitch * Math.pow(2, 5 / 12);
    v.osc.frequency.cancelScheduledValues(now);
    v.osc.frequency.setValueAtTime(v.lastPitch, now);
    v.osc.frequency.exponentialRampToValueAtTime(whistlePitch, now + 0.075);
    v.osc.frequency.exponentialRampToValueAtTime(riseTarget, now + 2.0);
    // Subtle volume swell on each new note
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(targetVol, now + 0.04);
    BACKING.whistle.lastPitch = whistlePitch;
  }

  // Reschedule fade-out: voice dissolves 2.2s after last note
  clearTimeout(BACKING.whistle.fadeTimer);
  BACKING.whistle.fadeTimer = setTimeout(() => stopBackingVoice('whistle'), BACKING_FADE_MS);
}

/**
 * Spaghetti Western whistle — pure sine, a perfect fifth above the melody.
 * Wide slow vibrato (3.5 Hz LFO, ±14 Hz) is the Ennio Morricone signature.
 * Long portamento (180 ms) gives the languid, wandering legato feel.
 * Soft volume (22%) — heard as a lonely background element, not a lead.
 */
function updateWesternWhistle(ac, pitch, volume, fxComp) {
  const whistlePitch = Math.min(1400, pitch * 1.5); // perfect fifth above melody
  const targetVol    = volume * 0.22;
  const now          = ac.currentTime;

  if (!BACKING.westernWhistle || BACKING.westernWhistle.ctx !== ac) {
    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.connect(fxComp);

    // Vibrato LFO — 3.5 Hz, ±14 Hz deviation (≈ half-semitone at 500 Hz)
    const lfo      = ac.createOscillator();
    const lfoDepth = ac.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 3.5;
    lfoDepth.gain.value = 14; // fixed Hz deviation — wide, characterful
    lfo.connect(lfoDepth);
    lfo.start(now);

    const osc = ac.createOscillator();
    osc.type = 'sine';
    // Approach from below on first entry — starts ~14% flat, glides up to target pitch
    osc.frequency.setValueAtTime(Math.max(20, whistlePitch * 0.86), now);
    osc.frequency.exponentialRampToValueAtTime(whistlePitch, now + 0.26);
    lfoDepth.connect(osc.frequency); // vibrato modulates pitch
    osc.connect(masterGain);
    osc.start(now);

    masterGain.gain.linearRampToValueAtTime(targetVol, now + 0.26); // slow bloom matches pitch rise

    BACKING.westernWhistle = {
      ctx: ac, oscs: [{ osc }], masterGain, lfo,
      lastPitch: whistlePitch, fadeTimer: null,
    };
  } else {
    const v = BACKING.westernWhistle;
    // Slower portamento: 240 ms — the characteristic Morricone lazy glide.
    // On upward intervals, dip 12% below target first (approach from below),
    // which sounds like a singer shaping the note before landing on it.
    v.oscs[0].osc.frequency.cancelScheduledValues(now);
    v.oscs[0].osc.frequency.setValueAtTime(v.lastPitch, now);
    if (whistlePitch > v.lastPitch * 1.04) {
      // upward move — undershoot then resolve
      v.oscs[0].osc.frequency.exponentialRampToValueAtTime(Math.max(20, whistlePitch * 0.88), now + 0.032);
      v.oscs[0].osc.frequency.exponentialRampToValueAtTime(Math.max(20, whistlePitch), now + 0.24);
    } else {
      // downward or same — smooth direct glide
      v.oscs[0].osc.frequency.exponentialRampToValueAtTime(Math.max(20, whistlePitch), now + 0.24);
    }
    v.masterGain.gain.cancelScheduledValues(now);
    v.masterGain.gain.setValueAtTime(v.masterGain.gain.value, now);
    v.masterGain.gain.linearRampToValueAtTime(targetVol, now + 0.08);
    BACKING.westernWhistle.lastPitch = whistlePitch;
  }

  clearTimeout(BACKING.westernWhistle.fadeTimer);
  BACKING.westernWhistle.fadeTimer = setTimeout(
    () => stopBackingVoice('westernWhistle'), BACKING_FADE_MS,
  );
}

/**
 * Medieval hurdy-gurdy drone — two slightly detuned sawtooth oscillators,
 * one octave below the melody, with a 6 Hz amplitude tremolo that simulates
 * the mechanical wheel rubbing the string. Tracks the melody with a 0.8 s
 * portamento so it follows along rather than sitting frozen beneath it.
 * A peaking EQ around 600 Hz adds the nasal "box resonance" quality.
 */
function updateMedievalDrone(ac, pitch, volume, fxComp) {
  const dronePitch = Math.max(80, pitch * 0.5); // one octave below — stays in touch with melody
  const targetVol  = volume * 0.10;
  const now        = ac.currentTime;

  if (!BACKING.medievalDrone || BACKING.medievalDrone.ctx !== ac) {
    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.connect(fxComp);

    // Peaking EQ around 600 Hz — the "box resonance" of the hurdy-gurdy body
    const peak = ac.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 600;
    peak.Q.value = 1.2;
    peak.gain.value = 5; // gentle boost, not aggressive
    peak.connect(masterGain);

    // Amplitude tremolo LFO — 6 Hz simulates the wheel's mechanical rotation
    // depth: ±15 % of signal (wheelTremoloDepth × masterGain feeds back into itself
    // via a gain node so the overall level stays within targetVol bounds)
    const tremoloLfo   = ac.createOscillator();
    const tremoloDepth = ac.createGain();
    const tremoloGain  = ac.createGain();
    tremoloLfo.type = 'sine';
    tremoloLfo.frequency.value = 6.0;
    tremoloDepth.gain.value = 0.15; // ±15 % depth
    tremoloLfo.connect(tremoloDepth);
    tremoloDepth.connect(tremoloGain.gain); // LFO modulates the tremolo gain
    tremoloGain.gain.setValueAtTime(1.0, now); // base gain = 1, LFO offsets it
    tremoloGain.connect(peak);
    tremoloLfo.start(now);

    // Pitch LFO for slight crank-speed variation (very slow, very subtle)
    const lfo      = ac.createOscillator();
    const lfoDepth = ac.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.18;
    lfoDepth.gain.value = 1.2; // ±1.2 Hz — just a breath of instability
    lfo.connect(lfoDepth);
    lfo.start(now);

    // Two sawtooth strings detuned 0 and +8 cents — beating gives wheel buzz
    const detunes = [0, 8];
    const oscs = detunes.map((cents) => {
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = dronePitch * 2 ** (cents / 1200);
      lfoDepth.connect(osc.frequency);
      osc.connect(tremoloGain);
      osc.start(now);
      return { osc };
    });

    // Bloom in over 1 s — present within a bar or two but not instant
    masterGain.gain.linearRampToValueAtTime(targetVol, now + 1.0);

    BACKING.medievalDrone = {
      ctx: ac, oscs, masterGain, lfo: tremoloLfo, lastPitch: dronePitch,
      fadeTimer: null, _pitchLfo: lfo,
    };
  } else {
    const v = BACKING.medievalDrone;
    // 0.8 s portamento — follows the melody, not frozen in one spot
    v.oscs.forEach(({ osc }, i) => {
      const centsOffset = [0, 8][i];
      const targetFreq = Math.max(80, dronePitch * 2 ** (centsOffset / 1200));
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(osc.frequency.value, now);
      osc.frequency.exponentialRampToValueAtTime(targetFreq, now + 0.8);
    });
    v.masterGain.gain.cancelScheduledValues(now);
    v.masterGain.gain.setValueAtTime(v.masterGain.gain.value, now);
    v.masterGain.gain.linearRampToValueAtTime(targetVol, now + 0.10);
    BACKING.medievalDrone.lastPitch = dronePitch;
  }

  clearTimeout(BACKING.medievalDrone.fadeTimer);
  BACKING.medievalDrone.fadeTimer = setTimeout(
    () => stopBackingVoice('medievalDrone'), BACKING_FADE_MS + 800,
  );
}

/**
 * Dungeon gothic choir — two square-wave channels detuned 10¢ apart.
 * The pitch beating between the two channels creates the classic chiptune
 * chorus effect: same waveform, same note, slightly off-tune = haunted shimmer.
 * Routed directly to ac.destination, bypassing the master compressor.
 */
function updateDungeonChoir(ac, pitch, _volume, _fxComp) {
  const targetVol = 0.07; // subtle — felt beneath the crunch, not competing with it
  const voices    = [{ detuneCents: 0 }, { detuneCents: 10 }];
  const glideMs   = 0.40;
  const now       = ac.currentTime;

  if (!BACKING.choir || BACKING.choir.ctx !== ac) {
    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(targetVol, now);

    // LPF keeps the choir dark and below the melody — presence without harshness
    const lpf = ac.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 1100;
    lpf.Q.value = 0.8;
    masterGain.connect(lpf);
    lpf.connect(ac.destination);

    const oscs = voices.map(({ detuneCents }) => {
      const osc = ac.createOscillator();
      osc.type = 'square';
      osc.frequency.value = pitch * 2 ** (detuneCents / 1200);
      osc.connect(masterGain);
      osc.start(now);
      return { osc };
    });

    BACKING.choir = { ctx: ac, oscs, masterGain, lfo: null, lastPitch: pitch, fadeTimer: null };
  } else {
    const v = BACKING.choir;
    voices.forEach(({ detuneCents }, i) => {
      const osc      = v.oscs[i].osc;
      const newFreq  = pitch * 2 ** (detuneCents / 1200);
      const lastFreq = v.lastPitch * 2 ** (detuneCents / 1200);
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(lastFreq, now);
      osc.frequency.exponentialRampToValueAtTime(newFreq, now + glideMs);
    });
    BACKING.choir.lastPitch = pitch;
  }

  clearTimeout(BACKING.choir.fadeTimer);
  BACKING.choir.fadeTimer = setTimeout(() => stopBackingVoice('choir'), BACKING_FADE_MS);
}

/**
 * Neon sub-bass foundation — two sine oscillators two octaves below the melody,
 * very quiet, gliding slowly. Provides low-end weight under the punchy square-wave
 * lead without adding any high-frequency content that would clash with the Axel F
 * staccato character. Think: the "thump" you feel rather than hear.
 */
function updateNeonPad(ac, pitch, _volume) {
  // Two octaves below melody — pure sub, felt not heard
  const padPitch  = pitch * 0.25;
  const targetVol = 0.032;    // much quieter — foundation only, not a pad
  const glideMs   = 0.40;
  const now       = ac.currentTime;

  // Two sine oscillators with minimal detune — clean sub, no harmonic clash
  const voices = [{ detuneCents: -4 }, { detuneCents: 4 }];

  if (!BACKING.neonPad || BACKING.neonPad.ctx !== ac) {
    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(targetVol, now + 0.90); // slow fade-in — pads bloom

    // Wide stereo panner — left and right oscillators for maximum width
    const panL = ac.createStereoPanner();
    const panR = ac.createStereoPanner();
    panL.pan.value = -0.78;
    panR.pan.value =  0.78;
    panL.connect(masterGain);
    panR.connect(masterGain);
    masterGain.connect(ac.destination);

    const oscs = voices.map(({ detuneCents }, i) => {
      const osc = ac.createOscillator();
      osc.type = 'sine'; // sine = pure sub, no high harmonics to clash with lead
      osc.frequency.value = padPitch * 2 ** (detuneCents / 1200);
      const pan = i === 0 ? panL : panR;
      osc.connect(pan);
      osc.start(now);
      return { osc };
    });

    BACKING.neonPad = { ctx: ac, oscs, masterGain, lfo: null, lastPitch: padPitch, fadeTimer: null };
  } else {
    const v = BACKING.neonPad;
    voices.forEach(({ detuneCents }, i) => {
      const osc      = v.oscs[i].osc;
      const newFreq  = padPitch * 2 ** (detuneCents / 1200);
      const lastFreq = v.lastPitch * 2 ** (detuneCents / 1200);
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(lastFreq, now);
      osc.frequency.exponentialRampToValueAtTime(newFreq, now + glideMs);
    });
    BACKING.neonPad.lastPitch = padPitch;
  }
  clearTimeout(BACKING.neonPad.fadeTimer);
  BACKING.neonPad.fadeTimer = setTimeout(() => stopBackingVoice('neonPad'), BACKING_FADE_MS);
}

/**
 * @param {string|null|undefined} worldKey
 */
export function setWorldSoundKey(worldKey) {
  if (worldKey !== activeWorldKey) stopAllBackingVoices();
  activeWorldKey = worldKey || null;
}

export function gapMs(gap) {
  return clamp01(gap) * 600;
}

/**
 * @param {Record<string, number>} params
 */
export function play(params) {
  const ac = getContext();
  const baseProfile = resolveSoundProfile(activeWorldKey);
  const lane = params.lane || 'melody';
  let profile = applyLaneOverlay(baseProfile, lane);
  const fx = ensureFxBus(ac, baseProfile);

  // Backing voices — persistent, pitch-gliding, not tied to step envelope
  if (lane === 'melody') {
    const rawPitch = Math.max(80, Math.min(2400, params.pitch));
    const rawVol   = (0.02 + clamp01(params.volume) * 0.33);
    if (activeWorldKey === 'space-age') updateSpaceAgeWhistle(ac, rawPitch, rawVol, fx.comp);
    if (activeWorldKey === 'western')   updateWesternWhistle(ac, rawPitch, rawVol, fx.comp);
    if (activeWorldKey === 'dungeon')   updateDungeonChoir(ac, rawPitch, rawVol, fx.comp);
    if (activeWorldKey === 'bubble')    updateBubbleDrone(ac, rawPitch, rawVol);
    if (activeWorldKey === 'neon')      updateNeonPad(ac, rawPitch, rawVol);
    // no persistent backing voice for medieval — harpsichord stands on its own
  }

  // Bubble: each note gets a randomly-sized filter pop + stereo scatter.
  // Different cutoff = different bubble size; downward sweep = the "blorp" shape.
  if (activeWorldKey === 'bubble') {
    profile = {
      ...profile,
      filterCutoffHz:    400  + Math.random() * 1600,  // 400–2000 Hz bubble size
      filterQ:           7    + Math.random() * 9,      // 7–16 resonance
      filterCutoffStart: 3.0  + Math.random() * 1.5,   // starts bright (high)
      filterCutoffEnd:   0.18 + Math.random() * 0.22,  // sweeps dark (low)
      filterEnvAmount:   0.88 + Math.random() * 0.10,  // strong, committed sweep
      stereoWidth:       0.25 + Math.random() * 0.55,  // scatter across stereo field
    };
  }

  const h = humanize();

  const t0 = ac.currentTime + h.timeSec;
  const pitch = Math.max(80, Math.min(2400, params.pitch * h.pitchMul));
  const tone = profile.toneBias != null
    ? lerp(clamp01(params.tone), profile.toneBias, 0.55)
    : clamp01(params.tone);
  const decay = clamp01(params.decay);
  const crunch = clamp01(params.crunch);
  const noiseAmt = clamp01(params.noise);
  const punch = clamp01(params.punch ?? 0);
  const gateMul = Math.max(0.45, Math.min(1.85, params.gateMul ?? 1));
  const releaseMul = Math.max(0.55, Math.min(1.65, params.releaseMul ?? 1));
  const bend = bendMultiplier(params.bend);
  const wobble = clamp01(params.wobble);
  const userDetune = clamp01(params.detune);
  const filterAmt = clamp01(params.filter);
  const volume = (0.02 + clamp01(params.volume) * 0.33) * h.volMul;

  const userAttack = clamp01(params.attack);
  const attackMs = lerp(profile.attackMs, 5 + userAttack * 10, 0.35);
  const releaseMs = lerp(profile.releaseMs, 42 + (1 - profile.envelopeTight) * 28, 0.25) * releaseMul;
  const attackT = Math.max(0.005, attackMs / 1000);
  const releaseT = Math.max(0.04, releaseMs / 1000);

  const sustain = (0.04 + decay * 0.62) * (1 - punch * 0.05) * (1.05 - profile.envelopeTight * 0.12) * gateMul;
  const attackEnd = t0 + attackT;
  const sustainEnd = attackEnd + sustain;
  const releaseEnd = sustainEnd + releaseT;
  const noteDuration = sustain + releaseT + 0.08;

  const endPitch = Math.max(40, pitch * bend);
  const oscAWave = profile.oscA || waveType(tone);
  const oscBWave = profile.oscB || 'triangle';
  const width = profile.stereoWidth;

  const voiceBus = ac.createGain();
  voiceBus.gain.value = 1 - noiseAmt * 0.82;

  // World-specific PeriodicWave overrides
  const isArcade = activeWorldKey === 'arcade';
  // Arcade: NES 12.5% + 25% pulse waves
  const arcadeWaveA = isArcade ? getPulseWave(ac, 0.125) : null;
  const arcadeWaveB = isArcade ? getPulseWave(ac, 0.25)  : null;
  // Ice Cave: pure sine base — the profile's harmonicRatio: 2.756 partial handles bell character.
  // Desert: reverted to plain triangle — marimba partial was adding unwanted complexity.

  const oscAPan = addOscVoice(ac, {
    type: oscAWave,
    periodicWave: arcadeWaveA,
    pitch,
    endPitch,
    t0,
    duration: noteDuration,
    wobble,
    gain: profile.oscAGain,
    pan: -width * 0.5,
  });
  oscAPan.connect(voiceBus);

  const bGain = profile.oscBGain * (0.85 + userDetune * 0.25);
  const bDetune = profile.oscBDetuneCents + userDetune * 6;
  const oscBPan = addOscVoice(ac, {
    type: oscBWave,
    periodicWave: arcadeWaveB,
    pitch,
    endPitch,
    t0,
    duration: noteDuration,
    wobble: wobble * 0.85,
    gain: bGain,
    pan: width * 0.5,
    detuneCents: bDetune,
  });
  oscBPan.connect(voiceBus);

  if (profile.harmonicRatio > 0 && profile.harmonicGain > 0.01) {
    const harmPan = addOscVoice(ac, {
      type: 'sine',
      pitch: pitch * profile.harmonicRatio,
      endPitch: endPitch * profile.harmonicRatio,
      t0,
      duration: noteDuration * 0.95,
      wobble: 0,
      gain: profile.harmonicGain,
      pan: width * 0.15,
    });
    harmPan.connect(voiceBus);
  }

  const noiseMix = ac.createGain();
  noiseMix.gain.value = noiseAmt * 0.88;
  const noise = noiseBurst(ac, noteDuration);
  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 420 + pitch * 0.55;
  noiseFilter.Q.value = 0.35 + crunch * 1.1;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseMix);

  const mix = ac.createGain();
  voiceBus.connect(mix);
  noiseMix.connect(mix);

  let tail = mix;

  const worldSat = profile.satAmount + crunch * 0.04;
  if (worldSat > 0.02) {
    const sat = ac.createWaveShaper();
    sat.curve = makeSatCurve(worldSat);
    sat.oversample = worldSat > 0.16 ? '2x' : 'none';
    mix.connect(sat);
    tail = sat;
  }

  if (crunch > 0.12) {
    const shaper = ac.createWaveShaper();
    shaper.curve = makeCrunchCurve(crunch * 0.85);
    shaper.oversample = crunch > 0.5 ? '2x' : 'none';
    tail.connect(shaper);
    tail = shaper;
  }

  const preFilter = ac.createGain();
  preFilter.gain.value = 1;
  attachChorus(ac, tail, preFilter, profile, t0, noteDuration);

  const lpf = ac.createBiquadFilter();
  lpf.type = 'lowpass';
  const cutoffBase = profile.filterCutoffHz * (0.72 + (1 - filterAmt) * 0.38) * Math.min(1.35, 0.85 + pitch / 2400);
  lpf.Q.value = profile.filterQ;
  scheduleFilterEnvelope(lpf, t0, attackEnd, sustainEnd, releaseEnd, Math.max(900, cutoffBase), profile);
  preFilter.connect(lpf);

  const amp = ac.createGain();
  scheduleEnvelope(amp, t0, attackEnd, sustainEnd, releaseEnd, volume, punch);
  lpf.connect(amp);

  // Arcade: insert 5-bit bitcrusher post-envelope for NES digital crunch
  let postAmp = amp;
  if (activeWorldKey === 'arcade') {
    const bitcrush = ac.createWaveShaper();
    bitcrush.curve = getArcadeBitcrushCurve();
    bitcrush.oversample = 'none'; // 'none' preserves aliasing artifacts
    amp.connect(bitcrush);
    postAmp = bitcrush;
  }

  const drySend = ac.createGain();
  drySend.gain.value = 0.94;
  postAmp.connect(drySend);
  drySend.connect(fx.dry);

  // Echo knob (0–1): 0 = silent, 0.5 = world default, 1 = 2× world delay level
  const echoMult = (params.echo ?? 0.5) * 2.0;
  fx.delayWet.gain.value = Math.max(0, profile.delayMix * echoMult);

  const wetSend = ac.createGain();
  wetSend.gain.value = 0.55 + profile.delayMix * 2.5;
  postAmp.connect(wetSend);
  wetSend.connect(fx.delaySend);

  // Room knob (0–1): 0 = fully dry, 0.5 = world default reverb, 1 = 2× reverb.
  // Works on all worlds — worlds without a WORLD_REVERB entry get a neutral
  // medium-room impulse when the user pushes Room above 0.
  const roomMult    = (params.room ?? 0.5) * 2.0;
  const reverbCfg   = WORLD_REVERB[activeWorldKey];
  const baseRevCfg  = reverbCfg || { decay: 0.5, preDelayMs: 12, wet: 0.022 };
  if (roomMult > 0.04 && (lane === 'melody' || lane === 'harmony')) {
    const revKey = activeWorldKey || '__default';
    const rev = ensureReverbBus(ac, revKey, baseRevCfg, fx.comp);
    const reverbSend = ac.createGain();
    reverbSend.gain.value = baseRevCfg.wet * roomMult * (lane === 'harmony' ? 0.55 : 1.0);
    amp.connect(reverbSend);
    reverbSend.connect(rev.convolver);
  }

  // Ice Cave — high-ratio FM sparkle ping.
  // Ratio 7.0 with low index 0.28 produces thin, bright, inharmonic upper partials
  // that read as "twinkle" rather than "crunch". Think light catching a crystal edge,
  // not a struck metal tine. Pan varies on every note for stereo scatter.
  if (activeWorldKey === 'ice-cave' && lane === 'melody') {
    const glintPitch = pitch * (1 + (Math.random() * 2 - 1) * 0.0015);
    const fm   = makeFmVoice(ac, glintPitch, 7.0, 0.12);
    const env  = ac.createGain();
    const pan  = ac.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.72; // wide random scatter
    const glintEnd = t0 + 0.055;
    env.gain.setValueAtTime(0.00008, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.00008, volume * 0.09), t0 + 0.0008);
    env.gain.exponentialRampToValueAtTime(0.00008, glintEnd);
    fm.carrier.connect(env);
    env.connect(pan);
    pan.connect(fx.dry);
    fm.carrier.start(t0);
    fm.modulator.start(t0);
    fm.carrier.stop(glintEnd + 0.01);
    fm.modulator.stop(glintEnd + 0.01);
  }

  // Music Box — FM tine voice + brief noise burst for pin-strike contact.
  // Carrier:mod 3.5, index 1.2 reproduces the inharmonic metal-tine spectrum.
  // Noise burst (3–8 kHz, 12ms) gives the mechanical "click" of pin contact.
  if (activeWorldKey === 'music-box' && lane === 'melody') {
    // FM tine — the sustained ring
    const fm      = makeFmVoice(ac, pitch, 3.5, 1.2);
    const tineEnv = ac.createGain();
    const tineEnd = t0 + 0.18; // 180ms ring-down
    tineEnv.gain.setValueAtTime(0.00008, t0);
    tineEnv.gain.exponentialRampToValueAtTime(Math.max(0.00008, volume * 0.48), t0 + 0.001);
    tineEnv.gain.exponentialRampToValueAtTime(0.00008, tineEnd);
    fm.carrier.connect(tineEnv);
    tineEnv.connect(fx.dry);
    fm.carrier.start(t0);
    fm.modulator.start(t0);
    fm.carrier.stop(tineEnd + 0.01);
    fm.modulator.stop(tineEnd + 0.01);

    // Pin-strike noise burst — shaped broadband click, 12ms, filtered 3–8 kHz
    const clickNoise = noiseBurst(ac, 0.014);
    const clickHpf   = ac.createBiquadFilter();
    clickHpf.type = 'highpass';
    clickHpf.frequency.value = 3000;
    const clickLpf   = ac.createBiquadFilter();
    clickLpf.type = 'lowpass';
    clickLpf.frequency.value = 8000;
    const clickEnv   = ac.createGain();
    const clickEnd   = t0 + 0.012;
    clickEnv.gain.setValueAtTime(0.00008, t0);
    clickEnv.gain.exponentialRampToValueAtTime(Math.max(0.00008, volume * 0.06), t0 + 0.001);
    clickEnv.gain.exponentialRampToValueAtTime(0.00008, clickEnd);
    clickNoise.connect(clickHpf);
    clickHpf.connect(clickLpf);
    clickLpf.connect(clickEnv);
    clickEnv.connect(fx.dry);
    clickNoise.start(t0);
    clickNoise.stop(clickEnd + 0.01);
  }

  // Dungeon FM bell toll — fires on ~12% of bass notes. Deep inharmonic FM
  // at two octaves below melody (modRatio 3.5, index 2.6 = dark metallic clang,
  // like a heavy iron door or a slow chain strike far down the corridor).
  // Long exponential decay (650 ms) — it rings out, doesn't snap off.
  if (activeWorldKey === 'dungeon' && lane === 'bass' && Math.random() < 0.08) {
    const bellPitch = Math.max(30, pitch * 0.25);
    const bell      = makeFmVoice(ac, bellPitch, 3.5, 2.6);
    const bellEnv   = ac.createGain();
    const bellPan   = ac.createStereoPanner();
    bellPan.pan.value = (Math.random() * 2 - 1) * 0.45;
    const bellEnd = t0 + 0.65;
    bellEnv.gain.setValueAtTime(0.00001, t0);
    bellEnv.gain.linearRampToValueAtTime(Math.max(0.00001, volume * 0.28), t0 + 0.008);
    bellEnv.gain.exponentialRampToValueAtTime(0.00001, bellEnd);
    bell.carrier.connect(bellEnv);
    bellEnv.connect(bellPan);
    bellPan.connect(fx.dry);
    bell.carrier.start(t0);
    bell.modulator.start(t0);
    bell.carrier.stop(bellEnd + 0.01);
    bell.modulator.stop(bellEnd + 0.01);
  }

  // Dungeon stone drip — rare (5%) ambient texture on any lane. A narrow
  // bandpass noise burst at ~900 Hz mimics water dripping onto stone: the
  // resonant "tock" of a hollow cave surface. Barely audible, subliminal.
  if (activeWorldKey === 'dungeon' && Math.random() < 0.05) {
    const drip    = noiseBurst(ac, 0.045);
    const dripBpf = ac.createBiquadFilter();
    dripBpf.type = 'bandpass';
    dripBpf.frequency.value = 880 + Math.random() * 160; // slight pitch variation
    dripBpf.Q.value = 5.5; // narrow — a single resonant drip, not broadband noise
    const dripEnv = ac.createGain();
    const dripEnd = t0 + 0.045;
    dripEnv.gain.setValueAtTime(0.00001, t0);
    dripEnv.gain.linearRampToValueAtTime(Math.max(0.00001, volume * 0.11), t0 + 0.003);
    dripEnv.gain.exponentialRampToValueAtTime(0.00001, dripEnd);
    drip.connect(dripBpf);
    dripBpf.connect(dripEnv);
    dripEnv.connect(fx.dry);
    drip.start(t0);
    drip.stop(dripEnd + 0.01);
  }

  // Western banjo — JS-DSP Karplus-Strong at the actual melody pitch.
  // No DelayNode used, so it works at 160–400 Hz without buzz.
  // brightness 0.72 = warm metallic banjo body (brighter than guitar, less than harp).
  // sustain 0.982 gives ~0.35s ring, natural banjo decay.
  if (activeWorldKey === 'western' && lane === 'melody') {
    const dur   = 0.32 + Math.random() * 0.14;
    const ksOut = makeKarplusJsDsp(ac, pitch, t0, dur, 0.72, 0.982, volume * 0.88);
    ksOut.connect(fx.dry);
  }

  // Medieval recorder grace note — brief triangle-wave upper-neighbor ornament
  // on ~18% of melody notes. Pitches a whole tone above the harpsichord note,
  // decays before the K-S body is audible. A baroque ornament: the melodic
  // "flick" of a recorder player's finger before landing on the main note.
  if (activeWorldKey === 'medieval' && lane === 'melody' && Math.random() < 0.18) {
    const graceOsc = ac.createOscillator();
    graceOsc.type = 'triangle'; // triangle = warm, breathy, no high harmonics = recorder
    graceOsc.frequency.value = pitch * 1.122; // whole tone above main pitch
    const graceEnv = ac.createGain();
    const graceEnd = t0 + 0.055;
    graceEnv.gain.setValueAtTime(0.00001, t0);
    graceEnv.gain.linearRampToValueAtTime(Math.max(0.00001, volume * 0.20), t0 + 0.006);
    graceEnv.gain.exponentialRampToValueAtTime(0.00001, graceEnd);
    graceOsc.connect(graceEnv);
    graceEnv.connect(fx.dry);
    graceOsc.start(t0);
    graceOsc.stop(graceEnd + 0.01);
  }

  // Medieval harpsichord — JS-DSP K-S at melody and harmony pitches.
  // brightness 0.88 = very bright metallic wire string (harpsichord uses brass wire).
  // sustain 0.990 = wire strings ring longer than gut — moderate harpsichord sustain.
  // Quill-click noise burst on melody lane gives the organic pluck transient.
  if (activeWorldKey === 'medieval' && (lane === 'melody' || lane === 'harmony')) {
    const dur   = 0.55 + Math.random() * 0.18;
    const ksOut = makeKarplusJsDsp(ac, pitch, t0, dur, 0.88, 0.990, volume * 0.80);
    ksOut.connect(fx.dry);

    if (lane === 'melody') {
      const quill = noiseBurst(ac, 0.018);
      const bpf   = ac.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = pitch * 1.4;
      bpf.Q.value = 3.0;
      const qEnv = ac.createGain();
      const qEnd = t0 + 0.018;
      qEnv.gain.setValueAtTime(0.00001, t0);
      qEnv.gain.linearRampToValueAtTime(Math.max(0.00001, volume * 0.20), t0 + 0.002);
      qEnv.gain.exponentialRampToValueAtTime(0.00001, qEnd);
      quill.connect(bpf);
      bpf.connect(qEnv);
      qEnv.connect(fx.dry);
      quill.start(t0);
      quill.stop(qEnd + 0.01);

      // Finger cymbals — tiny FM ting on ~28% of notes, very soft.
      // Ratio 5.1, index 0.55 → thin metallic shimmer, not a deep bell.
      if (Math.random() < 0.28) {
        const cym    = makeFmVoice(ac, pitch * 3.6, 5.1, 0.55);
        const cymEnv = ac.createGain();
        const cymPan = ac.createStereoPanner();
        cymPan.pan.value = (Math.random() * 2 - 1) * 0.72;
        const cEnd = t0 + 0.038;
        cymEnv.gain.setValueAtTime(0.00001, t0);
        cymEnv.gain.linearRampToValueAtTime(Math.max(0.00001, volume * 0.038), t0 + 0.003);
        cymEnv.gain.exponentialRampToValueAtTime(0.00001, cEnd);
        cym.carrier.connect(cymEnv);
        cymEnv.connect(cymPan);
        cymPan.connect(fx.dry);
        cym.carrier.start(t0);
        cym.modulator.start(t0);
        cym.carrier.stop(cEnd + 0.01);
        cym.modulator.stop(cEnd + 0.01);
      }
    }
  }

  // Forest — Karplus-Strong log-drum for bass lane: dark hollow thud.
  // Pitched an octave below melody (×0.5). brightness 0.28 = woody/dull.
  if (activeWorldKey === 'forest' && lane === 'bass') {
    const ks = makeKarplusStrong(ac, pitch * 0.5, t0, 0.32, 0.28, 0.94, volume * 0.70);
    ks.connect(fx.dry);
  }

  noise.start(t0);
  noise.stop(releaseEnd + 0.04);

  return { duration: sustain + attackT, gap: gapMs(params.gap) };
}

let loopActive = false;
let loopTimer = null;
let loopParams = null;

function scheduleLoop() {
  if (!loopActive || !loopParams) return;
  const { duration, gap } = play(loopParams);
  loopTimer = setTimeout(scheduleLoop, duration * 1000 + gap);
}

export function startLoop(params) {
  stopLoop();
  loopActive = true;
  loopParams = { ...params };
  scheduleLoop();
}

export function stopLoop() {
  loopActive = false;
  loopParams = null;
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
}

export function updateLoopParams(params) {
  if (!loopActive) return;
  loopParams = { ...params };
}

export function isLooping() {
  return loopActive;
}

export function unlock() {
  getContext();
}
