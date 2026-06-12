#!/usr/bin/env python3
"""Convert a TTF/TTC face to Three.js typeface.json (facetype.js format)."""

import json
import sys
from fontTools.ttLib import TTFont, TTCollection
from fontTools.pens.boundsPen import ControlBoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Scale

RESOLUTION = 1000
CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'


def load_font(path, font_number=None):
    if path.lower().endswith('.ttc'):
        return TTCollection(path).fonts[font_number]
    return TTFont(path)


def recording_to_outline(recording):
    parts = []
    for op, args in recording.value:
        if op == 'moveTo':
            x, y = args[0]
            parts.extend(['m', str(round(x)), str(round(y))])
        elif op == 'lineTo':
            x, y = args[0]
            parts.extend(['l', str(round(x)), str(round(y))])
        elif op == 'qCurveTo':
            # TrueType quad: control points + on-curve end
            *controls, end = args
            if len(controls) == 1:
                cx, cy = controls[0]
                ex, ey = end
                parts.extend(['q', str(round(ex)), str(round(ey)), str(round(cx)), str(round(cy))])
            else:
                for i in range(0, len(controls), 1):
                    cx, cy = controls[i]
                    ex, ey = end if i == len(controls) - 1 else controls[i + 1]
                    parts.extend(['q', str(round(ex)), str(round(ey)), str(round(cx)), str(round(cy))])
        elif op == 'curveTo':
            c1, c2, end = args
            parts.extend([
                'b',
                str(round(end[0])), str(round(end[1])),
                str(round(c1[0])), str(round(c1[1])),
                str(round(c2[0])), str(round(c2[1])),
            ])
        elif op == 'closePath':
            pass
    return ' '.join(parts)


def convert(path, out_path, font_number=None):
    font = load_font(path, font_number)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    units = font['head'].unitsPerEm
    scale = RESOLUTION / units
    ascender = round(font['hhea'].ascender * scale)
    descender = round(font['hhea'].descender * scale)

    x_min = y_min = 10**9
    x_max = y_max = -10**9

    glyphs = {}

    for char in CHARS:
        code = ord(char)
        if code not in cmap:
            continue
        name = cmap[code]
        advance, _ = font['hmtx'][name]

        rec = RecordingPen()
        tpen = TransformPen(rec, Scale(scale, scale))
        glyph_set[name].draw(tpen)

        bounds = ControlBoundsPen(glyph_set)
        glyph_set[name].draw(bounds)
        if bounds.bounds:
            bx0, by0, bx1, by1 = bounds.bounds
            gx0, gy0, gx1, gy1 = [round(v * scale) for v in (bx0, by0, bx1, by1)]
            x_min = min(x_min, gx0)
            y_min = min(y_min, gy0)
            x_max = max(x_max, gx1)
            y_max = max(y_max, gy1)
        else:
            gx0 = gy0 = gx1 = gy1 = 0

        glyphs[char] = {
            'x_min': gx0,
            'x_max': gx1,
            'ha': round(advance * scale),
            'o': recording_to_outline(rec),
        }

    family = font['name'].getDebugName(1) or 'Futura'
    style = font['name'].getDebugName(2) or 'Bold'

    data = {
        'glyphs': glyphs,
        'familyName': family,
        'ascender': ascender,
        'descender': descender,
        'underlinePosition': round(font['post'].underlinePosition * scale),
        'underlineThickness': round(font['post'].underlineThickness * scale),
        'boundingBox': {
            'xMin': x_min if x_min < 10**9 else 0,
            'yMin': y_min if y_min < 10**9 else descender,
            'xMax': x_max if x_max > -10**9 else RESOLUTION,
            'yMax': y_max if y_max > -10**9 else ascender,
        },
        'resolution': RESOLUTION,
        'original_font_information': {
            'postscript_name': font['name'].getDebugName(6) or family,
            'full_font_name': f'{family} {style}',
            'font_family_name': family,
            'font_sub_family_name': style,
        },
        'cssFontWeight': 'bold',
        'cssFontStyle': 'normal',
        'lineHeight': ascender - descender,
    }

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'))

    print(f'Wrote {out_path} ({len(glyphs)} glyphs)')


if __name__ == '__main__':
    src = sys.argv[1]
    dst = sys.argv[2]
    num = int(sys.argv[3]) if len(sys.argv) > 3 else None
    convert(src, dst, num)
