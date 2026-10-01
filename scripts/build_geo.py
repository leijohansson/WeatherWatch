"""Build the Live map's GeoJSON layers. Standard library only.

    python3 scripts/build_geo.py coast --land ne_10m_land.shp
    python3 scripts/build_geo.py coast --sea goas_v01.shp        # sea polygons instead of land
    python3 scripts/build_geo.py townships "Nowcast Sectors2.shp"
    python3 scripts/build_geo.py army MFOSectors.txt

Output goes to public/geo/. Geometry is clipped to the area the Live map can show, simplified,
and written as WGS84 [lon, lat] with 5 decimals (about 1 m). `coast` also writes
coast-region.geojson, covering the whole 240 km radar image for the Watch map.
"""

import argparse
import json
import math
import re
import struct
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "geo"

# The Live map can't pan past this box (lon/lat). Clip a little wider so clip edges stay off-screen.
CLIP = (103.0, 104.7, 0.6, 2.1)
# The Watch map shows the radar image's extent (src/lib/geo.ts RADAR_BOUNDS), padded the same way.
REGION_CLIP = (101.812 - 0.3, 106.127 + 0.3, -0.805 - 0.3, 3.507 + 0.3)
LAT0, LON0 = 1.35, 103.82
KX, KY = math.cos(math.radians(LAT0)) * 111.32, 110.57


def read_shp(path, box=None):
    data = Path(path).read_bytes()
    off, shapes = 100, []
    while off < len(data):
        _, length = struct.unpack(">2i", data[off : off + 8])
        rec = data[off + 8 : off + 8 + length * 2]
        off += 8 + length * 2
        if struct.unpack("<i", rec[:4])[0] == 0:
            shapes.append(([], None))
            continue
        bbox = struct.unpack("<4d", rec[4:36])
        if box and not box_overlaps(bbox, box):
            shapes.append(([], bbox))
            continue
        nparts, npts = struct.unpack("<2i", rec[36:44])
        parts = list(struct.unpack(f"<{nparts}i", rec[44 : 44 + 4 * nparts])) + [npts]
        p0 = 44 + 4 * nparts
        flat = struct.unpack(f"<{2 * npts}d", rec[p0 : p0 + 16 * npts])
        pts = list(zip(flat[0::2], flat[1::2]))
        shapes.append(([pts[parts[i] : parts[i + 1]] for i in range(nparts)], bbox))
    return shapes


def read_dbf(path, encoding="latin-1"):
    data = Path(path).read_bytes()
    nrec, hlen, rlen = struct.unpack("<I2H", data[4:12])
    fields, pos = [], 32
    while data[pos] != 0x0D:
        fields.append((data[pos : pos + 11].split(b"\0")[0].decode(), data[pos + 16]))
        pos += 32
    rows = []
    for i in range(nrec):
        r = data[hlen + i * rlen : hlen + (i + 1) * rlen]
        p, row = 1, {}
        for name, flen in fields:
            row[name] = r[p : p + flen].decode(encoding).strip()
            p += flen
        rows.append(row)
    return rows


def clip_ring(ring, box=CLIP):
    """Sutherland–Hodgman clip of a closed ring to the lon/lat box."""
    west, east, south, north = box
    edges = [
        (lambda p: p[0] >= west, lambda a, b: _cross_x(a, b, west)),
        (lambda p: p[0] <= east, lambda a, b: _cross_x(a, b, east)),
        (lambda p: p[1] >= south, lambda a, b: _cross_y(a, b, south)),
        (lambda p: p[1] <= north, lambda a, b: _cross_y(a, b, north)),
    ]
    out = ring
    for inside, cross in edges:
        if not out:
            break
        src, out = out, []
        prev = src[-1]
        for cur in src:
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur))
            prev = cur
    return out


def _cross_x(a, b, x):
    t = (x - a[0]) / (b[0] - a[0])
    return (x, a[1] + t * (b[1] - a[1]))


def _cross_y(a, b, y):
    t = (y - a[1]) / (b[1] - a[1])
    return (a[0] + t * (b[0] - a[0]), y)


