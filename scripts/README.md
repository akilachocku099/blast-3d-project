# convert_to_binary.py

Converts the raw survey CSVs in `raw-data/` into the flat float32 `.bin`
files the app loads via `useBinary.ts`, plus the JSON side-files and
`manifest.json`.

## What's exact
- The coordinate transform (survey Easting/Northing/Elevation → Three.js
  Y-up x/y/z, with a fixed scene offset) — solved by matching the raw CSV
  extents against the shipped `.bin` extents, confirmed to line up.
- `blastholes.json` and the string files — 1:1 mapping from their CSVs,
  no filtering, row counts match exactly.

## What's an approximation
- The block model, mbm (displacement), and surface point clouds are
  decimated ~8-40x from their raw row counts for browser performance.
  The exact original selection logic wasn't preserved anywhere in this
  project's git history (no `.py` file was ever committed), so this
  script re-implements the same *idea* — voxel-grid decimation, binary
  search on cell size until the output count lands within ~10% of a
  target — rather than reproducing the original file byte-for-byte.

## Usage
```
python3 scripts/convert_to_binary.py
```
Reads `raw-data/`, writes into `public/data-bin/`. Takes a couple of
minutes on the full `1_mbm.csv` (~72MB, ~394k rows).

Note: running this will overwrite `public/data-bin/` with a fresh,
slightly different point selection than what currently ships. The
currently-shipped binaries are the tested, known-good ones — treat this
script as the documented pipeline / talking point, not something you
need to re-run before submitting.
