import { play, unlock, stopLoop, updateLoopParams, isLooping, setWorldSoundKey } from './synth.js';
import {
  initMelody,
  getMelodyUrlParam,
  loadMelodyFromUrl,
  stopMelody,
  startMelodyPlayback,
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
// renderWorldRadar stashed — radar visualization preserved in world-radar.js for future use
import { RADAR_NODES } from './world-radar.js';

const DEFAULTS = {
  pitch: 880, tone: 0.3, decay: 0.2, crunch: 0.3,
  attack: 0, room: 0.5, echo: 0.5, filter: 0, gap: 0.05, bend: 0.5, volume: 0.55,
  punch: 0.35,
  // internal defaults — not shown in UI
  noise: 0.3, wobble: 0, detune: 0,
};

const URL_KEYS = {
  pitch: 'p', tone: 't', decay: 'd', crunch: 'c',
  attack: 'a', room: 'ro', echo: 'ec', filter: 'f', gap: 'g', bend: 'b', volume: 'v',
  punch: 'pu',
  noise: 'n', wobble: 'w', detune: 'dt',
};

const CORE_KNOBS = [
  { id: 'pitch',  label: 'Pitch',  min: 80, max: 2400, step: 1,    fmt: (v) => `${Math.round(v)} Hz` },
  { id: 'tone',   label: 'Tone',   min: 0,  max: 1,    step: 0.01, fmt: (v) => waveLabel(v) },
  { id: 'decay',  label: 'Decay',  min: 0,  max: 1,    step: 0.01, fmt: (v) => `${Math.round(30 + v * 670)} ms` },
  { id: 'crunch', label: 'Crunch', min: 0,  max: 1,    step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
];

const SHAPE_KNOBS = [
  { id: 'attack', label: 'Attack', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 180)} ms` },
  { id: 'room',   label: 'Room',   min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { id: 'echo',   label: 'Echo',   min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { id: 'filter', label: 'Filter', min: 0, max: 1, step: 0.01, fmt: (v) => (v < 0.02 ? 'open' : `${Math.round(v * 100)}%`) },
  { id: 'gap',    label: 'Gap',    min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 600)} ms` },
  { id: 'bend',   label: 'Bend',   min: 0, max: 1, step: 0.01, fmt: bendLabel },
  { id: 'volume', label: 'Volume', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
];

const PUNCH_KNOB = {
  id: 'punch', label: 'Punch', min: 0, max: 1, step: 0.01,
  fmt: (v) => `${Math.round(v * 100)}%`,
};

// Removed from visible UI — synth still reads these at their default values.
const HIDDEN_KNOBS = [
  { id: 'noise',  min: 0, max: 1, step: 0.01 },
  { id: 'wobble', min: 0, max: 1, step: 0.01 },
  { id: 'detune', min: 0, max: 1, step: 0.01 },
];

const ALL_KNOBS = [...CORE_KNOBS, ...SHAPE_KNOBS];
const SOUND_PARAMS = [...ALL_KNOBS, PUNCH_KNOB, ...HIDDEN_KNOBS];

const MACROS = [
  { id: 'brightness', label: 'Brightness' },
  { id: 'texture', label: 'Texture' },
  { id: 'energy', label: 'Energy' },
  { id: 'space', label: 'Space' },
];

const MACRO_DEFAULT = 0.5;

const DESKTOP_LAYOUT = window.matchMedia('(min-width: 1101px)');

const DESKTOP_SLIDER_ROWS = [
  ['brightness', 'texture', 'energy', 'space', 'attack'],
  ['room', 'echo', 'filter', 'gap', 'bend'],
];

const DETUNE_KNOB = SHAPE_KNOBS.find((k) => k.id === 'detune');

const MACRO_BY_ID = Object.fromEntries(MACROS.map((m) => [m.id, m]));
const SHAPE_BY_ID = {
  ...Object.fromEntries(SHAPE_KNOBS.map((k) => [k.id, k])),
  punch: PUNCH_KNOB,
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function avg(...vals) {
  const clean = vals.filter((v) => Number.isFinite(v));
  if (!clean.length) return MACRO_DEFAULT;
  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
}

function waveLabel(tone) {
  if (tone < 0.34) return 'SINE';
  if (tone < 0.67) return 'SQUARE';
  return 'SAW';
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
  for (const k of SOUND_PARAMS) {
    const el = document.getElementById(`knob-${k.id}`);
    out[k.id] = el ? parseFloat(el.value) : DEFAULTS[k.id];
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
let mutationIntensity = 'wild';
const DEFAULT_MUTATE_INTENSITY = 'wild';
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
    sequencer: null,
    revision: currentGeneration?.revision || 0,
  };
  updateArtifactCard();
  updateWorldSelection();
}

/**
 * Like syncCustomArtifact but preserves the current world.
 * Used for structural melody edits (step count, pattern, tempo) that should
 * not count as "drifting" — only knob changes can push you into Custom.
 */
function syncMelodyEdit() {
  const melody = getMelodyState();
  if (isMelodyEmpty()) {
    currentGeneration = null;
    updateArtifactCard();
    updateWorldSelection();
    return;
  }
  if (!currentGeneration) {
    syncCustomArtifact();
    return;
  }
  currentGeneration = {
    ...currentGeneration,
    steps: melody.steps,
    tempo: melody.tempo,
    pattern: [...melody.pattern],
    sequencer: null,
  };
  updateArtifactCard();
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

function applyWorldTheme(worldKey) {
  const shell = document.querySelector('.toy-shell');
  if (!shell) return;
  if (worldKey && WORLDS[worldKey]) {
    shell.dataset.worldTheme = worldKey;
  } else {
    delete shell.dataset.worldTheme;
  }
}

function updateWorldSelection() {
  const worldKey = currentGeneration?.worldKey;
  document.querySelectorAll('.world-node').forEach((btn) => {
    btn.classList.toggle('is-selected', worldKey === btn.dataset.world);
  });
  document.getElementById('worlds-flyout')?.classList.toggle('is-selected', !!worldKey);
  applyWorldTheme(worldKey);
  setWorldSoundKey(worldKey ?? null);
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

function applyGenerated(song, { autoPlay = false } = {}) {
  const volume = readParams().volume;
  applyingGeneration = true;
  currentGeneration = song;
  applyParams({ ...song.params, volume }, { keepGeneration: true });
  applyMelody({ steps: song.steps, tempo: song.tempo, pattern: song.pattern, sequencer: song.sequencer ?? null });
  applyingGeneration = false;
  updateArtifactCard();
  updateWorldSelection();
  syncUrl();
  stopSynthRepeat();
  if (autoPlay) startMelodyPlayback();
  else stopMelody();
}

function generateSong() {
  const seed = randomSeed();
  applyGenerated(
    { ...generateFromSeed(seed), revision: 0, intensity: mutationIntensity },
    { autoPlay: true },
  );
}

function pulsePanel(el) {
  if (!el || !DESKTOP_LAYOUT.matches) return;
  el.classList.remove('is-pulse');
  void el.offsetWidth;
  el.classList.add('is-pulse');
  window.setTimeout(() => el.classList.remove('is-pulse'), 480);
}

function generateWorldSong(worldKey) {
  const seed = randomSeed();
  applyGenerated({ ...generateFromWorld(worldKey, seed), revision: 0, intensity: mutationIntensity });
  pulsePanel(document.getElementById('sound-module'));
}

let _worldsFlyoutTimer = null;

function closeFlyout() {
  const flyout = document.getElementById('worlds-flyout');
  if (flyout) flyout.removeAttribute('open');
  clearTimeout(_worldsFlyoutTimer);
  _worldsFlyoutTimer = null;
}

function resetFlyoutTimer() {
  clearTimeout(_worldsFlyoutTimer);
  _worldsFlyoutTimer = setTimeout(closeFlyout, 5000);
}

function renderWorldPresets() {
  const list   = document.getElementById('worlds-list');
  const flyout = document.getElementById('worlds-flyout');
  if (!list) return;
  list.innerHTML = '';
  RADAR_NODES.forEach(({ key, label }) => {
    if (!WORLDS[key]) return;
    const li  = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'world-node';
    btn.dataset.world = key;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      generateWorldSong(key);
      closeFlyout();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });

  // Start inactivity timer when dropdown opens; reset on hover; stop on close
  if (flyout) {
    flyout.addEventListener('toggle', () => {
      if (flyout.open) resetFlyoutTimer();
      else { clearTimeout(_worldsFlyoutTimer); _worldsFlyoutTimer = null; }
    });
    flyout.addEventListener('mouseenter', () => { if (flyout.open) clearTimeout(_worldsFlyoutTimer); });
    flyout.addEventListener('mouseleave', () => { if (flyout.open) resetFlyoutTimer(); });
  }

  // Click outside closes the flyout
  document.addEventListener('click', (e) => {
    const f = document.getElementById('worlds-flyout');
    if (f && f.open && !f.contains(e.target)) closeFlyout();
  }, { capture: true });

  updateWorldSelection();
}

function remixCurrentSong() {
  const worldKey = currentGeneration?.worldKey;
  if (worldKey && WORLDS[worldKey]) {
    const seed = randomSeed();
    applyGenerated(
      { ...generateFromWorld(worldKey, seed), revision: 0, intensity: mutationIntensity },
      { autoPlay: true },
    );
    pulsePanel(document.getElementById('melody-panel'));
    return;
  }

  remixPattern();
  stopSynthRepeat();
  startMelodyPlayback();
  pulsePanel(document.getElementById('melody-stage'));
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
  applyGenerated(
    { ...next, seed: currentGeneration.seed, revision, intensity: mutationIntensity },
    { autoPlay: true },
  );
  pulsePanel(document.getElementById('melody-panel'));
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
    )),
    energy: clamp01(avg(
      params.attack / 0.7,
      1 - (params.decay - 0.06) / 0.42,
      (params.punch ?? DEFAULTS.punch) / 0.7,
      (params.bend - 0.42) / 0.45 + 0.5,
    )),
    // Space now controls acoustic environment: reverb (room), delay (echo), note gap
    space: clamp01(avg(
      (params.room  ?? DEFAULTS.room),
      (params.echo  ?? DEFAULTS.echo),
      params.gap / 0.5,
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

  return {
    filter: clamp01((1 - b) * 0.65),
    tone:   clamp01(b * 0.92),
    pitch:  Math.max(80, Math.min(2400, base * (0.9 + b * 0.18))),
    crunch: clamp01(t * 0.9),
    attack: clamp01(e * 0.7),
    decay:  clamp01(energyDecay),
    bend:   clamp01(0.42 + (e - 0.5) * 0.45),
    room:   clamp01(s),
    echo:   clamp01(s * 0.85),
    gap:    clamp01(s * 0.5),
  };
}

function syncMacroSliders(params = readParams()) {
  const macros = macrosFromParams(params);
  for (const macro of MACROS) {
    const input = document.getElementById(`macro-${macro.id}`);
    if (input) input.value = macros[macro.id].toFixed(2);
    const val = document.getElementById(`val-macro-${macro.id}`);
    if (val) val.textContent = `${Math.round(macros[macro.id] * 100)}%`;
  }
}

function applyMacroValues(macros) {
  applyingMacros = true;
  const next = { ...readParams(), ...paramsFromMacros(macros) };
  for (const k of SOUND_PARAMS) {
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
  for (const k of SOUND_PARAMS) {
    const el = document.getElementById(`knob-${k.id}`);
    if (!el) continue;
    el.value = merged[k.id];
    if (document.querySelector(`[data-rotary="${k.id}"]`)) {
      setRotaryValue(k, merged[k.id]);
    } else {
      const val = document.getElementById(`val-${k.id}`);
      if (val) val.textContent = k.fmt(parseFloat(el.value));
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

function isTextEntryTarget(el) {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'password', 'url', 'number', 'tel'].includes(type);
  }
  return false;
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

function bindSoundSliderActive(row, input) {
  const setSliderActive = (active) => row.classList.toggle('is-active', active);
  input.addEventListener('pointerdown', () => setSliderActive(true));
  input.addEventListener('pointerup', () => setSliderActive(false));
  input.addEventListener('pointercancel', () => setSliderActive(false));
  input.addEventListener('blur', () => setSliderActive(false));
}

function buildSoundSlider({ id, label, kind, fmt }, root, gridRow, gridCol) {
  const row = document.createElement('label');
  row.className = 'sound-slider';
  row.htmlFor = kind === 'macro' ? `macro-${id}` : `knob-${id}`;
  if (gridRow != null) row.style.gridRow = String(gridRow);
  if (gridCol != null) row.style.gridColumn = String(gridCol);

  const head = document.createElement('span');
  head.className = 'sound-slider__label';
  head.textContent = label;

  const val = document.createElement('span');
  val.className = 'sound-slider__value';
  val.id = kind === 'macro' ? `val-macro-${id}` : `val-${id}`;

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'sound-slider__input';
  input.id = kind === 'macro' ? `macro-${id}` : `knob-${id}`;
  input.min = 0;
  input.max = 1;
  input.step = 0.01;
  input.value = kind === 'macro' ? MACRO_DEFAULT : DEFAULTS[id];
  input.setAttribute('aria-label', label);

  if (kind === 'macro') {
    const syncMacroValue = () => {
      val.textContent = `${Math.round(parseFloat(input.value) * 100)}%`;
    };
    input.addEventListener('input', () => {
      syncMacroValue();
      const macros = Object.fromEntries(
        MACROS.map((m) => [m.id, parseFloat(document.getElementById(`macro-${m.id}`).value)]),
      );
      applyMacroValues(macros);
      onParamChange();
    });
    syncMacroValue();
  } else {
    input.addEventListener('input', () => {
      val.textContent = fmt(parseFloat(input.value));
      onParamChange();
    });
    val.textContent = fmt(parseFloat(input.value));
  }

  bindSoundSliderActive(row, input);

  const headRow = document.createElement('span');
  headRow.className = 'sound-slider__head';
  headRow.append(head, val);

  row.append(headRow, input);
  root.appendChild(row);
}

function buildDesktopControlGrid(root) {
  root.replaceChildren();
  DESKTOP_SLIDER_ROWS.forEach((slots, rowIndex) => {
    slots.forEach((slotId, colIndex) => {
      if (MACRO_BY_ID[slotId]) {
        buildSoundSlider(
          { id: slotId, label: MACRO_BY_ID[slotId].label, kind: 'macro' },
          root,
          rowIndex + 1,
          colIndex + 1,
        );
        return;
      }
      const shape = SHAPE_BY_ID[slotId];
      if (shape) {
        buildSoundSlider(
          { id: shape.id, label: shape.label, kind: 'shape', fmt: shape.fmt },
          root,
          rowIndex + 1,
          colIndex + 1,
        );
      }
    });
  });
}

function mountMelodyTempo() {
  const tempo = document.getElementById('melody-tempo-control');
  const desktopHost = document.getElementById('sound-utility-row');
  const mobileHost = document.getElementById('melody-tempo-slot');
  if (!tempo || !desktopHost || !mobileHost) return;
  const host = DESKTOP_LAYOUT.matches ? desktopHost : mobileHost;
  if (tempo.parentElement !== host) host.appendChild(tempo);
}

function buildDesktopUtilityRow(root) {
  root.replaceChildren();
  mountMelodyTempo();
  const volume = SHAPE_BY_ID.volume;
  if (volume) {
    buildSoundSlider(
      { id: volume.id, label: volume.label, kind: 'shape', fmt: volume.fmt },
      root,
      null,
      null,
    );
  }
}

function ensureHiddenKnob(knob, root) {
  if (document.getElementById(`knob-${knob.id}`)) return;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.id = `knob-${knob.id}`;
  input.value = DEFAULTS[knob.id];
  const val = document.createElement('span');
  val.id = `val-${knob.id}`;
  val.hidden = true;
  root.append(input, val);
}

function clearSoundControlMounts() {
  document.getElementById('macro-sliders')?.replaceChildren();
  document.getElementById('knobs-shape')?.replaceChildren();
  document.getElementById('knobs-core')?.replaceChildren();
  document.getElementById('knobs-core-header')?.replaceChildren();
  document.getElementById('sound-control-grid')?.replaceChildren();
  document.getElementById('sound-utility-row')?.replaceChildren();
  document.getElementById('knob-detune')?.remove();
  document.getElementById('val-detune')?.remove();
  document.getElementById('knob-punch')?.remove();
  document.getElementById('val-punch')?.remove();
}

function captureSoundUiParams() {
  const pitchEl = document.getElementById('knob-pitch');
  if (!pitchEl) return mergeParams({});
  return readParams();
}

function buildSoundControls() {
  const params = captureSoundUiParams();
  clearSoundControlMounts();

  if (DESKTOP_LAYOUT.matches) {
    buildDesktopControlGrid(document.getElementById('sound-control-grid'));
    buildDesktopUtilityRow(document.getElementById('sound-utility-row'));
    buildRotaryKnobs(CORE_KNOBS, document.getElementById('knobs-core-header'), { header: true });
    if (DETUNE_KNOB) {
      ensureHiddenKnob(DETUNE_KNOB, document.getElementById('sound-module'));
    }
  } else {
    mountMelodyTempo();
    buildMacroSliders(document.getElementById('macro-sliders'));
    buildRotaryKnobs(CORE_KNOBS, document.getElementById('knobs-core'));
    buildSliders(SHAPE_KNOBS, document.getElementById('knobs-shape'));
    ensureHiddenKnob(PUNCH_KNOB, document.getElementById('sound-module'));
    for (const k of HIDDEN_KNOBS) ensureHiddenKnob(k, document.getElementById('sound-module'));
  }

  applyParams(params, { keepGeneration: true });
}

function buildRotaryKnobs(knobs, root, { header = false } = {}) {
  for (const k of knobs) {
    const wrap = document.createElement('div');
    wrap.className = header ? 'rotary rotary--header' : 'rotary';
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

    if (header) {
      const head = document.createElement('span');
      head.className = 'rotary__head';
      const sep = document.createElement('span');
      sep.className = 'rotary__sep';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '·';
      head.append(label, sep, val);
      wrap.append(head, dial, input);
    } else {
      wrap.append(label, dial, val, input);
    }
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
    const mi = mutationIntensity !== DEFAULT_MUTATE_INTENSITY ? `&mi=${mutationIntensity}` : '';
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
  if (!btn) return;
  const isIcon = btn.classList.contains('seed-copy-btn');
  const prev = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    if (isIcon) {
      btn.classList.add('is-copied');
      setTimeout(() => btn.classList.remove('is-copied'), 1400);
    } else {
      btn.textContent = okLabel;
      setTimeout(() => { btn.textContent = prev; }, 1400);
    }
  } catch {
    if (!isIcon) {
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = prev; }, 1400);
    }
  }
}

function seedSnippet() {
  if (!currentGeneration?.seed) return null;
  const rv = currentGeneration.revision > 0 ? `&rv=${currentGeneration.revision}` : '';
  const world = currentGeneration.worldKey ? `&world=${currentGeneration.worldKey}` : '';
  const mi = mutationIntensity !== DEFAULT_MUTATE_INTENSITY ? `&mi=${mutationIntensity}` : '';
  return `seed=${currentGeneration.seed}${rv}${world}${mi}`;
}

function copyShareLink(fromBtnId = 'artifact-seed-copy') {
  const qs = paramsToSearch(readParams());
  const url = `${location.origin}${location.pathname}${qs ? `?${qs}` : ''}`;
  const seed = seedSnippet();
  const text = seed ? `${url}\n${seed}` : url;
  copyText(text, fromBtnId, 'Copied');
}

function stopSynthRepeat() {
  stopLoop();
}

function syncAdvancedSoundPanel() {
  const panel = document.getElementById('sound-advanced');
  if (!panel || DESKTOP_LAYOUT.matches) return;
  if (!panel.dataset.userToggled) {
    panel.removeAttribute('open');
  }
}

function init() {
  buildSoundControls();
  DESKTOP_LAYOUT.addEventListener('change', () => {
    buildSoundControls();
    syncAdvancedSoundPanel();
  });

  initMelody({
    getParams: readParams,
    getWorld: () => currentGeneration?.worldKey ?? null,
    onChange: () => {
      if (!applyingGeneration) syncMelodyEdit();
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

  document.getElementById('artifact-seed-copy').addEventListener('click', () => copyShareLink('artifact-seed-copy'));
  document.getElementById('shuffle-btn').addEventListener('click', generateSong);
  document.getElementById('remix-btn').addEventListener('click', remixCurrentSong);
  document.getElementById('mutate-btn').addEventListener('click', mutateCurrentSong);

  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTextEntryTarget(e.target)) return;

    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      togglePlay();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      remixCurrentSong();
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      mutateCurrentSong();
    } else if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      generateSong();
    }
  }, true);

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
  bindWrapperActive(document.getElementById('knobs-core-header'));
  syncAdvancedSoundPanel();
  document.getElementById('sound-advanced')?.addEventListener('toggle', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.dataset.userToggled = e.currentTarget.open ? '1' : '';
      if (!e.currentTarget.open) delete e.currentTarget.dataset.userToggled;
    }
  });
  updateReadout();
}

init();
