import { useMemo } from "react";
import * as THREE from "three";
import { useBinary } from "../hooks/useBinary";
import { rampColor } from "../lib/colorRamp";

interface Props {
  orePositionsPath: string;
  oreValues: Float32Array | null;
  min: number;
  max: number;
  pointSize?: number;
}

// Builds a soft circular sprite (radial gradient, opaque center fading to
// transparent edge) once, shared by every instance. This is what lets
// overlapping points melt into a continuous colour field instead of
// showing hard square/box edges — the same trick behind most "heatmap of
// points" renders.
let sharedSpriteTexture: THREE.CanvasTexture | null = null;
function getSoftSprite(): THREE.CanvasTexture {
  if (sharedSpriteTexture) return sharedSpriteTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.6, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  sharedSpriteTexture = new THREE.CanvasTexture(canvas);
  return sharedSpriteTexture;
}

// Renders the ore block footprint as a dense cloud of soft, overlapping
// points, coloured by value along the same ramp used in the legend. Real
// per-point positions (not grid-averaged), spaced roughly 0.9 apart in this
// dataset, with points sized well past that spacing so they overlap and
// read as one continuous shaded surface rather than discrete blocks.
export function SmoothOreSurface({
  orePositionsPath,
  oreValues,
  min,
  max,
  pointSize = 2.4,
}: Props) {
  const orePositions = useBinary(orePositionsPath);

  const colors = useMemo(() => {
    if (!orePositions || !oreValues) return null;
    const count = oreValues.length;
    const out = new Float32Array(count * 3);
    const range = max - min || 1;
    for (let i = 0; i < count; i++) {
      const t = (oreValues[i] - min) / range;
      const [r, g, b] = rampColor(t);
      out[i * 3] = r;
      out[i * 3 + 1] = g;
      out[i * 3 + 2] = b;
    }
    return out;
  }, [orePositions, oreValues, min, max]);

  const sprite = useMemo(() => getSoftSprite(), []);

  if (!orePositions || !colors) return null;

  return (
    <points position={[0, 0.6, 0]}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[orePositions, 3]}
        />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={pointSize}
        vertexColors
        map={sprite}
        transparent
        opacity={0.85}
        depthWrite={false}
        sizeAttenuation
        alphaTest={0.02}
      />
    </points>
  );
}
