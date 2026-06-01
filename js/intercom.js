/**
 * PS1-style codec / intercom transmission panel.
 * Swap portrait at PORTRAIT_SRC when ready.
 */

import { audio } from './audio.js';

/** Intercom portrait — swap path here when replacing the asset */
export const PORTRAIT_SRC = 'assets/peppy.gif';

let noiseCanvas = null;
let noiseCtx = null;
let noiseRaf = null;
let portraitController = null;
let intercomScreen = null;
let portraitEl = null;
let acquireTimer = null;
let staticStartTimer = null;
let acquiringSignal = false;

const SIGNAL_ACQUIRE_MS = 1650;
/** Delay crackle until codec panel is visible enough for heavy static */
const STATIC_CRACKLE_DELAY_MS = 320;

function drawNoiseFrame() {
  if (!noiseCtx || !noiseCanvas) return;

  const w = noiseCanvas.width;
  const h = noiseCanvas.height;
  const image = noiseCtx.createImageData(w, h);
  const data = image.data;

  for (let i = 0; i < data.length; i += 4) {
    const n = Math.random();
    if (acquiringSignal) {
      data[i] = 14 + n * 38;
      data[i + 1] = 80 + n * 148;
      data[i + 2] = 66 + n * 118;
      data[i + 3] = Math.min(255, (88 + n * 118) * 1.12);
    } else {
      data[i] = 22 + n * 26;
      data[i + 1] = 92 + n * 98;
      data[i + 2] = 48 + n * 42;
      data[i + 3] = Math.min(255, (10 + n * 38) * 1.15);
    }
  }

  noiseCtx.putImageData(image, 0, 0);
  noiseRaf = requestAnimationFrame(drawNoiseFrame);
}

function resizeNoiseCanvas() {
  if (!noiseCanvas || !intercomScreen) return;
  const rect = intercomScreen.getBoundingClientRect();
  const scale = acquiringSignal ? 0.5 : 0.3;
  noiseCanvas.width = Math.max(96, Math.round(rect.width * scale));
  noiseCanvas.height = Math.max(96, Math.round(rect.height * scale));
}

function clearAcquireTimer() {
  if (acquireTimer) {
    clearTimeout(acquireTimer);
    acquireTimer = null;
  }
}

function clearStaticStartTimer() {
  if (staticStartTimer) {
    clearTimeout(staticStartTimer);
    staticStartTimer = null;
  }
}

function beginSignalAcquire() {
  clearAcquireTimer();
  clearStaticStartTimer();
  acquiringSignal = true;
  intercomScreen?.classList.add('intercom__screen--acquiring');
  if (portraitEl) portraitEl.hidden = true;

  resizeNoiseCanvas();

  staticStartTimer = setTimeout(() => {
    staticStartTimer = null;
    audio.startIntercomStatic();
  }, STATIC_CRACKLE_DELAY_MS);

  acquireTimer = setTimeout(() => {
    acquiringSignal = false;
    acquireTimer = null;
    audio.stopIntercomStatic(180);
    intercomScreen?.classList.remove('intercom__screen--acquiring');
    resizeNoiseCanvas();
    if (portraitEl) {
      portraitEl.hidden = false;
      intercomScreen?.classList.add('intercom__screen--signal-lock');
      setTimeout(() => {
        intercomScreen?.classList.remove('intercom__screen--signal-lock');
      }, 480);
    }
    portraitController?.start();
  }, SIGNAL_ACQUIRE_MS);
}

function endSignalAcquire() {
  clearAcquireTimer();
  clearStaticStartTimer();
  audio.stopIntercomStatic();
  acquiringSignal = false;
  intercomScreen?.classList.remove('intercom__screen--acquiring');
  intercomScreen?.classList.remove('intercom__screen--signal-lock');
  if (portraitEl) portraitEl.hidden = false;
  resizeNoiseCanvas();
}

function createPortraitController(portrait, screen) {
  const freeze = document.createElement('canvas');
  freeze.className = 'intercom__portrait-freeze';
  freeze.hidden = true;
  portrait.insertAdjacentElement('afterend', freeze);
  const ctx = freeze.getContext('2d');

  let active = false;
  let timer = null;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function syncCanvasSize() {
    const w = portrait.naturalWidth || 220;
    const h = portrait.naturalHeight || 223;
    if (freeze.width !== w) freeze.width = w;
    if (freeze.height !== h) freeze.height = h;
  }

  function showTalking() {
    freeze.hidden = true;
    portrait.hidden = false;
  }

  function showFrozen() {
    syncCanvasSize();
    ctx.drawImage(portrait, 0, 0, freeze.width, freeze.height);
    portrait.hidden = true;
    freeze.hidden = false;
  }

  function talkBurst() {
    if (!active) return;
    showTalking();
    portrait.src = `${PORTRAIT_SRC}?b=${Date.now()}`;

    const burstMs = 280 + Math.random() * 420;
    timer = setTimeout(holdFrame, burstMs);
  }

  function holdFrame() {
    if (!active) return;
    if (!portrait.complete || portrait.naturalWidth === 0) {
      timer = setTimeout(talkBurst, 320);
      return;
    }
    showFrozen();

    const holdMs = 520 + Math.random() * 980;
    timer = setTimeout(talkBurst, holdMs);
  }

  return {
    start() {
      if (active) return;
      active = true;
      talkBurst();
    },
    stop() {
      active = false;
      clearTimer();
      freeze.hidden = true;
      portrait.hidden = false;
      portrait.src = PORTRAIT_SRC;
    },
  };
}

export function initIntercom(rootEl) {
  if (!rootEl) return;

  intercomScreen = rootEl.querySelector('.intercom__screen');
  portraitEl = rootEl.querySelector('.intercom__portrait');
  noiseCanvas = rootEl.querySelector('.intercom__noise');

  if (noiseCanvas) {
    noiseCanvas.width = 96;
    noiseCanvas.height = 96;
    noiseCtx = noiseCanvas.getContext('2d', { alpha: true });
  }

  if (portraitEl) {
    portraitEl.src = PORTRAIT_SRC;
    portraitEl.addEventListener('error', () => {
      portraitController?.stop();
      endSignalAcquire();
      portraitEl.remove();
      intercomScreen?.classList.add('intercom__screen--placeholder');
    }, { once: true });

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      portraitController = createPortraitController(portraitEl, intercomScreen);
    }
  }
}

export function startIntercomNoise() {
  portraitController?.stop();
  endSignalAcquire();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    portraitController?.start();
  } else {
    beginSignalAcquire();
  }

  if (noiseRaf || !noiseCtx) return;
  drawNoiseFrame();
}

export function stopIntercomNoise() {
  endSignalAcquire();
  audio.playIntercomStaticBurst();
  if (noiseRaf) {
    cancelAnimationFrame(noiseRaf);
    noiseRaf = null;
  }
  portraitController?.stop();
}
