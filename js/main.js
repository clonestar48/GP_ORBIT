/**
 * VMU Portfolio - File Browser
 *
 * Late-90s file manager aesthetic: floating save icons in 3D space,
 * small GP emblem hub as cursor, dark BIOS atmosphere.
 */

import * as THREE from '../assets/vendor/three.module.js';
import { CONTENT, initContactPanel } from './content.js';
import { audio } from './audio.js';
import { buildGPEmblem, createPearlMaterialSet, tickPearlMaterialShader } from './emblem.js';
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
  /** Vertical inset - elliptical orbit clears top/bottom nav strips (lower = flatter/wider) */
  orbitFlatten: 0.58,
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

/** Shared nav/orbit visual easing (~0.5s settle) */
const NAV_SYNC_LERP = 6;
const NAV_BEAM_LERP = 5;
const GEM_FRAME_OPACITY = 1;

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

const INNER_OVAL_OPACITY = 0.131;

function addDashboardSegment(group, mat, a, b) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([a, b]),
    mat
  );
  line.renderOrder = -2;
  group.add(line);
}

/** Sparse reticle ticks, center pip, and sub-scales inside the master oval */
function addOvalDashboardMarks(group, mat, masterR, flat, z) {
  const majorLen = masterR * 0.052;
  const minorLen = masterR * 0.03;
  const majorT = [0.5, 1];
  const minorT = [0.25, 0.75];

  const hTick = (x, len) => {
    addDashboardSegment(group, mat,
      new THREE.Vector3(x, -len, z),
      new THREE.Vector3(x, len, z));
  };
  const vTick = (y, len) => {
    addDashboardSegment(group, mat,
      new THREE.Vector3(-len, y, z),
      new THREE.Vector3(len, y, z));
  };

  for (const t of minorT) {
    hTick(t * masterR, minorLen);
    hTick(-t * masterR, minorLen);
    vTick(t * masterR * flat, minorLen);
    vTick(-t * masterR * flat, minorLen);
  }
  for (const t of majorT) {
    hTick(t * masterR, majorLen);
    hTick(-t * masterR, majorLen);
    vTick(t * masterR * flat, majorLen);
    vTick(-t * masterR * flat, majorLen);
  }

  const subTick = minorLen * 0.45;
  const subLines = [
    { y: -0.4, half: 0.24 },
    { y: -0.56, half: 0.15 },
  ];
  for (const { y, half } of subLines) {
    const yw = y * masterR * flat;
    const xw = half * masterR;
    addDashboardSegment(group, mat,
      new THREE.Vector3(-xw, yw, z),
      new THREE.Vector3(xw, yw, z));
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const x = (i / 2) * xw;
      addDashboardSegment(group, mat,
        new THREE.Vector3(x, yw - subTick, z),
        new THREE.Vector3(x, yw + subTick, z));
    }
  }

  const pipGeo = new THREE.BufferGeometry();
  pipGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, z], 3));
  const pip = new THREE.Points(pipGeo, new THREE.PointsMaterial({
    color: CONFIG.colors.teal,
    size: 0.012,
    transparent: true,
    opacity: INNER_OVAL_OPACITY,
    sizeAttenuation: true,
    depthWrite: false,
  }));
  pip.renderOrder = -2;
  group.add(pip);
  group.userData.dotMaterial = pip.material;
}

