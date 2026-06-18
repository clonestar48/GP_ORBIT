/**
 * Retro voice engine — NES / Amiga flavored one-shots via Web Audio API.
 */

import { resolveSoundProfile } from './world-sound.js';

let ctx = null;
let activeWorldKey = null;
/** @type {{ ctx: AudioContext, dry: GainNode, delaySend: GainNode, delay: DelayNode, delayFb: GainNode, delayWet: GainNode } | null} */
let fxBus = null;

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

function ensureFxBus(ac, profile) {
  if (!fxBus || fxBus.ctx !== ac) {
    const dry = ac.createGain();
    dry.gain.value = 1;
    dry.connect(ac.destination);

    const delaySend = ac.createGain();
    delaySend.gain.value = 1;

    const delay = ac.createDelay(0.4);
    const delayFb = ac.createGain();
    const delayWet = ac.createGain();

    delaySend.connect(delay);
    delay.connect(delayFb);
    delayFb.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(ac.destination);

    fxBus = { ctx: ac, dry, delaySend, delay, delayFb, delayWet };
  }

  fxBus.delay.delayTime.value = profile.delayTimeMs / 1000;
  fxBus.delayFb.gain.value = profile.delayFeedback;
  fxBus.delayWet.gain.value = profile.delayMix;
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

function addOscVoice(ac, {
  type, pitch, endPitch, t0, duration, wobble, gain, pan, detuneCents = 0,
}) {
  const osc = ac.createOscillator();
  osc.type = type;
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

/**
 * @param {string|null|undefined} worldKey
 */
export function setWorldSoundKey(worldKey) {
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
  const profile = resolveSoundProfile(activeWorldKey);
  const fx = ensureFxBus(ac, profile);
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

  const oscAPan = addOscVoice(ac, {
    type: oscAWave,
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

  const drySend = ac.createGain();
  drySend.gain.value = 0.94;
  amp.connect(drySend);
  drySend.connect(fx.dry);

  const wetSend = ac.createGain();
  wetSend.gain.value = 0.55 + profile.delayMix * 2.5;
  amp.connect(wetSend);
  wetSend.connect(fx.delaySend);

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
