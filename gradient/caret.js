/**
 * Map textarea cursor index to 3D text layout coordinates.
 */

import { wrapLabelPrefix, caretOffsetX } from './wrap.js';

/**
 * Resolve cursor to horizontal offset and row position in layout space.
 * @param {Array<{ text: string, height: number, y: number }>} layoutLines
 */
export function resolveCaretLine(prefix, layoutLines, font, maxWidth, size, lineGap) {
  const prefixLines = wrapLabelPrefix(prefix, font, maxWidth, size);
  const lineIndex = Math.max(0, prefixLines.length - 1);
  const partial = prefixLines[lineIndex] ?? '';
  const full = layoutLines[lineIndex]?.text ?? partial;

  let localX = caretOffsetX(partial, full, font, size);
  let localY = layoutLines[lineIndex]?.y;
  let lineHeight = layoutLines[lineIndex]?.height ?? size * 1.05;

  if (localY === undefined && layoutLines.length) {
    const last = layoutLines[layoutLines.length - 1];
    const gap = size * lineGap;
    localY = last.y - last.height * 0.5 - gap - lineHeight * 0.5;
    localX = 0;
  } else if (localY === undefined) {
    localY = 0;
    localX = 0;
  }

  return { localX, localY, lineHeight };
}
