/**
 * VMU Portfolio - File Browser
 *
 * Late-90s file manager aesthetic: floating save icons in 3D space,
 * small GP emblem hub as cursor, dark BIOS atmosphere.
 */

import * as THREE from '../assets/vendor/three.module.js';
import { CONTENT, WORK_MENU } from './content.js';
import { audio } from './audio.js';
import { buildGPEmblem, createPearlMaterialSet } from './emblem.js';
import { buildSectionSaveIcon, ICON_SCALE } from './save-icons.js';

if (typeof window.__vmuBoot === 'function') window.__vmuBoot();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SECTIONS = [
  { key: 'work', label: 'WORK', file: 'WORK.SAV' },
  { key: 'nfl', label: 'NFL', file: 'NFL.SAV' },
  { key: 'portraits', label: 'PORTRAITS', file: 'PORTRAITS.SAV' },
  { key: 'about', label: 'ABOUT', file: 'ABOUT.SAV' },
];
/** SECTIONS index 0 = first clockwise slot; slots staggered in quadrants around hub. */

const CONFIG = {
  emblemScale: 0.38,
  orbitRadius: 2.0,
  /** Vertical inset - elliptical orbit clears top/bottom nav strips */
  orbitFlatten: 0.65,
  /** Rotate slots 45° off 12/3/6/9 - icons sit in quadrants, not on nav bars */
  orbitSlotOffset: Math.PI / 4,
  /** Index 0 leads clockwise from the first staggered slot */
  orbitStartAngle: Math.PI / 2,
  float: {
    amplitudeY: 0.035,
    amplitudeX: 0.015,
    speedY: 0.4,
    speedX: 0.28,
    rotSpeedY: 0.12,
    rotSpeedX: 0.1,
    rotAmplitudeY: 0.06,
    rotAmplitudeX: 0.02,
    baseRotX: 0.04,
  },
  camera: {
    startZ: 5.8,
    endY: 0.08,
    introDuration: 2.4,
  },
  parallax: {
    strength: 0.14,
    smoothing: 0.06,
  },
  colors: {
    bg: 0x080a0e,
    teal: 0x3d8b82,
    plastic: 0xeceae4,
    plasticWear: 0xd8d6d0,
    bezel: 0x1a1c20,
    lcdFace: 0x0e181a,
    saveBody: 0xd8d6d0,
    saveScreen: 0x0e181a,
  },
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function getCameraEndZ() {
  const w = window.innerWidth;
  const aspect = w / window.innerHeight;
  if (w < 480) return 5.2;
  if (w < 768) return 4.8;
  if (aspect < 0.75) return 4.6;
  return 4.2;
}

function createBIOSSpiral(segments = 240) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * Math.PI * 5.5;
    const radius = 0.05 + t * 1.8;
    points.push(new THREE.Vector3(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      -0.4 - t * 0.2
    ));
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: CONFIG.colors.teal, transparent: true, opacity: 0.22 })
  );
}

function animateContentLines(container) {
  container.querySelectorAll('.lcd__line').forEach((line, i) => {
    line.classList.remove('lcd__line--visible');
    line.style.animationDelay = `${i * 80}ms`;
    void line.offsetWidth;
    line.classList.add('lcd__line--visible');
  });
}

// ---------------------------------------------------------------------------
// Scene Setup
// ---------------------------------------------------------------------------

const container = document.getElementById('canvas-container');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(CONFIG.colors.bg, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(CONFIG.colors.bg, 0.065);

const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, CONFIG.camera.endY, CONFIG.camera.startZ);
camera.layers.enable(1);

/** Emblem-only layer - keeps scene fill lights from washing chrome to ice white */
const EMBLEM_LAYER = 1;

const mouse = { x: 0, y: 0 };
const parallax = { x: 0, y: 0 };
let introProgress = 0;
let isIntroComplete = false;
let cameraEndZ = getCameraEndZ();

// World group - shared gentle drift
const worldGroup = new THREE.Group();
scene.add(worldGroup);

// Hub group - GP emblem focal point + LCD readout
const hubGroup = new THREE.Group();
worldGroup.add(hubGroup);

