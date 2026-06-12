import { play, unlock, stopLoop, updateLoopParams, isLooping } from './synth.js';
import {
  initMelody,
  getMelodyUrlParam,
  loadMelodyFromUrl,
  stopMelody,
  isMelodyPlaying,
  toggleMelodyPlayback,
  applyMelody,
  getMelodyState,
  isMelodyEmpty,
} from './melody.js';
import {
  WORLDS,
  MUTATE_INTENSITY,
  generateFromSeed,
  generateFromWorld,
  mutateSong,
  randomSeed,
  replayFromSeed,
} from './generate.js';

const DEFAULTS = {
  pitch: 880,
  tone: 0.3,
  decay: 0.2,
  crunch: 0.3,
  noise: 0.3,
  attack: 0,
  bend: 0.5,
  wobble: 0,
  detune: 0,
  filter: 0,
  volume: 0.55,
  gap: 0.05,
};

const URL_KEYS = {
  pitch: 'p', tone: 't', decay: 'd', crunch: 'c', noise: 'n',
  attack: 'a', bend: 'b', wobble: 'w', detune: 'dt', filter: 'f',
  volume: 'v', gap: 'g',
};

const MUTATE_ORDER = ['subtle', 'medium', 'wild'];

const CORE_KNOBS = [
  { id: 'pitch', label: 'Pitch', min: 80, max: 2400, step: 1, fmt: (v) => `${Math.round(v)} Hz` },
  { id: 'tone', label: 'Tone', min: 0, max: 1, step: 0.01, fmt: (v) => waveLabel(v) },
  { id: 'decay', label: 'Decay', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(30 + v * 670)} ms` },
  { id: 'crunch', label: 'Crunch', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { id: 'noise', label: 'Noise', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
];

const SHAPE_KNOBS = [
  { id: 'attack', label: 'Attack', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 180)} ms` },
  { id: 'bend', label: 'Bend', min: 0, max: 1, step: 0.01, fmt: bendLabel },
  { id: 'wobble', label: 'Wobble', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { id: 'detune', label: 'Detune', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 40)}¢` },
  { id: 'filter', label: 'Filter', min: 0, max: 1, step: 0.01, fmt: (v) => (v < 0.02 ? 'open' : `${Math.round(v * 100)}%`) },
  { id: 'volume', label: 'Volume', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { id: 'gap', label: 'Gap', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 600)} ms` },
];

const ALL_KNOBS = [...CORE_KNOBS, ...SHAPE_KNOBS];

function waveLabel(tone) {
  if (tone < 0.34) return 'sine';
  if (tone < 0.67) return 'square';
  return 'saw';
}

function bendLabel(v) {
  if (Math.abs(v - 0.5) < 0.02) return 'flat';
  if (v < 0.5) return `↓ ${Math.round((0.5 - v) * 200)}%`;
  return `↑ ${Math.round((v - 0.5) * 200)}%`;
}

function mergeParams(params) {
  return { ...DEFAULTS, ...params };
}

function readParams() {
  const out = {};
  for (const k of ALL_KNOBS) {
    out[k.id] = parseFloat(document.getElementById(`knob-${k.id}`).value);
  }
  return out;
}

function valueToDeg(value, min, max) {
  const t = (value - min) / (max - min);
  return -90 + t * 180;
}

function setRotaryValue(k, value) {
  const clamped = Math.max(k.min, Math.min(k.max, value));
  const stepped = k.step >= 1
    ? Math.round(clamped / k.step) * k.step
    : Math.round(clamped / k.step) * k.step;

  const input = document.getElementById(`knob-${k.id}`);
  input.value = stepped;

  const dial = document.querySelector(`[data-rotary="${k.id}"] .rotary__dial`);
  const indicator = document.querySelector(`[data-rotary="${k.id}"] .rotary__indicator`);
  if (indicator) {
    indicator.style.transform = `rotate(${valueToDeg(stepped, k.min, k.max)}deg)`;
  }
  if (dial) {
    dial.setAttribute('aria-valuenow', stepped);
    dial.setAttribute('aria-valuetext', k.fmt(stepped));
  }
  document.getElementById(`val-${k.id}`).textContent = k.fmt(stepped);
}

let currentGeneration = null;
let applyingGeneration = false;
let mutationIntensity = 'medium';

