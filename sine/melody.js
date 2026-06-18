import { play, unlock } from './synth.js';

const NOTE_ROWS = [
  { label: 'C5', midi: 72 },
  { label: 'B4', midi: 71 },
  { label: 'A4', midi: 69 },
  { label: 'G4', midi: 67 },
  { label: 'F4', midi: 65 },
  { label: 'E4', midi: 64 },
  { label: 'D4', midi: 62 },
  { label: 'C4', midi: 60 },
];

const STEP_OPTIONS = [8, 12, 16, 24, 32];
const DEFAULT_STEPS = 16;
const DEFAULT_TEMPO = 160;
const TEMPO_MIN = 80;
const TEMPO_MAX = 400;

function tempoToSlider(ms) {
  return TEMPO_MAX + TEMPO_MIN - ms;
}

function sliderToTempo(value) {
  return TEMPO_MAX + TEMPO_MIN - value;
}

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function emptyPattern(steps) {
  return Array(steps).fill(-1);
}

let steps = DEFAULT_STEPS;
let pattern = emptyPattern(DEFAULT_STEPS);
let tempo = DEFAULT_TEMPO;
let playing = false;
let loopMelody = true;
let playTimer = null;
let playStep = 0;
let getSynthParams = () => ({});

let painting = false;
let paintStartRow = -1;
let paintStartStep = -1;
let paintMoved = false;
let noteAtStrokeStart = -1;
let paintGlobalsBound = false;

function syncStepUi() {
  document.querySelectorAll('.melody-steps-btn').forEach((btn) => {
    btn.classList.toggle('is-selected', Number(btn.dataset.steps) === steps);
  });
}

function syncTempoUi() {
  const tempoEl = document.getElementById('melody-tempo');
  if (tempoEl) tempoEl.value = tempoToSlider(tempo);
  document.getElementById('melody-tempo-val').textContent = `${tempo} ms`;
}

function encodeMelody() {
  const body = pattern.map((n) => (n < 0 ? 'x' : n.toString(36))).join('');
  return `${steps}.${tempo}.${body}`;
}

function decodeMelody(raw) {
  if (!raw) return false;
  const [stepStr, tempoStr, body] = raw.split('.');
  const s = parseInt(stepStr, 10);
  const t = parseInt(tempoStr, 10);
  if (!STEP_OPTIONS.includes(s) || !body || body.length !== s) return false;
  steps = s;
  tempo = Number.isFinite(t) ? Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, t)) : DEFAULT_TEMPO;
  pattern = body.split('').map((ch) => (ch === 'x' ? -1 : parseInt(ch, 36)));
  if (pattern.some((n) => n < -1 || n >= NOTE_ROWS.length)) return false;
  return true;
}

function updateStepColumn(step) {
  document.querySelectorAll(`.melody-grid__cell[data-step="${step}"]`).forEach((cell) => {
    const row = Number(cell.dataset.row);
    const on = pattern[step] === row;
    cell.classList.toggle('is-on', on);
    cell.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  updatePlayhead();
}

function syncPatternToGrid() {
  for (let step = 0; step < steps; step++) {
    updateStepColumn(step);
  }
}

function assignStepNote(step, row) {
  if (pattern[step] === row) return false;
  pattern[step] = row;
  if (document.getElementById('melody-grid')?.children.length) {
    updateStepColumn(step);
  } else {
    renderGrid();
  }
  if (playing && step === playStep) {
    triggerStep(step);
  }
  return true;
}

function endPaintStroke() {
  if (!painting) return;
  const wasClick = !paintMoved;
  const step = paintStartStep;
  const row = paintStartRow;
  painting = false;
  if (wasClick && noteAtStrokeStart === row) {
    pattern[step] = -1;
    updateStepColumn(step);
    onMelodyChange();
  }
}

function paintAtCell(step, row) {
  if (step !== paintStartStep || row !== paintStartRow) paintMoved = true;
  if (assignStepNote(step, row)) onMelodyChange();
}

function bindCellPointer(cell, step, row) {
  cell.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    painting = true;
    paintStartRow = row;
    paintStartStep = step;
    paintMoved = false;
    noteAtStrokeStart = pattern[step];
    cell.setPointerCapture(e.pointerId);
    paintAtCell(step, row);
  });

  cell.addEventListener('pointerenter', (e) => {
    if (!painting || (e.buttons & 1) === 0) return;
    paintAtCell(step, row);
  });

  cell.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    endPaintStroke();
    try {
      cell.releasePointerCapture(e.pointerId);
    } catch {
      /* released outside capture */
    }
  });

  cell.addEventListener('pointercancel', () => {
    painting = false;
  });
}