def simplify(ring, tolerance_km):
    """Douglas–Peucker in projected km."""
    if len(ring) < 5 or tolerance_km <= 0:
        return ring
    pts = [((lon - LON0) * KX, (LAT0 - lat) * KY) for lon, lat in ring]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (ax, ay), (bx, by) = pts[i], pts[j]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-12
        best, index = -1.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm if math.hypot(dx, dy) else math.hypot(px - ax, py - ay)
            if d > best:
                best, index = d, k
        if index > 0 and best > tolerance_km:
            keep[index] = True
            stack += [(i, index), (index, j)]
    return [p for p, k in zip(ring, keep) if k]


def ring_out(ring):
    ring = [(round(lon, 5), round(lat, 5)) for lon, lat in ring]
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    return [list(p) for p in ring]


def box_overlaps(bbox, box=CLIP):
    return bbox and not (bbox[2] < box[0] or bbox[0] > box[1] or bbox[3] < box[2] or bbox[1] > box[3])


def write(name, features):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    points = sum(len(r) for f in features for poly in f["geometry"]["coordinates"] for r in poly)
    print(f"{path.relative_to(OUT_DIR.parent.parent)}: {len(features)} features, {points} points, {path.stat().st_size // 1024} KB")


def feature(polygons, **properties):
    return {"type": "Feature", "properties": properties, "geometry": {"type": "MultiPolygon", "coordinates": polygons}}


def coast_polygons(shapes, box, tolerance_km):
    polygons = []
    for parts, bbox in shapes:
        if not box_overlaps(bbox, box):
            continue
        for ring in parts:
            clipped = clip_ring(ring, box)
            if len(clipped) < 3:
                continue
            simplified = simplify(clipped, tolerance_km)
            if len(simplified) >= 3:
                polygons.append([ring_out(simplified)])
    return polygons


def build_coast(path, kind, tolerance_km):
    shapes = read_shp(path, REGION_CLIP)
    source = Path(path).name
    # Shapefile holes are separate rings; rendering with fill-rule evenodd keeps them as holes.
    write("coast.geojson", [feature(coast_polygons(shapes, CLIP, tolerance_km), kind=kind, source=source)])
    # The Watch map is wider and zooms less far, so it can be simplified more.
    region = coast_polygons(shapes, REGION_CLIP, max(tolerance_km, 0.1))
    write("coast-region.geojson", [feature(region, kind=kind, source=source)])


def title(name):
    return " ".join(word.capitalize() for word in name.split())


def build_townships(path, tolerance_km):
    rows = read_dbf(Path(path).with_suffix(".dbf"))
    features = []
    for (parts, _), row in zip(read_shp(path), rows):
        name = title(row["PLN_AREA_N"])
        polygons = [[ring_out(simplify(ring, tolerance_km))] for ring in parts if len(ring) >= 3]
        features.append(feature(polygons, id=name, name=name, forecastArea=name))
    write("townships.geojson", features)


def build_army(path, tolerance_km):
    text = Path(path).read_text(encoding="utf-8")
    match = re.search(r"const\s+FEATURES\s*=\s*(\[.*\])\s*;?\s*$", text, re.S)
    if not match:
        raise SystemExit(f"No FEATURES array in {path}")
    features = []
    for item in json.loads(match.group(1)):
        polygons = []
        for polygon in item["polygons"]:
            # Source rings are [lat, lon].
            rings = [ring_out(simplify([(lon, lat) for lat, lon in ring], tolerance_km)) for ring in polygon]
            polygons.append([r for r in rings if len(r) >= 4])
        features.append(feature(polygons, id=item["name"], name=item["name"]))
    write("army-cat1.geojson", features)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="layer", required=True)
    coast = sub.add_parser("coast")
    source = coast.add_mutually_exclusive_group(required=True)
    source.add_argument("--land", help="shapefile of land polygons")
    source.add_argument("--sea", help="shapefile of sea polygons (e.g. Marine Regions GOAS)")
    coast.add_argument("--tolerance-km", type=float, default=0.03)
    towns = sub.add_parser("townships")
    towns.add_argument("shapefile")
    towns.add_argument("--tolerance-km", type=float, default=0.02)
    army = sub.add_parser("army")
    army.add_argument("sectors_txt")
    army.add_argument("--tolerance-km", type=float, default=0.02)
    args = parser.parse_args()

    if args.layer == "coast":
        build_coast(args.land or args.sea, "land" if args.land else "sea", args.tolerance_km)
    elif args.layer == "townships":
        build_townships(args.shapefile, args.tolerance_km)
    else:
        build_army(args.sectors_txt, args.tolerance_km)


if __name__ == "__main__":
    main()
