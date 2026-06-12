/**
 * Word wrap for Three.js typeface shapes — manual breaks at newlines, auto at spaces.
 */

function measureWidth(font, text, size) {
  if (!text) return 0;
  const shapes = font.generateShapes(text, size);
  let minX = Infinity;
  let maxX = -Infinity;
  shapes.forEach((shape) => {
    shape.getPoints(8).forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
    });
  });
  if (!Number.isFinite(minX)) return 0;
  return maxX - minX;
}

function wrapWords(text, font, maxWidth, size) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && measureWidth(font, test, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }

  if (current) lines.push(current);
  return lines;
}

/** Lines for rendered mesh — skips blank rows. */
export function wrapLabel(label, font, maxWidth, size) {
  const text = label.replace(/\r\n/g, '\n').toUpperCase();
  if (!text.trim() || !font || maxWidth <= 0) return [];

  const lines = [];
  for (const row of text.split('\n')) {
    const segment = row.trim();
    if (!segment) continue;
    lines.push(...wrapWords(segment, font, maxWidth, size));
  }

  return lines;
}

/** Lines for caret prefix — keeps trailing empty row after Shift+Enter. */
export function wrapLabelPrefix(prefix, font, maxWidth, size) {
  const text = prefix.replace(/\r\n/g, '\n').toUpperCase();
  if (!text || !font || maxWidth <= 0) return [''];

  const endsWithNewline = prefix.endsWith('\n');
  const rows = text.split('\n');
  const lines = [];

  for (let i = 0; i < rows.length; i += 1) {
    const segment = rows[i].trim();
    if (segment) {
      lines.push(...wrapWords(segment, font, maxWidth, size));
    } else if (i < rows.length - 1 || endsWithNewline) {
      lines.push('');
    }
  }

  return lines.length ? lines : [''];
}

export function caretOffsetX(partial, full, font, size) {
  const partialW = measureWidth(font, partial, size);
  const fullW = measureWidth(font, full, size);
  return partialW - fullW / 2;
}

export { measureWidth };
