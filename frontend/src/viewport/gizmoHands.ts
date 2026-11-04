import { useCallback } from "react";
import * as THREE from "three";
import { addHandles } from "./handHandles";

// Lets a hand work the transform gizmo (see handHandles). The gizmo's own
// pointer methods take a point in view coordinates, so a hand drives it just
// as the mouse does; only finding the handle is extra, since a hand comes
// near a handle rather than exactly onto it.

type Pointer = { x: number; y: number; button: number };
type Gizmo = THREE.Object3D & {
    enabled: boolean;
    dragging: boolean;
    axis: string | null;
    mode: "translate" | "rotate" | "scale";
    domElement: HTMLElement;
    // three-stdlib's: the invisible shapes it hit-tests the pointer against.
    gizmo?: { picker: Record<string, THREE.Object3D> };
    pointerDown: (p: Pointer) => void;
    pointerMove: (p: Pointer) => void;
    pointerUp: (p: Pointer) => void;
};

const WORDS = {
    translate: { verb: "Pinch to move along it", doing: "Moving" },
    rotate: { verb: "Pinch to turn", doing: "Turning" },
    scale: { verb: "Pinch to resize", doing: "Resizing" },
};

// A ref callback for <TransformControls>; registers its handles while it's there.
export function useGizmoHands() {
    return useCallback((controls: THREE.Object3D | null) => {
        if (!controls) return;
        const gizmo = controls as Gizmo;
        // Like a browser's pointer event: button 0 pressing, -1 while moving.
        const at = (x: number, y: number, button = 0): Pointer => {
            const rect = gizmo.domElement.getBoundingClientRect();
            return { x: ((x - rect.left) / rect.width) * 2 - 1, y: -((y - rect.top) / rect.height) * 2 + 1, button };
        };
        const v = new THREE.Vector3();
        return addHandles({
            verb: () => WORDS[gizmo.mode].verb,
            doing: () => WORDS[gizmo.mode].doing,
            // The nearest point on any visible handle: along an arrow, around a
            // ring, on a square.
            nearest: (x, y) => {
                const picker = gizmo.gizmo?.picker[gizmo.mode];
                if (!picker || !gizmo.enabled || !gizmo.visible) return null;
                const camera = (gizmo as unknown as { camera: THREE.Camera }).camera;
                const rect = gizmo.domElement.getBoundingClientRect();
                let best: { key: string; x: number; y: number; gap: number } | null = null;
                // The picker itself is never drawn, but the handles it hides
                // (ones seen end on) are marked invisible.
                for (const handle of picker.children) handle.traverseVisible((child) => {
                    const position = (child as THREE.Mesh).geometry?.getAttribute("position");
                    if (!position || !child.name) return;
                    for (let i = 0; i < position.count; i++) {
                        v.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld).project(camera);
                        if (v.z > 1) continue;
                        const px = rect.left + ((v.x + 1) / 2) * rect.width;
                        const py = rect.top + ((1 - v.y) / 2) * rect.height;
                        const gap = Math.hypot(px - x, py - y);
                        if (!best || gap < best.gap) best = { key: child.name, x: px, y: py, gap };
                    }
                });
                return best;
            },
            hover: (key) => {
                if (!gizmo.dragging) gizmo.axis = key;
            },
            grab: (key, x, y) => {
                gizmo.axis = key;
                gizmo.pointerDown(at(x, y));
                return gizmo.dragging;
            },
            drag: (x, y) => gizmo.pointerMove(at(x, y, -1)),
            release: () => gizmo.pointerUp({ x: 0, y: 0, button: 0 }),
        });
    }, []);
}
