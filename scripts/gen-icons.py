"""Génère les icônes PNG de l'extension (boîte stylisée) sans dépendance externe."""
import struct
import sys
import zlib
from pathlib import Path


def png(size: int) -> bytes:
    bg = (47, 111, 222, 255)
    fg = (255, 255, 255, 255)
    clear = (0, 0, 0, 0)
    r = size * 0.18  # rayon des coins
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            cx = min(max(x + 0.5, r), size - r)
            cy = min(max(y + 0.5, r), size - r)
            inside = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r
            px = clear
            if inside:
                px = bg
                u, v = x / size, y / size
                # boîte : couvercle + corps + fente
                lid = 0.22 <= v <= 0.36 and 0.18 <= u <= 0.82
                body = 0.40 <= v <= 0.80 and 0.24 <= u <= 0.76
                slot = 0.50 <= v <= 0.56 and 0.40 <= u <= 0.60
                if (lid or body) and not slot:
                    px = fg
            row.extend(px)
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


out = Path(sys.argv[1] if len(sys.argv) > 1 else "public/icon")
out.mkdir(parents=True, exist_ok=True)
for s in (16, 32, 48, 128):
    (out / f"{s}.png").write_bytes(png(s))
