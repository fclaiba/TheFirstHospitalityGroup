"""Rebuild prototype/index.html from prototype/src/app.html: inlines the brand fonts and the lion mark.
Usage: python3 prototype/build.py"""
import base64, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "docs/brand/_src/fonts")
faces = [("Figtree", w, f"figtree-latin-{w}-normal.woff2") for w in (400, 500, 600, 700)] + [("IBM Plex Mono", 400, "ibm-plex-mono-latin-400-normal.woff2")]
css = "".join(
    f'@font-face{{font-family:"{n}";font-style:normal;font-weight:{w};font-display:swap;'
    f'src:url(data:font/woff2;base64,{base64.b64encode(open(os.path.join(FONTS, f), "rb").read()).decode()}) format("woff2");}}\n'
    for n, w, f in faces)
src = open(os.path.join(ROOT, "prototype/src/app.html")).read()
mark = open(os.path.join(ROOT, "docs/brand/logos/mark-martini.svg")).read()
inner = re.search(r"</title>(.*)</svg>", mark, re.S).group(1)
# themed copy for the app bar: follows light and dark tokens
themed = (inner.replace('fill="#4A6B3E"', 'style="fill:var(--brand)"')
               .replace('fill="#FFFFFF"', 'style="fill:var(--canvas)"')
               .replace('stroke="#FFFFFF"', 'style="stroke:var(--canvas)"'))
out = (src.replace("/*FONTS*/", css)
          .replace("<!--MARK_BRAND-->", themed)
          .replace("<!--MARK_WHITE-->", inner))
open(os.path.join(ROOT, "prototype/index.html"), "w").write(out)
print("prototype/index.html", len(out) // 1024, "KB")
