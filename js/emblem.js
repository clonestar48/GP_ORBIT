/**
 * Floating GP monogram - adapted from gp-numeral for portfolio hub focal point.
 */

import * as THREE from '../assets/vendor/three.module.js';

const TEAL_BOOST = 1.2;

function makeEnvironment() {
  const envCanvas = document.createElement('canvas');
  envCanvas.width = 1024;
  envCanvas.height = 512;
  const ctx = envCanvas.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, envCanvas.width, envCanvas.height);
  base.addColorStop(0.0, '#020707');
  base.addColorStop(0.18, '#60ffff');
  base.addColorStop(0.31, '#fff2a8');
  base.addColorStop(0.45, '#98ffff');
  base.addColorStop(0.58, '#c496ff');
  base.addColorStop(0.72, '#ff8bd8');
  base.addColorStop(0.86, '#20ffe0');
  base.addColorStop(1.0, '#050505');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, envCanvas.width, envCanvas.height);

  const vignette = ctx.createRadialGradient(512, 240, 60, 512, 240, 620);
  vignette.addColorStop(0, 'rgba(255,255,255,0.22)');
  vignette.addColorStop(0.22, `rgba(155, 240, 255, ${0.22 * TEAL_BOOST})`);
  vignette.addColorStop(0.55, 'rgba(15,18,22,0.18)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, envCanvas.width, envCanvas.height);

  const bands = [
    [`rgba(73, 255, 232, ${0.62 * TEAL_BOOST})`, 112, 56, 170],
    ['rgba(255,228,120,0.48)', 224, 410, 150],
    ['rgba(228,197,255,0.56)', 318, 92, 120],
    ['rgba(255,88,220,0.52)', 675, 52, 150],
    [`rgba(116, 246, 255, ${0.5 * TEAL_BOOST})`, 842, 125, 118],
    ['rgba(255,177,84,0.42)', 920, 390, 130],
  ];
  for (const [color, x, y, radius] of bands) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, envCanvas.width, envCanvas.height);
  }

  const texture = new THREE.CanvasTexture(envCanvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSparkleTexture(size = 512, base = '#707070', seed = 1) {
  let rngState = seed >>> 0;
  const rand = () => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < size * 10; i++) {
    const gray = 92 + rand() * 56;
    ctx.fillStyle = `rgba(${gray}, ${gray}, ${gray}, ${0.04 + rand() * 0.07})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2.5, 1 + rand() * 2.5);
  }

  const speckCount = Math.floor(size * size * (0.058 + rand() * 0.018));
  for (let i = 0; i < speckCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const alpha = 0.42 + rand() * 0.58;
    const radius = rand() * 1.35 + 0.22 + rand() * 0.35;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    if (rand() > 0.78) {
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, radius, radius * (0.75 + rand() * 0.5));
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6.37 + seed * 0.19, 7.13 + seed * 0.11);
  texture.rotation = seed * 0.09;
  texture.center.set(0.5, 0.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function attachPearlSparkle(material, storeKey) {
  material.customProgramCacheKey = () => `gp-pearl-sparkle-v8-${storeKey}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uMotion = { value: 0 };
    material.userData[storeKey] = shader;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uMotion;

        vec3 pearlColor(float t) {
          return 0.48 + 0.52 * cos(6.28318 * (vec3(0.98, 0.06, 0.18) + t));
        }

        float gpSpeck(vec2 uv, float scale, vec2 shift) {
          vec2 p = uv * scale + shift;
          p += vec2(sin(p.y * 4.9 + shift.x), cos(p.x * 3.7 + shift.y)) * 0.065;
          vec2 cell = floor(p);
          vec2 f = fract(p);
          float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float h2 = fract(sin(dot(cell, vec2(39.346, 11.753))) * 9758.331);
          vec2 pin = vec2(h, fract(h * 7.13)) + (vec2(h2, fract(h2 * 5.17)) - 0.5) * 0.12;
          float d = length(f - pin);
          float pinSize = mix(0.11, 0.21, h2);
          float gate = mix(0.86, 0.97, h);
          return (1.0 - smoothstep(0.0, pinSize, d)) * step(gate, h + 0.02);
        }

        float bevelStreak(float phase) {
          return pow(max(sin(phase), 0.0), 14.0);
        }`
      )
      .replace(
        '#include <opaque_fragment>',
        `
        float edgeLight = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.35);
        float faceSheen = pow(clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 1.5);
        float pearlPhase = normal.x * 0.18 + normal.y * 0.14 + vViewPosition.x * 0.055 - vViewPosition.y * 0.035 + uTime * 0.025;
        vec3 pearl = pearlColor(pearlPhase);
        float innerBias = smoothstep(0.18, 0.72, abs(normal.x) + abs(normal.y));
        float wellMask = smoothstep(0.02, 0.82, innerBias) * (0.5 + (1.0 - faceSheen) * 0.5);
        float sparkleMask = mix(0.84, 1.0, wellMask);
        float sparkleStrength = sparkleMask * (0.9 + uMotion * 0.1);
        outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.82, 0.98, 1.08) + pearl * 0.34, faceSheen * 0.32);
        outgoingLight += pearl * edgeLight * 0.44;
        vec3 N = normalize(normal);
        float bevelStrip = edgeLight * (1.0 - faceSheen * 0.7);
        float gleamX = dot(vViewPosition.xy, vec2(0.14, 0.028)) + N.x * 2.15 + N.z * 0.62 + uTime * 0.4;
        float gleamY = dot(vViewPosition.xy, vec2(0.038, 0.118)) + N.y * 2.05 + N.z * 0.52 + uTime * 0.34 + 1.85;
        float gleamX2 = dot(vViewPosition.xy, vec2(0.11, -0.016)) + N.x * 1.7 - N.y * 0.45 + uTime * 0.47 + 3.2;
        float gleamY2 = dot(vViewPosition.xy, vec2(-0.022, 0.095)) + N.y * 1.85 + N.x * 0.38 + uTime * 0.39 + 5.1;
        float gleamZ = dot(vViewPosition.xy, vec2(0.085, 0.072)) + (N.x + N.y) * 1.25 + uTime * 0.28 + 2.6;
        float streakH = bevelStreak(gleamX * 3.55) + bevelStreak(gleamX2 * 3.1) * 0.82;
        float streakV = bevelStreak(gleamY * 3.25) + bevelStreak(gleamY2 * 2.95) * 0.78;
        float streakD = bevelStreak(gleamZ * 2.75);
        float hMask = smoothstep(0.1, 0.74, abs(N.y) + abs(N.z) * 0.42);
        float vMask = smoothstep(0.1, 0.74, abs(N.x) + abs(N.z) * 0.42);
        float dMask = smoothstep(0.18, 0.82, abs(N.x) + abs(N.y));
        float bevelGleam = bevelStrip * (streakH * hMask + streakV * vMask + streakD * dMask * 0.58);
        vec3 gleamColor = mix(pearl, vec3(0.72, 0.86, 1.0), 0.42);
        outgoingLight += gleamColor * bevelGleam * (0.38 + uMotion * 0.09);
        #ifdef USE_UV
          vec2 grainUv = vUv + normal.xy * 0.22 + vViewPosition.xy * 0.014;
          float speckA = gpSpeck(grainUv, 137.0, vec2(0.0, 0.0));
          float speckB = gpSpeck(grainUv, 173.0, vec2(1.7, 4.2));
          float speckC = gpSpeck(grainUv, 211.0, vec2(8.3, 2.1));
          float speckD = gpSpeck(grainUv + vec2(0.23, -0.17), 149.0, vec2(3.9, 6.4));
          float speckle = (speckA + speckB * 0.9 + speckC * 0.82 + speckD * 0.76) / 3.48;
          float twinkle = 0.62 + 0.38 * sin(uTime * 5.4 + dot(grainUv, vec2(48.0, 36.0)));
          vec3 sparkColor = mix(pearl, vec3(1.0), 0.82);
          outgoingLight += sparkColor * speckle * twinkle * sparkleStrength * 2.85;
        #endif
        #include <opaque_fragment>`
      );
  };
  material.needsUpdate = true;
}

