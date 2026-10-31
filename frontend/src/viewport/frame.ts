import { create } from "zustand";
import * as THREE from "three";
import type { CameraControls } from "@react-three/drei";
import { worldBounds } from "../assistant/assistant";
import { useScene } from "../scene/store";

// Camera moves that buttons, shortcuts and dialogs outside the canvas can ask
// for. CameraBridge, inside the canvas, hands over the camera controls; a move
// asked for before they exist waits until they do.

export type ViewSide = "front" | "back" | "left" | "right" | "top" | "bottom";

// The camera's angles, for the view cube to follow.
export const useCameraAngles = create<{ azimuth: number; polar: number }>(() => ({ azimuth: 0, polar: Math.PI / 3 }));

let controls: CameraControls | null = null;
let pending: (() => void) | null = null;
// Asks the canvas for a frame; it only draws when something changes.
let redraw = () => {};

export function attachControls(next: CameraControls | null, invalidate?: () => void) {
    controls = next;
    if (invalidate) redraw = invalidate;
    if (next && pending) {
        const run = pending;
        pending = null;
        run();
    }
}

function withControls(move: (c: CameraControls) => void) {
    if (controls) move(controls);
    else pending = () => move(controls!);
}

// Room around what's framed, plus room for the panels covering the sides and
// bottom, so it lands in the part of the view that's still visible.
function padding(box: THREE.Box3) {
    const editor = document.querySelector<HTMLElement>("[data-editor]");
    const css = editor ? getComputedStyle(editor) : null;
    const px = (name: string) => parseFloat(css?.getPropertyValue(name) ?? "") || 0;
    const width = editor?.clientWidth || window.innerWidth;
    const height = editor?.clientHeight || window.innerHeight;
    const left = px("--left-inset");
    const right = px("--right-inset");
    const bottom = px("--bottom-offset");
    const freeWidth = Math.max(200, width - left - right);
    const freeHeight = Math.max(200, height - bottom);
    const size = box.getSize(new THREE.Vector3());
    const across = Math.max(size.x, size.z) + 1.2;
    const tall = size.y + 1.2;
    return {
        paddingTop: 0.6,
        paddingBottom: 0.6 + (tall * bottom) / freeHeight,
        paddingLeft: 0.6 + (across * left) / freeWidth,
        paddingRight: 0.6 + (across * right) / freeWidth,
    };
}

// Everything, or just the selection when there is one. Flat ground planes are
// left out of "everything", so the camera frames the subject.
function bounds(onlySelection: boolean) {
    const { doc, selectedIds } = useScene.getState();
    const picked = onlySelection ? selectedIds : [];
    const objects = picked.length ? doc.objects.filter((o) => picked.includes(o.id)) : doc.objects.filter((o) => o.geometry.type !== "plane");
    const lights = picked.length ? doc.lights.filter((l) => picked.includes(l.id)) : [];
    const list = objects.length || lights.length || picked.length ? objects : doc.objects;
    const box = new THREE.Box3();
    for (const o of list) {
        const b = worldBounds(o);
        box.expandByPoint(new THREE.Vector3(...b.min)).expandByPoint(new THREE.Vector3(...b.max));
    }
    for (const l of lights) box.expandByPoint(new THREE.Vector3(...l.position));
    if (box.isEmpty()) return null;
    // A single point (one light) still needs some room around it.
    if (box.getSize(new THREE.Vector3()).length() < 0.5) box.expandByScalar(0.5);
    return box;
}

export function frameScene() {
    withControls((c) => {
        const box = bounds(false);
        if (box) void c.fitToBox(box, true, padding(box));
    });
}

export function frameSelection() {
    withControls((c) => {
        const box = bounds(true);
        if (box) void c.fitToBox(box, true, padding(box));
    });
}

// Side views sit a hair above level: exactly level, the gizmo flips its up arrow.
const LEVEL = Math.PI / 2 - 0.001;
const SIDES: Record<ViewSide, [number, number]> = {
    front: [0, LEVEL],
    back: [Math.PI, LEVEL],
    right: [Math.PI / 2, LEVEL],
    left: [-Math.PI / 2, LEVEL],
    // Almost straight down, so the camera still knows which way is up.
    top: [0, 0.0001],
    bottom: [0, Math.PI - 0.0001],
};

// Turns the camera to look from one side, the short way round.
export function viewFrom(side: ViewSide) {
    withControls((c) => {
        const [azimuth, polar] = SIDES[side];
        const turns = Math.round((c.azimuthAngle - azimuth) / (Math.PI * 2));
        void c.rotateTo(azimuth + turns * Math.PI * 2, polar, true);
    });
}

// Turns the camera around what it's looking at, for dragging the view cube.
export function orbitBy(azimuth: number, polar: number) {
    if (!controls) return;
    void controls.rotate(azimuth, polar, false);
    redraw();
}

// Where a point on screen (0 to 1 across and down) meets the floor, if it does.
export function floorPointAt(x: number, y: number): [number, number] | null {
    if (!controls) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x * 2 - 1, -(y * 2 - 1)), controls.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    // Too far off toward the horizon isn't a useful place to put something.
    return hit && hit.length() < 40 ? [hit.x, hit.z] : null;
}

// Back to where a new scene starts.
export function resetView() {
    withControls((c) => void c.setLookAt(4, 3.5, 6, 0, 0, 0, true));
}
