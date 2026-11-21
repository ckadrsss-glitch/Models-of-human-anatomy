# Diagnostic plot: lateral projection + mid-sagittal slice of assets/skull.bin, used to
# pick the cephalometric landmarks (S, N, A, B, Pog, Me, Go, Co, ANS, PNS, incisors).
import json, numpy as np, sys
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
H = json.load(open("assets/skull.json")); raw = open("assets/skull.bin", "rb").read()
def ch(n):
    c = next(c for c in H["chunks"] if c["name"] == n)
    return np.frombuffer(raw[c["offset"]:c["offset"] + c["bytes"]], dtype=c["dtype"]).reshape(c["shape"])
P = ch("position"); part = ch("part"); ao = ch("ao")
print("AO min/mean/max", ao.min(), ao.mean(), ao.max())
x0, x1, y0, y1 = [float(v) for v in sys.argv[1:5]] if len(sys.argv) > 4 else (-105, 105, -110, 110)
fig, ax = plt.subplots(1, 2, figsize=(26, 13))
cols = {0: "#bbb", 1: "#e9a", 2: "#4cf", 3: "#fc4"}
for k, c in cols.items():
    m = part == k
    ax[0].scatter(P[m, 2], P[m, 1], s=0.6, c=c)
    mm = m & (np.abs(P[:, 0]) < 1.6)
    ax[1].scatter(P[mm, 2], P[mm, 1], s=1.5, c=c)
for a in ax:
    a.set_aspect("equal"); a.set_xlim(x0, x1); a.set_ylim(y0, y1)
    a.set_xticks(np.arange(int(x0)//10*10, x1, 10)); a.set_yticks(np.arange(int(y0)//10*10, y1, 10)); a.grid(alpha=.3)
    a.tick_params(labelsize=7)
plt.tight_layout(); plt.savefig(sys.argv[5] if len(sys.argv) > 5 else "build/sagittal.png", dpi=55)
