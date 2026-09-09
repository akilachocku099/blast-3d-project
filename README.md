<div align="center">

# BenchMark3D — Blast Reconciliation Viewer

An interactive 3D tool for visualizing how ore moves during a mine blast.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript&logoColor=white&style=flat-square)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white&style=flat-square)
![Three.js](https://img.shields.io/badge/Three.js-black?logo=three.js&logoColor=white&style=flat-square)
![Netlify](https://img.shields.io/badge/deployed-Netlify-00C7B7?logo=netlify&logoColor=white&style=flat-square)

**[🌐 Live site](https://benchmark3d.netlify.app)** · **[🎥 Demo video](https://drive.google.com/file/d/1D4yhJO-Ba_jJUsLrJTL0Ah6qFyQxSxpk/view?usp=drive_link)**

</div>

---

## What it does

Blast reconciliation data — pre/post-blast surfaces, drilled hole positions, block model grades, displacement vectors — usually gets reviewed as flat cross-sections or spreadsheets. This puts it in 3D instead, so you can actually see how ore moved instead of just comparing numbers before and after.

The main piece is a scrubbable timeline: drag it and watch every tracked ore block travel from its original spot to where it actually landed after the blast.

## Features

- **Pre/post-blast terrain** — ground surface before and after the blast, side by side
- **Blast holes** — all 520 drilled holes, angled and colored by explosive charge (kg)
- **Block model** — the ore grid, colored by grade
- **Displacement timeline** — scrubbable animation of ore movement, colored by distance moved or grade
- **Dual view** — compare two states at once

## Stack

- **React 19 + TypeScript + Vite** — app shell and build
- **React Three Fiber + drei + three.js** — the actual 3D scene
- **Python (pandas, numpy)** — preprocessing raw survey CSVs into binary buffers

## Project structure

```
src/
├── components/
│   ├── BlastHoles.tsx        # drilled holes, angled + colored by charge
│   ├── BlockModel.tsx        # ore grid colored by grade
│   ├── Boundary.tsx          # pit/site boundary
│   ├── Displacement.tsx      # the displacement timeline
│   ├── SmoothOreSurface.tsx  # interpolated surface from displaced blocks
│   └── Terrain.tsx           # pre/post-blast terrain
├── hooks/
│   └── useBinary.ts          # loads the preprocessed binary data
├── lib/
│   ├── colorRamp.ts          # shared color scale
│   └── types.ts
└── App.tsx

public/data-bin/              # preprocessed binary buffers + manifest.json
raw-data/                     # original survey/block model CSVs
preprocess.py                 # raw CSVs → binary buffers
```

## Why the data pipeline exists

The raw CSVs (in `raw-data/`) are huge — around 220MB combined, 1.6M+ rows just for the surface data. Parsing that live in the browser wasn't going to work, so `preprocess.py` converts everything into Float32 binary buffers in `public/data-bin/`, downsampling the dense point clouds to around 120–200k points each. Still dense enough to look right, light enough to actually load.

To regenerate it from raw CSVs:

```bash
pip install pandas numpy
python3 preprocess.py
```

## Running it locally

```bash
git clone https://github.com/akilachocku099/blast-3d-project.git
cd blast-3d-project
npm install
npm run dev
```

Opens at `http://localhost:5173`.

```bash
npm run build
```

builds to `dist/`.

## Notes on the 3D setup

- Everything's re-centered around the mean of the pre-blast surface, and the geological Z-axis (elevation) maps to three.js's Y-axis, so all the layers line up correctly.
- Displacement lines only draw for blocks that moved past a threshold — otherwise the view gets cluttered with near-zero-length lines that don't add anything.
- Color scale is the same everywhere (blue-teal → amber → red, low → high), so grade and displacement share one legend.

## What I'd do differently next

- Preprocessing is a manual step right now — new datasets need to run through the Python script before they show up. Could move some of that in-browser for smaller datasets.
- Downsampling keeps things fast but loses some fine detail from the full-resolution CSVs. LOD loading would let close-up views recover that without slowing the initial load.
- Camera position and the selected timeline frame reset on refresh — worth persisting so a specific moment in the reconciliation can be shared directly.

