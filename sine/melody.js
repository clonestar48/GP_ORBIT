import { play, unlock } from './synth.js';
import { SONG_TEMPLATES, TUNE_CATEGORIES } from './tunes.js';

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

/** One full phrase — notes then rests to fill phraseSteps. */
function buildPhrase(notes, phraseSteps) {
  const phrase = emptyPattern(phraseSteps);
  for (let i = 0; i < phraseSteps; i++) {
    phrase[i] = i < notes.length ? notes[i] : -1;
  }
  return phrase;
}

/** Shorter grid truncates; longer grid loops the full phrase. */
function fitSongToSteps(notes, count, phraseSteps) {
  const phrase = buildPhrase(notes, phraseSteps);
  const out = emptyPattern(count);
  if (count > phrase.length) {
    for (let i = 0; i < count; i++) out[i] = phrase[i % phrase.length];
    return out;
  }
  for (let i = 0; i < count; i++) out[i] = phrase[i];
  return out;
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
let loopMelody = false;
let playTimer = null;
let playStep = 0;
let getSynthParams = () => ({});
let activeSong = null;

function updateSongSelection(key) {
  activeSong = key;
  document.querySelectorAll('.melody-song-btn').forEach((btn) => {
    btn.classList.toggle('is-selected', btn.dataset.song === key);
  });
}

function clearSongSelection() {
  activeSong = null;
  document.querySelectorAll('.melody-song-btn').forEach((btn) => {
    btn.classList.remove('is-selected');
  });
}

function syncStepUi() {
  document.querySelectorAll('.melody-steps-btn').forEach((btn) => {
    btn.classList.toggle('is-selected', Number(btn.dataset.steps) === steps);
  });
}

function syncTempoUi() {
  const tempoEl = document.getElementById('melody-tempo');
  if (tempoEl) tempoEl.value = tempo;
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
  tempo = Number.isFinite(t) ? Math.max(80, Math.min(400, t)) : DEFAULT_TEMPO;
  pattern = body.split('').map((ch) => (ch === 'x' ? -1 : parseInt(ch, 36)));
  if (pattern.some((n) => n < -1 || n >= NOTE_ROWS.length)) return false;
  return true;
}

function setNote(step, row) {
  pattern[step] = pattern[step] === row ? -1 : row;
  clearSongSelection();
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

      cell.addEventListener('click', () => {
        setNote(step, row);
        renderGrid();
        onMelodyChange();
      });

      rowEl.appendChild(cell);
    }

    grid.appendChild(rowEl);
  });

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
  playTimer = setTimeout(scheduleStep, tempo);
}

function startPlayback() {
  unlock();
  stopPlayback();
  playing = true;
  playStep = 0;
  document.getElementById('melody-play-btn')?.classList.add('is-playing');
  document.getElementById('melody-panel')?.classList.add('is-playing');
  scheduleStep();
}

function togglePlayback() {
  if (playing) stopPlayback();
  else startPlayback();
}

function clearPattern() {
  pattern = emptyPattern(steps);
  clearSongSelection();
  renderGrid();
  onMelodyChange();
}

function setSteps(next) {
  steps = next;
  if (activeSong && SONG_TEMPLATES[activeSong]) {
    const song = SONG_TEMPLATES[activeSong];
    pattern = fitSongToSteps(song.notes, steps, song.phraseSteps);
  } else {
    const trimmed = pattern.slice(0, next);
    while (trimmed.length < next) trimmed.push(-1);
    pattern = trimmed;
  }
  syncStepUi();
  renderGrid();
  onMelodyChange();
}

function loadSong(key) {
  const song = SONG_TEMPLATES[key];
  if (!song) return;

  steps = song.phraseSteps;
  tempo = song.tempo;
  pattern = fitSongToSteps(song.notes, steps, song.phraseSteps);
  syncStepUi();
  syncTempoUi();
  updateSongSelection(key);
  renderGrid();
  onMelodyChange();
}

function renderSongButtons() {
  const root = document.getElementById('melody-songs-list');
  if (!root) return;
  root.replaceChildren();

  for (const cat of TUNE_CATEGORIES) {
    const label = document.createElement('p');
    label.className = 'preset-section__label';
    label.textContent = cat.label;
    root.appendChild(label);

    const row = document.createElement('div');
    row.className = 'presets presets--stack presets--tunes-col';
    row.setAttribute('aria-label', `${cat.label} tunes`);

    for (const [key, song] of Object.entries(cat.songs)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-btn melody-song-btn';
      btn.dataset.song = key;
      btn.textContent = song.label;
      btn.addEventListener('click', () => loadSong(key));
      row.appendChild(btn);
    }

    root.appendChild(row);
  }
}

let onMelodyChange = () => {};

export function getMelodyUrlParam() {
  const isDefault = steps === DEFAULT_STEPS
    && tempo === DEFAULT_TEMPO
    && pattern.every((n) => n < 0);
  if (isDefault) return null;
  return encodeMelody();
}

export function loadMelodyFromUrl(value) {
  if (!value || !decodeMelody(value)) return;

  clearSongSelection();
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
    tempo = parseInt(e.target.value, 10);
    document.getElementById('melody-tempo-val').textContent = `${tempo} ms`;
    onMelodyChange();
  });

  document.getElementById('melody-play-btn').addEventListener('click', () => {
    if (onPlayStart) onPlayStart();
    togglePlayback();
  });

  document.getElementById('melody-loop-btn').addEventListener('click', (e) => {
    loopMelody = !loopMelody;
    e.currentTarget.classList.toggle('is-selected', loopMelody);
    e.currentTarget.setAttribute('aria-pressed', loopMelody ? 'true' : 'false');
  });

  document.getElementById('melody-clear-btn').addEventListener('click', clearPattern);

  renderSongButtons();

  syncStepUi();
  renderGrid();
}

export function stopMelody() {
  stopPlayback();
}

export function isMelodyPlaying() {
  return playing;
}
