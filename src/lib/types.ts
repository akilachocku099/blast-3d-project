export interface GradeRange {
  min: number;
  max: number;
}

export interface Manifest {
  preSurface: { count: number; floatsPerPoint: number };
  pstSurface: { count: number; floatsPerPoint: number };
  blastholes: { count: number };
  preString: { segments: number };
  pstString: { segments: number };
  blockmodel: {
    count: number;
    gradeFields: string[];
    defaultGradeField: string;
    gradeRanges: Record<string, GradeRange>;
  };
  mbm: {
    count: number;
    gradeFields: string[];
    defaultGradeField: string;
    gradeRanges: Record<string, GradeRange>;
    dispMin: number;
    dispMax: number;
    dispMean: number;
  };
}

export interface BlastHole {
  id: number;
  x: number;
  y: number;
  z: number;
  depth: number;
  angle: number;
  bearing: number;
  kg: number;
  timing: number | null;
  diameterMm: number;
}

export type StringLines = number[][][]; // segments -> points -> [x,y,z]
