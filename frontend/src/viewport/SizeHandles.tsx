import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, type CameraControls } from "@react-three/drei";
import * as THREE from "three";
import type { Command, SceneObject, Vec3 } from "@shapeshift/shared/scene/schema";
import { boundsIn, objectMatrix } from "../scene/geometry";
import { transformCommand } from "../scene/autokey";
import { useScene } from "../scene/store";
import { useSettings } from "../settings/store";
import { usePalette, useResolvedTheme } from "../settings/theme";
import { formatLength } from "../ui/units";
import { useTools, workplaneMatrix } from "./tools";

type Dir = [number, number, number];
type Handle = { id: string; dir: Dir };

const HANDLES: Handle[] = [
    { id: "corner-nn", dir: [-1, 0, -1] },
    { id: "corner-pn", dir: [1, 0, -1] },
    { id: "corner-np", dir: [-1, 0, 1] },
    { id: "corner-pp", dir: [1, 0, 1] },
    { id: "side-x-", dir: [-1, 0, 0] },
    { id: "side-x+", dir: [1, 0, 0] },
    { id: "side-z-", dir: [0, 0, -1] },
    { id: "side-z+", dir: [0, 0, 1] },
    { id: "top", dir: [0, 1, 0] },
];

type Drag = {
    handle: Handle;
    frame: THREE.Matrix4;
    inverse: THREE.Matrix4;
    box: THREE.Box3;
    plane: THREE.Plane;
    members: { id: string; matrix: THREE.Matrix4 }[];
};

function handlePoint(box: THREE.Box3, dir: Dir): THREE.Vector3 {
    const c = box.getCenter(new THREE.Vector3());
    const pick = (i: 0 | 1 | 2, d: number) => (d > 0 ? box.max.getComponent(i) : d < 0 ? box.min.getComponent(i) : c.getComponent(i));
    return new THREE.Vector3(pick(0, dir[0]), dir[1] > 0 ? box.max.y : box.min.y, pick(2, dir[2]));
}

const label: React.CSSProperties = {
    padding: "2px 6px",
    background: "var(--surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    color: "var(--text)",
    font: "11px/1.3 -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    pointerEvents: "none",
};

