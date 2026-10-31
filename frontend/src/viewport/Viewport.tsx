import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type MutableRefObject } from "react";
import { useTimeline } from "../scene/timeline";
import { transformCommand } from "../scene/autokey";
import type { Pose } from "../scene/animation";
import type { Light, SceneObject, Vec3 } from "@shapeshift/shared/scene/schema";
import { useShallow } from "zustand/react/shallow";
import { useCollab } from "../collab/session";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, Line, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { useScene } from "../scene/store";
import { SceneMesh, type MeshLook } from "./SceneMesh";
import { cutGeometries } from "../scene/holes";
import { useCsg } from "../scene/csg";
import { ToolFloor, WorkplaneGrid } from "./Workplane";
import { Ruler } from "./Ruler";
import { SizeHandles } from "./SizeHandles";
import { snapOnWorkplane, useTools, workplaneQuaternion } from "./tools";
import { SceneLight } from "./SceneLight";
import { MultiTransform } from "./MultiTransform";
import { PeerCursors } from "./PeerCursors";
import { SceneEnvironment } from "./SceneEnvironment";
import { EditOverlay } from "./EditOverlay";
import { SnapshotBridge } from "./SnapshotBridge";
import { CameraBridge } from "./CameraBridge";
import { useObjectDrag } from "./useObjectDrag";
import { useGizmoColors } from "./GizmoTheme";
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

type ItemsProps = {
    objects: SceneObject[];
    lights: Light[];
    selectedIds: string[];
    selectedId: string | null;
    hoveredId: string | null;
    peerColors: Map<string, string>;
    editing: boolean;
    pick: (id: string, event: ThreeEvent<MouseEvent>) => void;
    busy: MutableRefObject<boolean>;
    setSelectedMesh: (mesh: THREE.Mesh | null) => void;
    cuts: Map<string, MeshProps["cut"]>;
    looks: Map<string, MeshProps["look"]>;
};

type MeshProps = ComponentProps<typeof SceneMesh>;

// The scene's objects and light markers. Lives inside the canvas so pressing
// one can start a drag; see useObjectDrag.
function SceneItems({ objects, lights, selectedIds, selectedId, hoveredId, peerColors, editing, pick, busy, setSelectedMesh, cuts, looks }: ItemsProps) {
    const mode = useScene((s) => s.mode);
    const select = useScene((s) => s.select);
    const drawn = useRef(new Map<string, Vec3>());
    drawn.current = new Map([...objects.map((o) => [o.id, o.position] as const), ...lights.map((l) => [l.id, l.position] as const)]);
    const positions = useCallback(() => drawn.current, []);
    // A tool like the workplane or ruler takes the press instead of a drag.
    const canDrag = useCallback(() => useTools.getState().tool === "select", []);
    const surface = useCallback(() => workplaneQuaternion(useTools.getState().workplane), []);
    const { onPointerDown, onHover } = useObjectDrag({ positions, pick, busy, canDrag, surface });
    // In object mode a press selects (and may drag); clicks only select in the other modes.
    const click = mode === "object" ? noop : pick;
    const clickLight = mode === "object" ? noop : (id: string) => select(id);
    return (
        <>
            {lights.map((l) => (
                <SceneLight
                    key={l.id}
                    light={l}
                    selected={l.id === selectedId}
                    showMarker={editing}
                    onSelect={clickLight}
                    onPress={onPointerDown}
                    onHover={onHover}
                    markerRef={l.id === selectedId ? setSelectedMesh : undefined}
                />
            ))}
            {objects.map((o) => (
                <SceneMesh
                    key={o.id}
                    object={o}
                    selected={selectedIds.includes(o.id)}
                    hovered={o.id === hoveredId}
                    peerColor={peerColors.get(o.id)}
                    showSelection={mode === "object"}
                    onSelect={click}
                    onPress={onPointerDown}
                    onHover={onHover}
                    meshRef={o.id === selectedId ? setSelectedMesh : undefined}
                    cut={cuts.get(o.id)}
                    look={looks.get(o.id)}
                />
            ))}
        </>
    );
}

const noop = () => {};

