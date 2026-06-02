/**
 * VMU Portfolio - File Browser
 *
 * Late-90s file manager aesthetic: floating save icons in 3D space,
 * small GP emblem hub as cursor, dark BIOS atmosphere.
 */

import * as THREE from '../assets/vendor/three.module.js';
import { CONTENT, initContactPanel } from './content.js';
import { audio } from './audio.js';
import { buildGPEmblem, createPearlMaterialSet } from './emblem.js';
import { initIntercom, startIntercomNoise, stopIntercomNoise } from './intercom.js';
import { buildSectionSaveIcon, ICON_SCALE } from './save-icons.js';

if (typeof window.__vmuBoot === 'function') window.__vmuBoot();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SECTIONS = [
  { key: 'work', label: 'WORK', file: 'WORK.SAV' },
  { key: 'lab', label: 'LAB', file: 'LAB.SAV' },
  { key: 'about', label: 'ABOUT', file: 'ABOUT.SAV' },
  { key: 'contact', label: 'CONTACT', file: 'CONTACT.SAV' },
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
const emblemPivot = new THREE.Group();
emblemPivot.add(emblem);
const EMBLEM_HOME_Y = -0.22;
const emblemMeshes = [];
emblem.traverse((obj) => {
  if (obj.isMesh) {
    obj.layers.set(EMBLEM_LAYER);
    emblemMeshes.push(obj);
  }
});
hubGroup.add(emblemPivot);

const emblemSpin = {
  active: false,
  elapsed: 0,
  duration: 0.52,
  startPivotY: 0,
  startEmblemY: 0,
  totalSpin: Math.PI * 2,
};

/** Idle Y drift anchor — reset on spin land so drift resumes from front-facing, not pre-click angle */
let emblemIdleAnchorT = 0;
let emblemIdleBias = 0;

function emblemYawOverlay() {
  return parallax.x * 0.08 + hubMagnetic.yaw;
}

function emblemDriftYaw(t, idleSpinRate) {
  return EMBLEM_HOME_Y
    + emblemIdleBias
    + (t - emblemIdleAnchorT) * idleSpinRate
    + emblemYawOverlay();
}

function settleEmblemSpinDrift(t) {
  emblemIdleAnchorT = t;
  emblemIdleBias = emblem.rotation.y - EMBLEM_HOME_Y - emblemYawOverlay();
}

function computeEmblemSpinAmount() {
  const currentTotal = emblemPivot.rotation.y + emblem.rotation.y;
  let forward = normalizeAngle(EMBLEM_HOME_Y - currentTotal);
  if (forward <= 0) forward += Math.PI * 2;
  if (forward < Math.PI * 2) forward += Math.PI * 2;
  return forward;
}

function triggerEmblemSpin() {
  emblemSpin.startPivotY = emblemPivot.rotation.y;
  emblemSpin.startOverlay = emblemYawOverlay();
  emblemSpin.frozenBaseY = emblem.rotation.y - emblemSpin.startOverlay;
  emblemSpin.startEmblemY = emblem.rotation.y;
  emblemSpin.totalSpin = computeEmblemSpinAmount();
  emblemSpin.duration = 0.52 * (emblemSpin.totalSpin / (Math.PI * 2));
  emblemSpin.active = true;
  emblemSpin.elapsed = 0;
  audio.spin();
}

function pickEmblemFromPointer() {
  raycaster.layers.enable(EMBLEM_LAYER);
  const hits = raycaster.intersectObjects(emblemMeshes, false);
  raycaster.layers.disable(EMBLEM_LAYER);
  if (hits.length) return true;

  if (!raycaster.ray.intersectPlane(orbitPlane, orbitHit)) return false;
  return orbitPlaneDistance(orbitHit.x, orbitHit.y) < CONFIG.orbitRadius * 0.36;
}

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
const hubSpotlight = setEmblemLightLayer(new THREE.PointLight(0x52c8a0, 0.72, 3.6));
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

  group.userData.visual = { scale: 0.8, opacity: 0, zLift: 0 };
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

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 14),
  new THREE.MeshStandardMaterial({ color: CONFIG.colors.bg, roughness: 1, transparent: true, opacity: 0.08 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -2.2;
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
const aboutDockEl = document.getElementById('about-dock');
const intercomEl = document.getElementById('intercom');
const aboutBioEl = document.getElementById('about-bio');
const bioChunks = [];
let bioChunkTimers = [];
let bioTransmissionPrimed = false;
const panelTitle = document.getElementById('panel-title');
const panelBody = document.getElementById('panel-body');
const osHud = document.getElementById('os-hud');

/** Build nav item button for the top strip */
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

function buildNavStrips() {
  osHud.replaceChildren();
  SECTIONS.forEach((section, index) => {
    osHud.appendChild(buildNavItem(section, index));
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
  btn.addEventListener('mouseleave', () => {
    if (currentView !== 'browser') return;
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
/** Teal gem frame - only after user selects an icon (not on initial load) */
let frameRevealedIndex = -1;
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
let panelBlend = 0;

/** Single controller for ABOUT / intercom — phases drive motion + occlusion */
const aboutState = {
  phase: 'closed',
  hubRetreat: 0,
  intercomShow: 0,
};

let aboutBioStreamTemplate = null;
const aboutCloseTimers = { transition: null, powerOff: null, finish: null };
let aboutCloseBezelListener = null;
let bioStreamMaxHeightScheduled = false;

const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
let prefersReducedMotion = reducedMotionMq.matches;
reducedMotionMq.addEventListener('change', (e) => {
  prefersReducedMotion = e.matches;
});

const INTERCOM = {
  transitionMs: 1020,
  crtPowerOffMs: 780,
  retreatRate: 1.28,
  showInRate: 1.05,
  showOutRate: 2.15,
  /** Final dock offset (vw left of center) and tilt — applied with fade-in */
  dockLeftVw: 17,
  /** Shared HUD camera (on #about-dock, not per-panel) */
  dockPerspectivePx: 1600,
  dockPerspectiveOriginY: 48,
  /** Concave inward; same rotateX on both planes (parallel top/bottom slant) */
  dockRotateY: 18,
  dockRotateX: 4,
  dockDepthZ: 10,
  navClearanceTop: 118,
  /** Bio stream may extend only slightly past intercom bottom glow */
  bioGlowSlackPx: 28,
  /** Staggered bio chunks — step between slots + jitter within each slot */
  bioChunkStepMs: 92,
  bioChunkJitterRatio: 0.48,
  /** Hub must clear this much before codec begins appearing */
  hubLeadOpen: 0.44,
  /** Codec must fade below this before hub returns */
  codecReturnGate: 0.12,
};

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function aboutPhaseActive() {
  return aboutState.phase !== 'closed';
}

function aboutWantsOpenMotion() {
  return aboutState.phase === 'opening' || aboutState.phase === 'open';
}

function setAboutPhase(phase) {
  aboutState.phase = phase;
  if (phase !== 'closed') {
    currentView = 'intercom';
  } else if (currentView === 'intercom') {
    currentView = 'browser';
  }
}

/** Keep orbit GP + emblem hidden for full ABOUT open/hold/close (no flash on exit) */
function orbitHubOcclusion() {
  const { phase, hubRetreat, intercomShow } = aboutState;
  if (phase === 'opening' || phase === 'open') return 1;
  if (phase === 'closing') {
    if (intercomShow > INTERCOM.codecReturnGate) return 1;
    return hubRetreat;
  }
  return hubRetreat;
}

function clearBioChunkTimers() {
  bioChunkTimers.forEach((id) => clearTimeout(id));
  bioChunkTimers = [];
}

function captureAboutBioStreamTemplate() {
  if (aboutBioStreamTemplate || !aboutBioEl) return;
  const stream = aboutBioEl.querySelector('.about-bio__stream');
  if (stream) aboutBioStreamTemplate = stream.innerHTML;
}

function restoreAboutBioStream() {
  if (!aboutBioEl || !aboutBioStreamTemplate) return;
  const stream = aboutBioEl.querySelector('.about-bio__stream');
  if (!stream) return;
  stream.innerHTML = aboutBioStreamTemplate;
  stream.style.removeProperty('max-height');
}

/** Cap scroll area so bio copy stays near intercom glow footprint (not per-frame) */
function measureBioStreamMaxHeight() {
  if (!aboutBioEl || !intercomEl || aboutState.phase === 'closed') return;

  const stream = aboutBioEl.querySelector('.about-bio__stream');
  if (!stream) return;

  const ir = intercomEl.getBoundingClientRect();
  if (ir.height < 8) return;

  const br = aboutBioEl.getBoundingClientRect();
  const slack = INTERCOM.bioGlowSlackPx;
  const intercomFloor = ir.bottom + slack;
  const maxFromTop = intercomFloor - br.top;
  const centerY = ir.top + ir.height / 2;
  const maxFromCenter = (intercomFloor - centerY) * 2;
  const maxH = Math.min(maxFromTop, maxFromCenter, ir.height + slack - 36);

  stream.style.maxHeight = `${Math.max(140, Math.floor(maxH))}px`;
}

function scheduleBioStreamMaxHeight() {
  if (bioStreamMaxHeightScheduled || aboutState.phase === 'closed') return;
  bioStreamMaxHeightScheduled = true;
  requestAnimationFrame(() => {
    bioStreamMaxHeightScheduled = false;
    measureBioStreamMaxHeight();
  });
}

function scheduleBioStreamMaxHeightAfterLayout() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => scheduleBioStreamMaxHeight());
  });
}

function clearAboutCloseTimers() {
  if (aboutCloseTimers.transition != null) {
    clearTimeout(aboutCloseTimers.transition);
    aboutCloseTimers.transition = null;
  }
  if (aboutCloseTimers.powerOff != null) {
    clearTimeout(aboutCloseTimers.powerOff);
    aboutCloseTimers.powerOff = null;
  }
  if (aboutCloseTimers.finish != null) {
    clearTimeout(aboutCloseTimers.finish);
    aboutCloseTimers.finish = null;
  }
  if (aboutCloseBezelListener) {
    const { bezel, handler } = aboutCloseBezelListener;
    bezel?.removeEventListener('animationend', handler);
    aboutCloseBezelListener = null;
  }
}

/** Shared dock pose — planes in #about-dock camera (no per-element perspective) */
function applyDockPanelMotion(el, motion, t, reducedMotion, side) {
  if (!el) return;

  const isBio = side === 'right';
  const shiftMirror = isBio ? 1 : -1;
  const shiftVw = shiftMirror * INTERCOM.dockLeftVw * motion;
  const rotY = (side === 'left' ? 1 : -1) * INTERCOM.dockRotateY * motion;
  const rotX = -INTERCOM.dockRotateX * motion;
  const scale = 0.9 + motion * 0.1;
  const depthZ = -INTERCOM.dockDepthZ * motion;

  el.style.opacity = String(motion);
  if (isBio) {
    el.style.pointerEvents = motion > 0.02 ? 'auto' : 'none';
  }

  const rot =
    `rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${scale})`;

  if (motion > 0.01 && !reducedMotion) {
    const floatAmp = motion < 0.88 ? 1 : Math.max(0, 1 - (motion - 0.88) / 0.12);
    const floatDamp = (1 - motion * 0.65) * floatAmp;
    const floatX = Math.sin(t * 0.414) * 12.1 * motion * floatDamp;
    const floatY = Math.sin(t * 0.522 + 0.6) * 7.7 * motion * floatDamp;
    el.style.transform =
      `translate3d(calc(-50% + ${shiftVw}vw + ${floatX}px), calc(-50% + ${floatY}px), ${depthZ}px) ` +
      rot;
  } else if (motion > 0.01) {
    el.style.transform =
      `translate3d(calc(-50% + ${shiftVw}vw), -50%, ${depthZ}px) ${rot}`;
  } else {
    el.style.transform =
      `translate3d(-50%, -50%, 0) rotateY(0deg) rotateX(0deg) scale(0.9)`;
  }
}

function syncAboutDockCamera() {
  if (!aboutDockEl) return;
  aboutDockEl.style.setProperty('--dock-persp', `${INTERCOM.dockPerspectivePx}px`);
  aboutDockEl.style.setProperty('--dock-persp-y', `${INTERCOM.dockPerspectiveOriginY}%`);
}

/** Split bio copy into word chunks for staggered transmission reveal */
function prepareAboutBioChunks() {
  if (!aboutBioEl) return;
  const stream = aboutBioEl.querySelector('.about-bio__stream');
  if (!stream) return;

  bioChunks.length = 0;
  let order = 0;
  const meta = stream.querySelector('.about-bio__meta');
  if (meta) {
    meta.style.opacity = '0';
    meta.classList.add('about-bio__chunk');
    bioChunks.push({ el: meta, order: order++ });
  }

  stream.querySelectorAll('.about-bio__line').forEach((para) => {
    const words = para.textContent.trim().split(/\s+/).filter(Boolean);
    para.textContent = '';
    para.classList.add('about-bio__para');

    let i = 0;
    while (i < words.length) {
      const size = 2 + Math.floor(Math.random() * 4);
      const text = words.slice(i, i + size).join(' ');
      i += size;

      const span = document.createElement('span');
      span.className = 'about-bio__chunk';
      span.textContent = `${text} `;
      span.style.opacity = '0';
      para.appendChild(span);
      bioChunks.push({ el: span, order: order++ });
    }
  });
}

function rebuildAboutBioForOpen() {
  clearBioChunkTimers();
  bioTransmissionPrimed = false;
  restoreAboutBioStream();
  prepareAboutBioChunks();
}

function revealBioChunk(el) {
  if (!el || el.classList.contains('about-bio__chunk--live')) return;
  el.classList.add('about-bio__chunk--live');
  el.style.opacity = '1';
}

function resetBioTransmission() {
  bioTransmissionPrimed = false;
  clearBioChunkTimers();
  bioChunks.forEach(({ el }) => {
    el.style.opacity = '0';
    el.classList.remove('about-bio__chunk--live');
  });
  aboutBioEl?.style.setProperty('--bio-reveal', '0');
}

function startBioTransmission() {
  if (!bioChunks.length) return;

  if (prefersReducedMotion) {
    bioChunks.forEach(({ el }) => revealBioChunk(el));
    aboutBioEl?.style.setProperty('--bio-reveal', '1');
    return;
  }

  aboutBioEl?.style.setProperty('--bio-reveal', '1');

  const step = INTERCOM.bioChunkStepMs;
  const jitter = step * INTERCOM.bioChunkJitterRatio;

  bioChunks.forEach(({ el, order }) => {
    const slotStart = 50 + order * step;
    const delay = slotStart + Math.random() * jitter;
    const id = window.setTimeout(() => revealBioChunk(el), delay);
    bioChunkTimers.push(id);
  });
}

function tickBioTransmission(motion) {
  if (!aboutWantsOpenMotion() || motion < 0.04 || bioTransmissionPrimed) return;
  bioTransmissionPrimed = true;
  startBioTransmission();
}

/** Opacity reaches ~0 by ~50% hub retreat — shrink continues invisibly behind */
function codecNumeralFade(retreat) {
  return 1 - easeInOutSine(Math.min(1, retreat / 0.5));
}

initIntercom(intercomEl);
captureAboutBioStreamTemplate();
syncAboutDockCamera();

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
  osHud.classList.toggle('nav-strip--lit', previewIdx >= 0);
  if (previewIdx >= 0) revealNav();
}

/** 3D orbit icons - selection and nav/orbit preview (stable through panel open/close) */
function applyIconTargets() {
  const navPreview = currentView === 'browser' && navHoverIndex >= 0 ? navHoverIndex : -1;
  const orbitPreview = currentView === 'browser' && orbitHoverIndex >= 0 ? orbitHoverIndex : -1;

  saveIcons.forEach(({ frame, group }, i) => {
    const selected = i === selectedIndex;
    const navHovered = i === navPreview;
    const orbitHovered = i === orbitPreview;
    const previewed = navHovered || orbitHovered;

    frame.visible = i === frameRevealedIndex;

    if (selected) {
      group.userData.target = previewed
        ? { scale: 1.0, opacity: 0.82, zLift: 0.18 }
        : { scale: 0.96, opacity: 0.76, zLift: 0.14 };
      return;
    }

    group.userData.target = {
      scale: previewed ? 0.94 : 0.8,
      opacity: previewed ? 0.52 : 0.22,
      zLift: previewed ? 0.1 : 0,
    };
  });
}

function resolveBeamTargetAngle() {
  if (isTransitioning || currentView !== 'browser') {
    return orbitAngle(selectedIndex);
  }
  if (orbitHoverIndex >= 0) {
    return orbitAngle(orbitHoverIndex);
  }
  if (navHoverIndex >= 0) {
    return orbitAngle(navHoverIndex);
  }
  if (pointerInOrbit) {
    return beamAngleTarget;
  }
  return orbitAngle(selectedIndex);
}

function syncBeamTarget() {
  beamAngleTarget = resolveBeamTargetAngle();
}

function flashNav() {
  osHud.classList.remove('nav-strip--flash');
  void osHud.offsetWidth;
  osHud.classList.add('nav-strip--flash');
  setTimeout(() => osHud.classList.remove('nav-strip--flash'), 180);
}

/** Single source of truth - index drives orbit, top nav, LCD, 3D */
function syncNavigation(index, playSound = false, revealFrame = false) {
  const prev = selectedIndex;
  selectedIndex = wrapIndex(index);
  navHoverIndex = -1;
  orbitHoverIndex = -1;

  if (revealFrame) {
    frameRevealedIndex = selectedIndex;
  }

  const section = SECTIONS[selectedIndex];

  applyStripUI();

  pointerInOrbit = false;
  syncBeamTarget();

  currentFileEl.textContent = section.label;
  fileMetaEl.textContent = `${selectedIndex + 1}/${SECTIONS.length}`;
  lcdStatus.textContent = section.label;

  applyIconTargets();

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
  syncBeamTarget();
  applyIconTargets();

  if (playSound && changed && navHoverIndex >= 0) {
    audio.hover();
  }
}

/** Orbit dial hover - 3D pop, beam snap, nav preview; ▶ stays on selection */
function setOrbitHover(index, playSound = false) {
  if (currentView !== 'browser') {
    orbitHoverIndex = -1;
    applyIconTargets();
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

  syncBeamTarget();
  applyIconTargets();
  applyStripUI();

  if (playSound && changed && orbitHoverIndex >= 0) {
    audio.hover();
  }
}

function selectSection(index, playSound = true) {
  syncNavigation(index, playSound, true);
}

function flashLCD() {
  lcdElement.classList.add('lcd--transitioning');
  setTimeout(() => lcdElement.classList.remove('lcd--transitioning'), 150);
}

function openSection(sectionKey) {
  if (sectionKey === 'about') {
    openAboutIntercom();
    return;
  }

  const data = CONTENT[sectionKey];
  if (!data || currentView !== 'browser' || isTransitioning) return;

  const idx = indexFromKey(sectionKey);
  if (idx !== selectedIndex) {
    syncNavigation(idx, false, true);
  } else {
    navHoverIndex = -1;
    orbitHoverIndex = -1;
    pointerInOrbit = false;
    syncBeamTarget();
    applyIconTargets();
  }

  isTransitioning = true;
  audio.confirm();
  flashLCD();
  flashNav();
  lcdStatus.textContent = 'LOADING';

  setTimeout(() => {
    panelTitle.textContent = SECTIONS[idx].file;
    panelBody.innerHTML = data.html;
    filePanelScrim.classList.add('file-panel-scrim--visible');
    filePanelScrim.setAttribute('aria-hidden', 'false');
    filePanel.classList.add('file-panel--visible');
    osHud.classList.remove('nav-strip--visible');
    lcdStatus.textContent = data.title;
    currentView = 'content';
    animateContentLines(panelBody);
    if (sectionKey === 'contact') initContactPanel(panelBody);
  }, 180);

  setTimeout(() => {
    isTransitioning = false;
  }, 420);
}

function showAboutDockDom() {
  syncAboutDockCamera();
  if (aboutDockEl) {
    aboutDockEl.hidden = false;
    aboutDockEl.setAttribute('aria-hidden', 'false');
    aboutDockEl.classList.add('about-dock--active');
  }
  intercomEl.classList.remove('intercom--power-off');
  intercomEl.hidden = false;
  intercomEl.setAttribute('aria-hidden', 'false');
  intercomEl.classList.add('intercom--active');
  if (aboutBioEl) {
    aboutBioEl.hidden = false;
    aboutBioEl.setAttribute('aria-hidden', 'false');
    aboutBioEl.classList.add('about-bio--active');
  }
}

function beginAboutOpen() {
  clearAboutCloseTimers();
  setAboutPhase('opening');
  aboutState.hubRetreat = 0;
  aboutState.intercomShow = 0;
  rebuildAboutBioForOpen();
  showAboutDockDom();
  startIntercomNoise();
  scheduleBioStreamMaxHeightAfterLayout();
}

function cancelAboutCloseAndResume() {
  clearAboutCloseTimers();
  intercomEl.classList.remove('intercom--power-off');
  isTransitioning = false;
  setAboutPhase(aboutState.intercomShow > 0.95 ? 'open' : 'opening');
  rebuildAboutBioForOpen();
  showAboutDockDom();
  startIntercomNoise();
  scheduleBioStreamMaxHeightAfterLayout();
}

function openAboutIntercom() {
  if (aboutState.phase === 'closing') {
    cancelAboutCloseAndResume();
    return;
  }
  if (aboutPhaseActive()) {
    closeAboutIntercom();
    return;
  }
  if (isTransitioning || currentView !== 'browser') return;

  syncNavigation(indexFromKey('about'), false, true);

  isTransitioning = true;
  audio.confirm();
  flashNav();
  lcdStatus.textContent = 'ABOUT';

  beginAboutOpen();

  aboutCloseTimers.transition = window.setTimeout(() => {
    aboutCloseTimers.transition = null;
    isTransitioning = false;
  }, INTERCOM.transitionMs);
}

function finishAboutClose() {
  clearAboutCloseTimers();
  intercomEl.classList.remove('intercom--power-off', 'intercom--active');
  intercomEl.hidden = true;
  intercomEl.setAttribute('aria-hidden', 'true');
  intercomEl.style.opacity = '';
  intercomEl.style.transform = '';
  if (aboutBioEl) {
    aboutBioEl.classList.remove('about-bio--active');
    aboutBioEl.hidden = true;
    aboutBioEl.setAttribute('aria-hidden', 'true');
    aboutBioEl.style.opacity = '';
    aboutBioEl.style.transform = '';
    aboutBioEl.style.removeProperty('--bio-reveal');
    aboutBioEl.querySelector('.about-bio__stream')?.style.removeProperty('max-height');
  }
  clearBioChunkTimers();
  restoreAboutBioStream();
  bioChunks.length = 0;
  bioTransmissionPrimed = false;
  if (aboutDockEl) {
    aboutDockEl.classList.remove('about-dock--active');
    aboutDockEl.hidden = true;
    aboutDockEl.setAttribute('aria-hidden', 'true');
  }
  aboutState.hubRetreat = 0;
  aboutState.intercomShow = 0;
  setAboutPhase('closed');
  lcdStatus.textContent = SECTIONS[selectedIndex].label;
  isTransitioning = false;
}

function closeAboutIntercom() {
  if (!aboutPhaseActive() || isTransitioning) return;

  isTransitioning = true;
  setAboutPhase('closing');
  audio.cancel();
  flashNav();
  clearBioChunkTimers();
  resetBioTransmission();
  stopIntercomNoise();

  const powerOffMs = prefersReducedMotion ? 320 : INTERCOM.crtPowerOffMs;

  intercomEl.classList.add('intercom--power-off');

  const runFinish = () => {
    if (aboutState.phase !== 'closing') return;
    finishAboutClose();
  };

  if (prefersReducedMotion) {
    aboutCloseTimers.powerOff = window.setTimeout(runFinish, powerOffMs);
    return;
  }

  const bezel = intercomEl.querySelector('.intercom__bezel');
  let closed = false;

  const finishOnce = () => {
    if (closed) return;
    closed = true;
    clearAboutCloseTimers();
    runFinish();
  };

  const onPowerOffEnd = (e) => {
    if (e.target !== bezel || e.animationName !== 'intercom-crt-power-off') return;
    finishOnce();
  };

  if (bezel) {
    aboutCloseBezelListener = { bezel, handler: onPowerOffEnd };
    bezel.addEventListener('animationend', onPowerOffEnd);
  }
  aboutCloseTimers.finish = window.setTimeout(finishOnce, powerOffMs + 80);
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
  navHoverIndex = -1;
  orbitHoverIndex = -1;
  pointerInOrbit = false;
  applyStripUI();
  lcdStatus.textContent = SECTIONS[selectedIndex].label;
  currentFileEl.textContent = SECTIONS[selectedIndex].label;
  fileMetaEl.textContent = `${selectedIndex + 1}/${SECTIONS.length}`;
  syncBeamTarget();
  applyIconTargets();

  setTimeout(() => {
    isTransitioning = false;
  }, 420);
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
  } else if (currentView === 'intercom') {
    if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      closeAboutIntercom();
    }
  }
});

