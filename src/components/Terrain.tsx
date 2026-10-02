import { useMemo } from "react";
import * as THREE from "three";
import { useBinary } from "../hooks/useBinary";

interface TerrainProps {
  path: string;
  color: string;
  size?: number;
  opacity?: number;
}

export function Terrain({ path, color, size = 0.55, opacity = 0.75 }: TerrainProps) {
  const positions = useBinary(path);

  const geometry = useMemo(() => {
    if (!positions) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [positions]);

  if (!geometry) return null;

  return (
    <points geometry={geometry}>
      <pointsMaterial
        color={color}
        size={size}
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </points>
  );
}
