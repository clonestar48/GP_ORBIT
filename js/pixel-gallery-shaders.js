export const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const fragmentShader = /* glsl */ `
uniform sampler2D uTexture;
varying vec2 vUv;

uniform vec2 uResolution;
uniform float uProgress;
uniform vec3 uColor;
uniform vec2 uContainerRes;
uniform float uGridSize;

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  float imageAspectX = uResolution.x / uResolution.y;
  float imageAspectY = uResolution.y / uResolution.x;
  float containerAspectX = uContainerRes.x / uContainerRes.y;
  float containerAspectY = uContainerRes.y / uContainerRes.x;

  vec2 ratio = vec2(
    min(containerAspectX / imageAspectX, 1.0),
    min(containerAspectY / imageAspectY, 1.0)
  );

  vec2 coverUvs = vec2(
    vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
    vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
  );

  float gridSize = max(floor(uContainerRes.x / uGridSize), 1.0);
  vec2 squareUvs = coverUvs;
  vec2 grid = vec2(
    floor(squareUvs.x * gridSize) / gridSize,
    floor(squareUvs.y * gridSize) / gridSize
  );
  vec4 tex = texture2D(uTexture, coverUvs);
  float height = 0.2;
  float progress = (1.0 + height) - (uProgress * (1.0 + height + height));
  float dist = 1.0 - distance(grid.y, progress);
  float clampedDist = smoothstep(height, 0.0, distance(grid.y, progress));
  float randDist = step(1.0 - height * random(grid), dist);
  dist = step(1.0 - height, dist);
  float rand = random(grid);
  float pixelAlpha = dist * (clampedDist + rand - 0.5 * (1.0 - randDist));
  pixelAlpha = max(0.0, pixelAlpha);

  float revealed = step(progress, grid.y);
  tex.rgb = mix(uColor, tex.rgb, revealed);
  vec4 gridTexture = vec4(uColor, pixelAlpha);
  gl_FragColor = vec4(mix(tex.rgb, gridTexture.rgb, gridTexture.a), 1.0);

  #include <colorspace_fragment>
}
`;