/** Seven inner ovals + master torus — even steps from hub to master */
function createBIOSSpiral(ringCount = 7, segmentsPerRing = 96) {
  const flat = CONFIG.orbitFlatten;
  const masterR = CONFIG.orbitRadius;
  const step = masterR / (ringCount + 1);
  const r1 = step * 1.15;
  const ringGap = (masterR - r1) / ringCount;
  const mat = new THREE.LineBasicMaterial({
    color: CONFIG.colors.teal,
    transparent: true,
    opacity: INNER_OVAL_OPACITY,
    depthWrite: false,
  });
  const group = new THREE.Group();
  const ringZ = -0.14;

  for (let ring = 0; ring < ringCount; ring++) {
    const r = r1 + ringGap * ring;
    const points = [];
    for (let i = 0; i <= segmentsPerRing; i++) {
      const angle = (i / segmentsPerRing) * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(angle) * r,
        Math.sin(angle) * r * flat,
        ringZ
      ));
    }
    const ovalLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      mat
    );
    ovalLine.renderOrder = -2;
    group.add(ovalLine);
  }

  const xAxisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-masterR, 0, ringZ),
    new THREE.Vector3(masterR, 0, ringZ),
  ]);
  const yAxisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -masterR * flat, ringZ),
    new THREE.Vector3(0, masterR * flat, ringZ),
  ]);
  const xAxis = new THREE.Line(xAxisGeo, mat);
  const yAxis = new THREE.Line(yAxisGeo, mat);
  xAxis.renderOrder = -2;
  yAxis.renderOrder = -2;
  group.add(xAxis);
  group.add(yAxis);
  addOvalDashboardMarks(group, mat, masterR, flat, ringZ);

  group.renderOrder = -2;
  group.userData.ringMaterial = mat;
  group.userData.baseOpacity = INNER_OVAL_OPACITY;
  return group;
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
const EMBLEM_RENDER_ORDER = 12;
emblem.traverse((obj) => {
  if (obj.isMesh) {
    obj.layers.set(EMBLEM_LAYER);
    obj.renderOrder = EMBLEM_RENDER_ORDER;
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

function orbitIndexWithHysteresis(angle, currentIndex) {
  const candidate = nearestOrbitIndex(angle);
  if (currentIndex < 0 || candidate === currentIndex) return candidate;

  const toCurrent = Math.abs(normalizeAngle(angle - orbitAngle(currentIndex)));
  const toCandidate = Math.abs(normalizeAngle(angle - orbitAngle(candidate)));
  if (toCandidate >= toCurrent * 0.92) return currentIndex;
  return candidate;
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
  group.userData.frameOpacity = 0;
  group.userData.frameTarget = 0;
  group.renderOrder = 6;
  root.traverse((obj) => {
    if (obj.isMesh) obj.renderOrder = 6;
  });

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
orbitRing.renderOrder = 1;
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
  const tick = new THREE.Line(
    tickGeo,
    new THREE.LineBasicMaterial({
      color: CONFIG.colors.teal,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    })
  );
  tick.renderOrder = 1;
  clockTicks.add(tick);
}
clockTicks.renderOrder = 1;
worldGroup.add(clockTicks);

const biosSpiral = createBIOSSpiral();
worldGroup.add(biosSpiral);

// ---------------------------------------------------------------------------
// Atmosphere
// ---------------------------------------------------------------------------

/** Random point inside the orbit ellipse (fills the center oval, not a horizontal strip) */
function sampleOrbitEllipsePosition(orbitR, shellMin = 0.38, shellMax = 1.22) {
  const flat = CONFIG.orbitFlatten;
  const theta = Math.random() * Math.PI * 2;
  const shell = shellMin + Math.random() * (shellMax - shellMin);
  const r = orbitR * shell * Math.sqrt(Math.random());
  return [
    Math.cos(theta) * r,
    Math.sin(theta) * r * flat,
    Math.sin(theta) * r * 0.22 - 0.55 - Math.random() * 1.5,
  ];
}

/** Ring just outside the orbit oval */
function sampleOutsideOrbitPosition(orbitR) {
  const flat = CONFIG.orbitFlatten;
  const theta = Math.random() * Math.PI * 2;
  const inner = orbitR * 1.2;
  const outer = orbitR * (2.05 + Math.random() * 0.95);
  const r = inner + Math.random() * (outer - inner);
  return [
    Math.cos(theta) * r,
    Math.sin(theta) * r * flat,
    -0.35 - Math.random() * 2.4,
  ];
}

/** Scatter above/below and beside the oval (viewport periphery) */
function samplePeripheralStarPosition(orbitR) {
  const flat = CONFIG.orbitFlatten;
  const axis = Math.random();
  if (axis < 0.42) {
    const x = (Math.random() - 0.5) * orbitR * 2.6;
    const sign = Math.random() < 0.5 ? 1 : -1;
    const y = sign * orbitR * flat * (1.05 + Math.random() * 1.35);
    return [x, y, -0.6 - Math.random() * 2.2];
  }
  const y = (Math.random() - 0.5) * orbitR * flat * 1.8;
  const sign = Math.random() < 0.5 ? 1 : -1;
  const x = sign * orbitR * (1.15 + Math.random() * 1.5);
  return [x, y, -0.6 - Math.random() * 2.2];
}

/** Pin-point star field — distant shell + orbital disk + rare twinkles */
function createStarField(count = 280) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const phases = new Float32Array(count);
  const twinkle = new Float32Array(count);
  const orbitR = CONFIG.orbitRadius;

  for (let i = 0; i < count; i++) {
    let x;
    let y;
    let z;
    const band = Math.random();
    if (band < 0.2) {
      const theta = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 4.8;
      x = Math.cos(theta) * r;
      y = Math.sin(theta) * r * CONFIG.orbitFlatten;
      z = -2.4 - Math.random() * 3.8;
    } else if (band < 0.44) {
      [x, y, z] = sampleOrbitEllipsePosition(orbitR, 0.35, 1.15);
    } else if (band < 0.96) {
      [x, y, z] = Math.random() < 0.62
        ? sampleOutsideOrbitPosition(orbitR)
        : samplePeripheralStarPosition(orbitR);
    } else {
      [x, y, z] = sampleOrbitEllipsePosition(orbitR, 0.2, 0.95);
      z = 0.12 + Math.random() * 0.85;
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const isTwinkle = Math.random() < 0.0225;
    twinkle[i] = isTwinkle ? 1 : 0;
    phases[i] = Math.random() * Math.PI * 2;
    if (isTwinkle) {
      sizes[i] = 1.05 + Math.random() * 0.45;
      brightness[i] = 0.72 + Math.random() * 0.28;
    } else if (band < 0.2) {
      sizes[i] = 0.6 + Math.random() * 0.5;
      brightness[i] = 0.32 + Math.random() * 0.36;
    } else if (band < 0.96) {
      sizes[i] = 0.65 + Math.random() * 0.48;
      brightness[i] = band < 0.44
        ? 0.42 + Math.random() * 0.42
        : 0.28 + Math.random() * 0.32;
    } else {
      sizes[i] = 0.7 + Math.random() * 0.55;
      brightness[i] = 0.42 + Math.random() * 0.42;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkle, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uOpacity: { value: 0.72 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aBrightness;
      attribute float phase;
      attribute float aTwinkle;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vBrightness;
      void main() {
        float wave = 0.5 + 0.5 * sin(uTime * (0.5 + aTwinkle * 0.85) + phase);
        float pulse = mix(1.0, 0.38 + 0.62 * pow(wave, 2.4), aTwinkle);
        vBrightness = aBrightness * pulse;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float px = (1.05 + aSize * 1.75) * uPixelRatio;
        float atten = 7.0 / max(-mvPosition.z, 2.0);
        gl_PointSize = min(px * atten, 15.0 * uPixelRatio);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vBrightness;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        float core = 1.0 - smoothstep(0.0, 0.16, d);
        float halo = 1.0 - smoothstep(0.16, 0.5, d);
        float alpha = (core * 0.95 + halo * 0.18) * vBrightness * uOpacity;
        if (alpha < 0.025) discard;
        vec3 col = mix(vec3(0.34, 0.58, 0.55), vec3(0.82, 0.96, 0.93), core);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -2;
  return points;
}

const starField = createStarField();
worldGroup.add(starField);

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
const orbitLabelsEl = document.getElementById('orbit-labels');
const navFlyawayZone = document.getElementById('nav-flyaway-zone');
const navFlyawayTrigger = document.getElementById('nav-flyaway-trigger');

/** Match .nav-flyaway-trigger::before hit pad in css/styles.css */
const FLYAWAY_HIT_PAD = { top: 8, right: 8, bottom: 24, left: 32 };
const ORBIT_LABEL_OFFSET_Y = 28;
/** Bottom quadrant slots (ABOUT, CONTACT) — keep labels above footer chrome */
const ORBIT_LABEL_OFFSET_Y_BOTTOM = 12;
const ORBIT_LABEL_BOTTOM_CLEAR = 56;
/** Hover scale — phase 2 only, after reticle pairs with label */
const ORBIT_HOVER_SCALE_MAX = 0.3;
/** Phase 1 — beam/reticle catch-up to the word */
const ORBIT_LOCK_TRACK_RATE = 7.5;
/** Phase 2 — ~1.86s to ~95% once paired */
const ORBIT_EXPAND_IN_S = 1.86;
const ORBIT_EXPAND_IN_RATE = 3 / ORBIT_EXPAND_IN_S;
const ORBIT_EXPAND_OUT_RATE = 10;
const ORBIT_LOCK_PAIRED = 0.97;
/** Flyaway nav — inset from oval top + compressed span (CONTACT stays at midline) */
const FLYAWAY_TOP_INSET = 0.35;
const FLYAWAY_SPAN_SCALE = 0.65;
const FLYAWAY_IDLE_MS = 5000;

/** Build nav item button for the top strip */
function buildNavItem(section, index) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'nav-strip__item';
  el.dataset.section = section.key;
  el.dataset.index = String(index);
  el.innerHTML = `<span class="nav-strip__label">${section.label}</span>`;
  return el;
}

function buildNavStrips() {
  osHud.replaceChildren();
  SECTIONS.forEach((section, index) => {
    osHud.appendChild(buildNavItem(section, index));
  });
}

function buildOrbitLabels() {
  if (!orbitLabelsEl) return;
  orbitLabelsEl.replaceChildren();
  SECTIONS.forEach((section, index) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'orbit-label';
    el.dataset.section = section.key;
    el.dataset.index = String(index);
    el.innerHTML = `<span class="orbit-label__text">${section.label}</span>`;
    el.addEventListener('mouseenter', () => audio.unlock());
    el.addEventListener('click', () => {
      audio.unlock();
      if (currentView !== 'browser') return;
      openSection(section.key);
    });
    orbitLabelsEl.appendChild(el);
  });
}

buildNavStrips();
buildOrbitLabels();

const topItems = [...osHud.querySelectorAll('.nav-strip__item')];
const orbitLabelItems = orbitLabelsEl
  ? [...orbitLabelsEl.querySelectorAll('.orbit-label')]
  : [];

const orbitNavBox = new THREE.Box3();
const orbitNavCenter = new THREE.Vector3();
const flyawayLayoutProj = new THREE.Vector3();
const orbitLockBeamTip = new THREE.Vector3();
const orbitLabelWorld = new THREE.Vector3();
let orbitLockBeamActive = false;

function screenPointOnOrbitPlane(screenX, screenY, out = new THREE.Vector3()) {
  pointer.x = (screenX / window.innerWidth) * 2 - 1;
  pointer.y = -(screenY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(orbitPlane, orbitHit)) {
    return out.copy(orbitHit);
  }
  return null;
}

function getOrbitLabelWorldPoint(index, out = orbitLabelWorld) {
  const iconTip = saveIcons[index].group.position.clone().multiplyScalar(0.88);
  const labelEl = orbitLabelItems[index];
  if (!labelEl) return out.copy(iconTip);
  const rect = labelEl.getBoundingClientRect();
  const hit = screenPointOnOrbitPlane(
    rect.left + rect.width * 0.5,
    rect.top + rect.height * 0.5,
    out,
  );
  return hit ? out : out.copy(iconTip);
}

function projectWorldPointToScreen(x, y, z = 0) {
  flyawayLayoutProj.set(x, y, z).project(camera);
  return {
    x: (flyawayLayoutProj.x * 0.5 + 0.5) * window.innerWidth,
    y: (-flyawayLayoutProj.y * 0.5 + 0.5) * window.innerHeight,
  };
}

/** Flyaway links — WORK lower in oval, CONTACT at midline, 35% tighter span */
function syncFlyawayNavLayout() {
  if (!isIntroComplete || (currentView !== 'browser' && currentView !== 'content')) return;

  const r = CONFIG.orbitRadius;
  const flat = CONFIG.orbitFlatten;
  const halfSpan = r * flat;
  const topWorldY = halfSpan * (1 - FLYAWAY_TOP_INSET);
  const bottomWorldY = topWorldY - halfSpan * FLYAWAY_SPAN_SCALE;

  const top = projectWorldPointToScreen(0, topWorldY, 0);
  const bottom = projectWorldPointToScreen(0, bottomWorldY, 0);
  const topY = Math.min(top.y, bottom.y);
  const bottomY = Math.max(top.y, bottom.y);
  const height = Math.max(56, bottomY - topY);

  osHud.style.top = `${Math.round(topY)}px`;
  osHud.style.height = `${Math.round(height)}px`;
}

function projectIconScreenCenter(root) {
  orbitNavBox.setFromObject(root);
  orbitNavBox.getCenter(orbitNavCenter);
  orbitNavCenter.applyMatrix4(root.matrixWorld);
  orbitNavCenter.project(camera);
  return {
    x: (orbitNavCenter.x * 0.5 + 0.5) * window.innerWidth,
    y: (-orbitNavCenter.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function orbitLabelScreenTop(iconScreenY, slotIndex) {
  const angle = orbitAngle(slotIndex);
  const isBottomHalf = Math.sin(angle) < -0.2;
  const offsetY = isBottomHalf ? ORBIT_LABEL_OFFSET_Y_BOTTOM : ORBIT_LABEL_OFFSET_Y;
  return Math.min(iconScreenY + offsetY, window.innerHeight - ORBIT_LABEL_BOTTOM_CLEAR);
}

/** Pin labels under each orbit icon — follows 3D projection each frame */
function syncOrbitLabelPositions() {
  if (!orbitLabelsEl || !orbitLabelItems.length) return;

  if (!isIntroComplete || currentView !== 'browser' || !saveIcons.length) {
    orbitLabelsEl.classList.remove('orbit-labels--visible');
    return;
  }

  const codecFade = codecNumeralFade(orbitHubOcclusion());
  orbitLabelsEl.classList.toggle('orbit-labels--visible', codecFade > 0.02);
  orbitLabelsEl.style.opacity = String(codecFade);

  saveIcons.forEach(({ root }, i) => {
    const el = orbitLabelItems[i];
    if (!el) return;
    const { x, y } = projectIconScreenCenter(root);
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(orbitLabelScreenTop(y, i))}px`;
  });
}

function applyOrbitLabelUI() {
  const previewIdx = getPreviewIndex();
  orbitLabelItems.forEach((el, i) => {
    const isSelected = selectedIndex >= 0 && i === selectedIndex;
    const isPreview = previewIdx === i;
    el.classList.toggle('orbit-label--selected', isSelected);
    el.classList.toggle('orbit-label--hover', isPreview);
    el.classList.toggle('orbit-label--engaged', isSelected || isPreview);
  });
}

function isInFlyawayActivateZone(clientX, clientY) {
  if (!navFlyawayTrigger || navFlyawayTrigger.hidden) return false;
  const rect = navFlyawayTrigger.getBoundingClientRect();
  const { top, right, bottom, left } = FLYAWAY_HIT_PAD;
  return clientX >= rect.left - left
    && clientX <= rect.right + right
    && clientY >= rect.top - top
    && clientY <= rect.bottom + bottom;
}

function isOverNavStrip(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  return el != null && osHud.contains(el);
}

function pickOrbitLabelIndex(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!(el instanceof Element) || !orbitLabelsEl?.contains(el)) return -1;
  const btn = el.closest('.orbit-label');
  if (!btn) return -1;
  const i = Number(btn.dataset.index);
  return Number.isNaN(i) ? -1 : i;
}

let reticleActiveIndex = -1;
let reticleLockProgress = 0;
let orbitHoverScale = 0;

/** Orbit-only label lock — drives reticle + shared 3D beam tip (not flyaway) */
function updateReticleState(delta) {
  const hoverIdx = (currentView === 'browser' && isIntroComplete && !isTransitioning)
    ? orbitHoverIndex
    : -1;

  if (hoverIdx >= 0 && hoverIdx !== reticleActiveIndex) {
    reticleActiveIndex = hoverIdx;
    reticleLockProgress = 0;
    orbitHoverScale = 0;
  }

  const targetProgress = hoverIdx >= 0 ? 1 : 0;
  const lockRate = targetProgress > reticleLockProgress
    ? ORBIT_LOCK_TRACK_RATE
    : ORBIT_EXPAND_OUT_RATE;
  const lockLerp = prefersReducedMotion ? 1 : (1 - Math.exp(-lockRate * delta));
  reticleLockProgress += (targetProgress - reticleLockProgress) * lockLerp;

  const isPaired = hoverIdx >= 0 && reticleLockProgress >= ORBIT_LOCK_PAIRED;
  const scaleTarget = isPaired ? 1 : 0;
  const scaleRate = scaleTarget > orbitHoverScale
    ? ORBIT_EXPAND_IN_RATE
    : ORBIT_EXPAND_OUT_RATE;
  const scaleLerp = prefersReducedMotion ? 1 : (1 - Math.exp(-scaleRate * delta));
  orbitHoverScale += (scaleTarget - orbitHoverScale) * scaleLerp;

  orbitLockBeamActive = false;

  if (reticleLockProgress < 0.012 && hoverIdx < 0) {
    reticleActiveIndex = -1;
    applyOrbitLabelScale(-1);
    window.__vmuReticleState = { active: false, progress: 0 };
    return;
  }

  const idx = reticleActiveIndex;
  if (idx < 0 || !saveIcons[idx]) {
    applyOrbitLabelScale(-1);
    window.__vmuReticleState = { active: false, progress: reticleLockProgress };
    return;
  }

  const iconTip = saveIcons[idx].group.position.clone().multiplyScalar(0.88);
  getOrbitLabelWorldPoint(idx, orbitLabelWorld);
  const lockBlend = easeOutCubic(reticleLockProgress);
  orbitLockBeamTip.copy(iconTip).lerp(orbitLabelWorld, lockBlend);
  orbitLockBeamActive = true;

  const tipScreen = projectWorldPointToScreen(
    orbitLockBeamTip.x,
    orbitLockBeamTip.y,
    orbitLockBeamTip.z,
  );

  let x = tipScreen.x;
  let y = tipScreen.y;
  let frameW = 72;
  let frameH = 22;

  const labelEl = orbitLabelItems[idx];
  if (labelEl) {
    const rect = labelEl.getBoundingClientRect();
    if (rect.width > 0) {
      const labelCx = rect.left + rect.width * 0.5;
      const labelCy = rect.top + rect.height * 0.5;
      frameW = Math.max(56, Math.round(rect.width + 24));
      frameH = Math.max(20, Math.round(rect.height + 14));
      const settle = Math.min(1, Math.max(0, (lockBlend - 0.55) / 0.45));
      x = tipScreen.x + (labelCx - tipScreen.x) * settle;
      y = tipScreen.y + (labelCy - tipScreen.y) * settle;
    }
  }

  const pairedScale = 1 + ORBIT_HOVER_SCALE_MAX * orbitHoverScale;
  applyOrbitLabelScale(idx, pairedScale);

  window.__vmuReticleState = {
    active: true,
    progress: reticleLockProgress,
    hoverScale: pairedScale,
    x,
    y,
    frameW,
    frameH,
  };
}

/** JS-driven scale keeps label + reticle in lockstep (phase 2 only) */
function applyOrbitLabelScale(activeIdx, scale = 1) {
  orbitLabelItems.forEach((el, i) => {
    el.style.setProperty('--label-scale', i === activeIdx ? scale : 1);
  });
}

/** Closest flyaway slot while pointer is over the corner strip */
function pickNavIndexFromPointer(clientX, clientY) {
  if (!isOverNavStrip(clientX, clientY)) return -1;

  let best = -1;
  let bestDist = Infinity;
  topItems.forEach((el) => {
    const i = Number(el.dataset.index);
    if (Number.isNaN(i)) return;
    const rect = el.getBoundingClientRect();
    const cy = rect.top + rect.height * 0.5;
    const dist = Math.abs(clientY - cy);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

/** Active preview — orbit / icon labels primary; corner nav when visible */
function getPreviewIndex() {
  if (currentView !== 'browser') return -1;
  if (orbitHoverIndex >= 0) return orbitHoverIndex;
  if (navHoverIndex >= 0 && osHud.classList.contains('nav-strip--visible')) return navHoverIndex;
  return -1;
}

function syncPreviewState() {
  syncBeamTarget();
  applyIconTargets();
  applyStripUI();
  applyOrbitLabelUI();
}

/** Click / hover handlers for top nav */
function bindNavStripItem(btn) {
  const idx = Number(btn.dataset.index);

  btn.addEventListener('mouseenter', () => audio.unlock());
  btn.addEventListener('click', () => {
    audio.unlock();
    if (currentView !== 'browser') return;
    openSection(SECTIONS[idx].key);
  });
}

topItems.forEach(bindNavStripItem);

// ---------------------------------------------------------------------------
// Corner flyaway nav — explicit trigger only; yields to orbit lock-on
// ---------------------------------------------------------------------------

let navRetracted = false;
let navCornerEngaged = false;
let navFlyawayPinned = false;
let flyawayIdleTimer = null;

function isFlyawayEngaged(clientX, clientY) {
  return isOverFlyawayUI(clientX, clientY);
}

function orbitNavHasFocus() {
  return orbitHoverIndex >= 0 || reticleLockProgress > 0.08;
}

function clearFlyawayIdleTimer() {
  if (flyawayIdleTimer != null) {
    clearTimeout(flyawayIdleTimer);
    flyawayIdleTimer = null;
  }
}

function scheduleFlyawayIdle() {
  clearFlyawayIdleTimer();
  if (navFlyawayPinned || currentView !== 'browser') return;
  if (!osHud.classList.contains('nav-strip--visible')) return;

  flyawayIdleTimer = window.setTimeout(() => {
    flyawayIdleTimer = null;
    if (navFlyawayPinned || currentView !== 'browser') return;
    if (isFlyawayEngaged(lastPointer.x, lastPointer.y)) {
      scheduleFlyawayIdle();
      return;
    }
    navCornerEngaged = false;
    hideFlyawayNav(true);
  }, FLYAWAY_IDLE_MS);
}

function isOverFlyawayUI(clientX, clientY) {
  if (isInFlyawayActivateZone(clientX, clientY)) return true;
  if (isOverNavStrip(clientX, clientY)) return true;
  const el = document.elementFromPoint(clientX, clientY);
  return el instanceof Node && navFlyawayTrigger?.contains(el);
}

function navBarIsPinned() {
  if (navFlyawayPinned) return true;
  return isOverFlyawayUI(lastPointer.x, lastPointer.y)
    || (osHud.matches(':hover') ?? false)
    || (navFlyawayTrigger?.matches(':hover') ?? false);
}

function navIsPointerEngaged() {
  return orbitHoverIndex >= 0 || navHoverIndex >= 0 || navBarIsPinned();
}

function updateFlyawayTriggerVisibility() {
  if (!navFlyawayTrigger) return;
  const show = isIntroComplete && (currentView === 'browser' || currentView === 'content');
  navFlyawayTrigger.hidden = !show;
  navFlyawayTrigger.setAttribute(
    'aria-expanded',
    (navFlyawayPinned || osHud.classList.contains('nav-strip--visible')) ? 'true' : 'false',
  );
  navFlyawayTrigger.classList.toggle('nav-flyaway-trigger--pinned', navFlyawayPinned);
}

function navStripShouldShow() {
  if (currentView === 'content' && selectedIndex >= 0) return true;
  if (currentView !== 'browser') return false;
  if (orbitNavHasFocus() && !navFlyawayPinned) return false;
  return navFlyawayPinned || navCornerEngaged || navBarIsPinned();
}

function updateNavStripVisibility() {
  const show = navStripShouldShow();
  osHud.classList.toggle('nav-strip--visible', show);
  if (!show) {
    navRetracted = false;
    osHud.classList.remove('nav-strip--retracted');
  }
  updateFlyawayTriggerVisibility();
}

function setNavRetracted(retracted) {
  if (!osHud.classList.contains('nav-strip--visible')) {
    navRetracted = false;
    osHud.classList.remove('nav-strip--retracted');
    return;
  }
  if (retracted && navBarIsPinned()) return;
  navRetracted = retracted;
  osHud.classList.toggle('nav-strip--retracted', retracted);
}

function revealNav() {
  if (orbitNavHasFocus() && !navFlyawayPinned) return;
  navCornerEngaged = true;
  setNavRetracted(false);
  updateNavStripVisibility();
  if (!navFlyawayPinned) scheduleFlyawayIdle();
}

function hideFlyawayNav(force = false) {
  clearFlyawayIdleTimer();
  if (currentView === 'content') return;
  if (!force && navFlyawayPinned) return;
  if (!force && isOverFlyawayUI(lastPointer.x, lastPointer.y)) return;
  navCornerEngaged = false;
  navRetracted = false;
  osHud.classList.remove('nav-strip--retracted');
  if (navHoverIndex >= 0) setNavHover(-1);
  updateNavStripVisibility();
}

function toggleFlyawayPinned() {
  if (navFlyawayPinned) {
    unpinFlyaway();
    return;
  }
  navFlyawayPinned = true;
  clearFlyawayIdleTimer();
  revealNav();
  updateFlyawayTriggerVisibility();
}

function isActivelyHoveredOrbitTarget(clientX, clientY) {
  if (orbitHoverIndex < 0) return false;
  const iconPick = pickSaveIconIndex(clientX, clientY);
  if (iconPick === orbitHoverIndex) return true;
  return pickOrbitLabelIndex(clientX, clientY) === orbitHoverIndex;
}

/** Clicks here keep flyaway pinned — nav links, trigger, active orbit icon/label */
function isFlyawayPinSafeTarget(clientX, clientY, target) {
  if (!(target instanceof Node)) return false;
  if (osHud.contains(target)) return true;
  if (navFlyawayTrigger?.contains(target)) return true;
  return isActivelyHoveredOrbitTarget(clientX, clientY);
}

function unpinFlyaway() {
  if (!navFlyawayPinned) return;
  navFlyawayPinned = false;
  navCornerEngaged = false;
  updateFlyawayTriggerVisibility();
  hideFlyawayNav(true);
}

function tryUnpinFlyawayFromClick(clientX, clientY, target) {
  if (!navFlyawayPinned || currentView !== 'browser' || isTransitioning) return;
  if (isFlyawayPinSafeTarget(clientX, clientY, target)) return;
  unpinFlyaway();
}

if (navFlyawayTrigger) {
  navFlyawayTrigger.addEventListener('mouseenter', () => {
    if (orbitNavHasFocus()) return;
    audio.unlock();
    revealNav();
  });
  navFlyawayTrigger.addEventListener('focus', revealNav);
  navFlyawayTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    audio.unlock();
    toggleFlyawayPinned();
  });
  navFlyawayTrigger.addEventListener('pointerdown', (e) => e.stopPropagation());
}

osHud.addEventListener('mouseenter', revealNav);

let selectedIndex = -1;
/** Top nav hover — driven from pointer position over strip */
let navHoverIndex = -1;
/** Orbit dial hover — driven from 3D pick */
let orbitHoverIndex = -1;
let beamAngle = orbitAngle(0);
let beamAngleTarget = beamAngle;
let pointerInOrbit = false;
const lastPointer = { x: 0, y: 0 };

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
  if (selectedIndex < 0) {
    selectSection(delta > 0 ? 0 : SECTIONS.length - 1);
    return;
  }
  selectSection(selectedIndex + delta);
}

function setBrowserIdleLabels() {
  if (currentView !== 'browser') return;
  lcdStatus.textContent = 'VMU';
  currentFileEl.textContent = '—';
  fileMetaEl.textContent = `—/${SECTIONS.length}`;
}

function refreshBrowserReadout() {
  if (currentView !== 'browser') return;
  const previewIdx = getPreviewIndex();
  if (previewIdx >= 0) {
    const preview = SECTIONS[previewIdx];
    currentFileEl.textContent = preview.label;
    fileMetaEl.textContent = `${previewIdx + 1}/${SECTIONS.length}`;
    lcdStatus.textContent = preview.label;
  } else if (selectedIndex >= 0) {
    const section = SECTIONS[selectedIndex];
    currentFileEl.textContent = section.label;
    fileMetaEl.textContent = `${selectedIndex + 1}/${SECTIONS.length}`;
    lcdStatus.textContent = section.label;
  } else {
    setBrowserIdleLabels();
  }
}

/** Index from section key */
function indexFromKey(key) {
  return SECTIONS.findIndex((s) => s.key === key);
}

/** Top nav - selection (▶) + preview from nav bar or orbit dial */
function applyStripUI() {
  const pointerEngaged = navIsPointerEngaged();
  const selIdx = selectedIndex;
  const previewIdx = getPreviewIndex();

  topItems.forEach((el) => {
    const i = Number(el.dataset.index);
    if (Number.isNaN(i)) return;
    const isSelected = selIdx >= 0 && i === selIdx;
    const isPreview = pointerEngaged && previewIdx >= 0 && i === previewIdx && !isSelected;
    el.classList.toggle('nav-strip__item--selected', isSelected);
    el.classList.toggle('nav-strip__item--hover', isPreview);
  });
  updateNavStripVisibility();
  if (currentView === 'browser') refreshBrowserReadout();
}

/** 3D orbit icons - selection and nav/orbit preview (stable through panel open/close) */
function applyIconTargets() {
  const previewIdx = getPreviewIndex();

  saveIcons.forEach(({ group }, i) => {
    const previewed = previewIdx === i;
    const selected = selectedIndex >= 0 && i === selectedIndex;

    group.userData.frameTarget = previewed || selected ? 1 : 0;

    if (selected && previewed) {
      group.userData.target = { scale: 1.0, opacity: 1, zLift: 0.18 };
      return;
    }
    if (selected || previewed) {
      group.userData.target = { scale: 0.94, opacity: 1, zLift: 0.1 };
      return;
    }

    group.userData.target = { scale: 0.8, opacity: 0.22, zLift: 0 };
  });
}

function resolveBeamTargetAngle() {
  if (isTransitioning || currentView !== 'browser') {
    return selectedIndex >= 0 ? orbitAngle(selectedIndex) : beamAngle;
  }
  if (orbitLockBeamActive && orbitHoverIndex >= 0) {
    return angleOnOrbit(orbitLockBeamTip.x, orbitLockBeamTip.y);
  }
  if (orbitHoverIndex >= 0) {
    return orbitAngle(orbitHoverIndex);
  }
  const preview = getPreviewIndex();
  if (preview >= 0) {
    return orbitAngle(preview);
  }
  if (pointerInOrbit) {
    return beamAngleTarget;
  }
  if (selectedIndex >= 0) {
    return orbitAngle(selectedIndex);
  }
  return beamAngle;
}

function syncBeamTarget() {
  beamAngleTarget = resolveBeamTargetAngle();
}

function flashNav() {
  topItems.forEach((el) => {
    el.classList.remove('nav-strip__item--flash');
    void el.offsetWidth;
    el.classList.add('nav-strip__item--flash');
  });
  setTimeout(() => {
    topItems.forEach((el) => el.classList.remove('nav-strip__item--flash'));
  }, 180);
}

/** Single source of truth - index drives orbit, top nav, LCD, 3D */
function syncNavigation(index, playSound = false) {
  const prev = selectedIndex;
  selectedIndex = wrapIndex(index);
  navHoverIndex = -1;
  orbitHoverIndex = -1;

  pointerInOrbit = false;
  syncPreviewState();

  if (playSound && prev !== selectedIndex && currentView === 'browser') {
    audio.navigate();
    flashNav();
  }
}

/** Top nav hover — pointer-driven via pickNavIndexFromPointer */
function setNavHover(index, playSound = false) {
  if (currentView !== 'browser') {
    navHoverIndex = -1;
    syncPreviewState();
    return;
  }

  const next = index >= 0 ? wrapIndex(index) : -1;
  const changed = next !== navHoverIndex;
  navHoverIndex = next;
  syncPreviewState();

  if (playSound && changed && navHoverIndex >= 0) {
    audio.hover();
  }
}

function setOrbitHover(index, playSound = false) {
  if (currentView !== 'browser') {
    orbitHoverIndex = -1;
    syncPreviewState();
    return;
  }

  const next = index >= 0 ? wrapIndex(index) : -1;
  const changed = next !== orbitHoverIndex;
  orbitHoverIndex = next;
  syncPreviewState();
  if (next >= 0 && !navFlyawayPinned) {
    navCornerEngaged = false;
    clearFlyawayIdleTimer();
    updateNavStripVisibility();
  }

  if (playSound && changed && orbitHoverIndex >= 0) {
    audio.hover();
  }
}

function selectSection(index, playSound = true) {
  syncNavigation(index, playSound);
}

function deselectSection() {
  if (selectedIndex < 0) return;
  selectedIndex = -1;
  navHoverIndex = -1;
  orbitHoverIndex = -1;
  pointerInOrbit = false;
  syncPreviewState();
  setBrowserIdleLabels();
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
    syncNavigation(idx, false);
  } else {
    navHoverIndex = -1;
    orbitHoverIndex = -1;
    pointerInOrbit = false;
    syncPreviewState();
  }

  isTransitioning = true;
  audio.confirm();
  flashLCD();
  flashNav();
  lcdStatus.textContent = 'LOADING';

  setTimeout(() => {
    panelTitle.textContent = SECTIONS[idx].file;
    panelBody.innerHTML = data.html;
    filePanel.classList.toggle('file-panel--contact', sectionKey === 'contact');
    filePanelScrim.classList.add('file-panel-scrim--visible');
    filePanelScrim.setAttribute('aria-hidden', 'false');
    filePanel.classList.add('file-panel--visible');
    updateNavStripVisibility();
    lcdStatus.textContent = data.title;
    currentView = 'content';
    if (sectionKey !== 'contact') animateContentLines(panelBody);
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

  syncNavigation(indexFromKey('about'), false);

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
  if (selectedIndex >= 0) {
    lcdStatus.textContent = SECTIONS[selectedIndex].label;
  } else {
    setBrowserIdleLabels();
  }
  applyStripUI();
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
  filePanel.classList.remove('file-panel--visible', 'file-panel--contact');
  setNavRetracted(false);
  currentView = 'browser';
  navHoverIndex = -1;
  orbitHoverIndex = -1;
  pointerInOrbit = false;
  syncPreviewState();
  if (selectedIndex < 0) setBrowserIdleLabels();

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
    selectedIndex = -1;
    navHoverIndex = -1;
    orbitHoverIndex = -1;
    setBrowserIdleLabels();
    saveIcons.forEach(({ group }) => {
      group.userData.visual.opacity = 0.22;
    });
    syncPreviewState();
    updateNavStripVisibility();
    setNavRetracted(false);

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
      if (selectedIndex < 0) return;
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

/** Screen-space grab radius when the ray misses the diamond mesh */
const SAVE_ICON_HIT_SCREEN_PX = 52;
const saveIconPickWorld = new THREE.Vector3();

function pickSaveIconIndex(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(saveMeshes, false);
  if (hits.length) return hits[0].object.userData.index;

  let best = -1;
  let bestDist = SAVE_ICON_HIT_SCREEN_PX;
  saveIcons.forEach(({ group }, i) => {
    group.getWorldPosition(saveIconPickWorld);
    saveIconPickWorld.project(camera);
    const sx = (saveIconPickWorld.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-saveIconPickWorld.y * 0.5 + 0.5) * window.innerHeight;
    const d = Math.hypot(clientX - sx, clientY - sy);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

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

  const iconPick = pickSaveIconIndex(clientX, clientY);
  if (iconPick >= 0) return iconPick;

  if (dist <= r * 1.18) {
    return orbitIndexWithHysteresis(angle, orbitHoverIndex);
  }

  return -1;
}

window.addEventListener('pointermove', (e) => {
  lastPointer.x = e.clientX;
  lastPointer.y = e.clientY;
  mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
  mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;

  if (currentView !== 'browser' || isTransitioning) {
    pointerInOrbit = false;
    if (orbitHoverIndex >= 0) setOrbitHover(-1);
    if (navHoverIndex >= 0) setNavHover(-1);
    container.classList.remove('is-hovering');
    return;
  }

  if (orbitNavHasFocus() && !navFlyawayPinned) {
    if (osHud.classList.contains('nav-strip--visible')) {
      navCornerEngaged = false;
      scheduleFlyawayIdle();
    }
  } else if (isFlyawayEngaged(e.clientX, e.clientY)) {
    revealNav();
  } else if (!navFlyawayPinned && osHud.classList.contains('nav-strip--visible')) {
    scheduleFlyawayIdle();
  }

  if (isOverNavStrip(e.clientX, e.clientY)) {
    pointerInOrbit = false;
    if (orbitHoverIndex >= 0) setOrbitHover(-1);
    const navIdx = pickNavIndexFromPointer(e.clientX, e.clientY);
    if (navIdx !== navHoverIndex) {
      setNavHover(navIdx, navIdx >= 0);
    }
    container.classList.toggle('is-hovering', navIdx >= 0);
    return;
  }

  if (navHoverIndex >= 0) setNavHover(-1);

  const labelIdx = pickOrbitLabelIndex(e.clientX, e.clientY);
  if (labelIdx >= 0) {
    pointerInOrbit = false;
    container.classList.toggle('is-hovering', true);
    if (labelIdx !== orbitHoverIndex) setOrbitHover(labelIdx, true);
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
  if (currentView !== 'browser') return;
  if (orbitHoverIndex >= 0) setOrbitHover(-1);
  if (navHoverIndex >= 0) setNavHover(-1);
});

window.addEventListener('pointerdown', (e) => {
  if (currentView === 'boot') return;
  audio.unlock();

  if (currentView === 'browser') {
    tryUnpinFlyawayFromClick(e.clientX, e.clientY, e.target);
  }

  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  if (currentView === 'content') {
    if (isClickInsideFilePanel(e.target)) return;

    const idx = pickSaveIconIndex(e.clientX, e.clientY);
    if (idx >= 0) {
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

  const idx = pickSaveIconIndex(e.clientX, e.clientY);
  if (idx < 0) {
    if (selectedIndex >= 0) deselectSection();
    return;
  }

  openSection(SECTIONS[idx].key);
});

updateNavStripVisibility();

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
    if (introProgress >= 1) {
      isIntroComplete = true;
      updateFlyawayTriggerVisibility();
    }
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

  const browserHubEnergy = getPreviewIndex() >= 0 || selectedIndex >= 0 ? 1 : 0.78;
  const targetHubEnergy = aboutPhaseActive()
    ? THREE.MathUtils.lerp(0.68, 0.38, easeInOutSine(aboutState.hubRetreat))
    : THREE.MathUtils.lerp(browserHubEnergy, 0.68, panelBlend);
  hubEnergy += (targetHubEnergy - hubEnergy) * (1 - Math.exp(-2.4 * delta));

  if (currentView === 'browser') {
    syncOrbitLabelPositions();
    updateReticleState(delta);
  }

  const targetAngle = resolveBeamTargetAngle();
  const angleLerp = 1 - Math.exp(-NAV_BEAM_LERP * delta);
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
      hubEnergy * 0.72 + Math.abs(parallax.x) * 0.28 + (getPreviewIndex() >= 0 ? 0.22 : 0) + spinProgress * 0.85
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
    const lerp = 1 - Math.exp(-NAV_SYNC_LERP * delta);
    const dim = selectedIndex >= 0 && i === selectedIndex
      ? 1 - panelBlend * 0.08
      : 1 - panelBlend * 0.28;
    const retreat = orbitHubOcclusion();
    const codecFade = codecNumeralFade(retreat);
    const codecPush = 1 + retreat * 0.09;
    const codecScale = 1 - retreat * 0.05;

    const isSelected = selectedIndex >= 0 && i === selectedIndex;
    const previewIdx = getPreviewIndex();
    const isHovered = previewIdx === i;
    const engaged = isSelected || isHovered;

    v.scale += (tgt.scale - v.scale) * lerp;
    const opacityLerp = engaged
      ? (1 - Math.exp(-NAV_SYNC_LERP * 2.4 * delta))
      : lerp;
    v.opacity += (tgt.opacity - v.opacity) * opacityLerp;
    v.zLift += (tgt.zLift - v.zLift) * lerp;

    root.scale.setScalar(v.scale * ICON_SCALE * codecScale);
    const emissiveBase = [0.38, 0.52];
    const warmEmissive = engaged ? 1 : (0.48 + pearlWarm * 0.52);
    const iconOpacity = engaged
      ? dim * codecFade
      : v.opacity * pearlWarm * dim * codecFade;
    const iconMotion = engaged
      ? 1
      : Math.min(1, v.opacity * 0.72);
    materials.forEach((mat, mi) => {
      if (mat.userData.baseEnv === undefined) mat.userData.baseEnv = mat.envMapIntensity;
      mat.opacity = iconOpacity;
      const emissiveFactor = engaged ? 1 : v.opacity;
      mat.emissiveIntensity = emissiveBase[mi] * (0.35 + emissiveFactor * 0.55) * dim * warmEmissive * codecFade;
      mat.envMapIntensity = mat.userData.baseEnv * (engaged ? 1 : 0.72 + pearlWarm * 0.28) * (0.65 + codecFade * 0.35);
      tickPearlMaterialShader(mat, t, iconMotion);
    });

    group.position.set(
      bp.x * codecPush + Math.sin(t * 0.5 + p) * 0.02,
      bp.y * codecPush + Math.sin(t * 0.7 + p) * 0.03,
      bp.z + v.zLift - retreat * 0.14
    );

    const frameTarget = group.userData.frameTarget ?? 0;
    const frameLerp = 1 - Math.exp(-NAV_SYNC_LERP * delta);
    group.userData.frameOpacity += (frameTarget - group.userData.frameOpacity) * frameLerp;
    const gemFade = group.userData.frameOpacity * codecFade;
    frame.visible = gemFade > 0.01 || frameTarget > 0;
    if (frame.visible) {
      frame.material.opacity = gemFade * GEM_FRAME_OPACITY;
      frame.material.transparent = true;
      frame.material.emissiveIntensity = (0.32 + Math.sin(t * 4) * 0.12) * gemFade;
    }
  });

  if (currentView === 'browser' || currentView === 'content') {
    syncFlyawayNavLayout();
  }

  // Selection beam + hub lighting - eases with panel open/close
  const hubCenter = new THREE.Vector3(0, 0, 0.02);
  const hubGlowPos = new THREE.Vector3(0, 0.1, 0.55);

  const beamTip = orbitPointAtAngle(beamAngle, 0.92);
  const previewIdx = getPreviewIndex();
  if (orbitLockBeamActive && orbitHoverIndex >= 0 && orbitEngage > 0.05) {
    beamTip.copy(orbitLockBeamTip);
  } else if (previewIdx >= 0 && orbitEngage > 0.05) {
    const iconTip = saveIcons[previewIdx].group.position.clone().multiplyScalar(0.88);
    beamTip.lerp(iconTip, 0.42 * orbitEngage);
  } else {
    const beamFocusIdx = selectedIndex >= 0
      ? selectedIndex
      : (previewIdx >= 0 ? previewIdx : 0);
    beamTip.z = saveIcons[beamFocusIdx].group.position.z * 0.35;
  }

  selectionLine.geometry.setFromPoints([hubCenter, beamTip]);

  const onTarget = previewIdx >= 0 || !pointerInOrbit;
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
  const glowTarget = previewIdx >= 0
    ? hubGlowPos
    : new THREE.Vector3(glowOrbit.x, glowOrbit.y + 0.1, 0.58);
  tealGlow.position.lerp(glowTarget, previewIdx >= 0 ? 0.12 : 0.08);
  const glowBrowser = 0.48 + 0.24 * beamPulse + hubEnergy * 0.5;
  const glowContent = 0.4 + 0.14 * beamPulse + hubEnergy * 0.28;
  tealGlow.intensity = THREE.MathUtils.lerp(glowContent, glowBrowser, orbitEngage);

  const spiralFade = 1 - easeInOutSine(Math.min(1, aboutState.hubRetreat * 1.15));
  if (biosSpiral.userData.ringMaterial) {
    const base = biosSpiral.userData.baseOpacity ?? INNER_OVAL_OPACITY;
    const faded = base * spiralFade;
    biosSpiral.userData.ringMaterial.opacity = faded;
    if (biosSpiral.userData.dotMaterial) {
      biosSpiral.userData.dotMaterial.opacity = faded;
    }
  }
  starField.rotation.y = t * 0.009;
  starField.material.uniforms.uTime.value = t;

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  cameraEndZ = getCameraEndZ();
  renderer.setSize(window.innerWidth, window.innerHeight);
  starField.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
  syncOrbitLabelPositions();
  syncFlyawayNavLayout();
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
      if (status === 'READY') finishBootSequence();
    }, delay);
  });

  setTimeout(() => document.body.classList.add('is-ready'), 800);
})();
