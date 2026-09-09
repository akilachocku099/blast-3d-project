"""
convert_to_binary.py

Converts the raw mine-survey CSV exports in raw-data/ into the flat
float32 binary format consumed by the app (src/hooks/useBinary.ts),
plus the JSON side-files and manifest.json.

--------------------------------------------------------------------
COORDINATE SYSTEM
--------------------------------------------------------------------
The raw CSVs use real mine-grid survey coordinates:
    XC / YC / ZC  =  Easting / Northing / Elevation   (Z is "up")

Three.js (and therefore this app) uses a Y-up convention, so every
point is remapped on the way out:

    three.x  =  survey Easting   (XC)  - OFFSET_X
    three.y  =  survey Elevation (ZC)  - OFFSET_Y   <- elevation becomes "up"
    three.z  =  survey Northing  (YC)  - OFFSET_Z

The offsets translate the whole site so it sits near the origin
(they were solved for by matching the raw CSV bounding box against
the shipped .bin bounding box — see README section below).

--------------------------------------------------------------------
DOWNSAMPLING (block model + mbm + surfaces)
--------------------------------------------------------------------
The raw block model / displacement / surface CSVs are far denser
(300k-1.6M rows) than what a browser needs to render smoothly. This
script decimates them with a voxel-grid filter: space is divided
into cubic cells sized so that keeping one representative point per
occupied cell lands close to TARGET_POINTS. This is a real, common
technique for point-cloud decimation, not just a random subsample.

NOTE: this reproduces the *format and general density* of the
shipped public/data-bin files, not their exact original point
selection (that logic wasn't preserved anywhere in this project's
history, so this is a legitimate independent implementation of the
same idea rather than a byte-for-byte reconstruction).

--------------------------------------------------------------------
USAGE
--------------------------------------------------------------------
    python3 scripts/convert_to_binary.py

Reads from ./raw-data/, writes into ./public/data-bin/.
"""

import csv
import json
import struct
from pathlib import Path

RAW_DIR = Path(__file__).parent.parent / "raw-data"
OUT_DIR = Path(__file__).parent.parent / "public" / "data-bin"

# Solved by matching raw CSV extents against the shipped .bin extents.
OFFSET_X = 366.09433
OFFSET_Y = 39.97540   # applied to survey Z (elevation)
OFFSET_Z = 238.18157  # applied to survey Y (northing)

TARGET_BLOCKMODEL_POINTS = 60_000
BLOCKMODEL_BENCH_HEIGHT = 1.0  # Zinc in 1_blockmodel.csv
TARGET_MBM_POINTS = 44_000
TARGET_SURFACE_POINTS = 40_000

# All grade columns present in blockmodel/mbm. grade_01 stays the default
# shown on load; the rest are exported so the app can offer a dropdown.
GRADE_FIELDS = [f"grade_{i:02d}" for i in range(1, 12)]
DEFAULT_GRADE_FIELD = "grade_01"


def transform(x, y, z):
    """Survey (Easting, Northing, Elevation) -> Three.js (x, y, z)."""
    return (x - OFFSET_X, z - OFFSET_Y, y - OFFSET_Z)


def write_f32(path: Path, values):
    """Write an iterable of floats as a flat little-endian float32 binary."""
    with open(path, "wb") as f:
        f.write(struct.pack(f"<{len(values)}f", *values))


def _voxel_pass(points, attrs_list, minx, miny, minz, cell_size, cell_y=None):
    seen = set()
    out_points = []
    out_attrs = []
    cy = cell_y if cell_y is not None else cell_size
    for p, a in zip(points, attrs_list):
        cell = (
            int((p[0] - minx) / cell_size),
            int((p[1] - miny) / cy),
            int((p[2] - minz) / cell_size),
        )
        if cell in seen:
            continue
        seen.add(cell)
        out_points.append(p)
        out_attrs.append(a)
    return out_points, out_attrs


