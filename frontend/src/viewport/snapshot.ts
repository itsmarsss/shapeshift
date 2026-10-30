import * as THREE from "three";
import type { View } from "./views";

export type { View };

export type SnapshotOptions = {
    view: View;
    targets?: string[];
    maxSize?: number;
    format?: "jpeg" | "png";
    // Renders at this many times the screen's resolution for a sharper image.
    supersample?: number;
    // Also hides the grid and axis lines, for a finished render.
    clean?: boolean;
};
export type Snapshot = { dataUrl: string; width: number; height: number };

export type Taker = (options: SnapshotOptions) => Snapshot | null;

let taker: Taker | null = null;
let canvas: HTMLCanvasElement | null = null;

// The viewport's canvas, for recording video.
export function setViewportCanvas(next: HTMLCanvasElement | null) {
    canvas = next;
}

export function viewportCanvas() {
    return canvas;
}

export function setSnapshotTaker(next: Taker | null) {
    taker = next;
}

export function takeSnapshot(options: SnapshotOptions): Snapshot | null {
    return taker ? taker(options) : null;
}

const DIRECTIONS: Record<Exclude<View, "current">, THREE.Vector3> = {
    front: new THREE.Vector3(0, 0.25, 1),
    back: new THREE.Vector3(0, 0.25, -1),
    left: new THREE.Vector3(-1, 0.25, 0),
    right: new THREE.Vector3(1, 0.25, 0),
    top: new THREE.Vector3(0, 1, 0.0001),
    iso: new THREE.Vector3(1, 0.8, 1),
};

// Editor overlays that would only clutter the picture.
export function isHelper(o: THREE.Object3D) {
    return o.userData.helper === true || o.type === "TransformControlsGizmo" || o.type === "TransformControlsPlane" || o.type === "LineSegments";
}

export function framedCamera(scene: THREE.Scene, view: Exclude<View, "current">, aspect: number, targets?: string[]) {
    const box = new THREE.Box3();
    scene.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh || !o.name || isHelper(o)) return;
        if (targets?.length && !targets.includes(o.name)) return;
        box.expandByObject(o);
    });
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const camera = new THREE.PerspectiveCamera(40, aspect, 0.05, 1000);
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * aspect));
    const distance = (Math.max(sphere.radius, 0.25) / Math.sin(fit / 2)) * 1.15;
    camera.position.copy(sphere.center).addScaledVector(DIRECTIONS[view].clone().normalize(), distance);
    camera.lookAt(sphere.center);
    camera.updateMatrixWorld();
    return camera;
}

