import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useJSON, useBinary } from "./hooks/useBinary";
import type { BlastHole, Manifest } from "./lib/types";
import { Terrain } from "./components/Terrain";
import { BlastHoles } from "./components/BlastHoles";
import { BlockModel } from "./components/BlockModel";
import { Displacement } from "./components/Displacement";
import { SmoothOreSurface } from "./components/SmoothOreSurface";
import { Boundary } from "./components/Boundary";

// Lives INSIDE <Canvas>, since useFrame only works there. Each frame, if a
// click set a new desired camera/target position, smoothly lerp toward it.
// This is what makes "click a point to focus on it" feel smooth rather than
// an instant snap.
function FocusAnimator({
  controlsRef,
  desiredTarget,
  desiredCamPos,
}: {
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  desiredTarget: React.MutableRefObject<THREE.Vector3 | null>;
  desiredCamPos: React.MutableRefObject<THREE.Vector3 | null>;
}) {
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !desiredTarget.current || !desiredCamPos.current) return;
    const camera = controls.object as THREE.PerspectiveCamera;
    controls.target.lerp(desiredTarget.current, 0.08);
    camera.position.lerp(desiredCamPos.current, 0.08);
    controls.update();
    if (controls.target.distanceTo(desiredTarget.current) < 0.05) {
      desiredTarget.current = null;
      desiredCamPos.current = null;
    }
  });
  return null;
}

type Layer =
  | "preSurface"
  | "pstSurface"
  | "holes"
  | "blockModel"
  | "blockModelPost"
  | "displacement"
  | "boundary";

const LAYER_INFO: Record<Layer, string> = {
  preSurface: "The ground shape before the blast, from survey data.",
  pstSurface: "The ground shape after the blast — compare with pre-blast to see the crater.",
  holes:
    "The 520 drilled holes. All vertical, all 311mm diameter — colour shows explosive charge (kg), and thickness is exaggerated so they stay visible at site scale.",
  blockModel: "The underground ore grid before the blast — a fixed snapshot, colored by grade.",
  blockModelPost:
    "The same ore blocks at their final resting position after the blast, colored by grade — where the high-grade rock actually ended up.",
  displacement: "Ore blocks tracked from their original to final position. Drag the timeline below.",
  boundary: "Outline markers for the blast area, before and after.",
};

function InfoIcon({ text }: { text: string }) {
  return (
    <span className="info-icon">
      i
      <span className="tooltip">{text}</span>
    </span>
  );
}