// Save icons orbit group
const savesGroup = new THREE.Group();
worldGroup.add(savesGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const orbitPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const orbitHit = new THREE.Vector3();
const saveMeshes = [];

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

scene.add(new THREE.AmbientLight(0x1a2030, 0.65));

const keyLight = new THREE.DirectionalLight(0xfff5ee, 1.3);
keyLight.position.set(2, 4, 3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 14;
keyLight.shadow.camera.left = -3;
keyLight.shadow.camera.right = 3;
keyLight.shadow.camera.top = 3;
keyLight.shadow.camera.bottom = -3;
keyLight.shadow.bias = -0.002;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x3d8b82, 0.4);
fillLight.position.set(-3, 1, 2);
scene.add(fillLight);

scene.add(new THREE.DirectionalLight(0x6080a0, 0.22).translateY(-2).translateZ(-3));

const tealGlow = new THREE.PointLight(CONFIG.colors.teal, 0.55, 8);
tealGlow.position.set(0, 0.2, 1);
worldGroup.add(tealGlow);

// ---------------------------------------------------------------------------
// GP emblem - center of attraction
// ---------------------------------------------------------------------------

const pearlAssets = createPearlMaterialSet();
const emblem = buildGPEmblem(pearlAssets);
emblem.scale.setScalar(CONFIG.emblemScale);
emblem.traverse((obj) => {
  if (obj.isMesh) obj.layers.set(EMBLEM_LAYER);
});
hubGroup.add(emblem);

function setEmblemLightLayer(light) {
  light.layers.set(EMBLEM_LAYER);
  hubGroup.add(light);
  return light;
}

// Chromatic hub lights - emblem layer only, no white scene fill
const hubTealKey = setEmblemLightLayer(new THREE.DirectionalLight(0xadffff, 1.28));
hubTealKey.position.set(-1.1, 1.3, 1.6);

const hubPurpleFill = setEmblemLightLayer(new THREE.DirectionalLight(0xd9caff, 0.58));
hubPurpleFill.position.set(1.0, -0.65, 1.2);

const hubPinkRim = setEmblemLightLayer(new THREE.DirectionalLight(0xff9fce, 1.05));
hubPinkRim.position.set(1.15, 0.75, -0.55);

// Tight teal spotlight on emblem - pulses in lockstep with selection beam
const hubSpotlight = setEmblemLightLayer(new THREE.PointLight(0x5cffa8, 0.72, 3.6));
hubSpotlight.position.set(0, 0.06, 0.38);

// Accent wash - ramps when icons beam energy into the hub
const hubAccentLight = setEmblemLightLayer(new THREE.PointLight(0xe8a8ff, 0.32, 5));
hubAccentLight.position.set(0, 0.14, 0.52);

const hubTealRim = setEmblemLightLayer(new THREE.DirectionalLight(0x38ffe8, 0.92));
hubTealRim.position.set(-1.5, 0.6, 0.9);

const hubChromaRim = setEmblemLightLayer(new THREE.DirectionalLight(0xc4a8ff, 0.62));
hubChromaRim.position.set(1.4, -0.15, 0.85);

/** Smoothed 0-1 hub illumination driven by icon hover / selection */
let hubEnergy = 0.62;

// LCD element - boot/status logic only (not rendered in 3D)
const lcdElement = document.getElementById('lcd-screen');

// Selection link - center hub to active file (single line, updates each frame)
const selectionLineGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(1, 0, 0),
]);
const selectionLine = new THREE.Line(
  selectionLineGeo,
  new THREE.LineBasicMaterial({ color: CONFIG.colors.teal, transparent: true, opacity: 0.32 })
);
worldGroup.add(selectionLine);

// ---------------------------------------------------------------------------
// Floating save icons - portfolio sections as save blocks
// ---------------------------------------------------------------------------

const saveIcons = [];

function orbitAngle(index) {
  return CONFIG.orbitStartAngle + CONFIG.orbitSlotOffset
    - (index / SECTIONS.length) * Math.PI * 2;
}

function orbitPosition(index) {
  const angle = orbitAngle(index);
  const r = CONFIG.orbitRadius;
  const flat = CONFIG.orbitFlatten;
  return new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r * flat, 0);
}

function orbitPointAtAngle(angle, radiusScale = 1) {
  const r = CONFIG.orbitRadius * radiusScale;
  const flat = CONFIG.orbitFlatten;
  return new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r * flat, 0);
}

function angleOnOrbit(x, y) {
  return Math.atan2(y / CONFIG.orbitFlatten, x);
}

function normalizeAngle(a) {
  let n = a % (Math.PI * 2);
  if (n > Math.PI) n -= Math.PI * 2;
  if (n < -Math.PI) n += Math.PI * 2;
  return n;
}

function lerpAngle(from, to, t) {
  return from + normalizeAngle(to - from) * t;
}

