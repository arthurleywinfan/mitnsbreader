"""Draw the app icon (maroon square with a white magnifying glass) as PNGs, no libraries needed."""
import struct, zlib, math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "icons"
BG, FG = (138, 21, 56), (255, 255, 255)


def png(size):
    rows = []
    cx, cy, r, w = 0.43 * size, 0.43 * size, 0.22 * size, 0.07 * size
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            # anti-aliased ring + handle via 3x3 supersampling
            hits = 0
            for sy in (0.17, 0.5, 0.83):
                for sx in (0.17, 0.5, 0.83):
                    px, py = x + sx, y + sy
                    d = math.hypot(px - cx, py - cy)
                    ring = abs(d - r) < w / 2
                    t = ((px - cx) + (py - cy)) / 2
                    perp = abs((px - cx) - (py - cy)) / math.sqrt(2)
                    handle = r * 0.75 < t < r * 1.6 and perp < w * 0.75
                    hits += ring or handle
            a = hits / 9
            row += bytes(round(BG[i] * (1 - a) + FG[i] * a) for i in range(3))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


OUT.mkdir(parents=True, exist_ok=True)
for s in (180, 192, 512):
    (OUT / f"icon-{s}.png").write_bytes(png(s))
print("icons written")
