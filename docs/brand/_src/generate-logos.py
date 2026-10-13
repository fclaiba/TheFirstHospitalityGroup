"""Generate The First Hospitality Group logo files: the lion mark and lockups, text outlined.
Usage: python3 docs/brand/_src/generate-logos.py docs/brand/logos   (needs: pip install fonttools brotli)
The lion: a lion head in profile facing right, one solid mass in martini green, with negative-space
lines for the mane rhythm (three concentric curves), the eye, the brow, the ear, the mouth and the whiskers.
Built on a 512 grid; the "min" version (boundary curve + eye) is for 16 to 32 px."""
import os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

F = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
SEMI = TTFont(f"{F}/figtree-latin-600-normal.woff2")
MED = TTFont(f"{F}/figtree-latin-500-normal.woff2")
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
MARTINI, INK, WHITE, PALE = "#4A6B3E", "#111311", "#FFFFFF", "#C8D6BA"

SIL = ("M336 100 "
       "C330 74 314 54 292 44 "          # ear front edge to tip
       "C276 38 264 40 254 46 "          # ear back into crown
       "C220 34 172 34 132 50 "          # crown of mane
       "C152 62 162 74 164 88 "
       "C124 80 84 94 56 124 "
       "C90 128 104 140 110 152 "
       "C72 162 44 194 34 236 "
       "C66 230 86 238 94 250 "
       "C60 274 48 310 52 350 "
       "C78 334 100 334 114 340 "
       "C98 372 100 410 118 442 "
       "C134 418 154 410 172 408 "
       "C178 440 198 468 228 486 "
       "C236 458 254 444 274 438 "
       "C290 462 316 478 348 484 "
       "C340 452 346 424 360 404 "
       "C374 384 392 368 410 358 "       # throat
       "C424 350 432 340 434 326 "       # chin
       "C438 312 446 302 452 292 "       # lower lip
       "C460 280 464 266 464 254 "       # muzzle front
       "C474 250 482 240 480 226 "       # nose
       "C478 214 468 206 456 200 "       # top of nose
       "L376 136 "                       # straight bridge
       "C362 124 348 112 336 100 Z")

def lion(fill, bg, detail="full", x=0, y=0, size=512):
    """Lion drawn into a size x size box at (x, y). bg is the color of the negative lines."""
    s = size / 512
    w = 9 if detail == "full" else 15
    neg = ["M306 92 C270 136 256 190 264 244 C272 296 304 336 356 364"]
    if detail == "full":
        neg += ["M246 108 C214 150 202 198 208 248 C214 296 240 334 284 364",
                "M188 140 C162 178 152 222 158 268 C162 306 182 338 214 364"]
    g = [f'<path d="{SIL}" fill="{fill}"/>',
         f'<path d="{" ".join(neg)}" stroke="{bg}" stroke-width="{w}" stroke-linecap="round" fill="none"/>',
         f'<path d="M366 168 C380 154 402 152 420 160 C408 174 384 180 366 168 Z" fill="{bg}"/>']
    if detail == "full":
        g += [f'<path d="M360 142 C378 134 400 134 420 142" stroke="{bg}" stroke-width="7" stroke-linecap="round" fill="none"/>',
              f'<path d="M290 58 C306 66 318 82 322 100" stroke="{bg}" stroke-width="7" stroke-linecap="round" fill="none"/>',
              f'<path d="M456 300 C438 308 418 310 400 306" stroke="{bg}" stroke-width="7" stroke-linecap="round" fill="none"/>',
              f'<path d="M470 240 C464 248 458 252 450 254" stroke="{bg}" stroke-width="5" stroke-linecap="round" fill="none"/>',
              f'<g fill="{bg}"><circle cx="432" cy="272" r="4.5"/><circle cx="416" cy="280" r="4.5"/><circle cx="434" cy="288" r="4"/></g>']
    return f'<g transform="translate({x:.1f} {y:.1f}) scale({s:.4f})">{"".join(g)}</g>'

