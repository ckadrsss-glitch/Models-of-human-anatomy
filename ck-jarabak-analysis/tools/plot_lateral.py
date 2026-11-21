# Lateral projection + mid-sagittal slice of assets/skull.bin rendered to PNG (no matplotlib).
# usage: python3 tools/plot_lateral.py out.png z0 z1 y0 y1 pxPerMm [midslice_halfwidth]
import json, sys, numpy as np
from PIL import Image, ImageDraw
H = json.load(open("assets/skull.json")); raw = open("assets/skull.bin", "rb").read()
def ch(n):
    c = next(c for c in H["chunks"] if c["name"] == n)
    return np.frombuffer(raw[c["offset"]:c["offset"] + c["bytes"]], dtype=c["dtype"]).reshape(c["shape"])
P = ch("position"); part = ch("part"); idx = ch("index").reshape(-1, 3)
out, z0, z1, y0, y1, k = sys.argv[1], *map(float, sys.argv[2:7])
hw = float(sys.argv[7]) if len(sys.argv) > 7 else 0
W, Hh = int((z1 - z0) * k), int((y1 - y0) * k)
img = Image.new("RGB", (W, Hh), (10, 14, 24)); d = ImageDraw.Draw(img)
cols = {0: (150, 150, 150), 1: (230, 150, 170), 2: (80, 200, 255), 3: (255, 200, 60)}
X = lambda z: (z - z0) * k; Y = lambda y: (y1 - y) * k
# filled triangles in lateral projection (painter by x: draw far side first not needed: flat colour per part)
for pk in [0, 1, 2, 3]:
    tri = idx[part[idx[:, 0]] == pk]
    if hw > 0:
        tri = tri[np.abs(P[tri[:, 0], 0]) < hw]
    c = tuple(int(v * (0.55 if hw == 0 else 1)) for v in cols[pk])
    for a, b, cc in tri:
        d.polygon([(X(P[a, 2]), Y(P[a, 1])), (X(P[b, 2]), Y(P[b, 1])), (X(P[cc, 2]), Y(P[cc, 1]))], fill=c)
for z in range(int(z0 // 10 * 10), int(z1) + 1, 5):
    d.line([(X(z), 0), (X(z), Hh)], fill=(0, 255, 255) if z % 50 == 0 else ((0, 120, 120) if z % 10 == 0 else (0, 60, 60)), width=1)
    if z % 10 == 0: d.text((X(z) + 2, 2), str(z), fill=(0, 255, 255))
for y in range(int(y0 // 10 * 10), int(y1) + 1, 5):
    d.line([(0, Y(y)), (W, Y(y))], fill=(255, 255, 0) if y % 50 == 0 else ((120, 120, 0) if y % 10 == 0 else (60, 60, 0)), width=1)
    if y % 10 == 0: d.text((2, Y(y) - 12), str(y), fill=(255, 255, 0))
for s in sys.argv[8:]:
    nm, z, y = s.split(","); z, y = float(z), float(y)
    d.ellipse([X(z) - 4, Y(y) - 4, X(z) + 4, Y(y) + 4], fill=(255, 0, 255)); d.text((X(z) + 6, Y(y) - 14), nm, fill=(255, 0, 255))
img.save(out)
