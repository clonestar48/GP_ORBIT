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
  remixPattern,
} from './melody.js';
import {
  WORLDS,
  MUTATE_INTENSITY,
  generateFromSeed,
  generateFromWorld,
  generateCustomTitle,
  mutateSong,
  randomSeed,
  replayFromSeed,
} from './generate.js';
import { renderWorldRadar } from './world-radar.js';

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

const MACROS = [
  { id: 'brightness', label: 'Brightness' },
  { id: 'texture', label: 'Texture' },
  { id: 'energy', label: 'Energy' },
  { id: 'space', label: 'Space' },
];

const MACRO_DEFAULT = 0.5;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function avg(...vals) {
  const clean = vals.filter((v) => Number.isFinite(v));
  if (!clean.length) return MACRO_DEFAULT;
  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
}

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
let applyingMacros = false;
let mutationIntensity = 'medium';
let soundBasePitch = DEFAULTS.pitch;

function syncCustomArtifact() {
  const melody = getMelodyState();
  if (isMelodyEmpty()) {
    currentGeneration = null;
    updateArtifactCard();
    updateWorldSelection();
    return;
  }

  const forkFromWorld = !!currentGeneration?.worldKey;
  const keepTitle = currentGeneration?.title && !forkFromWorld;
  const seed = currentGeneration?.seed ?? randomSeed();

  currentGeneration = {
    title: keepTitle ? currentGeneration.title : generateCustomTitle(seed),
    seed,
    worldKey: null,
    worldLabel: 'Custom',
    steps: melody.steps,
    tempo: melody.tempo,
    pattern: [...melody.pattern],
    revision: currentGeneration?.revision || 0,
  };
  updateArtifactCard();
  updateWorldSelection();
}

function clearGeneration() {
  if (isMelodyEmpty()) {
    currentGeneration = null;
    updateArtifactCard();
    updateWorldSelection();
    return;
  }
  syncCustomArtifact();
}

function updateIntensityUi() {
  document.querySelectorAll('.mutate-intensity-btn').forEach((btn) => {
    btn.classList.toggle('is-selected', btn.dataset.intensity === mutationIntensity);
  });
}

function updateWorldSelection() {
  const worldKey = currentGeneration?.worldKey;
  document.querySelectorAll('.world-node').forEach((btn) => {
    btn.classList.toggle('is-selected', worldKey === btn.dataset.world);
  });
  document.getElementById('worlds-flyout')?.classList.toggle('is-selected', !!worldKey);
  updateSoundWorldLabel();
}

function updateSoundWorldLabel() {
  const el = document.getElementById('sound-world-name');
  if (!el) return;
  el.textContent = currentGeneration?.worldLabel || 'Custom';
}

function syncWrapperActive(wrapper) {
  if (!wrapper) return;
  wrapper.classList.toggle('is-active', wrapper.contains(document.activeElement));
}

function bindWrapperActive(wrapper) {
  if (!wrapper) return;
  const sync = () => syncWrapperActive(wrapper);
  wrapper.addEventListener('focusin', sync);
  wrapper.addEventListener('focusout', () => requestAnimationFrame(sync));
}

function updateArtifactCard() {
  const title = document.getElementById('artifact-title');
  const world = document.getElementById('artifact-world');
  const seed = document.getElementById('artifact-seed');
  const steps = document.getElementById('artifact-steps');
  if (!title || !world || !seed || !steps) return;

  if (!currentGeneration) {
    title.textContent = '—';
    world.textContent = '—';
    seed.textContent = '—';
    steps.textContent = '—';
    return;
  }

  title.textContent = currentGeneration.title;
  world.textContent = currentGeneration.worldLabel;
  seed.textContent = String(currentGeneration.seed);
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
  renderWorldRadar(document.getElementById('world-radar'), {
    onSelect: (worldKey) => {
      if (!WORLDS[worldKey]) return;
      generateWorldSong(worldKey);
      document.getElementById('worlds-flyout')?.removeAttribute('open');
    },
  });
  updateWorldSelection();
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
}

function macrosFromParams(params) {
  const base = soundBasePitch || DEFAULTS.pitch;
  const pitchNorm = base > 0 ? (params.pitch / base - 0.9) / 0.18 : MACRO_DEFAULT;
  return {
    brightness: clamp01(avg(
      params.tone / 0.92,
      1 - params.filter / 0.65,
      pitchNorm,
    )),
    texture: clamp01(avg(
      params.crunch / 0.9,
      params.noise / 0.8,
      params.detune / 0.5,
    )),
    energy: clamp01(avg(
      params.attack / 0.7,
      1 - (params.decay - 0.06) / 0.42,
      (params.volume - 0.32) / 0.58,
      (params.bend - 0.42) / 0.45 + 0.5,
    )),
    space: clamp01(avg(
      params.wobble / 0.75,
      params.gap / 0.5,
      (params.decay - 0.08) / 0.82,
    )),
  };
}