def text_path(font, text, size, x, y, tracking=0.0):
    upm = font["head"].unitsPerEm; k = size / upm
    cmap = font.getBestCmap(); gs = font.getGlyphSet(); hmtx = font["hmtx"]
    pen = SVGPathPen(gs); cx = x
    for ch in text:
        g = cmap.get(ord(ch))
        if g is None: continue
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, cx, y)))
        cx += hmtx[g][0] * k + tracking * size
    return pen.getCommands(), cx - x - tracking * size

def svg(w, h, body, bg=None, title="The First Hospitality Group"):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" role="img" '
            f'aria-label="{title}"><title>{title}</title>{rect}{body}</svg>\n')

def write(name, content):
    open(os.path.join(OUT, name), "w").write(content)

# marks (transparent; negative lines need a background color, so each mark is made for its ground)
write("mark-martini.svg", svg(512, 512, lion(MARTINI, WHITE)))
write("mark-ink.svg", svg(512, 512, lion(INK, WHITE)))
write("mark-white.svg", svg(512, 512, lion(WHITE, MARTINI), bg=MARTINI))
write("mark-min.svg", svg(512, 512, lion(MARTINI, WHITE, "min")))
# app icon and favicon (maskable: lion inside the 80 % safe zone)
write("app-icon.svg", svg(512, 512, lion(WHITE, MARTINI, x=86, y=86, size=340), bg=MARTINI))
write("app-icon-light.svg", svg(512, 512, lion(MARTINI, WHITE, x=86, y=86, size=340), bg=WHITE))
write("favicon.svg", svg(64, 64, lion(WHITE, MARTINI, "min", x=4, y=4, size=56), bg=MARTINI))

def lockup_h(mark_fill, mark_bg, word, sub, bg=None):
    m = 76
    d1, w1 = text_path(SEMI, "THE FIRST", 38, 0, 0, tracking=0.16)
    d2, w2 = text_path(MED, "HOSPITALITY GROUP", 13, 0, 0, tracking=0.32)
    x0 = m + 22; W = x0 + max(w1, w2) + 8; H = 80
    d1, _ = text_path(SEMI, "THE FIRST", 38, x0, 42, tracking=0.16)
    d2, _ = text_path(MED, "HOSPITALITY GROUP", 13, x0 + 1, 64, tracking=0.32)
    body = lion(mark_fill, mark_bg, x=0, y=2, size=m) + f'<path d="{d1}" fill="{word}"/><path d="{d2}" fill="{sub}"/>'
    return svg(W, H, body, bg=bg)

def lockup_v(mark_fill, mark_bg, word, sub, bg=None):
    _, w1 = text_path(SEMI, "THE FIRST", 44, 0, 0, tracking=0.16)
    _, w2 = text_path(MED, "HOSPITALITY GROUP", 15, 0, 0, tracking=0.32)
    W = max(w1, w2) + 48; H = 270
    d1, _ = text_path(SEMI, "THE FIRST", 44, (W - w1) / 2, 214, tracking=0.16)
    d2, _ = text_path(MED, "HOSPITALITY GROUP", 15, (W - w2) / 2, 246, tracking=0.32)
    body = lion(mark_fill, mark_bg, x=(W - 160) / 2, y=12, size=160) + f'<path d="{d1}" fill="{word}"/><path d="{d2}" fill="{sub}"/>'
    return svg(W, H, body, bg=bg)

write("logo-horizontal.svg", lockup_h(MARTINI, WHITE, INK, MARTINI))
write("logo-horizontal-white.svg", lockup_h(WHITE, MARTINI, WHITE, PALE, bg=MARTINI))
write("logo-horizontal-reverse.svg", lockup_h(WHITE, INK, WHITE, PALE, bg=INK))
write("logo-stacked.svg", lockup_v(MARTINI, WHITE, INK, MARTINI))
write("logo-stacked-reverse.svg", lockup_v(WHITE, MARTINI, WHITE, PALE, bg=MARTINI))
d, w = text_path(SEMI, "THE FIRST", 38, 4, 38, tracking=0.16)
write("wordmark.svg", svg(w + 8, 52, f'<path d="{d}" fill="{INK}"/>'))
print("ok", sorted(os.listdir(OUT)))