function nearestOrbitIndex(angle) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < SECTIONS.length; i++) {
    const d = Math.abs(normalizeAngle(angle - orbitAngle(i)));
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function orbitPlaneDistance(x, y) {
  const flat = CONFIG.orbitFlatten;
  return Math.hypot(x, y / flat);
}

function buildSaveIcon(section, index) {
  const group = new THREE.Group();
  group.userData = { sectionKey: section.key, index };

  const basePos = orbitPosition(index);
  group.position.copy(basePos);
  group.userData.basePos = basePos.clone();
  group.userData.phase = index * 1.4;

  const { root, materials, hit, frame } = buildSectionSaveIcon(section.key, pearlAssets);
  group.add(root);

  hit.userData.isSave = true;
  hit.userData.index = index;
  saveMeshes.push(hit);

  group.userData.visual = { scale: 0.82, opacity: 0.26, zLift: 0 };
  group.userData.target = { scale: 0.8, opacity: 0.22, zLift: 0 };
  group.renderOrder = 2;

  savesGroup.add(group);
  saveIcons.push({ group, section, root, frame, materials });
  return group;
}

SECTIONS.forEach((s, i) => buildSaveIcon(s, i));

// Clock ring + cardinal ticks
const orbitRing = new THREE.Mesh(
  new THREE.TorusGeometry(CONFIG.orbitRadius, 0.005, 8, 96),
  new THREE.MeshBasicMaterial({
    color: CONFIG.colors.teal,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  })
);
orbitRing.scale.y = CONFIG.orbitFlatten;
worldGroup.add(orbitRing);

const clockTicks = new THREE.Group();
for (let i = 0; i < SECTIONS.length; i++) {
  const angle = orbitAngle(i);
  const r0 = CONFIG.orbitRadius * 0.93;
  const r1 = CONFIG.orbitRadius * 1.06;
  const tickGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(Math.cos(angle) * r0, Math.sin(angle) * r0 * CONFIG.orbitFlatten, 0.012),
    new THREE.Vector3(Math.cos(angle) * r1, Math.sin(angle) * r1 * CONFIG.orbitFlatten, 0.012),
  ]);
  clockTicks.add(new THREE.Line(
    tickGeo,
    new THREE.LineBasicMaterial({ color: CONFIG.colors.teal, transparent: true, opacity: 0.38 })
  ));
}
worldGroup.add(clockTicks);

// ---------------------------------------------------------------------------
// Atmosphere
// ---------------------------------------------------------------------------

function createParticles(count = 120) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: CONFIG.colors.teal,
    size: 0.012,
    transparent: true,
    opacity: 0.3,
    sizeAttenuation: true,
  }));
}

scene.add(createParticles());

const biosSpiral = createBIOSSpiral();
biosSpiral.position.set(0, 0.1, -2.2);
biosSpiral.scale.setScalar(1.1);
scene.add(biosSpiral);

