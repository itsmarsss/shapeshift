import type * as THREE from "three";
import type { SceneObject } from "@shapeshift/shared/scene/schema";

// The scene object a raycast hit belongs to, for plain and instanced meshes.
export function hitObjectId(hit: THREE.Intersection): string | undefined {
    const ids = hit.object.userData?.ids as string[] | undefined;
    if (ids) return hit.instanceId === undefined ? undefined : ids[hit.instanceId];
    return hit.object.name || undefined;
}

export function batchKey(o: SceneObject): string | null {
    if (o.geometry.type !== "asset" || (o.material.transmission ?? 0) > 0) return null;
    const m = o.material;
    return `${o.geometry.hash}|${m.metalness}|${m.roughness}|${m.opacity}|${m.emissive ?? ""}|${m.emissiveIntensity ?? 0}`;
}
