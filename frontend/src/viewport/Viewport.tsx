import { useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { CameraControls, Grid, Line, TransformControls } from "@react-three/drei";
import type * as THREE from "three";
import { useScene } from "../scene/store";
import { SceneMesh } from "./SceneMesh";
import { SceneLight } from "./SceneLight";
import { EditOverlay } from "./EditOverlay";
import { SnapshotBridge } from "./SnapshotBridge";
import { HandControls } from "../hands/HandControls";
import { useHandHover } from "../hands/tracker";

const BACKGROUND = "#0d0e10";

function Axes() {
    return (
        <>
            <Line points={[[-500, 0.002, 0], [500, 0.002, 0]]} color="#e5484d" lineWidth={1.5} />
            <Line points={[[0, 0.002, -500], [0, 0.002, 500]]} color="#4f7cff" lineWidth={1.5} />
        </>
    );
}

export function Viewport() {
    const objects = useScene((s) => s.doc.objects);
    const lights = useScene((s) => s.doc.lights);
    const selectedId = useScene((s) => s.selectedId);
    const mode = useScene((s) => s.mode);
    const transformMode = useScene((s) => s.transformMode);
    const snap = useScene((s) => s.snap);
    const select = useScene((s) => s.select);
    const run = useScene((s) => s.run);
    const endCoalesce = useScene((s) => s.endCoalesce);
    const hoveredId = useHandHover((s) => s.hoveredId);
    const [selectedMesh, setSelectedMesh] = useState<THREE.Mesh | null>(null);
    const gizmoBusy = useRef(false);

    const editing = mode !== "render";
    const selectedObject = objects.find((o) => o.id === selectedId);
    const selectedLight = lights.find((l) => l.id === selectedId);
    // The built-in key light only shows until the scene has lights of its own.
    const studio = lights.length === 0;

    return (
        <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [4, 3.5, 6], fov: 45, near: 0.05, far: 500 }}
            raycaster={{ params: { Points: { threshold: 0.08 } } as THREE.RaycasterParameters }}
            onPointerMissed={() => {
                if (!gizmoBusy.current) select(null);
            }}
            style={{ position: "absolute", inset: 0 }}
        >
            <color attach="background" args={[BACKGROUND]} />
            <fog attach="fog" args={[BACKGROUND, 25, 90]} />
            <hemisphereLight args={["#ffffff", "#30333a", studio ? 0.7 : 0.35]} />
            {studio && (
                <directionalLight
                    position={[-5, 10, 3]}
                    intensity={1.8}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                    shadow-camera-left={-12}
                    shadow-camera-right={12}
                    shadow-camera-top={12}
                    shadow-camera-bottom={-12}
                    shadow-bias={-0.0005}
                    shadow-normalBias={0.02}
                />
            )}
            {lights.map((l) => (
                <SceneLight
                    key={l.id}
                    light={l}
                    selected={l.id === selectedId}
                    showMarker={editing}
                    onSelect={select}
                    markerRef={l.id === selectedId ? setSelectedMesh : undefined}
                />
            ))}
            <CameraControls makeDefault />
            <SnapshotBridge />
            <HandControls />

            {objects.map((o) => (
                <SceneMesh
                    key={o.id}
                    object={o}
                    selected={o.id === selectedId}
                    hovered={o.id === hoveredId}
                    showSelection={mode === "object"}
                    onSelect={select}
                    meshRef={o.id === selectedId ? setSelectedMesh : undefined}
                />
            ))}

            {editing ? (
                <>
                    <Grid
                        infiniteGrid
                        fadeDistance={60}
                        cellSize={0.5}
                        sectionSize={2}
                        cellThickness={0.6}
                        sectionThickness={1}
                        cellColor="#24262b"
                        sectionColor="#34373e"
                    />
                    <Axes />
                </>
            ) : (
                <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                    <planeGeometry args={[200, 200]} />
                    <shadowMaterial opacity={0.35} />
                </mesh>
            )}

            {mode === "edit" && selectedObject && <EditOverlay object={selectedObject} gizmoBusy={gizmoBusy} />}

            {mode === "object" && selectedId && selectedMesh && (
                <TransformControls
                    object={selectedMesh}
                    mode={selectedLight ? "translate" : transformMode}
                    translationSnap={snap.enabled ? snap.translate : null}
                    rotationSnap={snap.enabled ? snap.rotate : null}
                    scaleSnap={snap.enabled ? snap.scale : null}
                    onMouseDown={() => {
                        gizmoBusy.current = true;
                    }}
                    onMouseUp={() => {
                        endCoalesce();
                        setTimeout(() => {
                            gizmoBusy.current = false;
                        });
                    }}
                    onObjectChange={() => {
                        const m = selectedMesh;
                        if (selectedLight) {
                            run(
                                { type: "transform", target: selectedId, position: [m.position.x, m.position.y, m.position.z] },
                                { coalesce: `gizmo:${selectedId}` }
                            );
                            return;
                        }
                        run(
                            {
                                type: "transform",
                                target: selectedId,
                                position: [m.position.x, m.position.y, m.position.z],
                                rotation: [m.rotation.x, m.rotation.y, m.rotation.z],
                                scale: [m.scale.x, m.scale.y, m.scale.z],
                            },
                            { coalesce: `gizmo:${selectedId}` }
                        );
                    }}
                />
            )}
        </Canvas>
    );
}

export default Viewport;