function pickOrbitHoverFromPointer(clientX, clientY) {
  if (isTransitioning || currentView !== 'browser') {
    pointerInOrbit = false;
    return -1;
  }

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

  if (currentView !== 'browser' || isTransitioning) {
    pointerInOrbit = false;
    if (orbitHoverIndex >= 0) setOrbitHover(-1);
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

  if (currentView === 'intercom') {
    if (intercomEl.contains(e.target) || aboutBioEl?.contains(e.target)) return;
    closeAboutIntercom();
    return;
  }

  if (isOverNavStrip(e.clientX, e.clientY)) return;

  if (pickEmblemFromPointer()) {
    triggerEmblemSpin();
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
  const pearlWarm = easeOutCubic(Math.min(1, t / 5.2));

  const targetPanelBlend = currentView === 'content' ? 1 : 0;
  panelBlend += (targetPanelBlend - panelBlend) * (1 - Math.exp(-3.2 * delta));
  const intercomEngage = codecNumeralFade(orbitHubOcclusion());
  const orbitEngage = (1 - panelBlend * 0.92) * Math.max(0.04, intercomEngage);
  orbitRing.material.opacity = 0.28 * Math.max(0.04, intercomEngage);

  const browserHubEnergy = orbitHoverIndex >= 0 ? 1 : 0.78;
  const targetHubEnergy = aboutPhaseActive()
    ? THREE.MathUtils.lerp(0.68, 0.38, easeInOutSine(aboutState.hubRetreat))
    : THREE.MathUtils.lerp(browserHubEnergy, 0.68, panelBlend);
  hubEnergy += (targetHubEnergy - hubEnergy) * (1 - Math.exp(-2.4 * delta));

  const targetAngle = resolveBeamTargetAngle();
  const angleLerp = 1 - Math.exp(-4 * delta);
  beamAngle = lerpAngle(beamAngle, targetAngle, angleLerp);

  const magLerp = 1 - Math.exp(-4.5 * delta);
  const pullAmt = 0.05 * (0.38 + hubEnergy * 0.62) * orbitEngage;
  const magTargetX = Math.cos(beamAngle) * pullAmt;
  const magTargetY = Math.sin(beamAngle) * pullAmt * CONFIG.orbitFlatten;
  const magTargetRoll = Math.sin(beamAngle) * 0.08 * hubEnergy * orbitEngage;
  const magTargetPitch = -Math.cos(beamAngle) * 0.055 * hubEnergy * orbitEngage;
  const magTargetYaw = Math.sin(beamAngle) * 0.042 * hubEnergy * orbitEngage;
  const magTargetZ = pullAmt * 0.5;

  hubMagnetic.x += (magTargetX - hubMagnetic.x) * magLerp;
  hubMagnetic.y += (magTargetY - hubMagnetic.y) * magLerp;
  hubMagnetic.z += (magTargetZ - hubMagnetic.z) * magLerp;
  hubMagnetic.roll += (magTargetRoll - hubMagnetic.roll) * magLerp;
  hubMagnetic.pitch += (magTargetPitch - hubMagnetic.pitch) * magLerp;
  hubMagnetic.yaw += (magTargetYaw - hubMagnetic.yaw) * magLerp;

  const idleSpinRate = 0.055;
  const retreatLerp = 1 - Math.exp(-INTERCOM.retreatRate * delta);
  const intercomInLerp = 1 - Math.exp(-INTERCOM.showInRate * delta);
  const intercomOutLerp = 1 - Math.exp(-INTERCOM.showOutRate * delta);

  if (aboutWantsOpenMotion()) {
    aboutState.hubRetreat += (1 - aboutState.hubRetreat) * retreatLerp;
    const showTarget = easeInOutSine(
      Math.min(1, Math.max(0, (aboutState.hubRetreat - INTERCOM.hubLeadOpen) / (1 - INTERCOM.hubLeadOpen)))
    );
    aboutState.intercomShow += (showTarget - aboutState.intercomShow) * intercomInLerp;
    if (aboutState.phase === 'opening' && aboutState.hubRetreat > 0.992 && aboutState.intercomShow > 0.992) {
      setAboutPhase('open');
      scheduleBioStreamMaxHeight();
    }
  } else {
    aboutState.intercomShow += (0 - aboutState.intercomShow) * intercomOutLerp;
    if (aboutState.intercomShow < INTERCOM.codecReturnGate) {
      aboutState.hubRetreat += (0 - aboutState.hubRetreat) * retreatLerp;
    }
  }

  const hubOcclude = orbitHubOcclusion();
  const emblemShow = 1 - easeInOutSine(hubOcclude);

  if (intercomEl && aboutPhaseActive()) {
    const poweringOff = intercomEl.classList.contains('intercom--power-off');

    if (poweringOff) {
      intercomEl.style.opacity = prefersReducedMotion ? '' : '1';
      if (aboutBioEl && !prefersReducedMotion) aboutBioEl.style.opacity = '1';
    } else {
      const motion = easeInOutSine(aboutState.intercomShow);
      applyDockPanelMotion(intercomEl, motion, t, prefersReducedMotion, 'left');
      applyDockPanelMotion(aboutBioEl, motion, t, prefersReducedMotion, 'right');
      tickBioTransmission(motion);
    }
  }

  let spinProgress = 0;
  if (emblemSpin.active) {
    emblemSpin.elapsed += delta;
    const spinP = Math.min(emblemSpin.elapsed / emblemSpin.duration, 1);
    spinProgress = easeOutCubic(spinP);
    emblemPivot.rotation.y = emblemSpin.startPivotY + spinProgress * emblemSpin.totalSpin;
    emblem.rotation.y = emblemSpin.frozenBaseY + emblemYawOverlay();
    if (spinP >= 1) {
      emblem.rotation.y += emblemPivot.rotation.y;
      emblemPivot.rotation.y = 0;
      settleEmblemSpinDrift(t);
      emblemSpin.active = false;
    }
  } else {
    emblem.rotation.y = emblemDriftYaw(t, idleSpinRate);
  }

  hubGroup.position.set(0, 0, 0);
  emblem.position.set(
    Math.cos(t * 0.24) * 0.025 + hubMagnetic.x,
    Math.sin(t * 0.62) * 0.045 + hubMagnetic.y,
    hubMagnetic.z
  );
  emblemPivot.scale.setScalar(Math.max(0.0001, emblemShow));
  hubGroup.visible = emblemShow > 0.015 && !aboutPhaseActive();
  emblem.rotation.x = Math.sin(t * 0.38) * 0.035 - parallax.y * 0.04 + hubMagnetic.pitch;
  emblem.rotation.z = Math.sin(t * 0.27) * 0.018 + hubMagnetic.roll;

  if (chrome && darkChrome) {
    const motionEnergy = Math.min(
      1,
      hubEnergy * 0.72 + Math.abs(parallax.x) * 0.28 + (orbitHoverIndex >= 0 ? 0.22 : 0) + spinProgress * 0.85
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
    const warmMul = 0.78 + pearlWarm * 0.22;
    chrome.emissiveIntensity = 0.38 * sparklePulse * hubMul * warmMul;
    darkChrome.emissiveIntensity = 0.52 * sparklePulse * hubMul * warmMul;

    if (textures) {
      const { sparkleTexture, emissiveSparkleTexture } = textures;
      sparkleTexture.offset.set(t * 0.011, t * 0.007);
      sparkleTexture.rotation = 0.09 + Math.sin(t * 0.17) * 0.012;
      emissiveSparkleTexture.offset.set(-t * 0.008, t * 0.013);
      emissiveSparkleTexture.rotation = -0.07 + Math.cos(t * 0.13) * 0.01;
    }
  }

  // Save icons - smooth lerp toward selection targets
  saveIcons.forEach(({ group, root, materials, frame, section }, i) => {
    const p = group.userData.phase;
    const bp = group.userData.basePos;
    const v = group.userData.visual;
    const tgt = group.userData.target || { scale: 0.8, opacity: 0.22, zLift: 0 };
    const lerp = 1 - Math.exp(-5 * delta);
    const dim = i === selectedIndex ? 1 - panelBlend * 0.08 : 1 - panelBlend * 0.28;
    const retreat = orbitHubOcclusion();
    const codecFade = codecNumeralFade(retreat);
    const codecPush = 1 + retreat * 0.09;
    const codecScale = 1 - retreat * 0.05;

    v.scale += (tgt.scale - v.scale) * lerp;
    v.opacity += (tgt.opacity - v.opacity) * lerp;
    v.zLift += (tgt.zLift - v.zLift) * lerp;

    root.scale.setScalar(v.scale * ICON_SCALE * codecScale);
    const emissiveBase = [0.16, 0.24];
    const warmOpacity = v.opacity * pearlWarm;
    const warmEmissive = 0.48 + pearlWarm * 0.52;
    const iconOpacity = warmOpacity * dim * codecFade;
    materials.forEach((mat, mi) => {
      if (mat.userData.baseEnv === undefined) mat.userData.baseEnv = mat.envMapIntensity;
      mat.opacity = iconOpacity;
      mat.emissiveIntensity = emissiveBase[mi] * (0.35 + v.opacity * 0.55) * dim * warmEmissive * codecFade;
      mat.envMapIntensity = mat.userData.baseEnv * (0.72 + pearlWarm * 0.28) * (0.65 + codecFade * 0.35);
    });

    group.position.set(
      bp.x * codecPush + Math.sin(t * 0.5 + p) * 0.02,
      bp.y * codecPush + Math.sin(t * 0.7 + p) * 0.03,
      bp.z + v.zLift - retreat * 0.14
    );

    if (frame.visible) {
      frame.material.opacity = codecFade;
      frame.material.transparent = true;
      frame.material.emissiveIntensity = (0.32 + Math.sin(t * 4) * 0.12) * codecFade;
    }
  });

  // Selection beam + hub lighting - eases with panel open/close
  const hubCenter = new THREE.Vector3(0, 0, 0.02);
  const hubGlowPos = new THREE.Vector3(0, 0.1, 0.55);

  const beamTip = orbitPointAtAngle(beamAngle, 0.92);
  if (orbitHoverIndex >= 0 && orbitEngage > 0.05) {
    const iconTip = saveIcons[orbitHoverIndex].group.position.clone().multiplyScalar(0.88);
    beamTip.lerp(iconTip, 0.42 * orbitEngage);
  } else {
    beamTip.z = saveIcons[selectedIndex].group.position.z * 0.35;
  }

  selectionLine.geometry.setFromPoints([hubCenter, beamTip]);

  const onTarget = orbitHoverIndex >= 0 || !pointerInOrbit;
  const beamOpacity = (onTarget
    ? 0.28 + 0.34 * beamPulse * hubEnergy
    : 0.18 + 0.22 * beamPulse) * orbitEngage;
  selectionLine.material.opacity = beamOpacity;
  selectionLine.visible = orbitEngage > 0.02;

  hubSpotlight.position.set(
    Math.cos(beamAngle) * 0.07,
    Math.sin(beamAngle) * 0.07 * CONFIG.orbitFlatten + 0.06,
    0.36 + hubMagnetic.z * 0.4
  );

  const spotBrowser = 0.62 + 0.48 * beamPulse + hubEnergy * 1.2;
  const spotContent = 0.56 + 0.28 * beamPulse + hubEnergy * 0.72;
  hubSpotlight.intensity = THREE.MathUtils.lerp(spotContent, spotBrowser, orbitEngage);

  const accentBrowser = 0.28 + hubEnergy * (1.1 + beamPulse * 0.4);
  const accentContent = 0.22 + hubEnergy * 0.55;
  hubAccentLight.intensity = THREE.MathUtils.lerp(accentContent, accentBrowser, orbitEngage);

  const tealKeyBrowser = 1.12 + hubEnergy * 0.52 + beamPulse * 0.2;
  const tealKeyContent = 0.98 + hubEnergy * 0.28;
  hubTealKey.intensity = THREE.MathUtils.lerp(tealKeyContent, tealKeyBrowser, orbitEngage);

  const pinkBrowser = 0.88 + hubEnergy * 0.45 + beamPulse * 0.18;
  const pinkContent = 0.76 + hubEnergy * 0.22;
  hubPinkRim.intensity = THREE.MathUtils.lerp(pinkContent, pinkBrowser, orbitEngage);

  hubTealRim.intensity = THREE.MathUtils.lerp(0.66 + hubEnergy * 0.18, 0.78 + hubEnergy * 0.38, orbitEngage);
  hubChromaRim.intensity = THREE.MathUtils.lerp(0.44 + hubEnergy * 0.14, 0.52 + hubEnergy * 0.28, orbitEngage);
  hubPurpleFill.intensity = THREE.MathUtils.lerp(0.4 + hubEnergy * 0.12, 0.48 + hubEnergy * 0.22, orbitEngage);

  const glowOrbit = orbitPointAtAngle(beamAngle, 0.14);
  const glowTarget = orbitHoverIndex >= 0
    ? hubGlowPos
    : new THREE.Vector3(glowOrbit.x, glowOrbit.y + 0.1, 0.58);
  tealGlow.position.lerp(glowTarget, orbitHoverIndex >= 0 ? 0.12 : 0.08);
  const glowBrowser = 0.48 + 0.24 * beamPulse + hubEnergy * 0.5;
  const glowContent = 0.4 + 0.14 * beamPulse + hubEnergy * 0.28;
  tealGlow.intensity = THREE.MathUtils.lerp(glowContent, glowBrowser, orbitEngage);

  const spiralFade = 1 - easeInOutSine(Math.min(1, aboutState.hubRetreat * 1.15));
  biosSpiral.material.opacity = 0.22 * spiralFade;
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
  if (aboutPhaseActive()) scheduleBioStreamMaxHeight();
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
