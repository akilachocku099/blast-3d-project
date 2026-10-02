import { useMemo } from "react";
import * as THREE from "three";
import type { BlastHole } from "../lib/types";
import { chargeRampColor } from "../lib/colorRamp";

interface Props {
  holes: BlastHole[];
  visible: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);

// Drawn 6x true radius (~1.9m wide instead of ~0.31m).
const HOLE_RADIUS_EXAGGERATION = 6;

export function BlastHoles({ holes, visible }: Props) {
  const { kgMin, kgMax } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const h of holes) {
      if (h.kg < min) min = h.kg;
      if (h.kg > max) max = h.kg;
    }
    return { kgMin: min, kgMax: max };
  }, [holes]);

  if (!visible) return null;

  return (
    <group>
      {holes.map((h) => {
        // Angle from vertical (degrees), bearing = compass direction of dip.
        const angleRad = THREE.MathUtils.degToRad(90 + h.angle);
        const bearingRad = THREE.MathUtils.degToRad(h.bearing);
        const dir = new THREE.Vector3(
          Math.sin(angleRad) * Math.sin(bearingRad),
          -Math.cos(angleRad),
          Math.sin(angleRad) * Math.cos(bearingRad)
        ).normalize();

        const length = h.depth;
        const start = new THREE.Vector3(h.x, h.y, h.z);
        const end = start.clone().addScaledVector(dir, length);
        const mid = start.clone().lerp(end, 0.5);

        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          UP,
          dir.clone().normalize()
        );

        const t = (h.kg - kgMin) / (kgMax - kgMin || 1);
        const [r, g, b] = chargeRampColor(t);
        // Real hole diameter (mm -> scene metres, /2 for radius), exaggerated
        // so a ~15.5cm true radius still reads across a 500m+ site. Every hole
        // in this dataset is the same 311mm, so thickness carries no data and
        // nothing is lost by scaling it — charge weight is shown by colour.
        // Labelled as exaggerated in the legend rather than passed off as scale.
        const radius = (h.diameterMm / 1000 / 2) * HOLE_RADIUS_EXAGGERATION;

        return (
          <mesh
            key={h.id}
            position={mid}
            quaternion={quaternion}
          >
            <cylinderGeometry args={[radius, radius, length, 8]} />
            <meshStandardMaterial
              color={new THREE.Color(r, g, b)}
              emissive={new THREE.Color(r, g, b)}
              emissiveIntensity={0.35}
            />
          </mesh>
        );
      })}
    </group>
  );
}
