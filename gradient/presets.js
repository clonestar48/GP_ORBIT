/**
 * Classic letterform gradient fills — face only (bevel is separate).
 * `stops` drive the 3D face texture; `fill` drives UI swatches.
 */

export const PRESETS = [
  {
    id: 'chrome',
    label: 'Chrome',
    era: '80s',
    fill: 'linear-gradient(180deg, #ffffff 0%, #e2e2e2 8%, #9a9a9a 38%, #f0f0f0 48%, #6a6a6a 72%, #2a2a2a 92%, #0a0a0a 100%)',
    stops: [[0, '#ffffff'], [0.08, '#e2e2e2'], [0.38, '#9a9a9a'], [0.48, '#f0f0f0'], [0.72, '#6a6a6a'], [0.92, '#2a2a2a'], [1, '#0a0a0a']],
  },
  {
    id: 'brass',
    label: 'Brass',
    era: '70s',
    fill: 'linear-gradient(180deg, #fff6c8 0%, #e8c060 18%, #a87828 45%, #f0d878 52%, #806018 78%, #3a2808 100%)',
    stops: [[0, '#fff6c8'], [0.18, '#e8c060'], [0.45, '#a87828'], [0.52, '#f0d878'], [0.78, '#806018'], [1, '#3a2808']],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    era: '70s',
    fill: 'linear-gradient(180deg, #ffe8a0 0%, #ff9850 28%, #e83868 58%, #901858 82%, #401028 100%)',
    stops: [[0, '#ffe8a0'], [0.28, '#ff9850'], [0.58, '#e83868'], [0.82, '#901858'], [1, '#401028']],
  },
  {
    id: 'neon',
    label: 'Neon 85',
    era: '80s',
    fill: 'linear-gradient(180deg, #ffff80 0%, #ff4080 35%, #c020ff 65%, #4020a0 100%)',
    stops: [[0, '#ffff80'], [0.35, '#ff4080'], [0.65, '#c020ff'], [1, '#4020a0']],
  },
  {
    id: 'aqua',
    label: 'Aqua Chrome',
    era: '90s',
    fill: 'linear-gradient(180deg, #e8ffff 0%, #60e8f0 15%, #0898b0 42%, #c0f8ff 50%, #087888 75%, #042838 100%)',
    stops: [[0, '#e8ffff'], [0.15, '#60e8f0'], [0.42, '#0898b0'], [0.5, '#c0f8ff'], [0.75, '#087888'], [1, '#042838']],
  },
  {
    id: 'plum',
    label: 'Plum Fade',
    era: '90s',
    fill: 'linear-gradient(180deg, #f0c8ff 0%, #c060e0 30%, #6020a0 60%, #280848 100%)',
    stops: [[0, '#f0c8ff'], [0.3, '#c060e0'], [0.6, '#6020a0'], [1, '#280848']],
  },
];

export const DEFAULT_PRESET_ID = 'chrome';

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}