const biosSpiral2 = createBIOSSpiral(180);
biosSpiral2.material = biosSpiral2.material.clone();
biosSpiral2.material.opacity = 0.07;
biosSpiral2.position.set(0.3, -0.2, -2.8);
biosSpiral2.rotation.z = Math.PI * 0.4;
biosSpiral2.scale.setScalar(1.3);
scene.add(biosSpiral2);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 14),
  new THREE.MeshStandardMaterial({ color: CONFIG.colors.bg, roughness: 0.9, transparent: true, opacity: 0.35 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.4;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------------------
// Navigation & UI
// ---------------------------------------------------------------------------

const viewBoot = document.getElementById('view-boot');
const viewBrowser = document.getElementById('view-browser');
const currentFileEl = document.getElementById('current-file');
const fileMetaEl = document.getElementById('file-meta');
const lcdStatus = document.getElementById('lcd-status');
const bootBar = document.getElementById('boot-bar');
const filePanel = document.getElementById('file-panel');
const filePanelScrim = document.getElementById('file-panel-scrim');
const panelTitle = document.getElementById('panel-title');
const panelBody = document.getElementById('panel-body');
const osHud = document.getElementById('os-hud');

/** Build nav item button - used on both top and bottom strips */
function buildNavItem(section, index) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'nav-strip__item';
  el.dataset.section = section.key;
  el.dataset.index = String(index);
  el.innerHTML =
    '<span class="nav-strip__cursor">▶</span>' +
    `<span class="nav-strip__label">${section.label}</span>`;
  return el;
}

/** Top strip only - WORK gets a hover dropdown */
function buildWorkDropdown(section, index) {
  const wrap = document.createElement('div');
  wrap.className = 'nav-dropdown';
  wrap.dataset.section = section.key;

  const btn = buildNavItem(section, index);
  wrap.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'nav-dropdown__panel';
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', 'Work menu');

  WORK_MENU.forEach((item) => {
    const link = document.createElement('a');
    link.className = 'nav-dropdown__link';
    link.href = item.href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('role', 'menuitem');
    link.innerHTML =
      `<span class="nav-dropdown__link-title">${item.title}</span>` +
      `<span class="nav-dropdown__link-desc">${item.desc}</span>`;
    panel.appendChild(link);
  });

  wrap.appendChild(panel);

  panel.addEventListener('mouseenter', () => {
    if (currentView !== 'browser') return;
    setNavHover(index, false);
  });

  wrap.addEventListener('mouseleave', (e) => {
    if (e.relatedTarget instanceof Node && wrap.contains(e.relatedTarget)) return;
    if (currentView === 'browser') setNavHover(-1);
  });

  return wrap;
}

function buildNavStrips() {
  osHud.replaceChildren();
  SECTIONS.forEach((section, index) => {
    if (section.key === 'work') {
      osHud.appendChild(buildWorkDropdown(section, index));
    } else {
      osHud.appendChild(buildNavItem(section, index));
    }
  });
}

buildNavStrips();

const topItems = [...osHud.querySelectorAll('.nav-strip__item')];

function isOverNavStrip(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  return el != null && osHud.contains(el);
}

/** Click / hover handlers for top nav */
function bindNavStripItem(btn) {
  const idx = Number(btn.dataset.index);

  btn.addEventListener('mouseenter', () => {
    if (currentView !== 'browser') return;
    audio.unlock();
    setNavHover(idx, true);
  });
  btn.addEventListener('mouseleave', (e) => {
    if (currentView !== 'browser') return;
    const dropdown = btn.closest('.nav-dropdown');
    if (dropdown && e.relatedTarget instanceof Node && dropdown.contains(e.relatedTarget)) {
      return;
    }
    setNavHover(-1);
  });
  btn.addEventListener('click', () => {
    audio.unlock();
    if (currentView !== 'browser') return;
    if (idx === selectedIndex) {
      openSection(SECTIONS[idx].key);
    } else {
      selectSection(idx);
    }
  });
}

topItems.forEach(bindNavStripItem);

osHud.addEventListener('mouseleave', () => {
  if (currentView === 'browser' && navHoverIndex >= 0) {
    setNavHover(-1);
  }
});

// ---------------------------------------------------------------------------
// Top nav - reveal on scroll up / top edge; hide on scroll down
// ---------------------------------------------------------------------------

let navRetracted = false;

function navBarIsPinned() {
  return osHud.matches(':hover');
}

function setNavRetracted(retracted) {
  if (currentView !== 'browser' || !osHud.classList.contains('nav-strip--visible')) {
    navRetracted = false;
    osHud.classList.remove('nav-strip--retracted');
    return;
  }
  if (retracted && navBarIsPinned()) return;
  navRetracted = retracted;
  osHud.classList.toggle('nav-strip--retracted', retracted);
}

function revealNav() {
  setNavRetracted(false);
}

osHud.addEventListener('mouseenter', revealNav);

window.addEventListener(
  'wheel',
  (e) => {
    if (currentView !== 'browser' || !osHud.classList.contains('nav-strip--visible')) return;
    if (navBarIsPinned()) {
      revealNav();
      return;
    }
    if (e.deltaY > 6) setNavRetracted(true);
    else if (e.deltaY < -6) revealNav();
  },
  { passive: true }
);

window.addEventListener('pointermove', (e) => {
  if (currentView !== 'browser' || !osHud.classList.contains('nav-strip--visible')) return;
  if (e.clientY < 110 || navBarIsPinned()) revealNav();
});

let touchScrollY = 0;
window.addEventListener('touchstart', (e) => {
  touchScrollY = e.touches[0].clientY;
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (currentView !== 'browser' || !osHud.classList.contains('nav-strip--visible')) return;
  const y = e.touches[0].clientY;
  const dy = touchScrollY - y;
  if (navBarIsPinned()) {
    revealNav();
  } else if (dy > 10) {
    setNavRetracted(true);
  } else if (dy < -10) {
    revealNav();
  }
  touchScrollY = y;
}, { passive: true });

let selectedIndex = 0;
/** Top nav hover only - not driven by 3D orbit icons */
let navHoverIndex = -1;
/** 3D save-icon hover - independent from nav ▶ / selection */
let orbitHoverIndex = -1;
let beamAngle = orbitAngle(0);
let beamAngleTarget = beamAngle;
let pointerInOrbit = false;
const hubMagnetic = { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 };
let currentView = 'boot';
let isTransitioning = false;

/** Normalize index to valid range */
function wrapIndex(index) {
  return ((index % SECTIONS.length) + SECTIONS.length) % SECTIONS.length;
}

/** Step selection clockwise (+1) or counter-clockwise (−1) */
function stepClockwise(delta) {
  selectSection(selectedIndex + delta);
}

/** Index from section key */
function indexFromKey(key) {
  return SECTIONS.findIndex((s) => s.key === key);
}

/** Top nav - selection (▶) + preview from nav bar or orbit dial */
function applyStripUI() {
  const selIdx = selectedIndex;
  const previewIdx = navHoverIndex >= 0 ? navHoverIndex : orbitHoverIndex;

  topItems.forEach((el) => {
    const i = Number(el.dataset.index);
    if (Number.isNaN(i)) return;
    const isSelected = i === selIdx;
    const isPreview = previewIdx >= 0 && i === previewIdx && !isSelected;
    el.classList.toggle('nav-strip__item--selected', isSelected);
    el.classList.toggle('nav-strip__item--hover', isPreview);
  });
  const workDropdown = osHud.querySelector('.nav-dropdown');
  if (workDropdown) {
    workDropdown.classList.toggle('nav-dropdown--open', navHoverIndex === 0);
  }
  osHud.classList.toggle('nav-strip--lit', previewIdx >= 0);
  if (previewIdx >= 0) revealNav();
}

/** 3D orbit icons - selection + orbit hover only */
function applyOrbitVisuals() {
  saveIcons.forEach(({ group }, i) => {
    const hovered = i === orbitHoverIndex;
    const selected = i === selectedIndex;

    if (selected) {
      group.userData.target = orbitHoverIndex === selectedIndex
        ? { scale: 1.0, opacity: 0.82, zLift: 0.18 }
        : { scale: 0.96, opacity: 0.76, zLift: 0.14 };
      return;
    }

    group.userData.target = {
      scale: hovered ? 0.94 : 0.8,
      opacity: hovered ? 0.52 : 0.22,
      zLift: hovered ? 0.1 : 0,
    };
  });
}

function flashNav() {
  osHud.classList.remove('nav-strip--flash');
  void osHud.offsetWidth;
  osHud.classList.add('nav-strip--flash');
  setTimeout(() => osHud.classList.remove('nav-strip--flash'), 180);
}

/** Single source of truth - index drives orbit, top nav, LCD, 3D */
function syncNavigation(index, playSound = false) {
  const prev = selectedIndex;
  selectedIndex = wrapIndex(index);
  navHoverIndex = -1;
  orbitHoverIndex = -1;

  const section = SECTIONS[selectedIndex];

  applyStripUI();

  pointerInOrbit = false;
  beamAngleTarget = orbitAngle(selectedIndex);

  currentFileEl.textContent = section.label;
  fileMetaEl.textContent = `${selectedIndex + 1}/${SECTIONS.length}`;
  lcdStatus.textContent = section.label;

  saveIcons.forEach(({ frame, group }, i) => {
    const selected = i === selectedIndex;
    frame.visible = selected;
    group.userData.target = {
      scale: selected ? 0.98 : 0.8,
      opacity: selected ? 0.78 : 0.22,
      zLift: selected ? 0.16 : 0,
    };
  });

  if (playSound && prev !== selectedIndex && currentView === 'browser') {
    audio.navigate();
    flashNav();
  }
}

/** Top nav hover - strips only */
function setNavHover(index, playSound = false) {
  if (currentView !== 'browser') {
    navHoverIndex = -1;
    applyStripUI();
    return;
  }

  const next = index >= 0 ? wrapIndex(index) : -1;
  const changed = next !== navHoverIndex;
  navHoverIndex = next;
  applyStripUI();

  if (playSound && changed && navHoverIndex >= 0) {
    audio.hover();
  }
}

/** Orbit dial hover - 3D pop, beam snap, nav preview; ▶ stays on selection */
function setOrbitHover(index, playSound = false) {
  if (currentView !== 'browser') {
    orbitHoverIndex = -1;
    applyOrbitVisuals();
    applyStripUI();
    return;
  }

  const next = index >= 0 ? wrapIndex(index) : -1;
  const changed = next !== orbitHoverIndex;
  orbitHoverIndex = next;

  const previewIdx = orbitHoverIndex >= 0 ? orbitHoverIndex : selectedIndex;
  const preview = SECTIONS[previewIdx];
  currentFileEl.textContent = preview.label;
  fileMetaEl.textContent = `${previewIdx + 1}/${SECTIONS.length}`;
  lcdStatus.textContent = preview.label;

  applyOrbitVisuals();
  applyStripUI();

  if (playSound && changed && orbitHoverIndex >= 0) {
    audio.hover();
  }

  if (orbitHoverIndex >= 0) {
    beamAngleTarget = orbitAngle(orbitHoverIndex);
  }
}

function selectSection(index, playSound = true) {
  syncNavigation(index, playSound);
}

function flashLCD() {
  lcdElement.classList.add('lcd--transitioning');
  setTimeout(() => lcdElement.classList.remove('lcd--transitioning'), 150);
}

function openSection(sectionKey) {
  const data = CONTENT[sectionKey];
  if (!data || currentView !== 'browser' || isTransitioning) return;

  syncNavigation(indexFromKey(sectionKey), false);

  isTransitioning = true;
  audio.confirm();
  flashLCD();
  flashNav();
  lcdStatus.textContent = 'LOADING';

  setTimeout(() => {
    panelTitle.textContent = data.title + '.SAV';
    panelBody.innerHTML = data.html;
    filePanelScrim.classList.add('file-panel-scrim--visible');
    filePanelScrim.setAttribute('aria-hidden', 'false');
    filePanel.classList.add('file-panel--visible');
    osHud.classList.remove('nav-strip--visible');
    lcdStatus.textContent = data.title;
    currentView = 'content';
    isTransitioning = false;
    animateContentLines(panelBody);
  }, 180);
}

function backToBrowser() {
  if (currentView !== 'content' || isTransitioning) return;

  isTransitioning = true;
  audio.cancel();
  flashLCD();
  flashNav();
  filePanelScrim.classList.remove('file-panel-scrim--visible');
  filePanelScrim.setAttribute('aria-hidden', 'true');
  filePanel.classList.remove('file-panel--visible');
  osHud.classList.add('nav-strip--visible');
  setNavRetracted(false);
  currentView = 'browser';
  syncNavigation(selectedIndex, false);
  isTransitioning = false;
}

function finishBootSequence() {
  flashLCD();

  viewBoot.classList.add('lcd__view--leaving');
  setTimeout(() => {
    viewBoot.classList.add('lcd__view--hidden');
    viewBoot.classList.remove('lcd__view--leaving');
    viewBrowser.classList.remove('lcd__view--hidden');
    viewBrowser.classList.add('lcd__view--entering');
    currentView = 'browser';
    syncNavigation(0, false);

    osHud.classList.add('nav-strip--visible');
    setNavRetracted(false);
    flashNav();

    setTimeout(() => viewBrowser.classList.remove('lcd__view--entering'), 300);
  }, 250);
}

filePanelScrim.addEventListener('click', () => {
  audio.unlock();
  backToBrowser();
});

function isClickInsideFilePanel(target) {
  return target instanceof Node && filePanel.contains(target);
}

document.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.key === 'm' || e.key === 'M') { audio.toggle(); return; }
  if (currentView === 'boot') return;

  if (currentView === 'browser') {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      stepClockwise(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      stepClockwise(-1);
    } else if (e.key === 'Enter' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      openSection(SECTIONS[selectedIndex].key);
    }
  } else if (currentView === 'content') {
    if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      backToBrowser();
    }
  }
});

