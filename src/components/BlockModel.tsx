import { useMemo } from "react";
import * as THREE from "three";
import { useBinary } from "../hooks/useBinary";
import { buildColorAttribute } from "../lib/colorRamp";

interface Props {
  gradeField: string;
  gradeMin: number;
  gradeMax: number;
  visible: boolean;
  size?: number;
  /** Where the blocks sit. Defaults to the pre-blast block model snapshot. */
  positionsPath?: string;
  /** File prefix for the grade columns that pair with `positionsPath`. */
  gradePathPrefix?: string;
  opacity?: number;
}

// Renders one ore block cloud, always coloured by grade.
export function BlockModel({
  gradeField,
  gradeMin,
  gradeMax,
  visible,
  size = 0.5,
  positionsPath = "/data-bin/blockmodel_pos.bin",
  gradePathPrefix = "/data-bin/blockmodel_",
  opacity = 0.85,
}: Props) {
  const positions = useBinary(visible ? positionsPath : null);
  const grades = useBinary(visible ? `${gradePathPrefix}${gradeField}.bin` : null);

  const geometry = useMemo(() => {
    if (!positions || !grades) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(buildColorAttribute(grades, gradeMin, gradeMax), 3)
    );
    return geo;
  }, [positions, grades, gradeMin, gradeMax]);

  if (!visible || !geometry) return null;

  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={size}
        vertexColors
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </points>
  );
}