function clearGeneration() {
  currentGeneration = null;
  updateArtifactCard();
  updateWorldSelection();
}

function updateWorldSelection() {
  document.querySelectorAll('.world-btn').forEach((btn) => {
    btn.classList.toggle(
      'is-selected',
      currentGeneration?.worldKey === btn.dataset.world,
    );
  });
}

function updateArtifactCard() {
  const card = document.getElementById('artifact-card');
  if (!card) return;

  if (!currentGeneration) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  document.getElementById('artifact-title').textContent = currentGeneration.title;
  document.getElementById('artifact-world').textContent = currentGeneration.worldLabel;
  document.getElementById('artifact-seed').textContent = String(currentGeneration.seed);
  const steps = document.getElementById('artifact-steps');
  const rev = currentGeneration.revision > 0 ? ` · rv ${currentGeneration.revision}` : '';
  steps.textContent = `${currentGeneration.steps} steps${rev}`;
}

function applyGenerated(song) {
  applyingGeneration = true;
  currentGeneration = song;
  applyParams(song.params, { keepGeneration: true });
  applyMelody({ steps: song.steps, tempo: song.tempo, pattern: song.pattern });
  applyingGeneration = false;
  updateArtifactCard();
  updateWorldSelection();
  syncUrl();
  stopSynthRepeat();
  stopMelody();
  unlock();
  document.getElementById('melody-play-btn')?.click();
}

function generateSong() {
  const seed = randomSeed();
  applyGenerated({ ...generateFromSeed(seed), revision: 0, intensity: mutationIntensity });
}

function generateWorldSong(worldKey) {
  const seed = randomSeed();
  applyGenerated({ ...generateFromWorld(worldKey, seed), revision: 0, intensity: mutationIntensity });
}

