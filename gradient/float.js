/**
 * Gentle 3D drift — tuned to match orbit hub float (not spastic).
 */

export const FLOAT = {
  ampX: 22,
  ampY: 16,
  ampZ: 20,
  speedX: 0.32,
  speedY: 0.46,
  speedZ: 0.4,
  rotSpeedY: 0.14,
  rotSpeedX: 0.12,
  rotAmpY: 6.5,
  rotAmpX: 3.8,
  baseRotX: 8,
  baseRotY: -7,
};

const DEG = Math.PI / 180;
const WORLD = 0.009;

/** Sample float pose for CSS (px/deg) or Three.js (world/rad). */
export function getSampleFloatPose(t, damp = 1) {
  const x = Math.sin(t * FLOAT.speedX) * FLOAT.ampX * damp * WORLD;
  const y = Math.sin(t * FLOAT.speedY + 0.6) * FLOAT.ampY * damp * WORLD;
  const z = Math.sin(t * FLOAT.speedZ + 1.2) * FLOAT.ampZ * damp * WORLD;
  const rotY = (FLOAT.baseRotY + Math.sin(t * FLOAT.rotSpeedY) * FLOAT.rotAmpY * damp) * DEG;
  const rotX = (FLOAT.baseRotX + Math.sin(t * FLOAT.rotSpeedX + 0.8) * FLOAT.rotAmpX * damp) * DEG;
  return { x, y, z, rotX, rotY };
}

export function initLetterFloat(rig, { dampWhileEditing = null } = {}) {
  if (!rig) return () => {};

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    rig.style.transform =
      `rotateX(${FLOAT.baseRotX}deg) rotateY(${FLOAT.baseRotY}deg)`;
    return () => {};
  }

  let raf = 0;
  let start = performance.now();

  const tick = (now) => {
    const t = (now - start) * 0.001;
    const damp = dampWhileEditing?.() ? 0.28 : 1;
    const px = getSampleFloatPose(t, damp);
    const x = px.x / WORLD;
    const y = px.y / WORLD;
    const z = px.z / WORLD;
    const rotY = px.rotY / DEG;
    const rotX = px.rotX / DEG;

    rig.style.transform =
      `translate3d(${x}px, ${y}px, ${z}px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;

    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
