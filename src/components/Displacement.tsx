import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { useBinary } from "../hooks/useBinary";
import { buildColorAttribute } from "../lib/colorRamp";

interface Props {
  visible: boolean;
  progress: number; // 0 = pre-blast positions, 1 = post-blast positions
  colorBy: "grade" | "displacement";
  gradeField: string;
  gradeMin: number;
  gradeMax: number;
  dispMin: number;
  dispMax: number;
  showLines: boolean;
  highlightTopMovers: boolean;
  size?: number;
}

export function Displacement({
  visible,
  progress,
  colorBy,
  gradeField,
  gradeMin,
  gradeMax,
  dispMin,
  dispMax,
  showLines,
  highlightTopMovers,
  size = 0.55,
}: Props) {
  const initial = useBinary(visible ? "/data-bin/mbm_initial.bin" : null);
  const final = useBinary(visible ? "/data-bin/mbm_final.bin" : null);
  // Only fetch the grade file when it's actually the active color mode —
  // no point loading grade data while looking at displacement, or vice versa.
  const grade = useBinary(visible && colorBy === "grade" ? `/data-bin/mbm_${gradeField}.bin` : null);
  const disp = useBinary(visible ? "/data-bin/mbm_disp.bin" : null);

  const pointsRef = useRef<THREE.Points>(null);
  const highlightRef = useRef<THREE.Points>(null);
  const haloRef = useRef<THREE.Points>(null);

  const { colors, linePoints, lineColors } = useMemo(() => {
    // grade is only fetched (non-null) when colorBy === "grade", so only
    // require it in that mode — displacement mode just needs disp.
    const gradeReady = colorBy !== "grade" || !!grade;
    if (!initial || !final || !disp || !gradeReady) {
      return { colors: null, linePoints: [] as [number, number, number][], lineColors: [] as [number, number, number][] };
    }
    const n = initial.length / 3;
    const values = colorBy === "grade" ? grade! : disp;
    const min = colorBy === "grade" ? gradeMin : dispMin;
    const max = colorBy === "grade" ? gradeMax : dispMax;
    const colors = buildColorAttribute(values, min, max);

    // Build line-segment endpoints (initial -> final per block), only for
    // blocks that actually moved a meaningful amount. Uses drei's <Line> (a
    // "fat line" built on Line2/LineMaterial) instead of raw lineSegments,
    // since plain WebGL lines silently ignore linewidth in most browsers —
    // this is what actually lets the lines render visibly thicker.
    const linePoints: [number, number, number][] = [];
    const lineColors: [number, number, number][] = [];
    const THRESHOLD = (dispMax - dispMin) * 0.15 + dispMin;
    for (let i = 0; i < n; i++) {
      if (disp[i] < THRESHOLD) continue;
      linePoints.push([initial[i * 3], initial[i * 3 + 1], initial[i * 3 + 2]]);
      linePoints.push([final[i * 3], final[i * 3 + 1], final[i * 3 + 2]]);
      const r = colors[i * 3], g = colors[i * 3 + 1], b = colors[i * 3 + 2];
      lineColors.push([r, g, b]);
      lineColors.push([r, g, b]);
    }

    return { colors, linePoints, lineColors };
  }, [initial, final, grade, disp, colorBy, gradeMin, gradeMax, dispMin, dispMax]);
  // (grade stays in deps: when it flips from null -> loaded after switching
  // into grade mode, this needs to recompute once the fetch resolves.)

  const topMoverIndices = useMemo(() => {
    if (!disp) return [];
    const n = disp.length;
    const indexed = Array.from({ length: n }, (_, i) => i);
    indexed.sort((a, b) => disp[b] - disp[a]);
    return indexed.slice(0, 20);
  }, [disp]);

  const highlightGeometry = useMemo(() => {
    if (topMoverIndices.length === 0 || !colors) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(topMoverIndices.length * 3), 3)
    );
    // Use each point's own true ramp color (grade or displacement, whichever is
    // active) instead of a separate fixed highlight color, so the highlight
    // never hides or contradicts the real value it represents.
    const highlightColors = new Float32Array(topMoverIndices.length * 3);
    topMoverIndices.forEach((idx, j) => {
      highlightColors[j * 3] = colors[idx * 3];
      highlightColors[j * 3 + 1] = colors[idx * 3 + 1];
      highlightColors[j * 3 + 2] = colors[idx * 3 + 2];
    });
    geo.setAttribute("color", new THREE.Float32BufferAttribute(highlightColors, 3));
    return geo;
  }, [topMoverIndices, colors]);

  const haloGeometry = useMemo(() => {
    if (topMoverIndices.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(topMoverIndices.length * 3), 3)
    );
    return geo;
  }, [topMoverIndices]);

  const pointGeometry = useMemo(() => {
    if (!initial || !colors) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(initial.length), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [initial, colors]);

  const lastProgressRef = useRef<number | null>(null);

  // Whenever the point geometry itself is rebuilt (e.g. switching between
  // "grade" and "displacement" color modes creates a brand new geometry
  // with blank, zeroed positions), force the next frame to refill real
  // positions even if the timeline slider hasn't moved — otherwise every
  // dot stays stuck at the origin and the whole cloud appears to vanish.
  useEffect(() => {
    lastProgressRef.current = null;
  }, [pointGeometry]);

  useFrame(() => {
    if (!pointsRef.current || !initial || !final) return;

    // Only skip the expensive part (43k+ points) when progress hasn't
    // actually moved since last frame — covers both "paused, not dragging"
    // and "mid-play but between ticks", without needing a separate
    // playing/paused prop at all.
    if (lastProgressRef.current !== progress) {
      lastProgressRef.current = progress;
      const posAttr = pointsRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < arr.length; i++) {
        arr[i] = initial[i] + (final[i] - initial[i]) * progress;
      }
      posAttr.needsUpdate = true;
    }

    // The highlight is only 20 points, so it's cheap enough to always keep
    // in sync — this also avoids it getting stuck at position (0,0,0) if
    // someone toggles it on while progress happens to be unchanged.
    if (highlightTopMovers && highlightRef.current && topMoverIndices.length > 0) {
      const hAttr = highlightRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
      const hArr = hAttr.array as Float32Array;
      topMoverIndices.forEach((idx, j) => {
        for (let k = 0; k < 3; k++) {
          hArr[j * 3 + k] =
            initial[idx * 3 + k] + (final[idx * 3 + k] - initial[idx * 3 + k]) * progress;
        }
      });
      hAttr.needsUpdate = true;
    }

    if (highlightTopMovers && haloRef.current && topMoverIndices.length > 0) {
      const gAttr = haloRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
      const gArr = gAttr.array as Float32Array;
      topMoverIndices.forEach((idx, j) => {
        for (let k = 0; k < 3; k++) {
          gArr[j * 3 + k] =
            initial[idx * 3 + k] + (final[idx * 3 + k] - initial[idx * 3 + k]) * progress;
        }
      });
      gAttr.needsUpdate = true;
    }
  });

  if (!visible || !pointGeometry) return null;

  return (
    <group>
      <points ref={pointsRef} geometry={pointGeometry}>
        <pointsMaterial
          size={size}
          vertexColors
          sizeAttenuation
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </points>
      {showLines && linePoints.length > 0 && (
        <Line
          points={linePoints}
          vertexColors={lineColors}
          segments
          lineWidth={2.5}
          transparent
          opacity={0.75}
        />
      )}
      {highlightTopMovers && haloGeometry && (
        <points ref={haloRef} geometry={haloGeometry} renderOrder={1}>
          <pointsMaterial
            size={size * 5.5}
            color="#ffffff"
            sizeAttenuation
            transparent
            opacity={0.35}
            depthWrite={false}
            depthTest={false}
          />
        </points>
      )}
      {highlightTopMovers && highlightGeometry && (
        <points ref={highlightRef} geometry={highlightGeometry} renderOrder={2}>
          <pointsMaterial
            size={size * 3.2}
            vertexColors
            sizeAttenuation
            transparent
            opacity={0.95}
            depthWrite={false}
          />
        </points>
      )}
    </group>
  );
}