def voxel_downsample(points, attrs_list, target_count, tolerance=0.1, max_iters=25,
                     cell_y=None):
    """
    points: list of (x, y, z) tuples (already transformed)
    attrs_list: list of parallel per-point attribute tuples, e.g. (grade,)
    target_count: desired approximate output point count

    Buckets points into a voxel grid and keeps the first point seen in
    each occupied cell. `cell_y` pins the vertical cell size independently
    of the horizontal search: the block model is a wide, shallow slab
    (hundreds of metres across, ~17 one-metre benches tall), so cubic cells
    big enough to hit the target count also merge adjacent benches and throw
    away most of the elevation detail. Pinning cell_y to the bench height
    keeps every level and lets the horizontal cell absorb the downsampling,
    where there is far more resolution to spare. Point clouds here are thin surfaces/shells
    rather than solid-filling their bounding box, so a single
    closed-form guess from the bbox volume badly undershoots. Instead
    this binary-searches the cell size until the resulting count lands
    within `tolerance` of target_count.
    """
    n = len(points)
    if n <= target_count:
        return points, attrs_list

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    minx, miny, minz = min(xs), min(ys), min(zs)
    span = max(max(xs) - minx, max(ys) - miny, max(zs) - minz) or 1.0

    lo, hi = span / (target_count ** (1 / 2)) * 0.001, span
    best = None
    for _ in range(max_iters):
        mid = (lo + hi) / 2
        out_points, out_attrs = _voxel_pass(
            points, attrs_list, minx, miny, minz, mid, cell_y
        )
        count = len(out_points)
        if best is None or abs(count - target_count) < abs(best[0] - target_count):
            best = (count, out_points, out_attrs)
        if abs(count - target_count) <= target_count * tolerance:
            return out_points, out_attrs
        if count > target_count:
            lo = mid  # too many points -> grow cells
        else:
            hi = mid  # too few points -> shrink cells
    return best[1], best[2]


def convert_blockmodel():
    points, attrs = [], []
    with open(RAW_DIR / "1_blockmodel.csv") as f:
        for row in csv.DictReader(f):
            try:
                x, y, z = float(row["XC"]), float(row["YC"]), float(row["ZC"])
                grades = tuple(
                    float(row[g]) if row[g] else 0.0 for g in GRADE_FIELDS
                )
            except (ValueError, KeyError):
                continue
            points.append(transform(x, y, z))
            attrs.append(grades)

    # 1.0 = the block model's own Zinc bench height, so no two benches ever
    # collapse into one cell.
    points, attrs = voxel_downsample(
        points, attrs, TARGET_BLOCKMODEL_POINTS, cell_y=BLOCKMODEL_BENCH_HEIGHT
    )

    pos = [c for p in points for c in p]
    write_f32(OUT_DIR / "blockmodel_pos.bin", pos)

    grade_ranges = {}
    for i, field in enumerate(GRADE_FIELDS):
        values = [a[i] for a in attrs]
        write_f32(OUT_DIR / f"blockmodel_{field}.bin", values)
        grade_ranges[field] = {
            "min": min(values) if values else 0.0,
            "max": max(values) if values else 0.0,
        }

    return {
        "count": len(points),
        "gradeFields": GRADE_FIELDS,
        "defaultGradeField": DEFAULT_GRADE_FIELD,
        "gradeRanges": grade_ranges,
    }