function pickOrbitHoverFromPointer(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  if (!raycaster.ray.intersectPlane(orbitPlane, orbitHit)) {
    pointerInOrbit = false;
    return -1;
  }

  pointerInOrbit = true;
  const angle = angleOnOrbit(orbitHit.x, orbitHit.y);
  beamAngleTarget = angle;

  const dist = orbitPlaneDistance(orbitHit.x, orbitHit.y);
  const r = CONFIG.orbitRadius;

  if (dist < r * 0.4) {
    return -1;
  }

  const hits = raycaster.intersectObjects(saveMeshes, false);
  if (hits.length) {
    return hits[0].object.userData.index;
  }

  if (dist <= r * 1.18) {
    return nearestOrbitIndex(angle);
  }

  return -1;
}

window.addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
  mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;

  if (currentView !== 'browser') {
    pointerInOrbit = false;
    setOrbitHover(-1);
    container.classList.remove('is-hovering');
    return;
  }

  if (isOverNavStrip(e.clientX, e.clientY)) {
    pointerInOrbit = false;
    if (orbitHoverIndex >= 0) {
      setOrbitHover(-1);
    }
    return;
  }

  const nextHover = pickOrbitHoverFromPointer(e.clientX, e.clientY);
  container.classList.toggle('is-hovering', nextHover >= 0);
  if (nextHover !== orbitHoverIndex) {
    setOrbitHover(nextHover, nextHover >= 0);
  }
});

