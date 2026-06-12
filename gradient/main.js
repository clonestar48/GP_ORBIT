/**
 * Gradient lab — extruded 3D type with live input.
 */

import { PRESETS, DEFAULT_PRESET_ID, getPreset } from './presets.js';
import { initScene } from './scene.js';

const MAX_CHARS = 20;
const DEFAULT_TEXT = 'FUTURA CHROME';

const stage = document.querySelector('.stage');
const canvas = document.getElementById('gradient-canvas');
const textInput = document.getElementById('text-input');
const typeCaret = document.getElementById('type-caret');
const readout = document.getElementById('readout');
const charCount = document.getElementById('char-count');
const presetList = document.getElementById('preset-list');

let activePresetId = DEFAULT_PRESET_ID;
let sceneApi = null;
let animStart = performance.now();
let cancelAnim = null;

function printableLength(text) {
  return text.replace(/\n/g, '').length;
}

function sanitizeText(raw) {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim());

  let count = 0;
  const kept = [];

  for (let i = 0; i < lines.length; i += 1) {
    let line = '';
    for (const ch of lines[i].toUpperCase()) {
      if (count >= MAX_CHARS) break;
      line += ch;
      count += 1;
    }
    kept.push(line);
    if (count >= MAX_CHARS) break;
  }

  return kept.join('\n');
}

function updateCharCount(text) {
  if (charCount) charCount.textContent = `${printableLength(text)}/${MAX_CHARS}`;
}

function applyPreset(id) {
  const preset = getPreset(id);
  activePresetId = preset.id;
  sceneApi?.setGradientStops(preset.stops);

  presetList?.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.preset === preset.id);
    btn.setAttribute('aria-pressed', btn.dataset.preset === preset.id ? 'true' : 'false');
  });

  if (readout) {
    const len = printableLength(textInput?.value ?? '');
    readout.textContent = `${preset.label} · ${preset.era} · ${len}/${MAX_CHARS}`;
  }
}

function updateCaret() {
  if (!sceneApi || !textInput || !typeCaret) return;

  const focused = document.activeElement === textInput;
  if (!focused) {
    typeCaret.classList.remove('is-visible');
    return;
  }

  const pos = sceneApi.getCaretScreenPoint(textInput.selectionStart ?? 0);
  if (!pos) {
    typeCaret.classList.remove('is-visible');
    return;
  }

  typeCaret.style.left = `${pos.x}px`;
  typeCaret.style.top = `${pos.y}px`;
  typeCaret.style.height = `${Math.max(pos.height, 8)}px`;
  typeCaret.style.transform = 'translateY(-50%)';
  typeCaret.classList.add('is-visible');
}

function syncText(value) {
  const clean = sanitizeText(value);
  if (textInput && textInput.value !== clean) textInput.value = clean;
  sceneApi?.setText(clean);
  updateCharCount(clean);
  applyPreset(activePresetId);
  updateCaret();
}

function buildPresets() {
  if (!presetList) return;

  PRESETS.forEach((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.dataset.preset = preset.id;
    btn.setAttribute('aria-pressed', preset.id === DEFAULT_PRESET_ID ? 'true' : 'false');
    btn.innerHTML =
      `<span class="preset-btn__swatch" style="background:${preset.fill}" aria-hidden="true"></span>` +
      `<span class="preset-btn__label">${preset.label}</span>`;
    btn.addEventListener('click', () => applyPreset(preset.id));
    presetList.appendChild(btn);
  });
}

function focusInput() {
  textInput?.focus();
}

function initInput() {
  if (!textInput) return;

  textInput.addEventListener('input', () => syncText(textInput.value));
  textInput.addEventListener('keyup', updateCaret);
  textInput.addEventListener('click', updateCaret);
  textInput.addEventListener('focus', updateCaret);
  textInput.addEventListener('blur', updateCaret);
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === textInput) updateCaret();
  });

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) e.preventDefault();
  });

  stage?.addEventListener('click', (e) => {
    if (e.target.closest('.panel-wrap')) return;
    focusInput();
  });

  syncText(DEFAULT_TEXT);
  focusInput();
}

function startRenderLoop() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const tick = (now) => {
    const t = (now - animStart) * 0.001;
    const editing = textInput === document.activeElement;
    const damp = editing ? 0.28 : 1;
    sceneApi?.render(reducedMotion ? 0 : t, reducedMotion ? 0 : damp);
    if (editing) updateCaret();
    cancelAnim = requestAnimationFrame(tick);
  };

  cancelAnim = requestAnimationFrame(tick);
}

async function boot() {
  if (!canvas) return;

  if (readout) readout.textContent = 'Loading type…';

  sceneApi = initScene(canvas);
  sceneApi.resize();

  try {
    await sceneApi.ready;
  } catch {
    if (readout) readout.textContent = 'Failed to load 3D font.';
    return;
  }

  buildPresets();
  initInput();
  applyPreset(DEFAULT_PRESET_ID);
  startRenderLoop();

  window.addEventListener('resize', () => sceneApi?.resize());
}

boot();
