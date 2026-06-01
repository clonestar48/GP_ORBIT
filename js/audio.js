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

  /** Toggle audio on/off - returns new state */
  toggle() {
    enabled = !enabled;
    if (enabled) tone(990, 0.04, 0.02, 'sine');
    return enabled;
  },

  isEnabled() {
    return enabled;
  },

  /** Resume context after first interaction */
  unlock() {
    if (canPlay()) getContext();
  },
};
