import type { AnimProperty, AnimValue, Animation, Easing, Keyframe, Light, SceneDoc, SceneObject, Track, Vec3 } from "@shapeshift/shared/scene/schema";

// Keyframe animation: evaluating tracks over time, and the editing helpers the
// commands use.

const EPS = 1e-3;

export const OBJECT_PROPERTIES: AnimProperty[] = ["position", "rotation", "scale"];
export const LIGHT_PROPERTIES: AnimProperty[] = ["position", "color", "intensity"];

export function currentValue(entity: SceneObject | Light, property: AnimProperty): AnimValue | undefined {
    if ("geometry" in entity) {
        switch (property) {
            case "position":
                return entity.position;
            case "rotation":
                return entity.rotation;
            case "scale":
                return entity.scale;
            case "color":
                return entity.material.color;
            case "intensity":
                return undefined;
        }
    }
    switch (property) {
        case "position":
            return entity.position;
        case "color":
            return entity.color;
        case "intensity":
            return entity.intensity;
        default:
            return undefined;
    }
}

export function valueFits(property: AnimProperty, value: AnimValue): boolean {
    if (property === "color") return typeof value === "string";
    if (property === "intensity") return typeof value === "number";
    return Array.isArray(value);
}

export function findTrack(anim: Animation, target: string, property: AnimProperty): Track | undefined {
    return anim.tracks.find((t) => t.target === target && t.property === property);
}

// Adds or replaces the keyframe at a time, keeping keys sorted.
export function setKey(anim: Animation, target: string, property: AnimProperty, key: Keyframe) {
    let track = findTrack(anim, target, property);
    if (!track) {
        track = { target, property, keys: [] };
        anim.tracks.push(track);
    }
    const at = track.keys.findIndex((k) => Math.abs(k.time - key.time) < EPS);
    if (at >= 0) track.keys[at] = key;
    else track.keys.push(key);
    track.keys.sort((a, b) => a.time - b.time);
    if (key.time > anim.duration) anim.duration = Math.min(600, Math.ceil(key.time));
}

export function removeKeysAt(anim: Animation, target: string, time: number, property?: AnimProperty): number {
    let removed = 0;
    for (const track of anim.tracks) {
        if (track.target !== target || (property && track.property !== property)) continue;
        const before = track.keys.length;
        track.keys = track.keys.filter((k) => Math.abs(k.time - time) >= EPS);
        removed += before - track.keys.length;
    }
    anim.tracks = anim.tracks.filter((t) => t.keys.length > 0);
    return removed;
}

export function removeTracksFor(anim: Animation, ids: Set<string>) {
    if (anim.tracks.some((t) => ids.has(t.target))) anim.tracks = anim.tracks.filter((t) => !ids.has(t.target));
}

export function keyTimes(anim: Animation, target?: string): number[] {
    const times = anim.tracks.filter((t) => !target || t.target === target).flatMap((t) => t.keys.map((k) => k.time));
    return [...new Set(times.map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
}

// Evaluation.

const ease = (e: Easing | undefined, u: number) => (e === "step" ? 0 : e === "linear" ? u : u * u * (3 - 2 * u));

function hex(c: string): Vec3 {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Vec3): string {
    return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

function lerp(a: AnimValue, b: AnimValue, u: number): AnimValue {
    if (typeof a === "number" && typeof b === "number") return a + (b - a) * u;
    if (typeof a === "string" && typeof b === "string") {
        const [x, y] = [hex(a), hex(b)];
        return toHex([x[0] + (y[0] - x[0]) * u, x[1] + (y[1] - x[1]) * u, x[2] + (y[2] - x[2]) * u]);
    }
    if (Array.isArray(a) && Array.isArray(b)) return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    return a;
}

export function evaluateTrack(track: Track, time: number): AnimValue | undefined {
    const keys = track.keys;
    if (!keys.length) return undefined;
    if (time <= keys[0].time) return keys[0].value;
    const last = keys[keys.length - 1];
    if (time >= last.time) return last.value;
    let i = 0;
    while (keys[i + 1].time < time) i++;
    const a = keys[i];
    const b = keys[i + 1];
    return lerp(a.value, b.value, ease(a.easing, (time - a.time) / (b.time - a.time)));
}

export type Pose = Partial<{ position: Vec3; rotation: Vec3; scale: Vec3; color: string; intensity: number }>;

// The animated values for every entity at a time.
export function evaluate(anim: Animation, time: number): Map<string, Pose> {
    const poses = new Map<string, Pose>();
    for (const track of anim.tracks) {
        const value = evaluateTrack(track, time);
        if (value === undefined) continue;
        const pose = poses.get(track.target) ?? {};
        (pose as Record<string, AnimValue>)[track.property] = value;
        poses.set(track.target, pose);
    }
    return poses;
}

export function resolveAnimationTargets(doc: SceneDoc, target: string, findEntity: (t: string) => SceneObject | Light | undefined) {
    const one = findEntity(target);
    if (one) return [one];
    const lower = target.toLowerCase();
    return doc.objects.filter((o) => o.group === target || o.group?.toLowerCase() === lower);
}
