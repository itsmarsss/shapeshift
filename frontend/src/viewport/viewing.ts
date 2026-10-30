import * as THREE from "three";
import type { SceneObject, Vec3 } from "@shapeshift/shared/scene/schema";
import { worldBounds } from "../assistant/assistant";
import type { Section } from "./view";

export function boundsOf(objects: SceneObject[]): THREE.Box3 {
    const box = new THREE.Box3();
    for (const o of objects) {
        const b = worldBounds(o);
        box.expandByPoint(new THREE.Vector3(...b.min)).expandByPoint(new THREE.Vector3(...b.max));
    }
    return box;
}

const centerOf = (o: SceneObject) => {
    const b = worldBounds(o);
    return new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
};

// Which assembly an object belongs to: the model it was imported with, its
// group, or the whole scene.
const assemblyOf = (o: SceneObject) => o.path?.[0] ?? o.group ?? "";

// How far to push each part outward from the center of its assembly. At 1,
// every part ends up twice as far from the center as it started.
export function explodeOffsets(objects: SceneObject[], amount: number): Map<string, Vec3> {
    const offsets = new Map<string, Vec3>();
    if (amount <= 0) return offsets;
    const assemblies = new Map<string, { centers: Map<string, THREE.Vector3>; box: THREE.Box3 }>();
    for (const o of objects) {
        const key = assemblyOf(o);
        let a = assemblies.get(key);
        if (!a) assemblies.set(key, (a = { centers: new Map(), box: new THREE.Box3() }));
        const c = centerOf(o);
        a.centers.set(o.id, c);
        a.box.expandByPoint(c);
    }
    for (const { centers, box } of assemblies.values()) {
        const middle = box.getCenter(new THREE.Vector3());
        for (const [id, c] of centers) {
            const d = c.clone().sub(middle).multiplyScalar(amount);
            offsets.set(id, [d.x, d.y, d.z]);
        }
    }
    return offsets;
}

export function withOffsets(objects: SceneObject[], offsets: Map<string, Vec3>): SceneObject[] {
    if (!offsets.size) return objects;
    return objects.map((o) => {
        const d = offsets.get(o.id);
        return d ? { ...o, position: [o.position[0] + d[0], o.position[1] + d[1], o.position[2] + d[2]] } : o;
    });
}

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

// The cut through `box`. Three.js keeps what's on the side the normal points to.
export function sectionPlane(box: THREE.Box3, section: Section): THREE.Plane {
    const i = AXIS_INDEX[section.axis];
    const min = box.isEmpty() ? -1 : box.min.getComponent(i);
    const max = box.isEmpty() ? 1 : box.max.getComponent(i);
    const at = min + (max - min) * section.at;
    const normal = new THREE.Vector3().setComponent(i, section.flip ? 1 : -1);
    return new THREE.Plane(normal, section.flip ? -at : at);
}
