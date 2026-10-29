import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useCollab } from "../collab/session";
import { Canvas, useThree } from "@react-three/fiber";
import { CameraControls, Grid, Line, TransformControls } from "@react-three/drei";
import type * as THREE from "three";
import { useScene } from "../scene/store";
import { SceneMesh } from "./SceneMesh";
import { SceneLight } from "./SceneLight";
import { MultiTransform } from "./MultiTransform";
import { PeerCursors } from "./PeerCursors";
import { SceneEnvironment } from "./SceneEnvironment";
import { EditOverlay } from "./EditOverlay";
import { SnapshotBridge } from "./SnapshotBridge";
import { useHands } from "../hands/tracker";
import { useHandHover } from "../hands/tracker";
import { DPR, useSettings } from "../settings/store";
import { SCENE_COLORS, useResolvedTheme } from "../settings/theme";

function CameraSettings() {
    const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
    const setDpr = useThree((s) => s.setDpr);
    const fov = useSettings((s) => s.fov);
    const quality = useSettings((s) => s.quality);
    useEffect(() => {
        camera.fov = fov;
        camera.updateProjectionMatrix();
    }, [camera, fov]);
    useEffect(() => {
        const [min, max] = DPR[quality];
        setDpr(Math.min(max, Math.max(min, window.devicePixelRatio)));
    }, [setDpr, quality]);
    return null;
}

function Axes() {
    return (
        <group userData={{ grid: true }}>
            <Line points={[[-500, 0.002, 0], [500, 0.002, 0]]} color="#e5484d" lineWidth={1.5} />
            <Line points={[[0, 0.002, -500], [0, 0.002, 500]]} color="#4f7cff" lineWidth={1.5} />
        </group>
    );
}

const HandControls = lazy(() => import("../hands/HandControls").then((m) => ({ default: m.HandControls })));

export function Viewport() {
    const objects = useScene((s) => s.doc.objects);
    const lights = useScene((s) => s.doc.lights);
    const environment = useScene((s) => s.doc.environment);
    const selectedId = useScene((s) => s.selectedId);
    const handsOn = useHands((s) => s.status !== "off");
    const selectedIds = useScene(useShallow((s) => s.selectedIds));
    const peers = useCollab((s) => s.peers);
    const peerColors = new Map<string, string>();
    for (const p of Object.values(peers)) for (const id of p.presence.selection) peerColors.set(id, p.color);
    const selectMany = useScene((s) => s.selectMany);
    const mode = useScene((s) => s.mode);
    const transformMode = useScene((s) => s.transformMode);
    const snap = useScene((s) => s.snap);
    const select = useScene((s) => s.select);
    const run = useScene((s) => s.run);
    const endCoalesce = useScene((s) => s.endCoalesce);
    const hoveredId = useHandHover((s) => s.hoveredId);
    const [selectedMesh, setSelectedMesh] = useState<THREE.Mesh | null>(null);
    const gizmoBusy = useRef(false);

    const settings = useSettings();
    const colors = SCENE_COLORS[useResolvedTheme()];
    const shadows = mode === "render" && settings.shadows;
    const editing = mode !== "render";
    const selectedObject = objects.find((o) => o.id === selectedId);
    const selectedLight = lights.find((l) => l.id === selectedId);
    const selectedObjects = objects.filter((o) => selectedIds.includes(o.id));

    // Shift-click adds or removes one object. Clicking a grouped object picks
    // its whole group; Alt-click picks just that part.
    function pick(id: string, event: MouseEvent) {
        if (event.shiftKey) return select(id, { toggle: true });
        const group = objects.find((o) => o.id === id)?.group;
        if (group && !event.altKey) {
            const members = objects.filter((o) => o.group === group && o.id !== id).map((o) => o.id);
            return selectMany([...members, id]);
        }
        select(id);
    }
    // The built-in key light only shows until the scene has lights of its own.
    const studio = lights.length === 0;

    return (
        <Canvas
            // Draw only when something changes. Hand control polls the
            // tracker every frame, so it needs the loop running.
            frameloop={handsOn ? "always" : "demand"}
            shadows
            dpr={DPR[settings.quality]}
            camera={{ position: [4, 3.5, 6], fov: settings.fov, near: 0.05, far: 500 }}
            raycaster={{ params: { Points: { threshold: 0.08 } } as THREE.RaycasterParameters }}
            onPointerMissed={() => {
                if (!gizmoBusy.current) select(null);
            }}
            style={{ position: "absolute", inset: 0 }}
        >
            <color attach="background" args={[colors.background]} />
            <fog attach="fog" args={[colors.background, 25, 90]} />
            <hemisphereLight args={["#ffffff", colors.ground, studio ? 0.7 : 0.35]} />
            {studio && (
                <directionalLight
                    position={[-5, 10, 3]}
                    intensity={1.8}
                    castShadow={shadows}
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
            <CameraControls
                makeDefault
                azimuthRotateSpeed={settings.orbitSpeed}
                polarRotateSpeed={settings.orbitSpeed}
                dollySpeed={settings.zoomSpeed}
                dollyToCursor={settings.zoomToCursor}
            />
            <CameraSettings />
            <SceneEnvironment preset={environment} />
            <SnapshotBridge />
            <PeerCursors />
            {handsOn && (
                <Suspense fallback={null}>
                    <HandControls />
                </Suspense>
            )}

            {objects.map((o) => (
                <SceneMesh
                    key={o.id}
                    object={o}
                    selected={selectedIds.includes(o.id)}
                    hovered={o.id === hoveredId}
                    peerColor={peerColors.get(o.id)}
                    showSelection={mode === "object"}
                    onSelect={pick}
                    meshRef={o.id === selectedId ? setSelectedMesh : undefined}
                />
            ))}

            {editing && settings.showGrid && (
                <Grid
                    userData={{ grid: true }}
                    infiniteGrid
                    fadeDistance={60}
                    cellSize={settings.gridCell}
                    sectionSize={settings.gridCell * 4}
                    cellThickness={0.6}
                    sectionThickness={1}
                    cellColor={colors.cell}
                    sectionColor={colors.section}
                />
            )}
            {editing && settings.showAxes && <Axes />}
            {shadows && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                    <planeGeometry args={[200, 200]} />
                    <shadowMaterial opacity={0.35} />
                </mesh>
            )}

            {mode === "edit" && selectedObject && <EditOverlay object={selectedObject} gizmoBusy={gizmoBusy} />}

            {mode === "object" && selectedObjects.length > 1 && <MultiTransform objects={selectedObjects} gizmoBusy={gizmoBusy} />}

            {mode === "object" && selectedObjects.length <= 1 && selectedId && selectedMesh && (
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
