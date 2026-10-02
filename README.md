# Site 1 — Blast Reconciliation Viewer

An interactive 3D tool for visualizing how ore moves during a blast — built with React, TypeScript, and React Three Fiber.

## What this shows

- **Pre/post-blast terrain** — the ground surface before and after the blast
- **Blast holes** — the 520 drilled holes, angled and colored by explosive charge (kg)
- **Block model** — the underlying ore grid, colored by grade
- **Ore displacement** — the core feature: a scrubbable timeline showing every tracked ore block moving from its original position to where it actually landed after the blast, colored by either displacement distance or ore grade

## Getting started

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal (usually http://localhost:5173).

## Data pipeline

The raw CSVs (in `raw-data/`) are large (~220MB combined, 1.6M+ rows in the surface files). Rather than parsing that live in the browser, `preprocess.py` converts everything into compact Float32 binary buffers in `public/data-bin/`, downsampling the two surface point clouds and the block model/mbm datasets to ~120–200k points each — enough density to read clearly, small enough to load and render smoothly in a browser.

To regenerate the binary data from the raw CSVs:
```bash
pip install pandas numpy
python3 preprocess.py
```

## Design notes

- All coordinates are re-centered around the mean of the pre-blast surface, and the geological Z-axis (elevation) is mapped to three.js's Y-axis (up), so everything lines up in the same 3D space.
- Displacement lines are only drawn for blocks that moved more than a threshold, to keep the "flow" visualization readable rather than a cluttered mess of near-zero-length lines.
- Color scale: cool blue-teal (low) → amber → red (high) — used consistently for both grade and displacement magnitude so the legend logic stays simple.

## Stack

React 19, TypeScript, Vite, @react-three/fiber, @react-three/drei, three.js, papaparse (data prep reference).
