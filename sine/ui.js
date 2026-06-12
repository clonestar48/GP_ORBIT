import { play, unlock, startLoop, stopLoop, updateLoopParams, isLooping } from './synth.js';
import { initMelody, getMelodyUrlParam, loadMelodyFromUrl, stopMelody } from './melody.js';

const STORAGE_KEY = 'sine-user-presets';

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

const PRESETS = {
  // High pierce — pitch + bend up + saw
  'laser': { pitch: 1840, tone: 0.88, decay: 0.1, crunch: 0.35, noise: 0.06, attack: 0, bend: 0.82, wobble: 0, detune: 0.12, filter: 0, volume: 0.5, gap: 0.08 },
  // Low thump — pitch + crunch + filter
  'sub-kick': { pitch: 92, tone: 0.52, decay: 0.58, crunch: 0.62, noise: 0.18, attack: 0.12, bend: 0.38, wobble: 0, detune: 0.08, filter: 0.42, volume: 0.72, gap: 0.12 },
  // Bright ping — short decay + detune + bend up
  'coin': { pitch: 1180, tone: 0.18, decay: 0.14, crunch: 0.2, noise: 0.04, attack: 0, bend: 0.7, wobble: 0, detune: 0.32, filter: 0.05, volume: 0.48, gap: 0.03 },
  // Urgent pulse — wobble + detune + saw
  'alarm': { pitch: 720, tone: 0.82, decay: 0.28, crunch: 0.3, noise: 0.12, attack: 0, bend: 0.55, wobble: 0.58, detune: 0.28, filter: 0.12, volume: 0.58, gap: 0.18 },
  // Muffled grit — filter + noise + crunch
  'walkie': { pitch: 510, tone: 0.48, decay: 0.22, crunch: 0.48, noise: 0.68, attack: 0.04, bend: 0.5, wobble: 0.22, detune: 0.1, filter: 0.72, volume: 0.52, gap: 0.1 },
  // Soft swell — attack + long decay + bend down
  'bubble': { pitch: 310, tone: 0.08, decay: 0.74, crunch: 0.08, noise: 0.1, attack: 0.42, bend: 0.24, wobble: 0.08, detune: 0.15, filter: 0.2, volume: 0.42, gap: 0.22 },
  // Staccato digital — high pitch + square + crunch + tight gap
  'data-blip': { pitch: 2050, tone: 0.58, decay: 0.09, crunch: 0.52, noise: 0.14, attack: 0, bend: 0.58, wobble: 0.05, detune: 0.2, filter: 0.08, volume: 0.46, gap: 0.04 },
  // Eerie wash — low + long decay + wobble + filter + noise
  'ghost': { pitch: 155, tone: 0.12, decay: 0.82, crunch: 0.18, noise: 0.38, attack: 0.5, bend: 0.42, wobble: 0.45, detune: 0.22, filter: 0.58, volume: 0.38, gap: 0.28 },
};

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

let activePreset = null;

function updatePresetSelection() {
  document.querySelectorAll('.preset-btn[data-preset]').forEach((btn) => {
    btn.classList.toggle(
      'is-selected',
      activePreset?.kind === 'stock' && activePreset.id === btn.dataset.preset,
    );
  });

  document.querySelectorAll('.user-preset').forEach((wrap) => {
    const id = Number(wrap.dataset.userPreset);
    const selected = activePreset?.kind === 'user' && activePreset.id === id;
    wrap.classList.toggle('is-selected', selected);
    wrap.querySelector('.user-preset__load')?.classList.toggle('is-selected', selected);
  });
}

function clearActivePreset() {
  activePreset = null;
  updatePresetSelection();
}

function applyParams(params, { keepPreset = false } = {}) {
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
  if (!keepPreset) clearActivePreset();
  updateLoopParams(readParams());
  syncUrl();
  updateReadout();
}

function selectStockPreset(key) {
  applyParams(PRESETS[key], { keepPreset: true });
  activePreset = { kind: 'stock', id: key };
  updatePresetSelection();
  doPlay();
}

function selectUserPreset(id, params) {
  applyParams(params, { keepPreset: true });
  activePreset = { kind: 'user', id };
  updatePresetSelection();
  doPlay();
}

function updateReadout() {
  const p = readParams();
  const el = document.getElementById('readout');
  const loop = isLooping() ? ' · repeat' : '';
  el.textContent = `${Math.round(p.pitch)} Hz · ${waveLabel(p.tone)} · ${Math.round(30 + p.decay * 670)} ms · vol ${Math.round(p.volume * 100)}% · gap ${Math.round(p.gap * 600)} ms${loop}`;
}

function setRepeatVisual(on) {
  document.getElementById('repeat-lever').checked = on;
  document.querySelector('.repeat-lever').classList.toggle('is-on', on);
  document.querySelector('.panel--synth')?.classList.toggle('is-repeating', on);
}

function flashPlay() {
  const btn = document.getElementById('play-btn');
  btn.classList.add('is-playing');
  setTimeout(() => btn.classList.remove('is-playing'), 120);
}

