/**
 * Label lock reticle — horizontal frame synced to the 3D selection beam.
 */

export function initCursorReticle() {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const root = document.getElementById('cursor-reticle');
  const frame = root?.querySelector('.cursor-reticle__frame');
  if (!root || !frame) return;

  const hide = () => {
    root.hidden = true;
  };

  const tick = () => {
    requestAnimationFrame(tick);

    const state = window.__vmuReticleState;
    if (!state?.active || state.progress < 0.015) {
      hide();
      return;
    }

    // Size is only the slow 30% hover bump — lock progress drives position/travel only.
    const scale = state.hoverScale ?? 1;

    root.hidden = false;
    root.style.transform = `translate(${state.x}px, ${state.y}px) translate(-50%, -50%) scale(${scale})`;
    frame.style.width = `${state.frameW}px`;
    frame.style.height = `${state.frameH}px`;
  };

  window.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
  tick();
}

initCursorReticle();