function polygonShape(points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return shape;
}

function chamferedPlate(width, height, cut = 0.12, italic = 0.22) {
  const w = width / 2;
  const h = height / 2;
  const c = Math.min(cut, w * 0.42, h * 0.42);
  return [
    [-w + c, -h], [w - c, -h], [w, -h + c], [w, h - c],
    [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c],
  ].map(([x, y]) => [x + y * italic, y]);
}

function extrudedPlate(width, height, cut, depth, italic = 0.22) {
  const geometry = new THREE.ExtrudeGeometry(polygonShape(chamferedPlate(width, height, cut, italic)), {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.105,
    bevelSize: 0.095,
    bevelSegments: 3,
    curveSegments: 1,
    material: 0,
    extrudeMaterial: 1,
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

function addPiece(group, geometry, materials, x, y, z = 0) {
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function buildPearlChromeMaterials(envMap, sparkleTexture, emissiveSparkleTexture, withShader = true) {
  const chrome = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x6ec8be),
    metalness: 1,
    roughness: 0.14,
    roughnessMap: sparkleTexture,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    reflectivity: 1,
    envMap,
    envMapIntensity: 2.75 * TEAL_BOOST,
    iridescence: 1,
    iridescenceIOR: 2.05,
    iridescenceThicknessRange: [160, 950],
    emissive: new THREE.Color(0xb8a0ff),
    emissiveMap: emissiveSparkleTexture,
    emissiveIntensity: 0.38,
  });

  const darkChrome = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x07111b),
    metalness: 1,
    roughness: 0.22,
    roughnessMap: sparkleTexture,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    envMap,
    envMapIntensity: 2.05 * TEAL_BOOST,
    iridescence: 0.72,
    iridescenceIOR: 1.72,
    iridescenceThicknessRange: [80, 420],
    emissive: new THREE.Color(0x6fd4c8),
    emissiveMap: emissiveSparkleTexture,
    emissiveIntensity: 0.52,
  });

  if (withShader) {
    attachPearlSparkle(chrome, 'shader');
    attachPearlSparkle(darkChrome, 'shaderDark');
  }

  return { chrome, darkChrome, materials: [chrome, darkChrome] };
}