function doPlay() {
  unlock();
  play(readParams());
  flashPlay();
}

function randomize() {
  applyParams({
    pitch: 120 + Math.random() * 2000,
    tone: Math.random(),
    decay: Math.random() * 0.7 + 0.05,
    crunch: Math.random() * 0.8,
    noise: Math.random() * 0.6,
    attack: Math.random() * 0.4,
    bend: 0.25 + Math.random() * 0.5,
    wobble: Math.random() * 0.5,
    detune: Math.random() * 0.4,
    filter: Math.random() * 0.5,
    volume: 0.35 + Math.random() * 0.45,
    gap: Math.random() * 0.35,
  });
  doPlay();
}

function onParamChange() {
  clearActivePreset();
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

function toggleRepeat(on) {
  unlock();
  if (on) {
    stopMelody();
    startLoop(readParams());
  } else {
    stopLoop();
  }
  setRepeatVisual(on);
  updateReadout();
}

function paramsToSearch(params) {
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

function copyConfig() {
  const payload = { synth: readParams() };
  const mel = getMelodyUrlParam();
  if (mel) payload.melody = mel;
  copyText(JSON.stringify(payload, null, 2), 'copy-btn');
}

function copyShareLink() {
  const qs = paramsToSearch(readParams());
  const url = `${location.origin}${location.pathname}${qs ? `?${qs}` : ''}`;
  copyText(url, 'share-btn', 'Link copied');
}

function loadUserPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUserPresets(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function renderUserPresets() {
  const root = document.getElementById('user-presets');
  const list = loadUserPresets();
  root.replaceChildren();

  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'user-presets__empty';
    empty.textContent = 'No saved sounds yet';
    root.appendChild(empty);
    return;
  }

  for (const item of list) {
    const wrap = document.createElement('div');
    wrap.className = 'user-preset';

    const btn = document.createElement('button');
    btn.type = 'button';
    wrap.dataset.userPreset = item.id;

    btn.className = 'preset-btn user-preset__load';
    btn.textContent = item.name;
    btn.addEventListener('click', () => {
      selectUserPreset(item.id, item.params);
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'user-preset__delete';
    del.setAttribute('aria-label', `Delete ${item.name}`);
    del.textContent = '×';
    del.addEventListener('click', () => {
      if (activePreset?.kind === 'user' && activePreset.id === item.id) {
        clearActivePreset();
      }
      saveUserPresets(list.filter((p) => p.id !== item.id));
      renderUserPresets();
    });

    wrap.append(btn, del);
    root.appendChild(wrap);
  }

  updatePresetSelection();
}

function saveUserPreset() {
  const input = document.getElementById('preset-name');
  const name = input.value.trim();
  if (!name) {
    input.focus();
    return;
  }
  const list = loadUserPresets();
  const id = Date.now();
  list.push({ id, name, params: readParams() });
  saveUserPresets(list);
  input.value = '';
  renderUserPresets();
  activePreset = { kind: 'user', id };
  updatePresetSelection();
}

function stopSynthRepeat() {
  stopLoop();
  setRepeatVisual(false);
}

function init() {
  buildRotaryKnobs(CORE_KNOBS, document.getElementById('knobs-core'));
  buildSliders(SHAPE_KNOBS, document.getElementById('knobs-shape'));

  initMelody({
    getParams: readParams,
    onChange: syncUrl,
    onPlayStart: stopSynthRepeat,
  });

  const fromUrl = paramsFromSearch();
  if (fromUrl) applyParams(fromUrl);

  const urlParams = new URLSearchParams(location.search);
  if (urlParams.has('mel')) loadMelodyFromUrl(urlParams.get('mel'));

  document.getElementById('play-btn').addEventListener('click', doPlay);
  document.getElementById('random-btn').addEventListener('click', randomize);
  document.getElementById('copy-btn').addEventListener('click', copyConfig);
  document.getElementById('share-btn').addEventListener('click', copyShareLink);
  document.getElementById('save-preset-btn').addEventListener('click', saveUserPreset);
  document.getElementById('preset-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveUserPreset();
  });

  document.getElementById('repeat-lever').addEventListener('change', (e) => {
    toggleRepeat(e.target.checked);
  });

  document.querySelectorAll('.preset-btn[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectStockPreset(btn.dataset.preset);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (
      e.code === 'Space'
      && e.target.tagName !== 'INPUT'
      && e.target.tagName !== 'BUTTON'
      && e.target.getAttribute('role') !== 'slider'
    ) {
      e.preventDefault();
      doPlay();
    }
  });

  const unlockOnce = () => {
    unlock();
    document.removeEventListener('pointerdown', unlockOnce);
    document.removeEventListener('keydown', unlockOnce);
  };
  document.addEventListener('pointerdown', unlockOnce);
  document.addEventListener('keydown', unlockOnce);

  renderUserPresets();
  updateReadout();
}

init();
