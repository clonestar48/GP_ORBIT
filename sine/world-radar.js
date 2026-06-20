/** Retro mission-select radar — 8 worlds around a central hub. */

const RADAR_CX = 50;
const RADAR_CY = 50;
const RADAR_RX = 41;
const RADAR_RY = 18;
/** Radar stage is 2:1 — scale Y so 8 nodes read as even clock hours. */
const RADAR_Y_SCALE = 2;

/** Even 45° spacing on the radar, starting at top (-90°). */
function radarPoint(deg) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: Math.round((RADAR_CX + RADAR_RX * Math.cos(rad)) * 10) / 10,
    y: Math.round((RADAR_CY + RADAR_RY * RADAR_Y_SCALE * Math.sin(rad)) * 10) / 10,
  };
}

export const RADAR_NODES = [
  { key: 'space-age', label: 'Space Age', ...radarPoint(-90) },
  { key: 'dungeon', label: 'Dungeon', ...radarPoint(-45) },
  { key: 'bubble', label: 'Bubble', ...radarPoint(0) },
  { key: 'speedway', label: 'Speedway', ...radarPoint(45) },
  { key: 'arcade', label: 'Arcade', ...radarPoint(90) },
  { key: 'desert', label: 'Desert', ...radarPoint(135) },
  { key: 'beach', label: 'Beach', ...radarPoint(180) },
  // { key: 'ice-cave', label: 'Ice Cave', ...radarPoint(-135) },  // stashed — needs rework
  // { key: 'neon', label: 'Neon', ...radarPoint(-67) },           // stashed — needs rework
  // { key: 'music-box', label: 'Music Box', ...radarPoint(22) },  // stashed — needs rework
  { key: 'western', label: 'Western', ...radarPoint(112) },
  { key: 'forest', label: 'Forest', ...radarPoint(157) },
  { key: 'medieval', label: 'Medieval', ...radarPoint(-22) },
];

/**
 * Tactical map-marker silhouettes — viewBox 0 0 24 28.
 * Landmark + shared pin stem/ring; one color via currentColor.
 */
const MAP_PIN =
  '<path d="M11.5 19.5h1v4h-1v-4z"/>'
  + '<circle class="world-node__pin-ring" cx="12" cy="25.5" r="1.75"/>';

const LANDMARKS = {
  beach:
    '<path d="M12 2.5 9 8.5h1.5L12 5.5l1.5 3h1.5L12 2.5zM7 9l4.5 1.5L12 7l0.5 3.5L7 9zM17 9l-4.5 1.5L12 7l-0.5 3.5L17 9z"/>'
    + '<path d="M11.5 9.5h1v6h-1v-6z"/>'
    + '<path d="M5.5 16.5c2.5-2 4.5-2.5 6.5-2.5s4 .5 6.5 2.5v1.5H5.5v-1.5z"/>'
    + MAP_PIN,
  desert:
    '<path d="M10.5 7h3c1 0 1.5.5 1.5 1.5v9c0 1-.5 1.5-1.5 1.5h-3c-1 0-1.5-.5-1.5-1.5v-9c0-1 .5-1.5 1.5-1.5z"/>'
    + '<path d="M7 12.5h3.5v1.5H7v-1.5zM7 10.5h2v4H7v-4z"/>'
    + '<path d="M13.5 10h3.5v1.5H13.5V10zM15 8h2v5.5h-2V8z"/>'
    + MAP_PIN,
  'ice-cave':
    '<path d="M10.5 4 13 17.5H8L10.5 4z"/>'
    + '<path d="M6 11.5 8 17.5H4L6 11.5z"/>'
    + '<path d="M14 7 16.5 17.5H12L14 7z"/>'
    + '<path d="M17 12.5 18.5 17.5H15.5L17 12.5z"/>'
    + MAP_PIN,
  'space-age':
    '<path fill-rule="evenodd" d="'
    + 'M12 3.5c4 0 6 2.5 6.5 5.5.5 3-1.5 6.5-4.5 8-1 .6-2 .9-2 .9s-1-.3-2-.9c-3-1.5-5-5-4.5-8C5.5 6 7.5 3.5 12 3.5z'
    + 'M9.2 9.8l2.3 2.8-1.2 1.4-2.8-3.2 1.7-1zM14.8 9.8l-2.3 2.8 1.2 1.4 2.8-3.2-1.7-1z'
    + '"/>'
    + MAP_PIN,
  dungeon:
    '<path fill-rule="evenodd" d="'
    + 'M3 6.5h2v1.5H3V6.5zM5.5 6.5h2v1.5h-2V6.5zM3 8h5v10.5H3V8z'
    + 'M15.5 6.5h2v1.5h-2V6.5zM18 6.5h2v1.5h-2V6.5zM15.5 8H20.5v10.5H15.5V8z'
    + 'M8.5 9h7v9.5H8.5V9zM10 14.5h4v4H10v-4z'
    + '"/>'
    + MAP_PIN,
  bubble:
    '<path fill-rule="evenodd" d="'
    + 'M8 11.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM6.8 12.8a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z'
    + 'M15.5 8a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM14.6 8.9a1 1 0 1 0 0 2 1 1 0 0 0 0-2z'
    + 'M18.5 14a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM17.8 14.7a0.9 0.9 0 1 0 0 1.8 0.9 0.9 0 0 0 0-1.8z'
    + '"/>'
    + MAP_PIN,
  arcade:
    '<path fill-rule="evenodd" d="'
    + 'M5.5 5.5h12l.8 2.2H4.7l.8-2.2zM5 8h13.5v1.2H5V8zM5.5 9.2h12.5v7.8H5.5V9.2zM7 10.5h7.5v4.5H7V10.5z'
    + 'M15.5 11.5h2v3.5h-2v-3.5zM16.25 10.5h1v1.5h-1v-1.5zM16 14.5h.6v.8H16v-.8zM17 14.5h.6v.8H17v-.8z'
    + '"/>'
    + MAP_PIN,
  speedway:
    '<path d="M4.5 4h1.5v15.5H4.5V4z"/>'
    + '<path fill-rule="evenodd" d="'
    + 'M7 5.5h13l.8 1.8-13 .7-.8-2.5zM7 8.8h13.2v5.5H7V8.8z'
    + 'M8 6.2h2.8v1.6H8V6.2zM12.2 6.2h2.8v1.6h-2.8V6.2zM16.4 6.2h2.8v1.6h-2.8V6.2z'
    + 'M8 9.5h2.8v1.6H8V9.5zM12.2 9.5h2.8v1.6h-2.8V9.5zM16.4 9.5h2.8v1.6h-2.8V9.5z'
    + 'M8 12.8h2.8v1.6H8v-1.6zM12.2 12.8h2.8v1.6h-2.8v-1.6zM16.4 12.8h2.8v1.6h-2.8v-1.6z'
    + '"/>'
    + MAP_PIN,
};