window.addEventListener('pointerleave', () => {
  pointerInOrbit = false;
});

window.addEventListener('pointerdown', (e) => {
  if (currentView === 'boot') return;
  audio.unlock();

  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  if (currentView === 'content') {
    if (isClickInsideFilePanel(e.target)) return;

    const hits = raycaster.intersectObjects(saveMeshes, false);
    if (hits.length) {
      const idx = hits[0].object.userData.index;
      if (idx === selectedIndex) {
        backToBrowser();
        return;
      }
      selectSection(idx, false);
      openSection(SECTIONS[idx].key);
      return;
    }

    backToBrowser();
    return;
  }

  const hits = raycaster.intersectObjects(saveMeshes, false);
  if (!hits.length) return;

  const idx = hits[0].object.userData.index;
  if (idx === selectedIndex) {
    openSection(SECTIONS[idx].key);
  } else {
    selectSection(idx);
  }
});

syncNavigation(0, false);

// ---------------------------------------------------------------------------
// Animation Loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const t = clock.getElapsedTime();
  const { float: f, camera: cam, parallax: px } = CONFIG;

  // Camera intro & parallax
  if (!isIntroComplete) {
    introProgress = Math.min(introProgress + delta / cam.introDuration, 1);
    const eased = easeOutCubic(introProgress);
    camera.position.z = THREE.MathUtils.lerp(cam.startZ, cameraEndZ, eased);
    camera.position.y = THREE.MathUtils.lerp(0.2, cam.endY, eased);
    camera.lookAt(0, 0, 0);
    if (introProgress >= 1) isIntroComplete = true;
  } else {
    parallax.x += (mouse.x - parallax.x) * px.smoothing;
    parallax.y += (mouse.y - parallax.y) * px.smoothing;
    camera.position.x = parallax.x * px.strength;
    camera.position.y = cam.endY - parallax.y * px.strength * 0.4;
    camera.position.z = cameraEndZ;
    camera.lookAt(0, 0, 0);
  }

  // World drift - subtle
  worldGroup.position.y = Math.sin(t * f.speedY) * f.amplitudeY;
  worldGroup.position.x = Math.sin(t * f.speedX) * f.amplitudeX;

  const { chrome, darkChrome } = emblem.userData.materials;
  const { textures } = emblem.userData;
  const beamPulse = 0.5 + 0.5 * Math.sin(t * 3);

  const targetHubEnergy = currentView === 'browser'
    ? (orbitHoverIndex >= 0 ? 1 : 0.78)
    : 0.45;
  hubEnergy += (targetHubEnergy - hubEnergy) * 0.12;

  if (currentView === 'browser') {
    let targetAngle;
    if (orbitHoverIndex >= 0) {
      const hp = saveIcons[orbitHoverIndex].group.position;
      targetAngle = angleOnOrbit(hp.x, hp.y);
    } else if (pointerInOrbit) {
      targetAngle = beamAngleTarget;
    } else {
      const sp = saveIcons[selectedIndex].group.position;
      targetAngle = angleOnOrbit(sp.x, sp.y);
    }
    const angleLerp = 1 - Math.exp(-10 * delta);
    beamAngle = lerpAngle(beamAngle, targetAngle, angleLerp);
  }

  const magLerp = 1 - Math.exp(-7 * delta);
  const pullAmt = currentView === 'browser' ? 0.05 * (0.38 + hubEnergy * 0.62) : 0;
  const magTargetX = Math.cos(beamAngle) * pullAmt;
  const magTargetY = Math.sin(beamAngle) * pullAmt * CONFIG.orbitFlatten;
  const magTargetRoll = Math.sin(beamAngle) * 0.08 * hubEnergy;
  const magTargetPitch = -Math.cos(beamAngle) * 0.055 * hubEnergy;
  const magTargetYaw = Math.sin(beamAngle) * 0.042 * hubEnergy;
  const magTargetZ = pullAmt * 0.5;

  hubMagnetic.x += (magTargetX - hubMagnetic.x) * magLerp;
  hubMagnetic.y += (magTargetY - hubMagnetic.y) * magLerp;
  hubMagnetic.z += (magTargetZ - hubMagnetic.z) * magLerp;
  hubMagnetic.roll += (magTargetRoll - hubMagnetic.roll) * magLerp;
  hubMagnetic.pitch += (magTargetPitch - hubMagnetic.pitch) * magLerp;
  hubMagnetic.yaw += (magTargetYaw - hubMagnetic.yaw) * magLerp;

  if (currentView !== 'browser') {
    const decay = 0.88;
    hubMagnetic.x *= decay;
    hubMagnetic.y *= decay;
    hubMagnetic.z *= decay;
    hubMagnetic.roll *= decay;
    hubMagnetic.pitch *= decay;
    hubMagnetic.yaw *= decay;
  }

  const idleSpinRate = currentView === 'browser' ? 0.055 : 0.12;
  hubGroup.position.set(0, 0, 0);
  emblem.position.set(
    Math.cos(t * 0.24) * 0.025 + hubMagnetic.x,
    Math.sin(t * 0.62) * 0.045 + hubMagnetic.y,
    hubMagnetic.z
  );
  emblem.rotation.y = -0.22 + t * idleSpinRate + parallax.x * 0.08 + hubMagnetic.yaw;
  emblem.rotation.x = Math.sin(t * 0.38) * 0.035 - parallax.y * 0.04 + hubMagnetic.pitch;
  emblem.rotation.z = Math.sin(t * 0.27) * 0.018 + hubMagnetic.roll;

  if (chrome && darkChrome) {
    const motionEnergy = Math.min(
      1,
      hubEnergy * 0.72 + Math.abs(parallax.x) * 0.28 + (orbitHoverIndex >= 0 ? 0.22 : 0)
    );

    if (chrome.userData.shader) {
      chrome.userData.shader.uniforms.uTime.value = t * 1.35;
      chrome.userData.shader.uniforms.uMotion.value = motionEnergy;
    }
    if (darkChrome.userData.shaderDark) {
      darkChrome.userData.shaderDark.uniforms.uTime.value = t * 1.35;
      darkChrome.userData.shaderDark.uniforms.uMotion.value = motionEnergy;
    }

    const sparklePulse = 0.9 + 0.1 * Math.sin(t * 4.6) + motionEnergy * 0.08;
    const hubMul = 1 + hubEnergy * 0.65;
    chrome.emissiveIntensity = 0.38 * sparklePulse * hubMul;
    darkChrome.emissiveIntensity = 0.52 * sparklePulse * hubMul;

    if (textures) {
      const { sparkleTexture, emissiveSparkleTexture } = textures;
      sparkleTexture.offset.set(t * 0.011, t * 0.007);
      sparkleTexture.rotation = 0.09 + Math.sin(t * 0.17) * 0.012;
      emissiveSparkleTexture.offset.set(-t * 0.008, t * 0.013);
      emissiveSparkleTexture.rotation = -0.07 + Math.cos(t * 0.13) * 0.01;
    }
  }

  // Save icons - smooth lerp toward selection targets
  saveIcons.forEach(({ group, root, materials, frame }, i) => {
    const p = group.userData.phase;
    const bp = group.userData.basePos;
    const v = group.userData.visual;
    const tgt = group.userData.target || { scale: 0.8, opacity: 0.22, zLift: 0 };
    const lerp = 0.1;

    v.scale += (tgt.scale - v.scale) * lerp;
    v.opacity += (tgt.opacity - v.opacity) * lerp;
    v.zLift += (tgt.zLift - v.zLift) * lerp;

    root.scale.setScalar(v.scale * ICON_SCALE);
    const emissiveBase = [0.16, 0.24];
    materials.forEach((mat, mi) => {
      mat.opacity = v.opacity;
      mat.emissiveIntensity = emissiveBase[mi] * (0.35 + v.opacity * 0.55);
    });

    group.position.set(
      bp.x + Math.sin(t * 0.5 + p) * 0.02,
      bp.y + Math.sin(t * 0.7 + p) * 0.03,
      bp.z + v.zLift
    );

    if (frame.visible) {
      frame.material.emissiveIntensity = 0.32 + Math.sin(t * 4) * 0.12;
    }
  });

  // Selection beam + hub lighting - sweeps the orbit with pointer, snaps on hover
  const hubCenter = new THREE.Vector3(0, 0, 0.02);
  const hubGlowPos = new THREE.Vector3(0, 0.1, 0.55);

  if (currentView === 'browser') {
    const beamTip = orbitPointAtAngle(beamAngle, 0.92);
    if (orbitHoverIndex >= 0) {
      const iconTip = saveIcons[orbitHoverIndex].group.position.clone().multiplyScalar(0.88);
      beamTip.lerp(iconTip, 0.42);
    } else {
      beamTip.z = saveIcons[selectedIndex].group.position.z * 0.35;
    }

    selectionLine.geometry.setFromPoints([hubCenter, beamTip]);

    const onTarget = orbitHoverIndex >= 0 || !pointerInOrbit;
    selectionLine.material.opacity = onTarget
      ? 0.28 + 0.34 * beamPulse * hubEnergy
      : 0.18 + 0.22 * beamPulse;

    selectionLine.visible = true;

    hubSpotlight.position.set(
      Math.cos(beamAngle) * 0.07,
      Math.sin(beamAngle) * 0.07 * CONFIG.orbitFlatten + 0.06,
      0.36 + hubMagnetic.z * 0.4
    );

    hubSpotlight.intensity = 0.62 + 0.48 * beamPulse + hubEnergy * 1.2;
    hubAccentLight.intensity = 0.28 + hubEnergy * (1.1 + beamPulse * 0.4);
    hubTealKey.intensity = 1.12 + hubEnergy * 0.52 + beamPulse * 0.2;
    hubPinkRim.intensity = 0.88 + hubEnergy * 0.45 + beamPulse * 0.18;
    hubTealRim.intensity = 0.78 + hubEnergy * 0.38;
    hubChromaRim.intensity = 0.52 + hubEnergy * 0.28;
    hubPurpleFill.intensity = 0.48 + hubEnergy * 0.22;

    const glowOrbit = orbitPointAtAngle(beamAngle, 0.14);
    const glowTarget = orbitHoverIndex >= 0
      ? hubGlowPos
      : new THREE.Vector3(glowOrbit.x, glowOrbit.y + 0.1, 0.58);
    tealGlow.position.lerp(glowTarget, orbitHoverIndex >= 0 ? 0.14 : 0.1);
    tealGlow.intensity = 0.48 + 0.24 * beamPulse + hubEnergy * 0.5;
  } else {
    selectionLine.visible = false;
    hubSpotlight.intensity = 0.55 + 0.2 * beamPulse;
    hubAccentLight.intensity = 0.22;
    hubTealKey.intensity = 0.95;
    hubPinkRim.intensity = 0.72;
    tealGlow.intensity = 0.42 + Math.sin(t * 1.8) * 0.08;
  }

  biosSpiral.rotation.z = t * 0.1;
  scene.children.filter(c => c.type === 'Points').forEach(p => { p.rotation.y = t * 0.012; });

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  cameraEndZ = getCameraEndZ();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------

(function bootSequence() {
  const steps = [
    { status: 'INIT', progress: 15, delay: 500 },
    { status: 'CHECK', progress: 40, delay: 900 },
    { status: 'LOAD', progress: 72, delay: 1400 },
    { status: 'READY', progress: 100, delay: 2200 },
  ];

  steps.forEach(({ status, progress, delay }) => {
    setTimeout(() => {
      lcdStatus.textContent = status;
      bootBar.style.width = `${progress}%`;
      if (status !== 'READY') audio.boot();
      if (status === 'READY') finishBootSequence();
    }, delay);
  });

  setTimeout(() => document.body.classList.add('is-ready'), 800);
})();