/** Shared pearl env + materials for emblem and orbit icons */
export function createPearlMaterialSet() {
  const envMap = makeEnvironment();
  const sparkleTexture = makeSparkleTexture(512, '#707070', 1);
  const emissiveSparkleTexture = makeSparkleTexture(512, '#000000', 5);
  const pearl = buildPearlChromeMaterials(envMap, sparkleTexture, emissiveSparkleTexture, true);
  return {
    envMap,
    ...pearl,
    textures: { sparkleTexture, emissiveSparkleTexture },
  };
}

export { extrudedPlate };

/** Build the chrome GP emblem group with chromatic pearl materials */
export function buildGPEmblem(sharedAssets = null) {
  const assets = sharedAssets || createPearlMaterialSet();
  const { materials, chrome, darkChrome, textures, envMap } = assets;
  const depth = 0.54;
  const emblem = new THREE.Group();

  const g = new THREE.Group();
  g.position.x = -1.02;
  emblem.add(g);

  addPiece(g, extrudedPlate(2.48, 0.46, 0.13, depth, 0.30), materials, -0.04, 0.98, 0.015);
  addPiece(g, extrudedPlate(0.52, 2.24, 0.13, depth, 0.18), materials, -1.08, -0.01, 0.005);
  addPiece(g, extrudedPlate(2.10, 0.46, 0.13, depth, 0.30), materials, -0.30, -0.98, 0.012);
  addPiece(g, extrudedPlate(1.18, 0.36, 0.10, depth, 0.28), materials, 0.12, 0, 0.04);
  addPiece(g, extrudedPlate(0.44, 0.84, 0.11, depth, 0.20), materials, 0.58, -0.54, 0.018);

  const p = new THREE.Group();
  p.position.set(1.08, -0.01, 0.04);
  emblem.add(p);

  addPiece(p, extrudedPlate(0.52, 3.18, 0.13, depth, 0.19), materials, -0.72, -0.48, 0.004);
  addPiece(p, extrudedPlate(2.24, 0.46, 0.13, depth, 0.30), materials, 0.28, 1.02, 0.024);
  addPiece(p, extrudedPlate(0.46, 0.92, 0.11, depth, 0.20), materials, 1.16, 0.56, 0.034);
  addPiece(p, extrudedPlate(1.48, 0.40, 0.10, depth, 0.28), materials, 0.38, 0.02, 0.028);

  emblem.userData.materials = { chrome, darkChrome };
  emblem.userData.textures = textures;
  emblem.userData.envMap = envMap;
  emblem.rotation.set(0, -0.22, 0);

  return emblem;
}
