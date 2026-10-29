import type { DocDiff, EntityChange } from "../scene/diff";
import type { Light, SceneDoc, SceneObject } from "../scene/schema";
import { diffDocs } from "../scene/diff";
import { emptyOps, type Ops } from "./protocol";

function toOps<T extends { id: string }>(changes: EntityChange<T>[]) {
    return {
        upsert: changes.filter((c) => c.after).map((c) => ({ entity: c.after!, index: c.index })),
        remove: changes.filter((c) => !c.after).map((c) => c.id),
    };
}

export function diffToOps(diff: DocDiff): Ops {
    return { objects: toOps(diff.objects), lights: toOps(diff.lights) };
}

function toChanges<T extends { id: string }>(part: { upsert: { entity: T; index?: number }[]; remove: string[] }): EntityChange<T>[] {
    return [
        ...part.remove.map((id) => ({ id, index: 0 })),
        ...part.upsert.map(({ entity, index }) => ({ id: entity.id, after: entity, index: index ?? Number.MAX_SAFE_INTEGER })),
    ];
}

export function opsToDiff(ops: Ops): DocDiff {
    return { objects: toChanges<SceneObject>(ops.objects), lights: toChanges<Light>(ops.lights) };
}

export function isEmptyOps(ops: Ops) {
    return !ops.objects.upsert.length && !ops.objects.remove.length && !ops.lights.upsert.length && !ops.lights.remove.length;
}

// Everything needed to turn `local` into the room's copy of the scene.
export function syncDiff(local: SceneDoc, objects: SceneObject[], lights: Light[]): DocDiff {
    return diffDocs(local, { ...local, objects, lights });
}

export { emptyOps };
