"""Generate The First Hospitality Group logo SVGs with outlined text.
Usage: python3 docs/brand/_src/generate-logos.py docs/brand/logos  (needs: pip install fonttools brotli)"""
import sys, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

F = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
SERIF = TTFont(f"{F}/figtree-latin-600-normal.woff2")
SANS = TTFont(f"{F}/figtree-latin-500-normal.woff2")
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

OLIVE, INK, WHITE = "#5C6B2F", "#111311", "#FFFFFF"


def text_path(font, text, size, x, y, tracking=0.0):
    """Return (svg path d, advance width) for text at baseline (x, y)."""
    upm = font["head"].unitsPerEm
    s = size / upm
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    hmtx = font["hmtx"]
    pen = SVGPathPen(gs)
    cx = x
    for ch in text:
        g = cmap.get(ord(ch))
        if g is None:
            continue
        tp = TransformPen(pen, (s, 0, 0, -s, cx, y))
        gs[g].draw(tp)
        cx += hmtx[g][0] * s + tracking * size
    width = cx - x - tracking * size
    return pen.getCommands(), width


BOLD = TTFont(f"{F}/figtree-latin-700-normal.woff2")


def _glyph(ch, scale, ox, oy):
    """Outline of one Figtree Bold capital, cap-height aligned, left edge of ink at ox."""
    from fontTools.pens.boundsPen import BoundsPen
    gs = BOLD.getGlyphSet(); g = BOLD.getBestCmap()[ord(ch)]
    bp = BoundsPen(gs); gs[g].draw(bp); xmin, ymin, xmax, ymax = bp.bounds
    pen = SVGPathPen(gs)
    gs[g].draw(TransformPen(pen, (scale, 0, 0, -scale, ox - xmin*scale, oy)))
    return pen.getCommands(), (xmax - xmin) * scale


def mark(cx, cy, r, color, stroke=None):
    """TFHG monogram: four Figtree Bold capitals on a 2x2 grid (TF over HG).
    Equal cap height, equal column widths, gutters set optically (row gap = 0.42 cap,
    column gap = 0.30 cap) so the block reads as one square mark."""
    upm = BOLD["head"].unitsPerEm
    cap = BOLD["OS/2"].sCapHeight or 700
    size = 2 * r
    # the block is a square of side `size`: 2 caps + row gap
    capH = size / (2 + 0.30)
    k = capH / cap
    widths = {c: _glyph(c, k, 0, 0)[1] for c in "TFHG"}
    # Each row is centred on the block axis with an optical gap: T's open arms already
    # carry air, so the TF gap is tighter than the HG gap. Equal-looking spacing beats
    # equal measured spacing.
    gaps = {"TF": capH * 0.16, "HG": capH * 0.24}
    y_top = cy - size / 2 + capH
    y_bot = y_top + capH * 1.30
    out = []
    for (a1, a2), base in [(("T", "F"), y_top), (("H", "G"), y_bot)]:
        g = gaps[a1 + a2]
        roww = widths[a1] + g + widths[a2]
        x = cx - roww / 2
        out.append(_glyph(a1, k, x, base)[0])
        out.append(_glyph(a2, k, x + widths[a1] + g, base)[0])
    return f'<path d="{" ".join(out)}" fill="{color}"/>'


def svg(w, h, body, bg=None, title="The First Hospitality Group"):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'role="img" aria-label="{title}"><title>{title}</title>{rect}{body}</svg>\n')


def write(name, content):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(content)


# Mark only
for name, col, bg in [("mark-olive.svg", OLIVE, None), ("mark-ink.svg", INK, None), ("mark-white.svg", WHITE, None)]:
    write(name, svg(64, 64, mark(32, 32, 28, col)))

# App icon (maskable safe zone: mark within 80 %)
write("app-icon.svg", svg(512, 512, mark(256, 256, 118, WHITE), bg=OLIVE))
write("app-icon-light.svg", svg(512, 512, mark(256, 256, 118, OLIVE), bg=WHITE))


def lockup_h(color_mark, color_text, color_sub, bg=None):
    d1, w1 = text_path(SERIF, "THE FIRST", 38, 0, 0, tracking=0.16)
    d2, w2 = text_path(SANS, "HOSPITALITY GROUP", 13, 0, 0, tracking=0.32)
    gap, m = 22, 64
    textw = max(w1, w2)
    W, H = int(m + gap + textw + 8), 72
    x0 = m + gap
    d1, _ = text_path(SERIF, "THE FIRST", 38, x0, 38, tracking=0.16)
    d2, _ = text_path(SANS, "HOSPITALITY GROUP", 13, x0 + 1, 61, tracking=0.32)
    body = mark(32, 36, 30, color_mark) + f'<path d="{d1}" fill="{color_text}"/><path d="{d2}" fill="{color_sub}"/>'
    return svg(W, H, body, bg=bg)


def lockup_v(color_mark, color_text, color_sub, bg=None):
    _, w1 = text_path(SERIF, "THE FIRST", 42, 0, 0, tracking=0.16)
    _, w2 = text_path(SANS, "HOSPITALITY GROUP", 14, 0, 0, tracking=0.32)
    W = int(max(w1, w2) + 40)
    H = 210
    d1, _ = text_path(SERIF, "THE FIRST", 42, (W - w1) / 2, 148, tracking=0.16)
    d2, _ = text_path(SANS, "HOSPITALITY GROUP", 14, (W - w2) / 2, 180, tracking=0.32)
    body = mark(W / 2, 52, 44, color_mark) + f'<path d="{d1}" fill="{color_text}"/><path d="{d2}" fill="{color_sub}"/>'
    return svg(W, H, body, bg=bg)


write("logo-horizontal.svg", lockup_h(OLIVE, INK, OLIVE))
write("logo-horizontal-white.svg", lockup_h(WHITE, WHITE, "#C9D1AE"))
write("logo-horizontal-reverse.svg", lockup_h(WHITE, WHITE, "#C9D1AE", bg=INK))
write("logo-stacked.svg", lockup_v(OLIVE, INK, OLIVE))
write("logo-stacked-reverse.svg", lockup_v(WHITE, WHITE, "#C9D1AE", bg=OLIVE))
d, w = text_path(SERIF, "THE FIRST", 38, 4, 38, tracking=0.16)
write("wordmark.svg", svg(int(w + 8), 52, f'<path d="{d}" fill="{INK}"/>'))
print("ok", sorted(os.listdir(OUT)))
