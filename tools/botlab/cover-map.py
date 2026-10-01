# Draw the cover map from cover-map.js's result line (page.cjs output): python3 cover-map.py page.log out.png [title]
# Minimap view (+X to the left, +Z up). Colour = distance to the nearest cover ≥ 0.9 m: green ≤ 2, yellow-green ≤ 5,
# orange ≤ 8, red beyond; grey = not floor (objects, roofs), blue = water. The largest open circle is drawn.
import sys, json, base64, re
from PIL import Image, ImageDraw, ImageFont
log = open(sys.argv[1]).read(); out = sys.argv[2]; title = sys.argv[3] if len(sys.argv) > 3 else ''
info = json.loads(re.search(r'PASS cover map  (\{.*\})', log).group(1))
g = info['grid']; x0, z0, nx, nz = g['x0'], g['z0'], g['nx'], g['nz']; b = base64.b64decode(g['b64'])
S = 10; W, H = nx * S, nz * S + 60
im = Image.new('RGB', (W, H), (40, 80, 110)); d = ImageDraw.Draw(im)
F = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 14)
def P(x, z): return ((x0 + nx - x) * S, (z0 + nz - z) * S + 60)
def col(v):
    if v == 255: return None
    m = v / 10
    if m <= 2: return (70, 170, 90)
    if m <= 5: return (170, 200, 90)
    if m <= 8: return (235, 160, 60)
    return (215, 60, 50)
for j in range(nz):
    for i in range(nx):
        v = b[j * nx + i]; c = col(v)
        x = x0 + i; z = z0 + j
        if c: d.rectangle([P(x + 1, z + 1), P(x, z)], fill=c)
for r in info.get('skip', []):
    d.rectangle([P(r[1], r[3]), P(r[0], r[2])], outline=(255, 255, 255), width=2)
if info.get('at'):
    cx, cz = info['at']; rr = info['largestOpenRadius_m']
    d.ellipse([P(cx + rr, cz + rr), P(cx - rr, cz - rr)], outline=(255, 255, 255), width=3)
d.rectangle([0, 0, W, 58], fill=(20, 24, 30))
d.text((8, 6), f"{title or info['map']}: {info['within5m_pct']}% of {info['floorCells']} floor cells within 5 m of cover", fill=(255, 255, 255), font=F)
d.text((8, 28), f"largest open circle r = {info['largestOpenRadius_m']} m at {info['at']}  (green ≤2 · yellow ≤5 · orange ≤8 · red >8 m)", fill=(220, 220, 220), font=F)
im.save(out); print('saved', out, info['within5m_pct'], info['largestOpenRadius_m'], info['at'])