function renderWorldPresets() {
  const root = document.getElementById('world-presets');
  if (!root) return;
  root.replaceChildren();

  for (const [key, world] of Object.entries(WORLDS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn world-btn';
    btn.dataset.world = key;

    btn.textContent = world.label;
    btn.addEventListener('click', () => generateWorldSong(key));
    root.appendChild(btn);
  }
}

function mutateCurrentSong() {
  if (!currentGeneration) {
    generateSong();
    return;
  }
  const revision = (currentGeneration.revision || 0) + 1;
  const base = {
    ...currentGeneration,
    pattern: getMelodyState().pattern,
    params: readParams(),
    tempo: getMelodyState().tempo,
    steps: getMelodyState().steps,
  };
  const next = mutateSong(base, currentGeneration.seed, revision - 1, mutationIntensity);
  applyGenerated({ ...next, seed: currentGeneration.seed, revision, intensity: mutationIntensity });
  mutationIntensity = MUTATE_ORDER[(MUTATE_ORDER.indexOf(mutationIntensity) + 1) % MUTATE_ORDER.length];
  syncUrl();
}

function applyParams(params, { keepGeneration = false } = {}) {
  const merged = mergeParams(params);
  for (const k of ALL_KNOBS) {
    const el = document.getElementById(`knob-${k.id}`);
    el.value = merged[k.id];
    if (document.querySelector(`[data-rotary="${k.id}"]`)) {
      setRotaryValue(k, merged[k.id]);
    } else {
      document.getElementById(`val-${k.id}`).textContent = k.fmt(parseFloat(el.value));
    }
  }
  if (!keepGeneration && !applyingGeneration) clearGeneration();
  updateLoopParams(readParams());
  syncUrl();
  updateReadout();
}

function updateReadout() {
  const el = document.getElementById('readout');
  if (!el) return;
  const p = readParams();
  el.textContent = `${Math.round(p.pitch)} Hz · ${waveLabel(p.tone)} · vol ${Math.round(p.volume * 100)}%`;
}

function doPlay() {
  unlock();
  play(readParams());
}

function togglePlay() {
  if (isMelodyPlaying()) {
    stopMelody();
    return;
  }
  if (isLooping()) {
    stopLoop();
    return;
  }
  if (!isMelodyEmpty()) {
    toggleMelodyPlayback();
    return;
  }
  doPlay();
}

function onParamChange() {
  clearGeneration();
  updateLoopParams(readParams());
  syncUrl();
  updateReadout();
}

function buildRotaryKnobs(knobs, root) {
  for (const k of knobs) {
    const wrap = document.createElement('div');
    wrap.className = 'rotary';
    wrap.dataset.rotary = k.id;

    const label = document.createElement('span');
    label.className = 'rotary__label';
    label.textContent = k.label;

    const dial = document.createElement('div');
    dial.className = 'rotary__dial';
    dial.setAttribute('role', 'slider');
    dial.setAttribute('tabindex', '0');
    dial.setAttribute('aria-label', k.label);
    dial.setAttribute('aria-valuemin', k.min);
    dial.setAttribute('aria-valuemax', k.max);

    const track = document.createElement('div');
    track.className = 'rotary__track';
    track.setAttribute('aria-hidden', 'true');

    const body = document.createElement('div');
    body.className = 'rotary__body';
    body.setAttribute('aria-hidden', 'true');

    const indicator = document.createElement('div');
    indicator.className = 'rotary__indicator';
    body.appendChild(indicator);
    dial.append(track, body);

    const val = document.createElement('span');
    val.className = 'rotary__value';
    val.id = `val-${k.id}`;

    const input = document.createElement('input');
    input.type = 'hidden';
    input.id = `knob-${k.id}`;
    input.value = DEFAULTS[k.id];

    wrap.append(label, dial, val, input);
    root.appendChild(wrap);

    setRotaryValue(k, DEFAULTS[k.id]);

    let dragging = false;
    let startY = 0;
    let startVal = 0;

    dial.addEventListener('focus', () => wrap.classList.add('is-focused'));
    dial.addEventListener('blur', () => wrap.classList.remove('is-focused'));

    dial.addEventListener('pointerdown', (e) => {
      dragging = true;
      dial.focus();
      dial.setPointerCapture(e.pointerId);
      startY = e.clientY;
      startVal = parseFloat(input.value);
      dial.classList.add('is-dragging');
      wrap.classList.add('is-focused');
    });

    dial.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const range = k.max - k.min;
      const sensitivity = range / 160;
      setRotaryValue(k, startVal - (e.clientY - startY) * sensitivity);
      onParamChange();
    });

    const endDrag = () => {
      dragging = false;
      dial.classList.remove('is-dragging');
      if (document.activeElement !== dial) wrap.classList.remove('is-focused');
    };
    dial.addEventListener('pointerup', endDrag);
    dial.addEventListener('pointercancel', endDrag);

    dial.addEventListener('keydown', (e) => {
      const mult = e.shiftKey ? 10 : 1;
      const step = k.step * mult;
      let v = parseFloat(input.value);
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        v += step;
        e.preventDefault();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        v -= step;
        e.preventDefault();
      } else {
        return;
      }
      setRotaryValue(k, v);
      onParamChange();
    });
  }
}

function buildSliders(knobs, root) {
  for (const k of knobs) {
    const row = document.createElement('label');
    row.className = 'knob';
    row.htmlFor = `knob-${k.id}`;

    const head = document.createElement('span');
    head.className = 'knob__label';
    head.textContent = k.label;

    const val = document.createElement('span');
    val.className = 'knob__value';
    val.id = `val-${k.id}`;

    const input = document.createElement('input');
    input.type = 'range';
    input.id = `knob-${k.id}`;
    input.min = k.min;
    input.max = k.max;
    input.step = k.step;
    input.value = DEFAULTS[k.id];

    input.addEventListener('input', () => {
      val.textContent = k.fmt(parseFloat(input.value));
      onParamChange();
    });

    row.append(head, val, input);
    root.appendChild(row);
    val.textContent = k.fmt(parseFloat(input.value));
  }
}

function paramsToSearch(params) {
  if (currentGeneration?.seed != null) {
    const rv = currentGeneration.revision > 0 ? `&rv=${currentGeneration.revision}` : '';
    const world = currentGeneration.worldKey ? `&world=${currentGeneration.worldKey}` : '';
    const mi = mutationIntensity !== 'medium' ? `&mi=${mutationIntensity}` : '';
    return `seed=${currentGeneration.seed}${rv}${world}${mi}`;
  }
  const q = new URLSearchParams();
  for (const [id, key] of Object.entries(URL_KEYS)) {
    const val = params[id];
    if (val !== undefined && val !== DEFAULTS[id]) {
      q.set(key, Number.isInteger(val) ? val : val.toFixed(2).replace(/\.?0+$/, ''));
    }
  }
  const mel = getMelodyUrlParam();
  if (mel) q.set('mel', mel);
  return q.toString();
}

