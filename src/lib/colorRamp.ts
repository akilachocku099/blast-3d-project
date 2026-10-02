// A deliberate 5-stop ramp for ore grade / displacement magnitude.
// Cool, low-value blue-teal through to hot amber/red for high-value or high-movement blocks —
// evoking both "geological survey" heat maps and the blast's own thermal signature.
const STOPS: [number, [number, number, number]][] = [
  [0.0, [0x1c, 0x3a, 0x4a]], // deep teal-slate (low)
  [0.25, [0x1f, 0x7a, 0x8c]], // teal
  [0.5, [0xd9, 0xa0, 0x3a]], // amber (Tika/portfolio accent family)
  [0.75, [0xe0, 0x5a, 0x2e]], // burnt orange
  [1.0, [0xc9, 0x2a, 0x2a]], // blast red (high)
];

export function rampColor(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const f = (clamped - t0) / (t1 - t0 || 1);
      return [
        (c0[0] + (c1[0] - c0[0]) * f) / 255,
        (c0[1] + (c1[1] - c0[1]) * f) / 255,
        (c0[2] + (c1[2] - c0[2]) * f) / 255,
      ];
    }
  }
  const last = STOPS[STOPS.length - 1][1];
  return [last[0] / 255, last[1] / 255, last[2] / 255];
}

// A separate ramp reserved for blast hole charge weight (kg of explosive).
// Deliberately a cool purple/magenta family with no overlap against the
// blue-teal-amber-orange-red ramp above, so "heavy charge" is never visually
// confused with "moved a long way" (which uses the ramp above).
const CHARGE_STOPS: [number, [number, number, number]][] = [
  [0.0, [0x2d, 0x1b, 0x4e]], // deep indigo (low charge)
  [0.25, [0x5b, 0x2a, 0x86]], // violet
  [0.5, [0x8e, 0x3b, 0xa8]], // purple-magenta
  [0.75, [0xc2, 0x4d, 0x9c]], // pink-magenta
  [1.0, [0xe6, 0x3d, 0xc9]], // hot magenta (high charge)
];

export function chargeRampColor(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < CHARGE_STOPS.length - 1; i++) {
    const [t0, c0] = CHARGE_STOPS[i];
    const [t1, c1] = CHARGE_STOPS[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const f = (clamped - t0) / (t1 - t0 || 1);
      return [
        (c0[0] + (c1[0] - c0[0]) * f) / 255,
        (c0[1] + (c1[1] - c0[1]) * f) / 255,
        (c0[2] + (c1[2] - c0[2]) * f) / 255,
      ];
    }
  }
  const last = CHARGE_STOPS[CHARGE_STOPS.length - 1][1];
  return [last[0] / 255, last[1] / 255, last[2] / 255];
}