function bindGridPaintMove() {
  const grid = document.getElementById('melody-grid');
  if (!grid || grid.dataset.paintMoveBound) return;
  grid.dataset.paintMoveBound = '1';
  grid.addEventListener('pointermove', (e) => {
    if (!painting || (e.buttons & 1) === 0) return;
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.melody-grid__cell');
    if (!cell || !grid.contains(cell)) return;
    paintAtCell(Number(cell.dataset.step), Number(cell.dataset.row));
  });
}

function bindPaintGlobals() {
  if (paintGlobalsBound) return;
  paintGlobalsBound = true;
  document.addEventListener('pointerup', (e) => {
    if (!painting || e.button !== 0) return;
    endPaintStroke();
  });
}

function renderGrid() {
  const grid = document.getElementById('melody-grid');
  const head = document.getElementById('melody-step-head');
  const wrap = document.querySelector('.melody-grid-wrap');
  if (!grid || !head || !wrap) return;

  wrap.style.setProperty('--melody-steps', steps);
  wrap.dataset.density = steps > 20 ? 'high' : steps > 12 ? 'mid' : 'low';
  head.replaceChildren();
  grid.replaceChildren();

  const corner = document.createElement('span');
  corner.className = 'melody-grid__corner';
  head.appendChild(corner);

  for (let i = 0; i < steps; i++) {
    const num = document.createElement('span');
    num.className = 'melody-grid__step-num';
    num.textContent = i + 1;
    head.appendChild(num);
  }

  NOTE_ROWS.forEach((note, row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'melody-grid__row';

    const label = document.createElement('span');
    label.className = 'melody-grid__note';
    label.textContent = note.label;
    rowEl.appendChild(label);

    for (let step = 0; step < steps; step++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'melody-grid__cell';
      cell.dataset.step = step;
      cell.dataset.row = row;
      cell.setAttribute('aria-label', `${note.label} step ${step + 1}`);
      cell.setAttribute('aria-pressed', pattern[step] === row ? 'true' : 'false');
      if (pattern[step] === row) cell.classList.add('is-on');

      bindCellPointer(cell, step, row);

      rowEl.appendChild(cell);
    }

    grid.appendChild(rowEl);
  });

  bindGridPaintMove();
  updatePlayhead();
}

function updatePlayhead() {
  document.querySelectorAll('.melody-grid__cell').forEach((cell) => {
    const step = Number(cell.dataset.step);
    cell.classList.toggle('is-playhead', playing && step === playStep);
  });
}

function triggerStep(step) {
  const row = pattern[step];
  if (row < 0) return;
  const params = getSynthParams();
  play({ ...params, pitch: midiToHz(NOTE_ROWS[row].midi) });
}

function stopPlayback() {
  playing = false;
  playStep = 0;
  if (playTimer) {
    clearTimeout(playTimer);
    playTimer = null;
  }
  document.getElementById('melody-play-btn')?.classList.remove('is-playing');
  document.getElementById('melody-panel')?.classList.remove('is-playing');
  document.getElementById('melody-stage')?.classList.remove('is-playing');
  updatePlayhead();
}

function scheduleStep() {
  if (!playing) return;
  updatePlayhead();
  triggerStep(playStep);
  playStep += 1;
  if (playStep >= steps) {
    if (loopMelody) {
      playStep = 0;
    } else {
      stopPlayback();
      return;
    }
  }
  playTimer = setTimeout(scheduleStep, Math.max(24, tempo + (Math.random() * 2 - 1) * 2.5));
}

