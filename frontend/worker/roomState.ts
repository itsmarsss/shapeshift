import { ROOM_LIMITS, type Ops } from "../src/collab/protocol";
import type { Light, SceneObject } from "../src/scene/schema";

type Entity = { id: string };

function applyList<T extends Entity>(list: T[], change: { upsert: { entity: T; index?: number }[]; remove: string[] }): T[] {
    const removed = new Set(change.remove);
    const next = list.filter((e) => !removed.has(e.id));
    for (const { entity, index } of change.upsert) {
        const at = next.findIndex((e) => e.id === entity.id);
        if (at >= 0) next[at] = entity;
        else next.splice(index === undefined ? next.length : Math.min(index, next.length), 0, entity);
    }
    return next;
}

// The authoritative copy of a room's scene. Changes are applied in the order
// they arrive and each one bumps the version.
export class RoomState {
    objects: SceneObject[];
    lights: Light[];
    version: number;

    constructor(objects: SceneObject[] = [], lights: Light[] = [], version = 0) {
        this.objects = objects;
        this.lights = lights;
        this.version = version;
    }

    apply(ops: Ops): { ok: true; version: number } | { ok: false; error: string } {
        const objects = applyList(this.objects, ops.objects);
        const lights = applyList(this.lights, ops.lights);
        if (objects.length > ROOM_LIMITS.objects) return { ok: false, error: `A shared scene can hold ${ROOM_LIMITS.objects} objects` };
        if (lights.length > ROOM_LIMITS.lights) return { ok: false, error: `A shared scene can hold ${ROOM_LIMITS.lights} lights` };
        this.objects = objects;
        this.lights = lights;
        this.version++;
        return { ok: true, version: this.version };
    }
}