export function buildColorAttribute(
  values: Float32Array,
  min: number,
  max: number
): Float32Array {
  const colors = new Float32Array(values.length * 3);
  const range = max - min || 1;
  for (let i = 0; i < values.length; i++) {
    const t = (values[i] - min) / range;
    const [r, g, b] = rampColor(t);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
}

// Builds a per-point color attribute for a terrain surface by finding, for
// each terrain point, the nearest ore block (in ground-plan x/z) and using
// that block's value (grade or displacement) to color the terrain point.
// This turns the ground itself into a shaded region map — no separate dot
// cloud, just the surface tinted by what's happening underneath it.
//
// Uses a simple spatial grid (bucket by x/z cell) so this stays fast even
// with tens of thousands of points on both sides — a plain nested loop
// would be far too slow (surface points times ore points).
export function buildNearestValueColors(
  terrainPositions: Float32Array,
  orePositions: Float32Array,
  oreValues: Float32Array,
  min: number,
  max: number,
  rampColor: (t: number) => [number, number, number]
): Float32Array {
  const oreCount = oreValues.length;
  const terrainCount = terrainPositions.length / 3;
  const colors = new Float32Array(terrainCount * 3);

  if (oreCount === 0 || terrainCount === 0) return colors;

  // Bounding box of ore blocks (x/z only — we're matching ground footprint,
  // not elevation).
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < oreCount; i++) {
    const x = orePositions[i * 3];
    const z = orePositions[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const gridSize = 64; // 64x64 buckets across the site footprint
  const cellW = (maxX - minX || 1) / gridSize;
  const cellH = (maxZ - minZ || 1) / gridSize;
  const cellOf = (x: number, z: number) => {
    const cx = Math.min(gridSize - 1, Math.max(0, Math.floor((x - minX) / cellW)));
    const cz = Math.min(gridSize - 1, Math.max(0, Math.floor((z - minZ) / cellH)));
    return cx * gridSize + cz;
  };

  const buckets = new Map<number, number[]>();
  for (let i = 0; i < oreCount; i++) {
    const key = cellOf(orePositions[i * 3], orePositions[i * 3 + 2]);
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(i);
  }

  const range = max - min || 1;

  for (let p = 0; p < terrainCount; p++) {
    const px = terrainPositions[p * 3];
    const pz = terrainPositions[p * 3 + 2];
    const cx = Math.min(gridSize - 1, Math.max(0, Math.floor((px - minX) / cellW)));
    const cz = Math.min(gridSize - 1, Math.max(0, Math.floor((pz - minZ) / cellH)));

    let bestIdx = -1;
    let bestDist = Infinity;
    let foundAtRing = -1;

    // Expand outward ring by ring from the point's own cell until we find
    // at least one ore block, then search exactly one extra ring beyond
    // that so a slightly closer point just across a cell boundary isn't
    // missed. This almost always resolves within ring 0 or 1 in practice.
    for (let ring = 0; ring < gridSize; ring++) {
      if (foundAtRing !== -1 && ring > foundAtRing + 1) break;
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue; // only the ring's edge
          const gx = cx + dx;
          const gz = cz + dz;
          if (gx < 0 || gx >= gridSize || gz < 0 || gz >= gridSize) continue;
          const key = gx * gridSize + gz;
          const arr = buckets.get(key);
          if (!arr) continue;
          if (foundAtRing === -1) foundAtRing = ring;
          for (const idx of arr) {
            const ox = orePositions[idx * 3];
            const oz = orePositions[idx * 3 + 2];
            const dist = (ox - px) * (ox - px) + (oz - pz) * (oz - pz);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = idx;
            }
          }
        }
      }
    }

    if (bestIdx === -1) {
      colors[p * 3] = 0.1;
      colors[p * 3 + 1] = 0.1;
      colors[p * 3 + 2] = 0.1;
      continue;
    }

    const t = (oreValues[bestIdx] - min) / range;
    const [r, g, b] = rampColor(t);
    colors[p * 3] = r;
    colors[p * 3 + 1] = g;
    colors[p * 3 + 2] = b;
  }

  return colors;
}

export interface RegionCell {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  color: [number, number, number];
}

// Bins ore block points into a grid over their own footprint (not the wider
// terrain scan) and averages the value in each cell. This is what actually
// gives "areas" of color — the ore data is dense enough over its own small
// footprint to tile it solidly, whereas the terrain scan is far too sparse
// out there to read as anything but empty space.
export function buildRegionGrid(
  positions: Float32Array,
  values: Float32Array,
  min: number,
  max: number,
  resolution: number,
  rampColorFn: (t: number) => [number, number, number]
): RegionCell[] {
  const count = values.length;
  if (count === 0) return [];

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const cellW = (maxX - minX || 1) / resolution;
  const cellD = (maxZ - minZ || 1) / resolution;

  // sumValue, sumY, count per cell
  const sumValue = new Float64Array(resolution * resolution);
  const sumY = new Float64Array(resolution * resolution);
  const cellCount = new Int32Array(resolution * resolution);

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const cx = Math.min(resolution - 1, Math.max(0, Math.floor((x - minX) / cellW)));
    const cz = Math.min(resolution - 1, Math.max(0, Math.floor((z - minZ) / cellD)));
    const key = cx * resolution + cz;
    sumValue[key] += values[i];
    sumY[key] += y;
    cellCount[key] += 1;
  }

  const range = max - min || 1;
  const cells: RegionCell[] = [];

  for (let cx = 0; cx < resolution; cx++) {
    for (let cz = 0; cz < resolution; cz++) {
      const key = cx * resolution + cz;
      const n = cellCount[key];
      if (n === 0) continue; // no ore data in this cell — leave it empty
      const avgValue = sumValue[key] / n;
      const avgY = sumY[key] / n;
      const t = (avgValue - min) / range;
      cells.push({
        x: minX + (cx + 0.5) * cellW,
        y: avgY,
        z: minZ + (cz + 0.5) * cellD,
        width: cellW,
        depth: cellD,
        color: rampColorFn(t),
      });
    }
  }

  return cells;
}