export function Viewport() {
    const gizmoColors = useGizmoColors();
    const baseObjects = useScene((s) => s.doc.objects);
    const baseLights = useScene((s) => s.doc.lights);
    const poses = useTimeline((s) => s.poses);
    // Animated objects show where the timeline puts them.
    const objects = useMemo(() => withPoses(baseObjects, poses), [baseObjects, poses]);
    const lights = useMemo(() => withLightPoses(baseLights, poses), [baseLights, poses]);
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

    const tool = useTools((s) => s.tool);
    const workplane = useTools((s) => s.workplane);
    // Redone once the cutting library arrives, if holes were drawn uncut.
    const csgReady = useCsg((s) => s.ready);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const cuts = useMemo(() => cutGeometries(objects), [objects, csgReady]);
    const looks = useMemo(() => {
        const map = new Map<string, MeshLook>();
        for (const o of objects) {
            if (!o.hole) continue;
            const cutting = o.group && objects.some((m) => m.group === o.group && !m.hole);
            const members = cutting ? objects.filter((m) => m.group === o.group) : [];
            const partly = selectedIds.includes(o.id) && !members.every((m) => selectedIds.includes(m.id));
            map.set(o.id, cutting && !partly ? "hidden" : "hole");
        }
        return map;
    }, [objects, selectedIds]);

    const settings = useSettings();
    const colors = SCENE_COLORS[useResolvedTheme()];
    const shadows = mode === "render" && settings.shadows;
    const editing = mode !== "render";
    const selectedObject = objects.find((o) => o.id === selectedId);
    const selectedLight = lights.find((l) => l.id === selectedId);
    const selectedObjects = objects.filter((o) => selectedIds.includes(o.id));

    // Shift-click adds or removes one object. Clicking a grouped object picks
    // its whole group; Alt-click picks just that part.
    function pick(id: string, e: ThreeEvent<MouseEvent>) {
        if (useTools.getState().tool !== "select") return applyTool(e);
        e.stopPropagation();
        const event = e.nativeEvent;
        if (event.shiftKey) return select(id, { toggle: true });
        const group = objects.find((o) => o.id === id)?.group;
        if (group && !event.altKey) {
            const members = objects.filter((o) => o.group === group && o.id !== id).map((o) => o.id);
            return selectMany([...members, id]);
        }
        select(id);
    }
    function applyTool(e: ThreeEvent<MouseEvent>) {
        if (e.object.userData.look === "hidden") return;
        e.stopPropagation();
        const tools = useTools.getState();
        const point = e.point.toArray() as Vec3;
        if (tools.tool === "ruler") return tools.addRulerPoint(point);
        if (e.object.userData.look === "floor" || !e.face) tools.setWorkplane(null);
        else {
            const normal = e.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(e.object.matrixWorld)).normalize();
            tools.setWorkplane({ origin: point, normal: normal.toArray() as Vec3 });
        }
        tools.setTool("select");
    }

    function snapMove(object: THREE.Object3D) {
        if (!workplane || !snap.enabled || transformMode !== "translate") return;
        object.position.copy(snapOnWorkplane(object.position, snap.translate, workplane));
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
                if (!gizmoBusy.current && useTools.getState().tool === "select") select(null);
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
            <CameraBridge />
            <PeerCursors />
            {handsOn && (
                <Suspense fallback={null}>
                    <HandControls />
                </Suspense>
            )}

            <SceneItems
                objects={objects}
                lights={lights}
                selectedIds={selectedIds}
                selectedId={selectedId}
                hoveredId={hoveredId}
                peerColors={peerColors}
                editing={editing}
                pick={pick}
                busy={gizmoBusy}
                setSelectedMesh={setSelectedMesh}
                cuts={cuts}
                looks={looks}
            />
            {editing && tool !== "select" && <ToolFloor onClick={applyTool} />}
            {editing && <Ruler />}

            {editing && settings.showGrid && <WorkplaneGrid />}
            {editing && settings.showAxes && <Axes />}
            {shadows && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                    <planeGeometry args={[200, 200]} />
                    <shadowMaterial opacity={0.35} />
                </mesh>
            )}

            {mode === "edit" && selectedObject && <EditOverlay object={selectedObject} gizmoBusy={gizmoBusy} />}

            {mode === "object" && selectedObjects.length > 1 && <MultiTransform objects={selectedObjects} gizmoBusy={gizmoBusy} />}

            {mode === "object" && tool === "select" && selectedObjects.length > 0 && <SizeHandles objects={selectedObjects} gizmoBusy={gizmoBusy} />}

            {mode === "object" && selectedObjects.length <= 1 && selectedId && selectedMesh && (
                <TransformControls
                    ref={gizmoColors}
                    object={selectedMesh}
                    mode={selectedLight ? "translate" : transformMode}
                    translationSnap={snap.enabled && !workplane ? snap.translate : null}
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
                        snapMove(m);
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