// Renders one half of the side-by-side compare view: a self-contained scene
// locked to either the pre-blast or post-blast state. `leadRef` is the
// OrbitControls this pane drives (left pane); `followRef`/`leaderRef` let a
// pane instead copy another pane's camera every frame, so orbiting one side
// orbits both — useful for presenting since you don't have to line up two
// views by hand.
function CompareScene({
  stage,
  manifest,
  paneKey,
  activePane,
  leftControls,
  rightControls,
  colorBy,
  gradeField,
}: {
  stage: "pre" | "post";
  manifest: Manifest;
  paneKey: "left" | "right";
  activePane: React.MutableRefObject<"left" | "right">;
  leftControls: React.MutableRefObject<OrbitControlsImpl | null>;
  rightControls: React.MutableRefObject<OrbitControlsImpl | null>;
  colorBy: "displacement" | "grade";
  gradeField: string;
}) {
  // Whichever pane the person is currently dragging/zooming "leads" — the
  // other pane copies its camera every frame. This is checked live each
  // frame (not fixed per-pane) so either side can take over just by
  // touching it, and the two views never drift apart or freeze.
  useFrame(() => {
    const iAmActive = activePane.current === paneKey;
    if (iAmActive) return;
    const leader = paneKey === "left" ? rightControls.current : leftControls.current;
    const follower = paneKey === "left" ? leftControls.current : rightControls.current;
    if (!leader || !follower) return;
    const leaderCam = leader.object as THREE.PerspectiveCamera;
    const followerCam = follower.object as THREE.PerspectiveCamera;
    followerCam.position.copy(leaderCam.position);
    follower.target.copy(leader.target);
    follower.update();
  });

  const controlsRef = paneKey === "left" ? leftControls : rightControls;

  // Ore block values used to shade the terrain by region — cached by path,
  // so loading them here in both panes doesn't mean fetching twice.
  // Grade file now follows the same field the person picked in the main
  // view, instead of a fixed leftover file.
  const oreGrade = useBinary(`/data-bin/mbm_${gradeField}.bin`);
  const oreDisp = useBinary("/data-bin/mbm_disp.bin");

  return (
    <>
      <color attach="background" args={["#0b0e11"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[100, 200, 100]} intensity={1.1} />
      <directionalLight position={[-100, 50, -100]} intensity={0.3} color="#2a8c99" />
      <fog attach="fog" args={["#0b0e11", 300, 900]} />

      {/* Compare view keeps a plain, dim terrain layer for ground context,
          then colors the ore block footprint itself with a dense, soft
          point cloud that blends into continuous shaded regions — that
          footprint is where the actual grade/displacement data lives. */}
      {stage === "pre" ? (
        <>
          <Terrain path="/data-bin/pre_surface.bin" color="#2c4256" opacity={0.35} size={0.6} />
          <SmoothOreSurface
            orePositionsPath="/data-bin/mbm_initial.bin"
            oreValues={colorBy === "grade" ? oreGrade : oreDisp}
            min={colorBy === "grade" ? manifest.mbm.gradeRanges[gradeField].min : manifest.mbm.dispMin}
            max={colorBy === "grade" ? manifest.mbm.gradeRanges[gradeField].max : manifest.mbm.dispMax}
          />
          <Boundary path="/data-bin/preString.json" color="#8b98a5" visible />

        </>
      ) : (
        <>
          <Terrain path="/data-bin/pst_surface.bin" color="#2c4630" opacity={0.35} size={0.6} />
          <SmoothOreSurface
            orePositionsPath="/data-bin/mbm_final.bin"
            oreValues={colorBy === "grade" ? oreGrade : oreDisp}
            min={colorBy === "grade" ? manifest.mbm.gradeRanges[gradeField].min : manifest.mbm.dispMin}
            max={colorBy === "grade" ? manifest.mbm.gradeRanges[gradeField].max : manifest.mbm.dispMax}
          />
          <Boundary path="/data-bin/pstString.json" color="#d9a03a" visible />
        </>
      )}

      <OrbitControls
        ref={controlsRef}
        makeDefault={paneKey === "left"}
        enableDamping
        dampingFactor={0.1}
        target={[181, 15, 81]}
        minDistance={20}
        maxDistance={1200}
        onStart={() => {
          activePane.current = paneKey;
        }}
      />
    </>
  );
}

function CompareView({
  manifest,
  holes,
  onReturnToSingle,
  colorBy,
  setColorBy,
  gradeField,
  setGradeField,
}: {
  manifest: Manifest;
  holes: BlastHole[];
  onReturnToSingle: () => void;
  colorBy: "displacement" | "grade";
  setColorBy: (v: "displacement" | "grade") => void;
  gradeField: string;
  setGradeField: (v: string) => void;
}) {
  const leftControls = useRef<OrbitControlsImpl | null>(null);
  const rightControls = useRef<OrbitControlsImpl | null>(null);
  // Tracks whichever pane was last dragged/zoomed — that one "leads" the
  // camera sync, so touching either side takes over instead of one side
  // always being locked as the master.
  const activePane = useRef<"left" | "right">("left");
  const camPos: [number, number, number] = [280, 170, 260];

  let holeKgMin = Infinity;
  let holeKgMax = -Infinity;
  for (const h of holes) {
    if (h.kg < holeKgMin) holeKgMin = h.kg;
    if (h.kg > holeKgMax) holeKgMax = h.kg;
  }

  return (
    <div className="compare-wrap">
      <div className="compare-intro">
        <button className="compare-back" onClick={onReturnToSingle}>
          <span aria-hidden="true">&larr;</span> Single view
        </button>
        <div className="compare-heading">
          <h2>Blast Reconciliation</h2>
        </div>
        <p className="compare-hint">Drag either pane &mdash; both cameras stay in sync</p>
      </div>
      <div className="compare-panes-row">
      <div className="compare-pane">
        <p className="compare-label">BEFORE — pre-blast</p>
        <div className="compare-stats">
          <div>
            <b>{holes.length}</b>
            holes were drilled and charged with explosive across the site
          </div>
          <div>
            <b>{holeKgMax.toFixed(0)} kg</b>
            the biggest single charge, in the heaviest-loaded hole
          </div>
        </div>
        <Canvas camera={{ position: camPos, fov: 50, near: 0.1, far: 5000 }}>
          <CompareScene
            stage="pre"
            manifest={manifest}
            paneKey="left"
            activePane={activePane}
            leftControls={leftControls}
            rightControls={rightControls}
            colorBy={colorBy}
            gradeField={gradeField}
          />
        </Canvas>
      </div>
      <div className="compare-pane">
        <p className="compare-label">AFTER — post-blast</p>
        <div className="compare-stats">
          <div>
            <b>{manifest.mbm.dispMean.toFixed(1)} m</b>
            how far the average ore block shifted from where it started
          </div>
          <div>
            <b>{manifest.mbm.dispMax.toFixed(1)} m</b>
            the single furthest-thrown ore block, at its most extreme
          </div>
        </div>

        <div className="compare-legend">
          <div className="radio-row">
            <button
              className={`radio-btn ${colorBy === "displacement" ? "active" : ""}`}
              onClick={() => setColorBy("displacement")}
            >
              Distance moved
            </button>
            <button
              className={`radio-btn ${colorBy === "grade" ? "active" : ""}`}
              onClick={() => setColorBy("grade")}
            >
              Ore grade
            </button>
          </div>
          {colorBy === "grade" && (
            <select
              value={gradeField}
              onChange={(e) => setGradeField(e.target.value)}
              className="grade-select"
              style={{ marginTop: 8 }}
            >
              {manifest.blockmodel.gradeFields.map((g) => (
                <option key={g} value={g}>
                  {g.replace("grade_", "Grade ")}
                </option>
              ))}
            </select>
          )}
          <p className="panel-title" style={{ marginTop: 10 }}>
            {colorBy === "displacement"
              ? "Displacement (m)"
              : `Ore grade (${gradeField.replace("grade_", "Grade ")})`}
          </p>
          <div className="legend-gradient" />
          <div className="legend-labels">
            <span>
              {colorBy === "displacement"
                ? manifest.mbm.dispMin.toFixed(0)
                : manifest.mbm.gradeRanges[gradeField].min.toFixed(0)}
            </span>
            <span>
              {colorBy === "displacement"
                ? manifest.mbm.dispMax.toFixed(0)
                : manifest.mbm.gradeRanges[gradeField].max.toFixed(0)}
            </span>
          </div>
          <p className="legend-caption">
            {colorBy === "displacement"
              ? "Red ore blocks travelled furthest from their original position."
              : "Red ore blocks carry the highest grade — track where this ends up after the blast."}
          </p>
        </div>

        <Canvas camera={{ position: camPos, fov: 50, near: 0.1, far: 5000 }}>
          <CompareScene
            stage="post"
            manifest={manifest}
            paneKey="right"
            activePane={activePane}
            leftControls={leftControls}
            rightControls={rightControls}
            colorBy={colorBy}
            gradeField={gradeField}
          />
        </Canvas>
      </div>
      </div>
    </div>
  );
}

function App() {
  const manifest = useJSON<Manifest>("/data-bin/manifest.json");
  const holes = useJSON<BlastHole[]>("/data-bin/blastholes.json");
  const [viewMode, setViewMode] = useState<"single" | "compare">("single");

  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    preSurface: true,
    pstSurface: false,
    holes: true,
    blockModel: false,
    blockModelPost: false,
    displacement: true,
    boundary: true,
  });

  const [colorBy, setColorBy] = useState<"grade" | "displacement">("displacement");
  // Which of the 11 grade columns (grade_01..grade_11) currently drives the
  // "Ore grade" color mode. Defaults to grade_01, same as the original
  // single-grade version — this just adds the option to switch.
  const [gradeField, setGradeField] = useState("grade_01");
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showLines, setShowLines] = useState(true);
  const [highlightTopMovers, setHighlightTopMovers] = useState(false);

  // Min/max charge weight across all holes, used for the charge legend below.
  // Computed here (not just inside BlastHoles) since App.tsx needs it too.
  let holeKgMin = Infinity;
  let holeKgMax = -Infinity;
  for (const h of holes || []) {
    if (h.kg < holeKgMin) holeKgMin = h.kg;
    if (h.kg > holeKgMax) holeKgMax = h.kg;
  }
  const rafRef = useRef<number | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const desiredTargetRef = useRef<THREE.Vector3 | null>(null);
  const desiredCamPosRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (!playing) return;
    let dir = 1;
    const tick = () => {
      setProgress((p) => {
        let next = p + 0.006 * dir;
        if (next >= 1) {
          next = 1;
          dir = -1;
        } else if (next <= 0) {
          next = 0;
          dir = 1;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  const toggle = (key: Layer) => {
    setLayers((l) => {
      const next = { ...l, [key]: !l[key] };
      // Highlight-top-movers and flow lines only make sense while displacement
      // itself is visible — otherwise the toggle stays "on" with nothing to show.
      if (key === "displacement" && !next.displacement) {
        setHighlightTopMovers(false);
      }
      return next;
    });
  };

  // Double-click anywhere on a visible layer to smoothly move the camera in close to
  // that point, instead of manually dragging/scrolling to hunt for it.
  const handleSceneClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object as THREE.PerspectiveCamera;
    const point = e.point.clone();
    // Keep the camera's current viewing direction, just move it in closer to
    // the clicked point rather than resetting the whole view angle.
    const offset = camera.position.clone().sub(controls.target);
    const dist = Math.min(offset.length(), 60);
    const newCamPos = point.clone().add(offset.normalize().multiplyScalar(dist));
    desiredTargetRef.current = point;
    desiredCamPosRef.current = newCamPos;
  };

  const exportScreenshot = () => {
    if (!glRef.current) return;
    const url = glRef.current.domElement.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `blast-reconciliation-${Date.now()}.png`;
    link.click();
  };

  if (!manifest || !holes) {
    return (
      <div
        className="app-root"
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 13 }}>
          Loading blast data…
        </div>
      </div>
    );
  }

  const stageLabel = progress === 0 ? "PRE-BLAST" : progress === 1 ? "POST-BLAST" : "IN MOTION";

  // The post-blast ore grid and the displacement cloud only ever occupy the
  // same positions right at the end of the timeline — everywhere before that
  // the blocks are still in flight and the two layers don't conflict at all.
  // So the grid holds full brightness the whole way along and only steps back
  // over the last stretch, as the real blocks land on top of it. Ramped across
  // the final 12% rather than snapped at exactly 1, so playback doesn't pop.
  // With the movement layer off there's nothing to overlap, so no fade.
  // The legend only has anything to say while a layer that uses a colour scale
  // is switched on. Without this the panel still painted its border and
  // backdrop, leaving an empty box floating in the corner.
  const showValueLegend = layers.displacement || layers.blockModel || layers.blockModelPost;
  const showLegend = showValueLegend || layers.holes;

  const gridOverlap = layers.displacement
    ? Math.min(Math.max((progress - 0.88) / 0.12, 0), 1)
    : 0;
  const postGridOpacity = 0.85 - 0.65 * gridOverlap;

  return (
    <div className="app-root">
      {viewMode === "single" && (
        <button className="view-toggle" onClick={() => setViewMode("compare")}>
          Comparison view
        </button>
      )}

      {viewMode === "compare" && (
        <CompareView
          manifest={manifest}
          holes={holes}
          onReturnToSingle={() => setViewMode("single")}
          colorBy={colorBy}
          setColorBy={setColorBy}
          gradeField={gradeField}
          setGradeField={setGradeField}
        />
      )}

      <div className="canvas-wrap" style={viewMode === "compare" ? { display: "none" } : undefined}>
        <Canvas
          camera={{ position: [280, 170, 260], fov: 50, near: 0.1, far: 5000 }}
          gl={{ preserveDrawingBuffer: true }}
          onCreated={({ gl, raycaster }) => {
            glRef.current = gl;
            // Points have no surface area, so widen the hit-test radius a bit
            // to make click-to-focus actually usable on point clouds.
            raycaster.params.Points = { threshold: 3 };
          }}
        >
          <color attach="background" args={["#0b0e11"]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[100, 200, 100]} intensity={1.1} />
          <directionalLight position={[-100, 50, -100]} intensity={0.3} color="#2a8c99" />
          <fog attach="fog" args={["#0b0e11", 300, 900]} />

          <group onDoubleClick={handleSceneClick}>
            {layers.preSurface && (
              <Terrain
                path="/data-bin/pre_surface.bin"
                color="#3b6ea5"
                opacity={layers.pstSurface ? 0.25 : 0.65}
              />
            )}
            {layers.pstSurface && (
              <Terrain path="/data-bin/pst_surface.bin" color="#4a9d5f" opacity={0.65} />
            )}

            {layers.boundary && (
              <>
                <Boundary path="/data-bin/preString.json" color="#8b98a5" visible />
                <Boundary path="/data-bin/pstString.json" color="#d9a03a" visible />
              </>
            )}

            {layers.holes && <BlastHoles holes={holes} visible={layers.holes} />}

            <BlockModel
              gradeField={gradeField}
              gradeMin={manifest.blockmodel.gradeRanges[gradeField].min}
              gradeMax={manifest.blockmodel.gradeRanges[gradeField].max}
              visible={layers.blockModel}
            />

            {/* Same component, pointed at the moved-block dataset at its final
                position. Always grade-coloured (like the pre-blast grid), so
                the two read as one before/after pair regardless of what the
                "Colour by" control is set to. */}
            <BlockModel
              gradeField={gradeField}
              gradeMin={manifest.mbm.gradeRanges[gradeField].min}
              gradeMax={manifest.mbm.gradeRanges[gradeField].max}
              visible={layers.blockModelPost}
              positionsPath="/data-bin/mbm_final.bin"
              gradePathPrefix="/data-bin/mbm_"
              opacity={postGridOpacity}
            />

            <Displacement
              visible={layers.displacement}
              progress={progress}
              colorBy={colorBy}
              gradeField={gradeField}
              gradeMin={manifest.mbm.gradeRanges[gradeField].min}
              gradeMax={manifest.mbm.gradeRanges[gradeField].max}
              dispMin={manifest.mbm.dispMin}
              dispMax={manifest.mbm.dispMax}
              showLines={showLines}
              highlightTopMovers={highlightTopMovers}
            />
          </group>

          <FocusAnimator
            controlsRef={controlsRef}
            desiredTarget={desiredTargetRef}
            desiredCamPos={desiredCamPosRef}
          />

          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.1}
            target={[181, 15, 81]}
            minDistance={20}
            maxDistance={1200}
            zoomToCursor
          />
        </Canvas>
      </div>

      <div className="header" style={viewMode === "compare" ? { display: "none" } : undefined}>
        <p className="eyebrow">Blast Movement Analysis</p>
        <h1>Blast Reconciliation</h1>
        <p className="sub">
          Drag to orbit &middot; scroll to zoom &middot; double-click to focus
        </p>
        <button
          className="play-btn"
          style={{ marginTop: 10, pointerEvents: "auto" }}
          onClick={() => controlsRef.current?.reset()}
        >
          Reset view
        </button>
      </div>

      <div className="panel panel-controls" style={viewMode === "compare" ? { display: "none" } : undefined}>
        <p className="panel-title">Layers</p>

        <p className="panel-section-title">Surfaces &amp; holes</p>
        <div className="layer-row">
          <div className="layer-label">
            <span className="swatch" style={{ background: "#3b6ea5" }} />
            Pre-blast surface
            <InfoIcon text={LAYER_INFO.preSurface} />
          </div>
          <button
            className={`toggle ${layers.preSurface ? "on" : ""}`}
            onClick={() => toggle("preSurface")}
          />
        </div>

        <div className="layer-row">
          <div className="layer-label">
            <span className="swatch" style={{ background: "#4a9d5f" }} />
            Post-blast surface
            <InfoIcon text={LAYER_INFO.pstSurface} />
          </div>
          <button
            className={`toggle ${layers.pstSurface ? "on" : ""}`}
            onClick={() => toggle("pstSurface")}
          />
        </div>

        <div className="layer-row">
          <div className="layer-label">
            <span className="swatch" style={{ background: "#8e3ba8" }} />
            Blast holes ({holes.length})
            <InfoIcon text={LAYER_INFO.holes} />
          </div>
          <button className={`toggle ${layers.holes ? "on" : ""}`} onClick={() => toggle("holes")} />
        </div>

        <p className="panel-section-title">Ore grid &amp; movement</p>
        <div className="layer-row">
          <div className="layer-label">
            Pre-blast ore grid
            <InfoIcon text={LAYER_INFO.blockModel} />
          </div>
          <button
            className={`toggle ${layers.blockModel ? "on" : ""}`}
            onClick={() => toggle("blockModel")}
          />
        </div>

        <div className="layer-row">
          <div className="layer-label">
            Post-blast ore grid
            <InfoIcon text={LAYER_INFO.blockModelPost} />
          </div>
          <button
            className={`toggle ${layers.blockModelPost ? "on" : ""}`}
            onClick={() => toggle("blockModelPost")}
          />
        </div>

        <div className="layer-row">
          <div className="layer-label">
            Post-blast movement
            <InfoIcon text={LAYER_INFO.displacement} />
          </div>
          <button
            className={`toggle ${layers.displacement ? "on" : ""}`}
            onClick={() => toggle("displacement")}
          />
        </div>

        <div className="layer-row">
          <div className="layer-label">
            Boundary outlines
            <InfoIcon text={LAYER_INFO.boundary} />
          </div>
          <button
            className={`toggle ${layers.boundary ? "on" : ""}`}
            onClick={() => toggle("boundary")}
          />
        </div>

        {/* "Colour by" only governs the post-blast movement cloud, so the
            mode toggle appears only when that layer is on. The two ore-grid
            layers are always grade-coloured (as their names say), so hiding
            the mode toggle while they're on is correct — it never affected
            them. The chosen mode is preserved in state, so toggling movement
            off and back on restores it exactly as the user left it. */}
        {layers.displacement && (
          <>
            <p className="panel-section-title">Colour by</p>
            <div className="radio-row">
              <button
                className={`radio-btn ${colorBy === "displacement" ? "active" : ""}`}
                onClick={() => setColorBy("displacement")}
              >
                Distance moved
              </button>
              <button
                className={`radio-btn ${colorBy === "grade" ? "active" : ""}`}
                onClick={() => setColorBy("grade")}
              >
                Ore grade
              </button>
            </div>
          </>
        )}

        {/* Grade-field picker. Kept separate from the mode toggle above so it
            stays reachable whenever any grade-coloured layer is on — the two
            ore grids read gradeField too, so users need it to choose which
            grade the pre/post ore grids show even when movement is off. It is
            hidden only when nothing is grade-coloured (movement on AND set to
            distance, with both ore grids off). */}
        {(layers.blockModel ||
          layers.blockModelPost ||
          (layers.displacement && colorBy === "grade")) && (
          <div style={{ marginTop: 10 }}>
            <div
              className="layer-label"
              style={{ marginBottom: 6, fontSize: 12, color: "var(--text-muted)" }}
            >
              Grade field
            </div>
            <select
              value={gradeField}
              onChange={(e) => setGradeField(e.target.value)}
              className="grade-select"
            >
              {manifest.blockmodel.gradeFields.map((g) => (
                <option key={g} value={g}>
                  {g.replace("grade_", "Grade ")}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="panel-section-title">Display options</p>
        <div className="layer-row">
          <div className="layer-label">Show flow lines</div>
          <button
            className={`toggle ${showLines ? "on" : ""}`}
            onClick={() => setShowLines((s) => !s)}
          />
        </div>

        <div
          className="layer-row"
          style={!layers.displacement ? { opacity: 0.4, pointerEvents: "none" } : undefined}
        >
          <div className="layer-label">
            Highlight top 20 movers
            <InfoIcon text="Highlights the 20 ore blocks that travelled furthest during the blast. Requires the displacement layer to be on." />
          </div>
          <button
            className={`toggle ${highlightTopMovers ? "on" : ""}`}
            onClick={() => setHighlightTopMovers((s) => !s)}
            disabled={!layers.displacement}
          />
        </div>

        <button className="export-btn" onClick={exportScreenshot}>
          Save current view as image
        </button>
      </div>

      <div
        className="panel panel-timeline"
        style={{
          ...(viewMode === "compare" ? { display: "none" } : {}),
          ...(!layers.displacement ? { opacity: 0.4, pointerEvents: "none" } : {}),
        }}
      >
        <div className="timeline-label">
          <span>
            Blast timeline &mdash; <span className="stage">{stageLabel}</span>
          </span>
          <button
            className="play-btn"
            onClick={() => setPlaying((p) => !p)}
            disabled={!layers.displacement}
          >
            {playing ? "Pause" : "Play"}
          </button>
        </div>
        <div className="slider-row">
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>BEFORE</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={progress}
            disabled={!layers.displacement}
            onChange={(e) => {
              setPlaying(false);
              setProgress(parseFloat(e.target.value));
            }}
          />
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>AFTER</span>
        </div>
        <div className="stats-row">
          <div>
            <b>{manifest.mbm.dispMean.toFixed(1)}m</b>
            avg. movement
          </div>
          <div>
            <b>{manifest.mbm.dispMax.toFixed(1)}m</b>
            max movement
          </div>
          <div>
            <b>{holes.length}</b>
            holes fired
          </div>
        </div>
      </div>

      {showLegend && (
      <div className="panel panel-legend" style={viewMode === "compare" ? { display: "none" } : undefined}>
        {showValueLegend && (
          <>
            <p className="panel-title">
              {layers.displacement && colorBy === "displacement" ? "Displacement (m)" : "Ore grade"}
            </p>
            <div className="legend-gradient" />
            <div className="legend-labels">
              <span>
                {layers.displacement && colorBy === "displacement"
                  ? manifest.mbm.dispMin.toFixed(0)
                  : manifest.mbm.gradeRanges[gradeField].min.toFixed(0)}
              </span>
              <span>
                {layers.displacement && colorBy === "displacement"
                  ? manifest.mbm.dispMax.toFixed(0)
                  : manifest.mbm.gradeRanges[gradeField].max.toFixed(0)}
              </span>
            </div>
            <p className="legend-caption">
              {layers.displacement && colorBy === "displacement"
                ? "Red blocks travelled furthest from their original position during the blast."
                : "Red blocks carry the highest ore grade — track where this value ends up after the blast."}
            </p>
          </>
        )}

        {layers.holes && (
          <>
            <p className="panel-title" style={{ marginTop: 14 }}>
              Blast hole charge (kg)
            </p>
            <div className="charge-legend-gradient" />
            <div className="legend-labels">
              <span>{holeKgMin.toFixed(0)}</span>
              <span>{holeKgMax.toFixed(0)}</span>
            </div>
            <p className="legend-caption">
              Colour shows explosive charge weight. Every hole is the same 311mm diameter, drawn thicker than life so it reads at site scale — this scale is separate from the displacement/grade colours above.
            </p>
          </>
        )}
      </div>
      )}
    </div>
  );
}

export default App;
