import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTimeline } from "../scene/timeline";
import { transformCommand } from "../scene/autokey";
import type { Pose } from "../scene/animation";
import type { Light, SceneObject } from "@shapeshift/shared/scene/schema";
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
import { FrameBridge } from "./FrameBridge";
import { useGizmoColors } from "./GizmoTheme";
import { AssetBatch } from "./AssetBatch";
import { batchKey } from "./batching";
import { AutoNear, SectionCut } from "./ViewTools";
import { useView } from "./view";
import { explodeOffsets, withOffsets } from "./viewing";
import { useHands } from "../hands/tracker";
import { useHandHover } from "../hands/tracker";
import { DPR, useSettings } from "../settings/store";
import { SCENE_COLORS, usePalette, useResolvedTheme } from "../settings/theme";

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
    const palette = usePalette();
    return (
        <group userData={{ grid: true }}>
            <Line points={[[-500, 0.002, 0], [500, 0.002, 0]]} color={palette.axisX} lineWidth={1.5} />
            <Line points={[[0, 0.002, -500], [0, 0.002, 500]]} color={palette.axisZ} lineWidth={1.5} />
        </group>
    );
}

const HandControls = lazy(() => import("../hands/HandControls").then((m) => ({ default: m.HandControls })));

function withPoses(objects: SceneObject[], poses: Map<string, Pose>): SceneObject[] {
    if (!poses.size) return objects;
    return objects.map((o) => {
        const p = poses.get(o.id);
        if (!p) return o;
        return {
            ...o,
            position: p.position ?? o.position,
            rotation: p.rotation ?? o.rotation,
            scale: p.scale ?? o.scale,
            material: p.color ? { ...o.material, color: p.color } : o.material,
        };
    });
}

function withLightPoses(lights: Light[], poses: Map<string, Pose>): Light[] {
    if (!poses.size) return lights;
    return lights.map((l) => {
        const p = poses.get(l.id);
        return p ? { ...l, position: p.position ?? l.position, color: p.color ?? l.color, intensity: p.intensity ?? l.intensity } : l;
    });
}

export function Viewport() {
    const gizmoColors = useGizmoColors();
    const baseObjects = useScene((s) => s.doc.objects);
    const baseLights = useScene((s) => s.doc.lights);
    const poses = useTimeline((s) => s.poses);
    // Animated objects show where the timeline puts them.
    const posed = useMemo(() => withPoses(baseObjects, poses), [baseObjects, poses]);
    const hidden = useView((s) => s.hidden);
    const explode = useView((s) => s.explode);
    const visible = useMemo(() => (hidden.size ? posed.filter((o) => !hidden.has(o.id)) : posed), [posed, hidden]);
    const objects = useMemo(() => withOffsets(visible, explodeOffsets(visible, explode)), [visible, explode]);
    const lights = useMemo(() => withLightPoses(baseLights, poses), [baseLights, poses]);
    const environment = useScene((s) => s.doc.environment);
    const selectedId = useScene((s) => s.selectedId);
    const handsOn = useHands((s) => s.status !== "off");
    const selectedIds = useScene(useShallow((s) => s.selectedIds));
    const peers = useCollab((s) => s.peers);
    const peerColors = new Map<string, string>();
    for (const p of Object.values(peers)) for (const id of p.presence.selection) peerColors.set(id, p.color);
    const peerKey = [...peerColors].join();
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
    // Exploded parts are drawn away from where they really are, so moving
    // them would be confusing.
    const canTransform = explode === 0;

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
    // Copies of the same imported part are drawn together, apart from ones
    // that need their own outline.
    const { singles, batches } = useMemo(() => {
        const marked = new Set([...selectedIds, ...peerColors.keys(), ...(hoveredId ? [hoveredId] : [])]);
        const groups = new Map<string, SceneObject[]>();
        const singles: SceneObject[] = [];
        for (const o of objects) {
            const key = marked.has(o.id) ? null : batchKey(o);
            if (key === null) singles.push(o);
            else {
                const list = groups.get(key);
                if (list) list.push(o);
                else groups.set(key, [o]);
            }
        }
        const batches: [string, SceneObject[]][] = [];
        for (const [key, members] of groups) {
            if (members.length > 1) batches.push([key, members]);
            else singles.push(members[0]);
        }
        return { singles, batches };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objects, selectedIds, hoveredId, peerKey]);
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
            <FrameBridge />
            <PeerCursors />
            {handsOn && (
                <Suspense fallback={null}>
                    <HandControls />
                </Suspense>
            )}

            {singles.map((o) => (
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
            {batches.map(([key, members]) => (
                <AssetBatch key={key} hash={(members[0].geometry as { hash: string }).hash} objects={members} onSelect={pick} />
            ))}
            <SectionCut objects={visible} />
            <AutoNear />

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

            {mode === "object" && canTransform && selectedObjects.length > 1 && <MultiTransform objects={selectedObjects} gizmoBusy={gizmoBusy} />}

            {mode === "object" && canTransform && selectedObjects.length <= 1 && selectedId && selectedMesh && (
                <TransformControls
                    ref={gizmoColors}
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
                            run(transformCommand(selectedId, { position: [m.position.x, m.position.y, m.position.z] }), { coalesce: `gizmo:${selectedId}` });
                            return;
                        }
                        run(
                            transformCommand(selectedId, {
                                position: [m.position.x, m.position.y, m.position.z],
                                rotation: [m.rotation.x, m.rotation.y, m.rotation.z],
                                scale: [m.scale.x, m.scale.y, m.scale.z],
                            }),
                            { coalesce: `gizmo:${selectedId}` }
                        );
                    }}
                />
            )}
        </Canvas>
    );
}

export default Viewport;
