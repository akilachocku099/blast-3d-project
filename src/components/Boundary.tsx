import { useMemo } from "react";
import * as THREE from "three";
import { useJSON } from "../hooks/useBinary";
import type { StringLines } from "../lib/types";

interface Props {
  path: string;
  color: string;
  visible: boolean;
}

export function Boundary({ path, color, visible }: Props) {
  const lines = useJSON<StringLines>(visible ? path : null);

  const lineObjects = useMemo(() => {
    if (!lines) return [];
    return lines.map((segment) => {
      const flat = segment.flat();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(flat, 3));
      const mat = new THREE.LineBasicMaterial({ color });
      return new THREE.Line(geo, mat);
    });
  }, [lines, color]);

  if (!visible) return null;

  return (
    <group>
      {lineObjects.map((obj, i) => (
        <primitive key={i} object={obj} />
      ))}
    </group>
  );
}