// Boxes on the corners, sides and top of the selection's bounds. Dragging one
// resizes the selection from the opposite side; Shift keeps its proportions.
export function SizeHandles({ objects, gizmoBusy }: { objects: SceneObject[]; gizmoBusy: RefObject<boolean> }) {
    const camera = useThree((s) => s.camera);
    const gl = useThree((s) => s.gl);
    const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
    const workplane = useTools((s) => s.workplane);
    const units = useSettings((s) => s.units);
    const snap = useScene((s) => s.snap);
    const palette = usePalette();
    const handleColor = useResolvedTheme() === "dark" ? "#e6e7ea" : "#3a3d44";
    const [hovered, setHovered] = useState<string | null>(null);
    const [dragging, setDragging] = useState<string | null>(null);
    const group = useRef<THREE.Group>(null);
    const busy = hovered !== null || dragging !== null;
    useEffect(() => {
        useTools.getState().setHandleBusy(busy);
        return () => useTools.getState().setHandleBusy(false);
    }, [busy]);

    const frame = useMemo(() => {
        if (objects.length === 1) {
            const o = objects[0];
            return new THREE.Matrix4().compose(new THREE.Vector3(...o.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation)), new THREE.Vector3(1, 1, 1));
        }
        return workplaneMatrix(workplane);
    }, [objects, workplane]);
    const box = useMemo(() => boundsIn(objects, frame), [objects, frame]);
    const size = box.getSize(new THREE.Vector3());
    const outline = useMemo(() => new THREE.Box3Helper(box), [box]);

    useFrame(() => {
        const g = group.current;
        if (!g) return;
        const world = new THREE.Vector3();
        for (const child of g.children) {
            if (!child.userData.handle) continue;
            child.getWorldPosition(world);
            child.scale.setScalar(world.distanceTo(camera.position) * 0.009);
        }
    });

    if (box.isEmpty()) return null;

    function onDown(handle: Handle, e: ThreeEvent<PointerEvent>) {
        e.stopPropagation();
        if (e.button !== 0) return;
        gizmoBusy.current = true;
        if (controls) controls.enabled = false;
        const start = handlePoint(box, handle.dir).applyMatrix4(frame);
        const up = new THREE.Vector3(0, 1, 0).transformDirection(frame);
        let normal = up.clone();
        if (handle.dir[1] !== 0) {
            const view = camera.getWorldDirection(new THREE.Vector3());
            normal = view.sub(up.clone().multiplyScalar(view.dot(up))).normalize();
            if (normal.lengthSq() < 1e-6) normal = new THREE.Vector3(1, 0, 0).transformDirection(frame);
        }
        const drag: Drag = {
            handle,
            frame: frame.clone(),
            inverse: frame.clone().invert(),
            box: box.clone(),
            plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, start),
            members: objects.map((o) => ({ id: o.id, matrix: objectMatrix(o) })),
        };
        setDragging(handle.id);
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const hit = new THREE.Vector3();

        const move = (ev: PointerEvent) => {
            const rect = gl.domElement.getBoundingClientRect();
            pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
            raycaster.setFromCamera(pointer, camera);
            if (!raycaster.ray.intersectPlane(drag.plane, hit)) return;
            resize(drag, hit.clone().applyMatrix4(drag.inverse), ev.shiftKey);
        };
        const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            useScene.getState().endCoalesce();
            if (controls) controls.enabled = true;
            setDragging(null);
            setTimeout(() => {
                gizmoBusy.current = false;
            });
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
    }

    function resize(drag: Drag, p: THREE.Vector3, uniform: boolean) {
        const { box: b, handle } = drag;
        const startSize = b.getSize(new THREE.Vector3());
        const factor = new THREE.Vector3(1, 1, 1);
        const anchor = b.getCenter(new THREE.Vector3());
        anchor.y = b.min.y;
        let main = 1;
        handle.dir.forEach((d, i) => {
            if (!d) return;
            const axis = i as 0 | 1 | 2;
            anchor.setComponent(axis, d > 0 ? b.min.getComponent(axis) : b.max.getComponent(axis));
            let length = d > 0 ? p.getComponent(axis) - b.min.getComponent(axis) : b.max.getComponent(axis) - p.getComponent(axis);
            if (snap.enabled) length = Math.round(length / snap.translate) * snap.translate;
            const start = startSize.getComponent(axis) || 1e-6;
            const f = Math.max(length, start * 0.01, 1e-4) / start;
            factor.setComponent(axis, f);
            if (Math.abs(f - 1) >= Math.abs(main - 1)) main = f;
        });
        if (uniform) factor.setScalar(main);
        const local = new THREE.Matrix4()
            .makeTranslation(anchor.x, anchor.y, anchor.z)
            .multiply(new THREE.Matrix4().makeScale(factor.x, factor.y, factor.z))
            .multiply(new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z));
        const change = drag.frame.clone().multiply(local).multiply(drag.inverse);
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const commands: Command[] = drag.members.map(({ id, matrix }) => {
            change.clone().multiply(matrix).decompose(position, quaternion, scale);
            const rotation = new THREE.Euler().setFromQuaternion(quaternion);
            return transformCommand(id, { position: position.toArray() as Vec3, rotation: [rotation.x, rotation.y, rotation.z], scale: scale.toArray() as Vec3 });
        });
        useScene.getState().run(commands, { coalesce: "resize", select: false });
    }

    const showSizes = hovered !== null || dragging !== null;
    const c = box.getCenter(new THREE.Vector3());

    return (
        <group matrix={frame} matrixAutoUpdate={false}>
            <primitive object={outline} raycast={() => null}>
                <lineBasicMaterial attach="material" color={palette.accent} transparent opacity={0.35} depthTest={false} />
            </primitive>
            <group ref={group}>
                {HANDLES.map((h) => {
                    const active = hovered === h.id || dragging === h.id;
                    return (
                        <mesh
                            key={h.id}
                            userData={{ handle: true }}
                            name={`size-${h.id}`}
                            position={handlePoint(box, h.dir)}
                            renderOrder={5}
                            onPointerDown={(e) => onDown(h, e)}
                            onPointerOver={(e) => {
                                e.stopPropagation();
                                setHovered(h.id);
                                gl.domElement.style.cursor = "pointer";
                            }}
                            onPointerOut={() => {
                                setHovered(null);
                                gl.domElement.style.cursor = "";
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <boxGeometry args={[1, 1, 1]} />
                            <meshBasicMaterial color={active ? palette.accent : handleColor} depthTest={false} />
                        </mesh>
                    );
                })}
            </group>
            {showSizes && (
                <>
                    <Html position={[c.x, box.min.y, box.max.z]} center zIndexRange={[14, 0]}>
                        <div style={label}>{formatLength(size.x, units)}</div>
                    </Html>
                    <Html position={[box.max.x, box.min.y, c.z]} center zIndexRange={[14, 0]}>
                        <div style={label}>{formatLength(size.z, units)}</div>
                    </Html>
                    <Html position={[box.max.x, c.y, box.max.z]} center zIndexRange={[14, 0]}>
                        <div style={label}>{formatLength(size.y, units)}</div>
                    </Html>
                </>
            )}
        </group>
    );
}
