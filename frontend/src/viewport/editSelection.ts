import { create } from "zustand";
import * as THREE from "three";
import { editableMesh } from "../scene/geometry";
import type { SceneObject } from "../scene/schema";

type EditSelection = {
    vertices: number[];
    hoverVertex: number | null;
    setVertices: (vertices: number[]) => void;
};

export const useEditSelection = create<EditSelection>()((set) => ({
    vertices: [],
    hoverVertex: null,
    setVertices: (vertices) => set({ vertices }),
}));

export function objectMatrix(o: SceneObject): THREE.Matrix4 {
    return new THREE.Matrix4().compose(
        new THREE.Vector3(...o.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation)),
        new THREE.Vector3(...o.scale)
    );
}

export function nearestVertex(
    o: SceneObject,
    camera: THREE.Camera,
    ndc: THREE.Vector2,
    aspect: number,
    radius: number
): { index: number; world: THREE.Vector3 } | null {
    const mesh = editableMesh(o.geometry);
    const matrix = objectMatrix(o);
    let best: { index: number; world: THREE.Vector3 } | null = null;
    let bestDist = radius;
    const v = new THREE.Vector3();
    for (let i = 0; i < mesh.positions.length / 3; i++) {
        const world = v.fromArray(mesh.positions, i * 3).applyMatrix4(matrix).clone();
        const p = world.clone().project(camera);
        if (p.z > 1) continue;
        const d = Math.hypot((p.x - ndc.x) * aspect, p.y - ndc.y);
        if (d < bestDist) {
            bestDist = d;
            best = { index: i, world };
        }
    }
    return best;
}