const TERRAIN_BG =
  '<rect x="18" y="38" width="4" height="2" opacity=".12"/>'
  + '<rect x="14" y="40" width="12" height="2" opacity=".12"/>'
  + '<rect x="10" y="42" width="20" height="2" opacity=".12"/>';

function markerHtml(key) {
  const shapes = LANDMARKS[key] || '<path d="M12 4 20 12 12 20 4 12Z"/>';
  return (
    '<div class="world-node__marker">'
    + '<svg class="world-node__landmark" viewBox="0 0 24 28" aria-hidden="true">'
    + `<g class="world-node__symbol">${shapes}</g></svg>`
    + '<span class="world-node__blip" aria-hidden="true"><span class="world-node__blip-core"></span></span>'
    + '</div>'
  );
}

function buildRadarSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'world-radar__svg');
  svg.setAttribute('viewBox', '0 0 100 50');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const terrain = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  terrain.setAttribute('class', 'world-radar__terrain');
  terrain.innerHTML = TERRAIN_BG;
  svg.appendChild(terrain);

  const links = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  links.setAttribute('class', 'world-radar__links');
  for (const node of RADAR_NODES) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '50');
    line.setAttribute('y1', '25');
    line.setAttribute('x2', String(node.x));
    line.setAttribute('y2', String(node.y / 2));
    links.appendChild(line);
  }
  svg.appendChild(links);
  return svg;
}

export function renderWorldRadar(root, { onSelect } = {}) {
  if (!root) return;
  root.replaceChildren();

  const display = document.createElement('div');
  display.className = 'world-radar__display';

  const scan = document.createElement('div');
  scan.className = 'world-radar__scan';
  scan.setAttribute('aria-hidden', 'true');

  const rings = document.createElement('div');
  rings.className = 'world-radar__rings';
  rings.setAttribute('aria-hidden', 'true');

  const hub = document.createElement('div');
  hub.className = 'world-radar__hub';
  hub.setAttribute('aria-hidden', 'true');
  hub.innerHTML = '<span class="world-radar__hub-core"></span><span class="world-radar__hub-ring"></span>';

  const stage = document.createElement('div');
  stage.className = 'world-radar__stage';

  stage.append(buildRadarSvg(), scan, rings, hub);

  for (const node of RADAR_NODES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `world-node world-node--${node.key}`;
    btn.dataset.world = node.key;
    btn.style.setProperty('--nx', `${node.x}%`);
    btn.style.setProperty('--ny', `${node.y}%`);
    btn.setAttribute('aria-label', node.label);

    btn.innerHTML = `${markerHtml(node.key)}<span class="world-node__label">${node.label}</span>`;
    btn.addEventListener('click', () => onSelect?.(node.key));
    stage.appendChild(btn);
  }

  display.append(stage);

  const caption = document.createElement('p');
  caption.className = 'world-radar__caption';
  caption.textContent = 'Select destination';

  root.append(caption, display);
}
