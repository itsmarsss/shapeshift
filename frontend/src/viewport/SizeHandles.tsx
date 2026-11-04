import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line, type CameraControls } from "@react-three/drei";
import * as THREE from "three";
import type { Command, SceneObject, Vec3 } from "@shapeshift/shared/scene/schema";
import { boundsIn, objectMatrix } from "../scene/geometry";
import { transformCommand } from "../scene/autokey";
import { useScene } from "../scene/store";
import { useSettings } from "../settings/store";
import { usePalette, useResolvedTheme } from "../settings/theme";
import { formatLength } from "../ui/units";
import { useTools, workplaneMatrix } from "./tools";
import { addHandles } from "./handHandles";

type Dir = [number, number, number];
// Size boxes resize; the knob on the floor ring turns the selection about
// its upright axis, and the arrow above it lifts it.
type Handle = { id: string; dir: Dir; kind: "size" | "turn" | "lift" };

const HANDLES: Handle[] = [
    { id: "corner-nn", dir: [-1, 0, -1], kind: "size" },
    { id: "corner-pn", dir: [1, 0, -1], kind: "size" },
    { id: "corner-np", dir: [-1, 0, 1], kind: "size" },
    { id: "corner-pp", dir: [1, 0, 1], kind: "size" },
    { id: "side-x-", dir: [-1, 0, 0], kind: "size" },
    { id: "side-x+", dir: [1, 0, 0], kind: "size" },
    { id: "side-z-", dir: [0, 0, -1], kind: "size" },
    { id: "side-z+", dir: [0, 0, 1], kind: "size" },
    { id: "top", dir: [0, 1, 0], kind: "size" },
    { id: "turn", dir: [1, 0, 1], kind: "turn" },
    { id: "lift", dir: [0, 1, 0], kind: "lift" },
];

const WORDS: Record<Handle["kind"], { verb: string; doing: string }> = {
    size: { verb: "Pinch to resize", doing: "Resizing" },
    turn: { verb: "Pinch to turn", doing: "Turning" },
    lift: { verb: "Pinch to lift", doing: "Lifting" },
};
const kindOf = (key: string) => HANDLES.find((h) => h.id === key)?.kind ?? "size";

type Drag = {
    handle: Handle;
    frame: THREE.Matrix4;
    inverse: THREE.Matrix4;
    box: THREE.Box3;
    plane: THREE.Plane;
    members: { id: string; matrix: THREE.Matrix4 }[];
    // Where the drag first met its plane, in the selection's frame.
    start: THREE.Vector3 | null;
};

function handlePoint(box: THREE.Box3, dir: Dir): THREE.Vector3 {
    const c = box.getCenter(new THREE.Vector3());
    const pick = (i: 0 | 1 | 2, d: number) => (d > 0 ? box.max.getComponent(i) : d < 0 ? box.min.getComponent(i) : c.getComponent(i));
    return new THREE.Vector3(pick(0, dir[0]), dir[1] > 0 ? box.max.y : box.min.y, pick(2, dir[2]));
}

// Clear of the shape, by an amount that suits its size.
const clearance = (box: THREE.Box3) => {
    const size = box.getSize(new THREE.Vector3());
    return Math.max(0.2, Math.max(size.x, size.y, size.z) * 0.2);
};
const ringRadius = (box: THREE.Box3) => {
    const size = box.getSize(new THREE.Vector3());
    return Math.hypot(size.x, size.z) / 2 + clearance(box);
};

