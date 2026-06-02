/**
 * Orbit navigation glyphs — GP pearl chrome (shared env + sparkle shader), diamond test shape.
 */

import * as THREE from '../assets/vendor/three.module.js';
import { clonePearlMaterialsForIcon, extrudedPlate } from './emblem.js';

/** ~35% smaller than prior 0.78 orbit icon scale */
export const ICON_SCALE = 0.51;

/** Match GP numeral extrude bevel */
const DIAMOND_EXTRUDE = {
  depth: 0.38,
  bevelEnabled: true,
  bevelThickness: 0.105,
  bevelSize: 0.095,
  bevelSegments: 3,
  curveSegments: 1,
  material: 0,
  extrudeMaterial: 1,
};

function extrudedDiamond(size = 0.62, italic = 0.22) {
  const s = size / 2;
  const shape = new THREE.Shape();
  const pts = [
    [0, s],
    [s, 0],
    [0, -s],
    [-s, 0],
  ];
  pts.forEach(([x, y], i) => {
    const px = x + y * italic;
    if (i === 0) shape.moveTo(px, y);
    else shape.lineTo(px, y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, DIAMOND_EXTRUDE);
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

/** Pearl diamond — same dual-material stack as emblem plates */
function buildDiamond(materials) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(extrudedDiamond(0.64), materials);
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

/** All sections use diamond while testing materiality */
export function buildSectionSaveIcon(sectionKey, pearlAssets) {
  const materials = clonePearlMaterialsForIcon(pearlAssets);
  const root = new THREE.Group();
  root.add(buildDiamond(materials));
  root.scale.setScalar(ICON_SCALE);

  /** Generous invisible target — diamonds are small on screen */
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.62, 0.14),
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
