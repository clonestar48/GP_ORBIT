/**
 * Subtle UI audio - soft VMU-style tones via Web Audio API.
 * Respects prefers-reduced-motion and can be toggled with M key.
 */

let ctx = null;
let enabled = true;

/** Lazily create AudioContext on first user gesture */
function getContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return ctx;
}

/** Check if audio should play */
function canPlay() {
  if (!enabled) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return true;
}

/** Play a short synthesized tone */
function tone(frequency, duration = 0.06, volume = 0.04, type = 'square') {
  if (!canPlay()) return;

  try {
    const ac = getContext();
    if (ac.state === 'suspended') ac.resume();

    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ac.currentTime);

    gain.gain.setValueAtTime(volume, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
  } catch {
    // Audio unavailable - fail silently
  }
}

/** Looping filtered noise + irregular gain spikes for intercom static */
let staticLayer = null;

function disposeStaticLayer() {
  if (!staticLayer) return;
  const { source, crackleTimer } = staticLayer;
  if (crackleTimer) clearTimeout(crackleTimer);
  try {
    source.stop();
  } catch {
    // Already stopped
  }
  staticLayer = null;
}

function scheduleStaticCrackle() {
  if (!staticLayer) return;

  const { gain, targetVol } = staticLayer;
  const delay = 80 + Math.random() * 200;

  staticLayer.crackleTimer = setTimeout(() => {
    if (!staticLayer || staticLayer.gain !== gain) return;

    try {
      const ac = getContext();
      const t = ac.currentTime;
      const spike = targetVol * (0.55 + Math.random() * 0.85);
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(targetVol + spike, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(targetVol, t + 0.035 + Math.random() * 0.05);
    } catch {
      // Audio unavailable
    }

    scheduleStaticCrackle();
  }, delay);
}

function stopStaticCrackle(fadeMs = 100) {
  if (!staticLayer) return;

  const layer = staticLayer;

  if (layer.crackleTimer) {
    clearTimeout(layer.crackleTimer);
    layer.crackleTimer = null;
  }

  if (fadeMs <= 0) {
    disposeStaticLayer();
    return;
  }

  try {
    const ac = getContext();
    const { gain } = layer;
    const t = ac.currentTime;

    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + fadeMs / 1000);

    setTimeout(() => {
      if (staticLayer === layer) disposeStaticLayer();
    }, fadeMs + 30);
  } catch {
    disposeStaticLayer();
  }
}

function beginStaticCrackle() {
  if (!canPlay()) return;

  stopStaticCrackle(0);

  try {
    const ac = getContext();
    if (ac.state === 'suspended') ac.resume();

    const seconds = 2;
    const sampleRate = ac.sampleRate;
    const length = Math.floor(sampleRate * seconds);
    const buffer = ac.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const highpass = ac.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 900;

    const bandpass = ac.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 2900;
    bandpass.Q.value = 0.55;

    const gain = ac.createGain();
    const targetVol = 0.013;
    const t = ac.currentTime;

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(targetVol, t + 0.07);

    source.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(ac.destination);
    source.start();

    staticLayer = { source, gain, targetVol, crackleTimer: null };
    scheduleStaticCrackle();
  } catch {
    disposeStaticLayer();
  }
}

export const audio = {
  /** Soft tick on menu navigation */
  navigate() {
    tone(880, 0.04, 0.025, 'square');
  },

  /** Lighter tick on hover preview */
  hover() {
    tone(740, 0.025, 0.012, 'sine');
  },

  /** Confirm tone on selection */
  confirm() {
    tone(1320, 0.07, 0.035, 'square');
    setTimeout(() => tone(1760, 0.05, 0.02, 'square'), 50);
  },

  /** Lower tone on back/cancel */
  cancel() {
    tone(440, 0.06, 0.03, 'square');
  },

  /** Boot sequence blip */
  boot() {
    tone(660, 0.03, 0.02, 'sine');
  },

  /** Quick whir on GP emblem spin */
  spin() {
    tone(520, 0.07, 0.022, 'sine');
    setTimeout(() => tone(920, 0.05, 0.016, 'square'), 70);
  },

  /** Toggle audio on/off - returns new state */
  toggle() {
    enabled = !enabled;
    if (!enabled) stopStaticCrackle(0);
    else if (enabled) tone(990, 0.04, 0.02, 'sine');
    return enabled;
  },

  isEnabled() {
    return enabled;
  },

  /** Resume context after first interaction */
  unlock() {
    if (canPlay()) getContext();
  },

  /** Teal static crackle during intercom signal acquire */
  startIntercomStatic() {
    beginStaticCrackle();
  },

  stopIntercomStatic(fadeMs = 100) {
    stopStaticCrackle(fadeMs);
  },
};
