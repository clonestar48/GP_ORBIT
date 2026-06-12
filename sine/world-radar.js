/** Retro mission-select radar — 8 worlds around a central hub. */

export const RADAR_NODES = [
  { key: 'space-age', x: 50, y: 10, label: 'Space Age' },
  { key: 'ice-cave', x: 16, y: 24, label: 'Ice Cave' },
  { key: 'dungeon', x: 84, y: 24, label: 'Dungeon' },
  { key: 'beach', x: 8, y: 50, label: 'Beach' },
  { key: 'bubble', x: 92, y: 50, label: 'Bubble' },
  { key: 'desert', x: 16, y: 76, label: 'Desert' },
  { key: 'speedway', x: 84, y: 76, label: 'Speedway' },
  { key: 'arcade', x: 50, y: 82, label: 'Arcade' },
];

/**
 * Map-marker silhouettes — viewBox 0 0 24 20, 2px pixel grid.
 * One dominant landmark per world; readable at 16–24px.
 */
const LANDMARKS = {
  'space-age':
    '<rect x="11" y="0" width="2" height="7"/>'
    + '<rect x="11" y="13" width="2" height="7"/>'
    + '<rect x="0" y="9" width="7" height="2"/>'
    + '<rect x="17" y="9" width="7" height="2"/>'
    + '<rect x="8" y="7" width="8" height="6"/>',
  arcade:
    '<rect x="5" y="1" width="14" height="3"/>'
    + '<rect x="4" y="4" width="16" height="7"/>'
    + '<rect x="6" y="6" width="12" height="4" class="world-node__dim"/>'
    + '<rect x="3" y="11" width="18" height="7"/>'
    + '<rect x="10" y="14" width="4" height="2" class="world-node__dim"/>',
  dungeon:
    '<rect x="3" y="2" width="2" height="2"/><rect x="6" y="2" width="2" height="2"/>'
    + '<rect x="16" y="2" width="2" height="2"/><rect x="19" y="2" width="2" height="2"/>'
    + '<rect x="9" y="2" width="2" height="2"/><rect x="13" y="2" width="2" height="2"/>'
    + '<rect x="3" y="4" width="5" height="12"/>'
    + '<rect x="16" y="4" width="5" height="12"/>'
    + '<rect x="8" y="6" width="8" height="10"/>'
    + '<rect x="10" y="12" width="4" height="4" class="world-node__dim"/>',
  bubble:
    '<rect x="8" y="8" width="10" height="10"/>'
    + '<rect x="15" y="2" width="8" height="8"/>'
    + '<rect x="2" y="10" width="7" height="7"/>',
  beach:
    '<rect x="10" y="1" width="4" height="2"/>'
    + '<rect x="4" y="3" width="16" height="3"/>'
    + '<rect x="2" y="5" width="8" height="3"/>'
    + '<rect x="14" y="5" width="8" height="3"/>'
    + '<rect x="11" y="8" width="2" height="9"/>'
    + '<rect x="2" y="17" width="20" height="3"/>',
  desert:
    '<rect x="10" y="3" width="4" height="14"/>'
    + '<rect x="5" y="7" width="6" height="3"/>'
    + '<rect x="7" y="5" width="2" height="5"/>'
    + '<rect x="13" y="10" width="6" height="3"/>'
    + '<rect x="15" y="8" width="2" height="5"/>',
  'ice-cave':
    '<rect x="11" y="0" width="2" height="4"/>'
    + '<rect x="9" y="4" width="6" height="3"/>'
    + '<rect x="7" y="7" width="10" height="4"/>'
    + '<rect x="5" y="11" width="14" height="4"/>'
    + '<rect x="8" y="15" width="8" height="3"/>',
  speedway:
    '<rect x="3" y="0" width="2" height="18"/>'
    + '<rect x="5" y="1" width="6" height="4"/>'
    + '<rect x="11" y="1" width="6" height="4" class="world-node__dim"/>'
    + '<rect x="5" y="5" width="6" height="4" class="world-node__dim"/>'
    + '<rect x="11" y="5" width="6" height="4"/>'
    + '<rect x="5" y="9" width="6" height="4"/>'
    + '<rect x="11" y="9" width="6" height="4" class="world-node__dim"/>',
};

const TERRAIN_BG =
  '<rect x="18" y="38" width="4" height="2" opacity=".12"/>'
  + '<rect x="14" y="40" width="12" height="2" opacity=".12"/>'
  + '<rect x="10" y="42" width="20" height="2" opacity=".12"/>';

function markerHtml(key) {
  const shapes = LANDMARKS[key] || '<rect x="8" y="6" width="8" height="8"/>';
  return (
    '<div class="world-node__marker">'
    + `<svg class="world-node__landmark" viewBox="0 0 24 20" aria-hidden="true" shape-rendering="crispEdges">`
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

  display.append(buildRadarSvg(), scan, rings, hub);

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
    display.appendChild(btn);
  }

  const caption = document.createElement('p');
  caption.className = 'world-radar__caption';
  caption.textContent = 'Select destination';

  root.append(caption, display);
}
