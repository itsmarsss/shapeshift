import { ROOM_LIMITS, type Ops, type SharedTurn, type VersionMeta } from "../src/collab/protocol";
import type { Environment, Light, SceneObject } from "../src/scene/schema";

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

export type VersionData = { objects: SceneObject[]; lights: Light[] };

// Saved copies of a room's scene, newest last.
export class VersionList {
    versions: VersionMeta[];

    constructor(versions: VersionMeta[] = []) {
        this.versions = versions;
    }

    get lastAt() {
        return this.versions.length ? this.versions[this.versions.length - 1].at : 0;
    }

    // Whether the room should save an automatic version before applying a change.
    autoDue(now: number, sceneVersion: number, lastSavedSceneVersion: number) {
        return sceneVersion > lastSavedSceneVersion && now - this.lastAt >= ROOM_LIMITS.autoVersionMs;
    }

    add(data: VersionData, meta: Omit<VersionMeta, "id" | "objects" | "lights">, id: string):
        | { ok: true; meta: VersionMeta; dropped: string[] }
        | { ok: false; error: string } {
        if (!data.objects.length && !data.lights.length) return { ok: false, error: "There's nothing in the scene to save" };
        if (JSON.stringify(data).length > ROOM_LIMITS.versionChars) return { ok: false, error: "The scene is too large to save as a version" };
        const full: VersionMeta = { ...meta, id, objects: data.objects.length, lights: data.lights.length };
        this.versions.push(full);
        // Drop the oldest automatic versions first, then the oldest of any kind.
        const dropped: string[] = [];
        while (this.versions.length > ROOM_LIMITS.versions) {
            const auto = this.versions.findIndex((v) => v.auto);
            const [gone] = this.versions.splice(auto >= 0 && auto < this.versions.length - 1 ? auto : 0, 1);
            dropped.push(gone.id);
        }
        return { ok: true, meta: full, dropped };
    }
}

// The authoritative copy of a room's scene. Changes are applied in the order
// they arrive and each one bumps the version.
export class RoomState {
    objects: SceneObject[];
    lights: Light[];
    version: number;
    chat: SharedTurn[];
    environment: Environment = "none";

    constructor(objects: SceneObject[] = [], lights: Light[] = [], version = 0, chat: SharedTurn[] = []) {
        this.objects = objects;
        this.lights = lights;
        this.version = version;
        this.chat = chat;
    }

    // Adds or updates a turn, keeping the newest ones. Only its author can
    // change a turn. Returns the turns that fell off the end.
    recordTurn(turn: SharedTurn, authorId: string): { ok: true; dropped: string[] } | { ok: false; error: string } {
        if (turn.author.id !== authorId) return { ok: false, error: "That turn belongs to someone else" };
        if (JSON.stringify(turn).length > ROOM_LIMITS.chatTurnChars) return { ok: false, error: "That turn is too long to share" };
        const at = this.chat.findIndex((t) => t.id === turn.id);
        if (at >= 0) {
            if (this.chat[at].author.id !== authorId) return { ok: false, error: "That turn belongs to someone else" };
            this.chat[at] = turn;
            return { ok: true, dropped: [] };
        }
        this.chat.push(turn);
        const dropped = this.chat.splice(0, Math.max(0, this.chat.length - ROOM_LIMITS.chatTurns)).map((t) => t.id);
        return { ok: true, dropped };
    }

    apply(ops: Ops): { ok: true; version: number } | { ok: false; error: string } {
        const objects = applyList(this.objects, ops.objects);
        const lights = applyList(this.lights, ops.lights);
        if (objects.length > ROOM_LIMITS.objects) return { ok: false, error: `A shared scene can hold ${ROOM_LIMITS.objects} objects` };
        if (lights.length > ROOM_LIMITS.lights) return { ok: false, error: `A shared scene can hold ${ROOM_LIMITS.lights} lights` };
        this.objects = objects;
        this.lights = lights;
        if (ops.environment) this.environment = ops.environment;
        this.version++;
        return { ok: true, version: this.version };
    }
}