// Where a handle sits, in the selection's frame: size boxes on the bounds,
// the lift arrow above the top, the turn knob out on the floor ring.
function handleSpot(box: THREE.Box3, h: Handle): THREE.Vector3 {
    const c = box.getCenter(new THREE.Vector3());
    if (h.kind === "lift") return new THREE.Vector3(c.x, box.max.y + clearance(box), c.z);
    if (h.kind === "turn") {
        const r = ringRadius(box) / Math.SQRT2;
        return new THREE.Vector3(c.x + r, box.min.y, c.z + r);
    }
    return handlePoint(box, h.dir);
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
    // How far a turn or lift has gone, shown beside its handle.
    const [readout, setReadout] = useState<string | null>(null);
    const group = useRef<THREE.Group>(null);
    const upGroup = useRef<THREE.Group>(null);
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
    // Turning and lifting go by the floor (or the workplane), even for a shape
    // that's tipped over: around the upright axis, and straight up.
    const upFrame = useMemo(() => {
        if (objects.length !== 1) return frame;
        const o = objects[0];
        const up = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(...o.rotation));
        return up.y > 0.9999 ? frame : new THREE.Matrix4().makeTranslation(...o.position);
    }, [objects, frame]);
    const upBox = useMemo(() => (upFrame === frame ? box : boundsIn(objects, upFrame)), [objects, frame, upFrame, box]);
    // Which frame and bounds a handle goes by.
    const placeOf = (h: Handle) => (h.kind === "size" ? { frame, box } : { frame: upFrame, box: upBox });
    const size = box.getSize(new THREE.Vector3());
    const outline = useMemo(() => new THREE.Box3Helper(box), [box]);

    // Hands grab the handles too (see handHandles): where each is on screen,
    // and the same resize a mouse drag does.
    const latest = useRef<{
        box: THREE.Box3;
        placeOf: (h: Handle) => { frame: THREE.Matrix4; box: THREE.Box3 };
        begin: (h: Handle) => {
            move: (x: number, y: number, u: boolean) => void;
            stop: () => void;
        };
    } | null>(null);
    useEffect(() => {
        let active: ReturnType<NonNullable<typeof latest.current>["begin"]> | null = null;
        const screen = new THREE.Vector3();
        return addHandles({
            verb: (key) => WORDS[kindOf(key)].verb,
            doing: (key) => WORDS[kindOf(key)].doing,
            nearest: (x, y) => {
                const l = latest.current;
                if (!l || l.box.isEmpty()) return null;
                const rect = gl.domElement.getBoundingClientRect();
                let best: { key: string; x: number; y: number; gap: number } | null = null;
                for (const h of HANDLES) {
                    const at = l.placeOf(h);
                    screen.copy(handleSpot(at.box, h)).applyMatrix4(at.frame).project(camera);
                    if (screen.z > 1) continue;
                    const px = rect.left + ((screen.x + 1) / 2) * rect.width;
                    const py = rect.top + ((1 - screen.y) / 2) * rect.height;
                    const gap = Math.hypot(px - x, py - y);
                    if (!best || gap < best.gap) best = { key: h.id, x: px, y: py, gap };
                }
                return best;
            },
            hover: (key) => setHovered(key),
            grab: (key) => {
                const h = HANDLES.find((handle) => handle.id === key);
                if (!h || !latest.current) return false;
                active = latest.current.begin(h);
                return true;
            },
            drag: (x, y) => active?.move(x, y, false),
            release: () => {
                active?.stop();
                active = null;
            },
        });
    }, [camera, gl]);

    useFrame(() => {
        const world = new THREE.Vector3();
        for (const g of [group.current, upGroup.current])
            for (const child of g?.children ?? []) {
                if (!child.userData.handle) continue;
                child.getWorldPosition(world);
                child.scale.setScalar(world.distanceTo(camera.position) * 0.009);
            }
    });

    latest.current = box.isEmpty() ? null : { box, placeOf, begin };
    if (box.isEmpty()) return null;

    // Starts resizing from a handle; the returned drag follows a window point.
    function begin(handle: Handle) {
        const { frame, box } = placeOf(handle);
        gizmoBusy.current = true;
        if (controls) controls.enabled = false;
        const start = handleSpot(box, handle).applyMatrix4(frame);
        const up = new THREE.Vector3(0, 1, 0).transformDirection(frame);
        let normal = up.clone();
        // Lifting and the top box move up and down, on a plane facing the camera;
        // the rest move across the floor.
        if (handle.dir[1] !== 0 && handle.kind !== "turn") {
            const view = camera.getWorldDirection(new THREE.Vector3());
            // Facing the camera, but upright; looking straight down, any upright plane does.
            normal = view.sub(up.clone().multiplyScalar(view.dot(up)));
            normal = normal.lengthSq() < 1e-4 ? new THREE.Vector3(1, 0, 0).transformDirection(frame) : normal.normalize();
        }
        const drag: Drag = {
            handle,
            frame: frame.clone(),
            inverse: frame.clone().invert(),
            box: box.clone(),
            plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, start),
            members: objects.map((o) => ({ id: o.id, matrix: objectMatrix(o) })),
            start: null,
        };
        setDragging(handle.id);
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const hit = new THREE.Vector3();

        return {
            move: (x: number, y: number, uniform: boolean) => {
                const rect = gl.domElement.getBoundingClientRect();
                pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
                raycaster.setFromCamera(pointer, camera);
                if (!raycaster.ray.intersectPlane(drag.plane, hit)) return;
                const p = hit.clone().applyMatrix4(drag.inverse);
                drag.start ??= p.clone();
                if (handle.kind === "turn") turn(drag, p);
                else if (handle.kind === "lift") lift(drag, p);
                else resize(drag, p, uniform);
            },
            stop: () => {
                setReadout(null);
                useScene.getState().endCoalesce();
                if (controls) controls.enabled = true;
                setDragging(null);
                setTimeout(() => {
                    gizmoBusy.current = false;
                });
            },
        };
    }

    function onDown(handle: Handle, e: ThreeEvent<PointerEvent>) {
        e.stopPropagation();
        if (e.button !== 0) return;
        const d = begin(handle);
        const move = (ev: PointerEvent) => d.move(ev.clientX, ev.clientY, ev.shiftKey);
        const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            d.stop();
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
        apply(drag, local, "resize");
    }

    // About the upright axis through the middle, by how far the pointer has
    // gone around the ring.
    function turn(drag: Drag, p: THREE.Vector3) {
        const c = drag.box.getCenter(new THREE.Vector3());
        const angle = (v: THREE.Vector3) => Math.atan2(v.z - c.z, v.x - c.x);
        let by = angle(drag.start!) - angle(p);
        by = Math.atan2(Math.sin(by), Math.cos(by));
        if (snap.enabled && snap.rotate) by = Math.round(by / snap.rotate) * snap.rotate;
        const local = new THREE.Matrix4()
            .makeTranslation(c.x, 0, c.z)
            .multiply(new THREE.Matrix4().makeRotationY(by))
            .multiply(new THREE.Matrix4().makeTranslation(-c.x, 0, -c.z));
        setReadout(`${Math.round(THREE.MathUtils.radToDeg(by))}°`);
        apply(drag, local, "turn");
    }

    // Straight up or down, by how far the pointer has risen.
    function lift(drag: Drag, p: THREE.Vector3) {
        let by = p.y - drag.start!.y;
        if (snap.enabled) by = Math.round(by / snap.translate) * snap.translate;
        setReadout(`${by >= 0 ? "Up" : "Down"} ${formatLength(Math.abs(by), units)}`);
        apply(drag, new THREE.Matrix4().makeTranslation(0, by, 0), "lift");
    }

    // A change in the selection's frame, made to every member.
    function apply(drag: Drag, local: THREE.Matrix4, coalesce: string) {
        const change = drag.frame.clone().multiply(local).multiply(drag.inverse);
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const commands: Command[] = drag.members.map(({ id, matrix }) => {
            change.clone().multiply(matrix).decompose(position, quaternion, scale);
            const rotation = new THREE.Euler().setFromQuaternion(quaternion);
            return transformCommand(id, {
                position: position.toArray() as Vec3,
                rotation: [rotation.x, rotation.y, rotation.z],
                scale: scale.toArray() as Vec3,
            });
        });
        useScene.getState().run(commands, { coalesce, select: false });
    }

    const sizing = (id: string | null) => id !== null && kindOf(id) === "size";
    const showSizes = sizing(hovered) || sizing(dragging);
    const c = box.getCenter(new THREE.Vector3());
    const turning = hovered === "turn" || dragging === "turn";
    const uc = upBox.getCenter(new THREE.Vector3());
    const ring = turning
        ? Array.from({ length: 65 }, (_, i) => {
              const a = (i / 64) * Math.PI * 2;
              return new THREE.Vector3(uc.x + Math.cos(a) * ringRadius(upBox), upBox.min.y, uc.z + Math.sin(a) * ringRadius(upBox));
          })
        : [];
    const active = dragging ?? hovered;
    const activeHandle = HANDLES.find((h) => h.id === active);

    const handleMesh = (h: Handle) => {
        const lit = hovered === h.id || dragging === h.id;
        return (
            <mesh
                key={h.id}
                userData={{ handle: true }}
                name={`size-${h.id}`}
                position={handleSpot(placeOf(h).box, h)}
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
                {h.kind === "lift" ? <coneGeometry args={[0.75, 1.9, 20]} /> : h.kind === "turn" ? <sphereGeometry args={[0.85, 20, 14]} /> : <boxGeometry args={[1, 1, 1]} />}
                <meshBasicMaterial color={lit || (h.kind !== "size" && !active) ? palette.accent : handleColor} depthTest={false} />
            </mesh>
        );
    };

    return (
        <>
            <group matrix={upFrame} matrixAutoUpdate={false}>
                <group ref={upGroup}>{HANDLES.filter((h) => h.kind !== "size").map(handleMesh)}</group>
                {turning && <Line points={ring} color={palette.accent} lineWidth={1.5} transparent opacity={0.6} depthTest={false} raycast={() => null} />}
                {readout && activeHandle && activeHandle.kind !== "size" && (
                    <Html position={handleSpot(upBox, activeHandle)} center zIndexRange={[14, 0]} pointerEvents="none" style={{ transform: "translateY(-26px)" }}>
                        <div style={label}>{readout}</div>
                    </Html>
                )}
            </group>
            <group matrix={frame} matrixAutoUpdate={false}>
                <primitive object={outline} raycast={() => null}>
                    <lineBasicMaterial attach="material" color={palette.accent} transparent opacity={0.35} depthTest={false} />
                </primitive>
                <group ref={group}>{HANDLES.filter((h) => h.kind === "size").map(handleMesh)}</group>
                {showSizes && (
                    <>
                        <Html position={[c.x, box.min.y, box.max.z]} center zIndexRange={[14, 0]} pointerEvents="none">
                            <div style={label}>{formatLength(size.x, units)}</div>
                        </Html>
                        <Html position={[box.max.x, box.min.y, c.z]} center zIndexRange={[14, 0]} pointerEvents="none">
                            <div style={label}>{formatLength(size.z, units)}</div>
                        </Html>
                        <Html position={[box.max.x, c.y, box.max.z]} center zIndexRange={[14, 0]} pointerEvents="none">
                            <div style={label}>{formatLength(size.y, units)}</div>
                        </Html>
                    </>
                )}
            </group>
        </>
    );
}
