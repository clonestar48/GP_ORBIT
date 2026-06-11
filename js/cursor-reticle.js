/**
 * Teal coordinate reticle — follows pointer behind the system cursor.
 */

export function initCursorReticle() {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const root = document.getElementById('cursor-reticle');
  if (!root) return;

  const xEl = root.querySelector('[data-coord="x"]');
  const yEl = root.querySelector('[data-coord="y"]');

  const move = (clientX, clientY) => {
    root.style.transform = `translate(${clientX}px, ${clientY}px)`;
    if (xEl) xEl.textContent = String(Math.round(clientX));
    if (yEl) yEl.textContent = String(Math.round(clientY));
    root.hidden = false;
  };

  const hide = () => {
    root.hidden = true;
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return;
      move(e.clientX, e.clientY);
    },
    { passive: true },
  );

  window.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
}

initCursorReticle();