function paramsFromSearch() {
  const q = new URLSearchParams(location.search);
  if ([...q.keys()].length === 0) return null;
  const out = {};
  for (const [id, key] of Object.entries(URL_KEYS)) {
    if (q.has(key)) out[id] = parseFloat(q.get(key));
  }
  return Object.keys(out).length ? out : null;
}

let urlTimer = null;
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const qs = paramsToSearch(readParams());
    const url = qs ? `${location.pathname}?${qs}` : location.pathname;
    history.replaceState(null, '', url);
  }, 200);
}

async function copyText(text, btnId, okLabel = 'Copied') {
  const btn = document.getElementById(btnId);
  const prev = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = okLabel;
    setTimeout(() => { btn.textContent = prev; }, 1400);
  } catch {
    btn.textContent = 'Failed';
    setTimeout(() => { btn.textContent = prev; }, 1400);
  }
}

function copySeed() {
  if (!currentGeneration?.seed) {
    copyText('', 'melody-copy-seed-btn', 'No seed');
    return;
  }
  const rv = currentGeneration.revision > 0 ? `&rv=${currentGeneration.revision}` : '';
  const world = currentGeneration.worldKey ? `&world=${currentGeneration.worldKey}` : '';
  const mi = mutationIntensity !== 'medium' ? `&mi=${mutationIntensity}` : '';
  copyText(`seed=${currentGeneration.seed}${rv}${world}${mi}`, 'melody-copy-seed-btn', 'Copied');
}

function copyShareLink() {
  const qs = paramsToSearch(readParams());
  const url = `${location.origin}${location.pathname}${qs ? `?${qs}` : ''}`;
  copyText(url, 'melody-share-btn', 'Link copied');
}

function stopSynthRepeat() {
  stopLoop();
}

function init() {
  buildRotaryKnobs(CORE_KNOBS, document.getElementById('knobs-core'));
  buildSliders(SHAPE_KNOBS, document.getElementById('knobs-shape'));

  initMelody({
    getParams: readParams,
    onChange: () => {
      if (!applyingGeneration) clearGeneration();
      syncUrl();
    },
    onPlayStart: stopSynthRepeat,
  });

  const urlParams = new URLSearchParams(location.search);
  if (urlParams.has('seed')) {
    const seed = parseInt(urlParams.get('seed'), 10);
    const revision = parseInt(urlParams.get('rv') || '0', 10);
    if (Number.isFinite(seed)) {
      const worldKey = urlParams.get('world') || urlParams.get('fam') || null;
      const mi = urlParams.get('mi');
      if (mi && MUTATE_INTENSITY[mi]) mutationIntensity = mi;
      applyGenerated(replayFromSeed(
        seed,
        Number.isFinite(revision) ? revision : 0,
        worldKey,
        mutationIntensity,
      ));
    }
  } else {
    const fromUrl = paramsFromSearch();
    if (fromUrl) applyParams(fromUrl);
    if (urlParams.has('mel')) {
      loadMelodyFromUrl(urlParams.get('mel'));
    } else {
      generateSong();
    }
  }

  document.getElementById('melody-share-btn').addEventListener('click', copyShareLink);
  document.getElementById('melody-copy-seed-btn').addEventListener('click', copySeed);
  document.getElementById('mutate-btn').addEventListener('click', mutateCurrentSong);
  document.getElementById('generate-btn').addEventListener('click', generateSong);

  document.addEventListener('keydown', (e) => {
    if (
      e.code === 'Space'
      && e.target.tagName !== 'INPUT'
      && e.target.tagName !== 'BUTTON'
      && e.target.getAttribute('role') !== 'slider'
    ) {
      e.preventDefault();
      togglePlay();
    }
  });

  const unlockOnce = () => {
    unlock();
    document.removeEventListener('pointerdown', unlockOnce);
    document.removeEventListener('keydown', unlockOnce);
  };
  document.addEventListener('pointerdown', unlockOnce);
  document.addEventListener('keydown', unlockOnce);

  renderWorldPresets();
  updateReadout();
}

init();
