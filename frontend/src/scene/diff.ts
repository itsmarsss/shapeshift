import type { Animation, Environment, Light, SceneDoc, SceneObject } from "./schema";

// A change to one object or light, by id. `before` is missing for something
// that was added and `after` for something that was removed. Working per
// entity instead of per array index means changes still apply correctly after
// other changes, including other people's, have shifted the arrays.
export type EntityChange<T> = { id: string; before?: T; after?: T; index: number };
export type DocDiff = {
    objects: EntityChange<SceneObject>[];
    lights: EntityChange<Light>[];
    environment?: { before: Environment; after: Environment };
    animation?: { before: Animation; after: Animation };
};

export const emptyDiff = (): DocDiff => ({ objects: [], lights: [] });

export function isEmptyDiff(d: DocDiff) {
    return d.objects.length === 0 && d.lights.length === 0 && !d.environment && !d.animation;
}

function diffList<T extends { id: string }>(prev: T[], next: T[]): EntityChange<T>[] {
    if (prev === next) return [];
    const before = new Map(prev.map((item, index) => [item.id, { item, index }]));
    const changes: EntityChange<T>[] = [];
    next.forEach((item, index) => {
        const old = before.get(item.id);
        if (!old) changes.push({ id: item.id, after: item, index });
        // Immer keeps untouched entities identical, so a reference check is enough.
        else if (old.item !== item) changes.push({ id: item.id, before: old.item, after: item, index });
        before.delete(item.id);
    });
    for (const [id, { item, index }] of before) changes.push({ id, before: item, index });
    return changes;
}

export function diffDocs(prev: SceneDoc, next: SceneDoc): DocDiff {
    return {
        objects: diffList(prev.objects, next.objects),
        lights: diffList(prev.lights, next.lights),
        ...(prev.environment !== next.environment ? { environment: { before: prev.environment, after: next.environment } } : {}),
        ...(prev.animation !== next.animation ? { animation: { before: prev.animation, after: next.animation } } : {}),
    };
}

function applyList<T extends { id: string }>(list: T[], changes: EntityChange<T>[], side: "before" | "after"): T[] {
    if (!changes.length) return list;
    const next = list.slice();
    const inserts: { item: T; index: number }[] = [];
    for (const change of changes) {
        const target = change[side];
        const at = next.findIndex((x) => x.id === change.id);
        if (!target) {
            if (at >= 0) next.splice(at, 1);
        } else if (at >= 0) {
            next[at] = target;
        } else {
            inserts.push({ item: target, index: change.index });
        }
    }
    // Put restored entities back where they were, as far as the list allows.
    inserts.sort((a, b) => a.index - b.index);
    for (const { item, index } of inserts) next.splice(Math.min(index, next.length), 0, item);
    return next;
}

// Sets every changed entity to its `before` or `after` state.
export function applyDiff(doc: SceneDoc, diff: DocDiff, side: "before" | "after"): SceneDoc {
    if (isEmptyDiff(diff)) return doc;
    return {
        ...doc,
        objects: applyList(doc.objects, diff.objects, side),
        lights: applyList(doc.lights, diff.lights, side),
        ...(diff.environment ? { environment: diff.environment[side] } : {}),
        ...(diff.animation ? { animation: diff.animation[side] } : {}),
    };
}

function mergeList<T>(a: EntityChange<T>[], b: EntityChange<T>[]): EntityChange<T>[] {
    const byId = new Map(a.map((c) => [c.id, { ...c }]));
    for (const c of b) {
        const first = byId.get(c.id);
        if (first) first.after = c.after;
        else byId.set(c.id, { ...c });
    }
    // Something added and then removed in the same step is no change at all.
    return [...byId.values()].filter((c) => c.before !== undefined || c.after !== undefined);
}

// One diff that does `a` then `b`.
export function mergeDiffs(a: DocDiff, b: DocDiff): DocDiff {
    const environment =
        a.environment && b.environment ? { before: a.environment.before, after: b.environment.after } : (a.environment ?? b.environment);
    const animation = a.animation && b.animation ? { before: a.animation.before, after: b.animation.after } : (a.animation ?? b.animation);
    return {
        objects: mergeList(a.objects, b.objects),
        lights: mergeList(a.lights, b.lights),
        ...(environment && environment.before !== environment.after ? { environment } : {}),
        ...(animation && animation.before !== animation.after ? { animation } : {}),
    };
}
