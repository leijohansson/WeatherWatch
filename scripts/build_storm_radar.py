"""Build assets/storm_radar_sample.png: a synthetic 240 km radar frame for the Live test storm.

    python3 scripts/build_storm_radar.py

The rain sits on the recorded storm in src/test/fixtures/lightning-sample.json, so the test shows the
radar overlay and clusters alongside the strikes. Colours come from dbr_mapping.py. Standard library only.
"""

import math
import random
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from dbr_mapping import RGB, dBR_binedges  # noqa: E402

SIZE = 480
WEST, EAST, SOUTH, NORTH = 101.812, 106.127, -0.805, 3.507  # src/lib/geo.ts RADAR_BOUNDS
LAT0, LON0 = 1.35, 103.82
KX, KY = math.cos(math.radians(LAT0)) * 111.32, 110.57

# (lat, lon, sigma east km, sigma north km, peak mm/h)
CELLS = [
    (1.345, 103.795, 4.5, 3.0, 140),  # the storm over the west and centre: orange to purple core
    (1.340, 103.720, 9.0, 5.0, 6),  # trailing light rain behind it
    (1.505, 103.775, 2.8, 2.8, 35),  # the weaker Johor cell: up to red-orange
    (1.250, 103.950, 2.0, 2.0, 4),  # scattered showers, below orange: no clusters
    (1.420, 104.020, 3.0, 3.0, 1.2),
    (1.200, 103.650, 1.5, 1.5, 9),
]


def colour_floors():
    floors = []
    for i in range(len(RGB)):
        if i == len(RGB) - 1:
            floors.append(dBR_binedges[-1])
            continue
        lo, hi = dBR_binedges[i // 2 + 1], dBR_binedges[i // 2 + 2]
        floors.append(lo if i % 2 == 0 else math.sqrt(lo * hi))
    return floors


def rain_rate(lat, lon, noise):
    x, y = (lon - LON0) * KX, (lat - LAT0) * KY
    total = 0.0
    for clat, clon, sx, sy, peak in CELLS:
        dx = x - (clon - LON0) * KX
        dy = y - (clat - LAT0) * KY
        total += peak * math.exp(-0.5 * ((dx / sx) ** 2 + (dy / sy) ** 2))
    return total * noise


def png(width, height, rows):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    raw = b"".join(b"\x00" + bytes(row) for row in rows)
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def main():
    random.seed(11)
    floors = colour_floors()
    colours = [tuple(round(c * 255) for c in rgb) for rgb in RGB]
    rows = []
    for py in range(SIZE):
        lat = NORTH - (py + 0.5) / SIZE * (NORTH - SOUTH)
        row = bytearray()
        for px in range(SIZE):
            lon = WEST + (px + 0.5) / SIZE * (EAST - WEST)
            rate = rain_rate(lat, lon, random.uniform(0.8, 1.2))
            index = max((i for i, floor in enumerate(floors) if floor <= rate), default=None)
            row += bytes(colours[index]) + b"\xff" if index is not None else b"\x00\x00\x00\x00"
        rows.append(row)
    out = ROOT / "assets" / "storm_radar_sample.png"
    out.write_bytes(png(SIZE, SIZE, rows))
    print(f"{out.relative_to(ROOT)}: {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
