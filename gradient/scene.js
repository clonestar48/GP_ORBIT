/**
 * Extruded 3D letterforms — gradient face, solid sides, word-wrapped stack.
 */

import * as THREE from '/assets/vendor/three.module.js';
import { FontLoader } from './vendor/FontLoader.js';
import { TextGeometry } from './vendor/TextGeometry.js';
import { getSampleFloatPose } from './float.js';
import { wrapLabel } from './wrap.js';
import { resolveCaretLine } from './caret.js';

const FONT_URL = '/gradient/fonts/futura_bold.typeface.json';

const EXTRUDE = {
  size: 0.82,
  height: 0.95,
  curveSegments: 12,
  bevelEnabled: true,
  bevelThickness: 0.14,
  bevelSize: 0.048,
  bevelSegments: 4,
};

const LINE_GAP = 0.14;

function buildGradientTexture(stops) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  stops.forEach(([t, color]) => grad.addColorStop(t, color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function visibleWorldSize(camera) {
  const dist = camera.position.z;
  const vFov = (camera.fov * Math.PI) / 180;
  const h = 2 * Math.tan(vFov / 2) * dist;
  return { w: h * camera.aspect, h };
}

function lineWidthLimit(camera) {
  const { w } = visibleWorldSize(camera);
  return w * 0.55;
}

export function initScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  scene.add(new THREE.AmbientLight(0xd8e4f0, 0.42));

  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(2.5, 3.5, 5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xa8bcd0, 0.55);
  fill.position.set(-1.5, 0.5, 6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x7ec4b8, 0.62);
  rim.position.set(-3.5, -0.5, 3);
  scene.add(rim);

  const edge = new THREE.DirectionalLight(0xc8d8e8, 0.38);
  edge.position.set(0, -2.5, 4);
  scene.add(edge);

  const textGroup = new THREE.Group();
  scene.add(textGroup);

  let gradientTexture = buildGradientTexture([[0, '#fff'], [1, '#111']]);
  const faceMaterial = new THREE.MeshBasicMaterial({ map: gradientTexture });
  const bodyMaterial = new THREE.MeshPhongMaterial({
    color: 0x3a4a5c,
    specular: 0xb8c8d8,
    shininess: 72,
    flatShading: false,
  });

  let font = null;
  let textRoot = null;
  let currentText = '';
  let layoutLines = [];

  function fitToView() {
    if (!textRoot) return;
    const box = new THREE.Box3().setFromObject(textRoot);
    const size = box.getSize(new THREE.Vector3());
    if (size.x < 0.001 || size.y < 0.001) return;

    const { w, h } = visibleWorldSize(camera);
    const lineCount = textRoot.children.length;
    const vFrac = lineCount > 1 ? 0.78 : 0.58;
    const scale = Math.min((w * 0.84) / size.x, (h * vFrac) / size.y, 2.4);
    textGroup.scale.setScalar(Math.max(scale, 0.3));
  }

  function disposeTextRoot() {
    if (!textRoot) return;
    textGroup.remove(textRoot);
    textRoot.traverse((child) => {
      if (child.isMesh) child.geometry.dispose();
    });
    textRoot = null;
  }

  function buildLineMesh(line) {
    const geometry = new TextGeometry(line, { font, ...EXTRUDE });
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const cx = (bb.min.x + bb.max.x) * 0.5;
    const cy = (bb.min.y + bb.max.y) * 0.5;
    geometry.translate(-cx, -cy, 0);
    const mesh = new THREE.Mesh(geometry, [faceMaterial, bodyMaterial]);
    return { mesh, height: bb.max.y - bb.min.y };
  }

  function buildTextStack(lines) {
    const root = new THREE.Group();
    const rows = lines.map((line) => buildLineMesh(line));
    const gap = EXTRUDE.size * LINE_GAP;
    const stackHeight = rows.reduce(
      (sum, row, i) => sum + row.height + (i ? gap : 0),
      0,
    );
    let yTop = stackHeight * 0.5;

    layoutLines = rows.map(({ mesh, height }, i) => {
      const y = yTop - height * 0.5;
      yTop -= height + gap;
      mesh.position.y = y;
      root.add(mesh);
      return { text: lines[i], height, y };
    });

    return root;
  }

  function rebuildMesh() {
    disposeTextRoot();
    const label = currentText.replace(/\r\n/g, '\n').trim().toUpperCase();
    if (!font || !label) {
      textGroup.scale.setScalar(1);
      layoutLines = [];
      return;
    }

    const lines = wrapLabel(label, font, lineWidthLimit(camera), EXTRUDE.size);
    if (!lines.length) return;

    textRoot = buildTextStack(lines);
    textGroup.add(textRoot);
    fitToView();
  }

  function setGradientStops(stops) {
    gradientTexture.dispose();
    gradientTexture = buildGradientTexture(stops);
    faceMaterial.map = gradientTexture;
    faceMaterial.needsUpdate = true;
  }

  function setText(text) {
    currentText = text;
    rebuildMesh();
  }

  function resize() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w < 1 || h < 1) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    rebuildMesh();
  }

  function getCaretScreenPoint(cursorIndex) {
    if (!font || !canvas.parentElement) return null;

    const prefix = currentText.slice(
      0,
      Math.min(Math.max(cursorIndex, 0), currentText.length),
    );
    const maxW = lineWidthLimit(camera);
    const { localX, localY, lineHeight } = resolveCaretLine(
      prefix,
      layoutLines,
      font,
      maxW,
      EXTRUDE.size,
      LINE_GAP,
    );

    const point = new THREE.Vector3(localX, localY, 0);
    const anchor = textRoot ?? textGroup;
    anchor.localToWorld(point);
    point.project(camera);

    const rect = canvas.getBoundingClientRect();
    const { h: worldH } = visibleWorldSize(camera);
    const scale = textGroup.scale.x;
    const heightPx = lineHeight * scale * (rect.height / worldH);

    return {
      x: (point.x * 0.5 + 0.5) * rect.width,
      y: (-point.y * 0.5 + 0.5) * rect.height,
      height: heightPx,
    };
  }

  function render(t, damp = 1) {
    const pose = getSampleFloatPose(t, damp);
    textGroup.position.set(pose.x, pose.y, pose.z);
    textGroup.rotation.set(pose.rotX, pose.rotY, 0);
    renderer.render(scene, camera);
  }

  function dispose() {
    disposeTextRoot();
    gradientTexture.dispose();
    faceMaterial.dispose();
    bodyMaterial.dispose();
    renderer.dispose();
  }

  const ready = new Promise((resolve, reject) => {
    new FontLoader().load(
      FONT_URL,
      (loaded) => {
        font = loaded;
        rebuildMesh();
        resolve();
      },
      undefined,
      reject,
    );
  });

  return {
    ready,
    setText,
    setGradientStops,
    getCaretScreenPoint,
    resize,
    render,
    dispose,
  };
}
