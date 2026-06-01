/**
 * Orbit navigation glyphs - beveled silhouettes matching the GP emblem pearl chrome.
 */

import * as THREE from '../assets/vendor/three.module.js';
import { extrudedPlate } from './emblem.js';

const TEAL_BOOST = 1.2;
const GLYPH_DEPTH = 0.12;
const GLYPH_ITALIC = 0.18;
export const ICON_SCALE = 0.78;
const BEVEL = {
  bevelEnabled: true,
  bevelThickness: 0.055,
  bevelSize: 0.048,
  bevelSegments: 2,
  curveSegments: 2,
  material: 0,
  extrudeMaterial: 1,
};

function plate(w, h, cut = 0.03) {
  return extrudedPlate(w, h, cut, GLYPH_DEPTH, GLYPH_ITALIC);
}

/** Extruded silhouette - same bevel recipe as emblem plates */
function extrudedSilhouette(points, depth = GLYPH_DEPTH, italic = GLYPH_ITALIC) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => {
    const px = x + y * italic;
    if (i === 0) shape.moveTo(px, y);
    else shape.lineTo(px, y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth, ...BEVEL });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

function addStroke(group, geometry, materials, x, y, z = 0, rotZ = 0) {
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.position.set(x, y, z);
  mesh.rotation.z = rotZ;
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function addSilhouette(group, points, materials, scale = 1) {
  const pts = scale === 1 ? points : points.map(([x, y]) => [x * scale, y * scale]);
  const mesh = new THREE.Mesh(extrudedSilhouette(pts), materials);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function circlePoints(radius, segments = 22) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2 - Math.PI / 2;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

function ellipsePoints(rx, ry, segments = 24) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2 - Math.PI / 2;
    pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return pts;
}

/** WORK - diamond / rhombus */
function buildDiamond(materials) {
  const g = new THREE.Group();
  const s = 0.88;
  addSilhouette(g, [
    [0, 0.32 * s],
    [0.26 * s, 0],
    [0, -0.32 * s],
    [-0.26 * s, 0],
  ], materials);
  return g;
}

/** NFL - american football (side profile) */
function buildFootball(materials) {
  const g = new THREE.Group();
  const s = 0.88;
  addSilhouette(g, [
    [-0.3 * s, 0],
    [-0.1 * s, 0.17 * s],
    [0.1 * s, 0.17 * s],
    [0.3 * s, 0],
    [0.1 * s, -0.17 * s],
    [-0.1 * s, -0.17 * s],
  ], materials);
  return g;
}

/** PORTRAITS - vertical oval (portrait frame) */
function buildPortraitOval(materials) {
  const g = new THREE.Group();
  const s = 0.88;
  addSilhouette(g, ellipsePoints(0.2 * s, 0.3 * s), materials);
  return g;
}

/** ABOUT - round face (single silhouette - no detached mouth/eye plates) */
function buildGrin(materials) {
  const g = new THREE.Group();
  const s = 0.88;
  addSilhouette(g, circlePoints(0.3 * s, 24), materials);
  return g;
}

const GLYPH_BUILDERS = {
  work: buildDiamond,
  lab: buildFootball,
  about: buildGrin,
  contact: buildPortraitOval,
  nfl: buildFootball,
  portraits: buildPortraitOval,
};

export function createIconMaterials(pearlAssets) {
  const { envMap, textures } = pearlAssets;
  const { sparkleTexture, emissiveSparkleTexture } = textures;

  function makeMat(isChrome) {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(isChrome ? 0x6ec8be : 0x07111b),
      metalness: 1,
      roughness: isChrome ? 0.2 : 0.28,
      roughnessMap: sparkleTexture,
      clearcoat: 1,
      clearcoatRoughness: isChrome ? 0.08 : 0.1,
      envMap,
      envMapIntensity: isChrome ? 1.45 * TEAL_BOOST : 1.1 * TEAL_BOOST,
      iridescence: isChrome ? 0.72 : 0.5,
      iridescenceIOR: isChrome ? 1.85 : 1.55,
      iridescenceThicknessRange: isChrome ? [100, 520] : [60, 280],
      emissive: new THREE.Color(isChrome ? 0xb8a0ff : 0x6fd4c8),
      emissiveMap: emissiveSparkleTexture,
      emissiveIntensity: isChrome ? 0.18 : 0.26,
      transparent: true,
      opacity: 0.28,
    });
  }

  return [makeMat(true), makeMat(false)];
}

/** Build a section glyph - pearl silhouette + hit volume + selection halo */
export function buildSectionSaveIcon(sectionKey, pearlAssets) {
  const materials = createIconMaterials(pearlAssets);
  const build = GLYPH_BUILDERS[sectionKey] || buildDiamond;

  const root = new THREE.Group();
  const glyph = build(materials);
  root.add(glyph);
  root.scale.setScalar(ICON_SCALE);

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.46, 0.1),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.userData.isSave = true;
  root.add(hit);

  const frame = new THREE.Mesh(
    extrudedPlate(0.52, 0.56, 0.04, 0.028, 0.16),
    new THREE.MeshPhysicalMaterial({
      color: 0x3d8b82,
      emissive: 0x3d8b82,
      emissiveIntensity: 0.45,
      metalness: 0.7,
      roughness: 0.28,
      transparent: true,
      opacity: 0.55,
    })
  );
  frame.position.z = -0.04;
  frame.visible = false;
  root.add(frame);

  return { root, materials, hit, frame };
}