function paramsFromMacros(macros) {
  const b = clamp01(macros.brightness ?? MACRO_DEFAULT);
  const t = clamp01(macros.texture ?? MACRO_DEFAULT);
  const e = clamp01(macros.energy ?? MACRO_DEFAULT);
  const s = clamp01(macros.space ?? MACRO_DEFAULT);
  const base = soundBasePitch || DEFAULTS.pitch;
  const energyDecay = 0.06 + (1 - e) * 0.42;
  const spaceDecay = 0.08 + s * 0.82;

  return {
    filter: clamp01((1 - b) * 0.65),
    tone: clamp01(b * 0.92),
    pitch: Math.max(80, Math.min(2400, base * (0.9 + b * 0.18))),
    crunch: clamp01(t * 0.9),
    noise: clamp01(t * 0.8),
    detune: clamp01(t * 0.5),
    attack: clamp01(e * 0.7),
    decay: clamp01(energyDecay * (1 - s * 0.35) + spaceDecay * (s * 0.5 + 0.15)),
    volume: clamp01(0.32 + e * 0.58),
    bend: clamp01(0.42 + (e - 0.5) * 0.45),
    wobble: clamp01(s * 0.75),
    gap: clamp01(s * 0.5),
  };
}

function syncMacroSliders(params = readParams()) {
  const macros = macrosFromParams(params);
  for (const macro of MACROS) {
    const input = document.getElementById(`macro-${macro.id}`);
    if (input) input.value = macros[macro.id].toFixed(2);
  }
}

function applyMacroValues(macros) {
  applyingMacros = true;
  const next = { ...readParams(), ...paramsFromMacros(macros) };
  for (const k of ALL_KNOBS) {
    const el = document.getElementById(`knob-${k.id}`);
    if (!el) continue;
    el.value = next[k.id];
    if (document.querySelector(`[data-rotary="${k.id}"]`)) {
      setRotaryValue(k, next[k.id]);
    } else {
      const val = document.getElementById(`val-${k.id}`);
      if (val) val.textContent = k.fmt(parseFloat(el.value));
    }
  }
  applyingMacros = false;
}

function applyParams(params, { keepGeneration = false, skipMacros = false } = {}) {
  const merged = mergeParams(params);
  soundBasePitch = merged.pitch;
  for (const k of ALL_KNOBS) {
    const el = document.getElementById(`knob-${k.id}`);
    el.value = merged[k.id];
    if (document.querySelector(`[data-rotary="${k.id}"]`)) {
      setRotaryValue(k, merged[k.id]);
    } else {
      document.getElementById(`val-${k.id}`).textContent = k.fmt(parseFloat(el.value));
    }
  }
  if (!skipMacros) syncMacroSliders(merged);
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
  if (!applyingMacros) syncMacroSliders();
  clearGeneration();
  updateLoopParams(readParams());
  syncUrl();
  updateReadout();
}

function buildMacroSliders(root) {
  for (const macro of MACROS) {
    const row = document.createElement('label');
    row.className = 'macro-slider';
    row.htmlFor = `macro-${macro.id}`;

    const head = document.createElement('span');
    head.className = 'macro-slider__label';
    head.textContent = macro.label;

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'macro-slider__input';
    input.id = `macro-${macro.id}`;
    input.min = 0;
    input.max = 1;
    input.step = 0.01;
    input.value = MACRO_DEFAULT;
    input.setAttribute('aria-label', macro.label);

    input.addEventListener('input', () => {
      const macros = Object.fromEntries(
        MACROS.map((m) => [m.id, parseFloat(document.getElementById(`macro-${m.id}`).value)]),
      );
      applyMacroValues(macros);
      onParamChange();
    });

    const setSliderActive = (active) => row.classList.toggle('is-active', active);
    input.addEventListener('pointerdown', () => setSliderActive(true));
    input.addEventListener('pointerup', () => setSliderActive(false));
    input.addEventListener('pointercancel', () => setSliderActive(false));
    input.addEventListener('blur', () => setSliderActive(false));

    row.append(head, input);
    root.appendChild(row);
  }
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

    const setSliderActive = (active) => row.classList.toggle('is-active', active);
    input.addEventListener('pointerdown', () => setSliderActive(true));
    input.addEventListener('pointerup', () => setSliderActive(false));
    input.addEventListener('pointercancel', () => setSliderActive(false));
    input.addEventListener('blur', () => setSliderActive(false));

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

function seedSnippet() {
  if (!currentGeneration?.seed) return null;
  const rv = currentGeneration.revision > 0 ? `&rv=${currentGeneration.revision}` : '';
  const world = currentGeneration.worldKey ? `&world=${currentGeneration.worldKey}` : '';
  const mi = mutationIntensity !== 'medium' ? `&mi=${mutationIntensity}` : '';
  return `seed=${currentGeneration.seed}${rv}${world}${mi}`;
}

function copyShareLink() {
  const qs = paramsToSearch(readParams());
  const url = `${location.origin}${location.pathname}${qs ? `?${qs}` : ''}`;
  const seed = seedSnippet();
  const text = seed ? `${url}\n${seed}` : url;
  copyText(text, 'melody-share-btn', 'Copied');
}

function stopSynthRepeat() {
  stopLoop();
}

function init() {
  buildMacroSliders(document.getElementById('macro-sliders'));
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
      if (!isMelodyEmpty()) syncCustomArtifact();
    } else {
      generateSong();
    }
  }

  document.getElementById('melody-share-btn').addEventListener('click', copyShareLink);
  document.getElementById('shuffle-btn').addEventListener('click', generateSong);
  document.getElementById('remix-btn').addEventListener('click', remixPattern);
  document.getElementById('mutate-btn').addEventListener('click', mutateCurrentSong);

  document.querySelectorAll('.mutate-intensity-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      mutationIntensity = btn.dataset.intensity;
      updateIntensityUi();
      syncUrl();
    });
  });
  updateIntensityUi();

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
  updateWorldSelection();
  bindWrapperActive(document.getElementById('sound-module'));
  bindWrapperActive(document.getElementById('sound-advanced'));
  updateReadout();
}

init();
