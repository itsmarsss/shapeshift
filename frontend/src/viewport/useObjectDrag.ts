import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import type { Vec3 } from "@shapeshift/shared/scene/schema";
import { useScene } from "../scene/store";
import { transformCommand } from "../scene/autokey";

// How far the pointer moves before a press becomes a drag, so a plain click
// still just selects.
const DRAG_PIXELS = 4;

type Options = {
    // Where each object or light is drawn right now, animation included.
    positions: () => Map<string, Vec3>;
    // Selects what was pressed, the same way a click does.
    pick: (id: string, event: PointerEvent) => void;
    // Set while a gizmo or a drag owns the pointer, so a click on empty space
    // at the end of it doesn't clear the selection.
    busy: MutableRefObject<boolean>;
};

// Pressing an object and dragging slides it, and everything selected with it,
// across the floor under the pointer. Holding Shift raises or lowers it
// instead. The camera only orbits when the drag starts on empty space.
export function useObjectDrag({ positions, pick, busy }: Options) {
    const camera = useThree((s) => s.camera);
    const gl = useThree((s) => s.gl);
    const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
    const invalidate = useThree((s) => s.invalidate);
    const cleanup = useRef<(() => void) | null>(null);
    useEffect(() => () => cleanup.current?.(), []);

    const setCursor = useCallback((cursor: string) => void (gl.domElement.style.cursor = cursor), [gl]);

    const onPointerDown = useCallback(
        (id: string, e: ThreeEvent<PointerEvent>) => {
            // Right and middle buttons keep panning the camera.
            if (e.button !== 0 || useScene.getState().mode !== "object") return;
            e.stopPropagation();
            // Shift-pressing something already selected could be a Shift-click
            // to deselect it or a Shift-drag to lift it; wait to see which.
            const deferred = e.nativeEvent.shiftKey && useScene.getState().selectedIds.includes(id);
            if (!deferred) pick(id, e.nativeEvent);
            const native = e.nativeEvent;
            const selected = useScene.getState().selectedIds;
            // A Shift-click that just deselected it has nothing to drag.
            if (!selected.includes(id)) return;

            const drawn = positions();
            const ids = selected.filter((s) => drawn.has(s));
            const pointerId = e.pointerId;
            const downX = e.nativeEvent.clientX;
            const downY = e.nativeEvent.clientY;
            const ray = new THREE.Raycaster();
            const ndc = new THREE.Vector2();
            const hit = new THREE.Vector3();
            let dragging = false;
            let vertical = false;
            // Re-based whenever Shift changes, so switching mid-drag doesn't jump.
            let base = new Map(ids.map((s) => [s, drawn.get(s)!] as const));
            let origin = e.point.clone();
            let applied = base;

            if (controls) controls.enabled = false;

            function planeFor(point: THREE.Vector3) {
                if (!vertical) return new THREE.Plane(new THREE.Vector3(0, 1, 0), -point.y);
                // A wall through the point, facing the camera.
                const facing = camera.getWorldDirection(new THREE.Vector3()).setY(0);
                if (facing.lengthSq() < 1e-6) facing.set(0, 0, 1);
                return new THREE.Plane().setFromNormalAndCoplanarPoint(facing.normalize().negate(), point);
            }

            function pointer(ev: PointerEvent) {
                const rect = gl.domElement.getBoundingClientRect();
                ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
                ray.setFromCamera(ndc, camera);
                return ray.ray.intersectPlane(planeFor(origin), hit) ? hit.clone() : null;
            }

            const move = (ev: PointerEvent) => {
                if (ev.pointerId !== pointerId) return;
                if (!dragging) {
                    if (Math.hypot(ev.clientX - downX, ev.clientY - downY) < DRAG_PIXELS) return;
                    // The press landed on a gizmo handle; let the gizmo have it.
                    if (busy.current) return end();
                    dragging = true;
                    busy.current = true;
                    setCursor("grabbing");
                }
                if (ev.shiftKey !== vertical) {
                    vertical = ev.shiftKey;
                    base = applied;
                    const at = pointer(ev);
                    if (at) origin = at;
                    return;
                }
                const at = pointer(ev);
                if (!at) return;
                const delta = at.sub(origin);
                if (vertical) delta.setX(0).setZ(0);
                else delta.setY(0);
                const { snap, run } = useScene.getState();
                if (snap.enabled) delta.divideScalar(snap.translate).round().multiplyScalar(snap.translate);
                applied = new Map([...base].map(([s, p]) => [s, [p[0] + delta.x, p[1] + delta.y, p[2] + delta.z] as Vec3]));
                run(
                    [...applied].map(([s, position]) => transformCommand(s, { position })),
                    { coalesce: `drag:${id}`, select: false }
                );
                invalidate();
            };

            const end = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                window.removeEventListener("pointercancel", up);
                cleanup.current = null;
                if (controls) controls.enabled = true;
                if (!dragging && deferred) pick(id, native);
                if (dragging) {
                    useScene.getState().endCoalesce();
                    setCursor("grab");
                    setTimeout(() => {
                        busy.current = false;
                    });
                }
            };
            const up = (ev: PointerEvent) => ev.pointerId === pointerId && end();

            cleanup.current?.();
            cleanup.current = end;
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
            window.addEventListener("pointercancel", up);
        },
        [camera, gl, controls, invalidate, pick, positions, busy, setCursor]
    );

    // A grab hand over things that can be dragged.
    const onHover = useCallback(
        (over: boolean) => {
            if (cleanup.current && over === false) return;
            setCursor(over && useScene.getState().mode === "object" ? "grab" : "");
        },
        [setCursor]
    );

    return { onPointerDown, onHover };
}
