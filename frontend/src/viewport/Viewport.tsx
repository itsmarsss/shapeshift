import { useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { CameraControls, Grid, Line, TransformControls } from "@react-three/drei";
import type * as THREE from "three";
import { useScene } from "../scene/store";
import { SceneMesh } from "./SceneMesh";
import { EditOverlay } from "./EditOverlay";

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
    const selectedId = useScene((s) => s.selectedId);
    const mode = useScene((s) => s.mode);
    const transformMode = useScene((s) => s.transformMode);
    const snap = useScene((s) => s.snap);
    const select = useScene((s) => s.select);
    const run = useScene((s) => s.run);
    const endCoalesce = useScene((s) => s.endCoalesce);
    const [selectedMesh, setSelectedMesh] = useState<THREE.Mesh | null>(null);
    const gizmoBusy = useRef(false);

    const editing = mode !== "render";
    const selectedObject = objects.find((o) => o.id === selectedId);

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
            <hemisphereLight args={["#ffffff", "#30333a", 0.7]} />
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
            <CameraControls makeDefault />

            {objects.map((o) => (
                <SceneMesh
                    key={o.id}
                    object={o}
                    selected={o.id === selectedId}
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
                    mode={transformMode}
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
