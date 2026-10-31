import { create } from "zustand";
import * as THREE from "three";
import type { Vec3 } from "@shapeshift/shared/scene/schema";

export type Tool = "select" | "workplane" | "ruler";
export type Workplane = { origin: Vec3; normal: Vec3 };

type ToolState = {
    tool: Tool;
    // A face the user picked to build on. Null is the floor.
    workplane: Workplane | null;
    // Grid spacing on screen right now, in metres.
    gridStep: number;
    ruler: Vec3[];
    // A size handle is under the pointer or being dragged, so the gizmo stands aside.
    handleBusy: boolean;
    setHandleBusy: (busy: boolean) => void;
    setTool: (tool: Tool) => void;
    setWorkplane: (workplane: Workplane | null) => void;
    setGridStep: (step: number) => void;
    addRulerPoint: (point: Vec3) => void;
    clearRuler: () => void;
};

export const useTools = create<ToolState>()((set) => ({
    tool: "select",
    workplane: null,
    gridStep: 0.1,
    ruler: [],
    handleBusy: false,
    setHandleBusy: (handleBusy) => set({ handleBusy }),
    setTool: (tool) => set({ tool }),
    setWorkplane: (workplane) => set({ workplane }),
    setGridStep: (gridStep) => set({ gridStep }),
    addRulerPoint: (point) => set((s) => ({ ruler: s.ruler.length >= 2 ? [point] : [...s.ruler, point] })),
    clearRuler: () => set({ ruler: [] }),
}));

let gizmos: WeakRef<{ enabled: boolean }>[] = [];

// The gizmo listens to the canvas before the scene's own handlers do, so it's
// switched off directly the moment a size handle is under the pointer.
export function trackGizmo(gizmo: { enabled: boolean }) {
    gizmos = [...gizmos.filter((g) => g.deref()), new WeakRef(gizmo)];
    gizmo.enabled = !useTools.getState().handleBusy;
}

useTools.subscribe((s, prev) => {
    if (s.handleBusy === prev.handleBusy) return;
    for (const g of gizmos) {
        const gizmo = g.deref();
        if (gizmo) gizmo.enabled = !s.handleBusy;
    }
});

const UP = new THREE.Vector3(0, 1, 0);

export function workplaneQuaternion(wp: Workplane | null): THREE.Quaternion {
    return wp ? new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...wp.normal).normalize()) : new THREE.Quaternion();
}

export function workplaneMatrix(wp: Workplane | null): THREE.Matrix4 {
    return new THREE.Matrix4().compose(new THREE.Vector3(...(wp?.origin ?? [0, 0, 0])), workplaneQuaternion(wp), new THREE.Vector3(1, 1, 1));
}

// Rounds a point to the snap step measured along the workplane's own axes.
export function snapOnWorkplane(point: THREE.Vector3, step: number, wp: Workplane | null): THREE.Vector3 {
    const matrix = workplaneMatrix(wp);
    const local = point.clone().applyMatrix4(matrix.clone().invert());
    local.set(Math.round(local.x / step) * step, Math.round(local.y / step) * step, Math.round(local.z / step) * step);
    return local.applyMatrix4(matrix);
}

// Decimal grid spacing that keeps cells a readable size on screen, from 1 mm up.
export function gridStepFor(distance: number): number {
    return Math.max(0.001, 10 ** Math.floor(Math.log10(Math.max(distance, 0.001) / 15)));
}