function startPlayback() {
  unlock();
  stopPlayback();
  playing = true;
  playStep = 0;
  document.getElementById('melody-play-btn')?.classList.add('is-playing');
  document.getElementById('melody-panel')?.classList.add('is-playing');
  document.getElementById('melody-stage')?.classList.add('is-playing');
  scheduleStep();
}

function togglePlayback() {
  if (playing) stopPlayback();
  else startPlayback();
}

function clearPattern() {
  stopPlayback();
  setLoopMelody(true);
  pattern = emptyPattern(steps);
  renderGrid();
  onMelodyChange();
}

function setSteps(next) {
  steps = next;
  const trimmed = pattern.slice(0, next);
  while (trimmed.length < next) trimmed.push(-1);
  pattern = trimmed;
  if (playing && playStep >= steps) playStep %= steps;
  syncStepUi();
  renderGrid();
  onMelodyChange();
}

let onMelodyChange = () => {};

export function getMelodyState() {
  return { steps, tempo, pattern: [...pattern] };
}

export function isMelodyEmpty() {
  return pattern.every((n) => n < 0);
}

export function remixPattern() {
  const notes = [];
  const slots = [];
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] >= 0) {
      slots.push(i);
      notes.push(pattern[i]);
    }
  }
  if (notes.length < 2) return;

  for (let i = notes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [notes[i], notes[j]] = [notes[j], notes[i]];
  }

  const next = [...pattern];
  slots.forEach((step, i) => {
    next[step] = notes[i];
  });
  pattern = next;
  if (document.getElementById('melody-grid')?.children.length) syncPatternToGrid();
  else renderGrid();
  onMelodyChange();
}

export function getLoopMelody() {
  return loopMelody;
}

export function setLoopMelody(on) {
  loopMelody = !!on;
  const btn = document.getElementById('melody-loop-btn');
  if (btn) {
    btn.classList.toggle('is-selected', loopMelody);
    btn.setAttribute('aria-pressed', loopMelody ? 'true' : 'false');
  }
}

export function applyMelody({ steps: nextSteps, tempo: nextTempo, pattern: nextPattern }) {
  const wasPlaying = playing;
  const savedStep = playStep;
  steps = nextSteps;
  tempo = nextTempo;
  pattern = [...nextPattern];
  if (wasPlaying && playStep >= steps) playStep = savedStep % steps;
  syncStepUi();
  syncTempoUi();
  renderGrid();
  if (wasPlaying) updatePlayhead();
  onMelodyChange();
}

export function getMelodyUrlParam() {
  const isDefault = steps === DEFAULT_STEPS
    && tempo === DEFAULT_TEMPO
    && pattern.every((n) => n < 0);
  if (isDefault) return null;
  return encodeMelody();
}

export function loadMelodyFromUrl(value) {
  if (!value || !decodeMelody(value)) return;

  syncTempoUi();
  syncStepUi();
  renderGrid();
}

export function initMelody({ getParams, onChange, onPlayStart }) {
  getSynthParams = getParams;
  onMelodyChange = onChange;

  document.querySelectorAll('.melody-steps-btn').forEach((btn) => {
    btn.addEventListener('click', () => setSteps(Number(btn.dataset.steps)));
  });

  document.getElementById('melody-tempo').addEventListener('input', (e) => {
    tempo = sliderToTempo(parseInt(e.target.value, 10));
    document.getElementById('melody-tempo-val').textContent = `${tempo} ms`;
    onMelodyChange();
  });

  document.getElementById('melody-play-btn').addEventListener('click', () => {
    if (onPlayStart) onPlayStart();
    if (!playing) startPlayback();
  });

  document.getElementById('melody-stop-btn').addEventListener('click', () => {
    stopPlayback();
  });

  document.getElementById('melody-loop-btn').addEventListener('click', () => {
    setLoopMelody(!loopMelody);
  });

  document.getElementById('melody-clear-btn').addEventListener('click', clearPattern);

  bindPaintGlobals();
  setLoopMelody(true);
  syncStepUi();
  syncTempoUi();
  renderGrid();
}

export function stopMelody() {
  stopPlayback();
}

export function isMelodyPlaying() {
  return playing;
}

export function toggleMelodyPlayback() {
  togglePlayback();
}
