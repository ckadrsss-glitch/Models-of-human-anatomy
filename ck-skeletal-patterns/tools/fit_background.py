# Reconstructs the original CK series background (1080x1920) from a reference frame of a
# previous film (assets/brand/source/reference_frame_ck_orthodontic.png, iPhone screenshot):
# background pixels (subject and caption excluded) are fitted with a smooth, left/right-symmetric
# 2-D polynomial per channel, then rendered with light dithering.
#   python3 tools/fit_background.py  → assets/brand/ck_background_original_1080x1920.png
import numpy as np
from PIL import Image
im = np.asarray(Image.open("assets/brand/source/reference_frame_ck_orthodontic.png").convert("RGB")).astype(np.float64)
H, W, _ = im.shape
top = 230                                  # first row of the video inside the screenshot
s = W / 1080.0                             # screenshot px per video px
vid = im[top:top + int(round(1920 * s))]
ys, xs = np.mgrid[0:vid.shape[0]:4, 0:W:4]
px = vid[ys, xs]
lum = px.max(axis=2)
# exclude subject (bright / glow), caption band, subtitle band
mask = (lum < 75) & (px[..., 2] - px[..., 0] < 50)
vy, vx = ys / s, xs / s
mask &= ~((vy > 180) & (vy < 225) & (vx > 340) & (vx < 740))
mask &= ~((vy > 1185) & (vy < 1275))
# keep a margin around the subject: dilate the rejected area
from scipy.ndimage import binary_erosion
mask = binary_erosion(mask, iterations=6)
X = (vx[mask] - 540) / 540.0; Y = (vy[mask] - 960) / 960.0
def basis(X, Y):
    cols = []
    for i in range(0, 5):          # even powers of x (symmetry) : x^0, x^2, ..., x^8
        for j in range(0, 7):      # y^0 .. y^6
            if i + j <= 8: cols.append((X ** (2 * i)) * (Y ** j))
    return np.stack(cols, -1)
A = basis(X, Y)
out = np.zeros((1920, 1080, 3))
gy, gx = np.mgrid[0:1920, 0:1080]
B = basis((gx - 540) / 540.0, (gy - 960) / 960.0)
for c in range(3):
    coef, *_ = np.linalg.lstsq(A, px[..., c][mask], rcond=None)
    out[..., c] = B @ coef
    err = A @ coef - px[..., c][mask]
    print("channel", c, "rms error", np.sqrt((err ** 2).mean()).round(2), "samples", mask.sum())
rng = np.random.default_rng(1); out += rng.uniform(-0.75, 0.75, out.shape)
Image.fromarray(np.clip(np.round(out), 0, 255).astype(np.uint8)).save("assets/brand/ck_background_original_1080x1920.png")
for p in [(540, 40), (20, 1000), (540, 1500), (540, 1880)]: print(p, out[p[1], p[0]].round(1))