def convert_mbm():
    initial, final, attrs = [], [], []
    with open(RAW_DIR / "1_mbm.csv") as f:
        for row in csv.DictReader(f):
            # Only keep rows that actually have a matched post-blast
            # position — that's what makes a "displacement" record.
            if not row.get("XF") or not row.get("YF") or not row.get("ZF"):
                continue
            try:
                ix, iy, iz = float(row["XC"]), float(row["YC"]), float(row["ZC"])
                fx, fy, fz = float(row["XF"]), float(row["YF"]), float(row["ZF"])
                grades = tuple(
                    float(row[g]) if row[g] else 0.0 for g in GRADE_FIELDS
                )
                disp = float(row["DISP_A"]) if row["DISP_A"] else 0.0
            except (ValueError, KeyError):
                continue
            initial.append(transform(ix, iy, iz))
            final.append(transform(fx, fy, fz))
            attrs.append((grades, disp))

    initial, attrs = voxel_downsample(initial, list(zip(final, attrs)), TARGET_MBM_POINTS)
    final = [fa[0] for fa in attrs]
    grades_disp = [fa[1] for fa in attrs]

    init_flat = [c for p in initial for c in p]
    final_flat = [c for p in final for c in p]
    disp = [d for _, d in grades_disp]

    write_f32(OUT_DIR / "mbm_initial.bin", init_flat)
    write_f32(OUT_DIR / "mbm_final.bin", final_flat)
    write_f32(OUT_DIR / "mbm_disp.bin", disp)

    grade_ranges = {}
    for i, field in enumerate(GRADE_FIELDS):
        values = [g[i] for g, _ in grades_disp]
        write_f32(OUT_DIR / f"mbm_{field}.bin", values)
        grade_ranges[field] = {
            "min": min(values) if values else 0.0,
            "max": max(values) if values else 0.0,
        }

    return {
        "count": len(initial),
        "gradeFields": GRADE_FIELDS,
        "defaultGradeField": DEFAULT_GRADE_FIELD,
        "gradeRanges": grade_ranges,
        "dispMin": min(disp) if disp else 0.0,
        "dispMax": max(disp) if disp else 0.0,
        "dispMean": (sum(disp) / len(disp)) if disp else 0.0,
    }


def convert_surface(csv_name, bin_name):
    points = []
    with open(RAW_DIR / csv_name) as f:
        for row in csv.DictReader(f):
            try:
                x, y, z = float(row["X"]), float(row["Y"]), float(row["Z"])
            except (ValueError, KeyError):
                continue
            points.append(transform(x, y, z))

    points, _ = voxel_downsample(points, points, TARGET_SURFACE_POINTS)
    flat = [c for p in points for c in p]
    write_f32(OUT_DIR / bin_name, flat)
    return {"count": len(points), "floatsPerPoint": 3}


def convert_blastholes():
    holes = []
    with open(RAW_DIR / "1_blastholes.csv") as f:
        for i, row in enumerate(csv.DictReader(f), start=1):
            x, y, z = transform(
                float(row["XCOLLAR"]), float(row["YCOLLAR"]), float(row["ZCOLLAR"])
            )
            holes.append({
                "id": i,
                "x": x, "y": y, "z": z,
                "depth": float(row["DEPTH"]),
                "angle": float(row["Angle"]),
                "bearing": float(row["Bearing"]),
                "kg": float(row["KG"]),
                "timing": float(row["TIMING"]),
                "diameterMm": float(row["Diameter"]),
            })
    with open(OUT_DIR / "blastholes.json", "w") as f:
        json.dump(holes, f)
    return {"count": len(holes)}


def convert_string(csv_name, json_name):
    segments = {}
    with open(RAW_DIR / csv_name) as f:
        for row in csv.DictReader(f):
            sid = row["SID"]
            x, y, z = transform(float(row["X"]), float(row["Y"]), float(row["Z"]))
            segments.setdefault(sid, []).append([x, y, z])
    ordered = [segments[k] for k in sorted(segments, key=lambda s: int(s))]
    with open(OUT_DIR / json_name, "w") as f:
        json.dump(ordered, f)
    return {"segments": len(ordered)}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {}
    print("Converting pre_surface...")
    manifest["preSurface"] = convert_surface("1_pre_surface.csv", "pre_surface.bin")
    print("Converting pst_surface...")
    manifest["pstSurface"] = convert_surface("1_pst_surface.csv", "pst_surface.bin")
    print("Converting blastholes...")
    manifest["blastholes"] = convert_blastholes()
    print("Converting pre_string...")
    manifest["preString"] = convert_string("1_pre_string.csv", "preString.json")
    print("Converting pst_string...")
    manifest["pstString"] = convert_string("1_pst_string.csv", "pstString.json")
    print("Converting blockmodel (this one's big, may take a minute)...")
    manifest["blockmodel"] = convert_blockmodel()
    print("Converting mbm (this one's big too)...")
    manifest["mbm"] = convert_mbm()

    with open(OUT_DIR / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    print("\nDone. Wrote:")
    for k, v in manifest.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
