/**
 * One-shot crunchy SFX via Web Audio API.
 */

let ctx = null;

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

/** 0 = sine, 0.5 = square, 1 = saw */
function waveType(tone) {
  if (tone < 0.34) return 'sine';
  if (tone < 0.67) return 'square';
  return 'sawtooth';
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

export function gapMs(gap) {
  return clamp01(gap) * 600;
}

/**
 * @param {Record<string, number>} params
 */
export function play(params) {
  const ac = getContext();
  const t0 = ac.currentTime;

  const pitch = Math.max(80, Math.min(2400, params.pitch));
  const tone = clamp01(params.tone);
  const decay = clamp01(params.decay);
  const crunch = clamp01(params.crunch);
  const noiseAmt = clamp01(params.noise);
  const attack = clamp01(params.attack) * 0.18;
  const bend = bendMultiplier(params.bend);
  const wobble = clamp01(params.wobble);
  const detune = clamp01(params.detune);
  const filterAmt = clamp01(params.filter);
  const volume = 0.02 + clamp01(params.volume) * 0.33;

  const duration = 0.03 + decay * 0.67;
  const attackT = Math.max(0.003, attack);

  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(volume, t0 + attackT);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  const oscMix = ac.createGain();
  oscMix.gain.value = 1 - noiseAmt * 0.85;

  const osc = ac.createOscillator();
  osc.type = waveType(tone);
  const endPitch = Math.max(40, pitch * bend);
  osc.frequency.setValueAtTime(pitch, t0);

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
  } else {
    osc.frequency.exponentialRampToValueAtTime(endPitch, t0 + duration * 0.75);
  }

  osc.connect(oscMix);

  if (detune > 0.02) {
    const osc2 = ac.createOscillator();
    osc2.type = waveType(tone);
    const cents = detune * 40;
    osc2.frequency.setValueAtTime(pitch * 2 ** (cents / 1200), t0);
    const detuneGain = ac.createGain();
    detuneGain.gain.value = 0.12 + detune * 0.38;
    osc2.connect(detuneGain);
    detuneGain.connect(oscMix);
    osc2.start(t0);
    osc2.stop(t0 + duration + 0.05);
  }

  const noiseMix = ac.createGain();
  noiseMix.gain.value = noiseAmt * 0.9;

  const noise = noiseBurst(ac, duration + 0.02);
  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 400 + pitch * 0.6;
  noiseFilter.Q.value = 0.4 + crunch * 1.2;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseMix);

  const mix = ac.createGain();
  oscMix.connect(mix);
  noiseMix.connect(mix);

  let tail = mix;

  if (crunch > 0.02) {
    const shaper = ac.createWaveShaper();
    shaper.curve = makeCrunchCurve(crunch);
    shaper.oversample = crunch > 0.5 ? '2x' : 'none';
    mix.connect(shaper);
    tail = shaper;
  }

  let preMaster = tail;

  if (filterAmt > 0.02) {
    const lpf = ac.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = Math.max(160, 14000 * 0.02 ** filterAmt);
    lpf.Q.value = 0.7;
    tail.connect(lpf);
    preMaster = lpf;
  }

  preMaster.connect(master);
  master.connect(ac.destination);

  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
  noise.start(t0);
  noise.stop(t0 + duration + 0.05);

  return { duration, gap: gapMs(params.gap) };
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
