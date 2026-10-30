import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { Geometry, SceneObject } from "@shapeshift/shared/scene/schema";
import { boundsIn, buildGeometry, flipWinding, objectMatrix } from "./geometry";

export type HoleGroup = { solids: SceneObject[]; holes: SceneObject[] };

export function holeGroups(objects: SceneObject[]): Map<string, HoleGroup> {
    const groups = new Map<string, HoleGroup>();
    for (const o of objects) {
        if (!o.group) continue;
        const g = groups.get(o.group) ?? { solids: [], holes: [] };
        (o.hole ? g.holes : g.solids).push(o);
        groups.set(o.group, g);
    }
    for (const [name, g] of groups) if (!g.solids.length || !g.holes.length) groups.delete(name);
    return groups;
}

const ids = new WeakMap<Geometry, number>();
let nextId = 1;
const geometryId = (g: Geometry) => {
    let id = ids.get(g);
    if (!id) ids.set(g, (id = nextId++));
    return id;
};

const brushes = new WeakMap<Geometry, Brush[]>();

function brushOf(g: Geometry, mirrored: boolean): Brush {
    let pair = brushes.get(g);
    if (!pair) brushes.set(g, (pair = []));
    const slot = mirrored ? 1 : 0;
    if (!pair[slot]) {
        const geometry = buildGeometry(g);
        pair[slot] = new Brush(mirrored ? flipWinding(geometry) : geometry);
    }
    return pair[slot];
}

const evaluator = new Evaluator();
evaluator.attributes = ["position", "normal"];
evaluator.useGroups = false;

const CACHE_LIMIT = 400;
const cache = new Map<string, THREE.BufferGeometry>();
const resultBrushes = new WeakMap<THREE.BufferGeometry, Brush>();

function recall(key: string) {
    const hit = cache.get(key);
    if (hit) {
        cache.delete(key);
        cache.set(key, hit);
    }
    return hit;
}

function remember(key: string, geometry: THREE.BufferGeometry) {
    cache.set(key, geometry);
    if (cache.size > CACHE_LIMIT) {
        const [oldest, old] = cache.entries().next().value!;
        cache.delete(oldest);
        old.dispose();
    }
}

const key = (m: THREE.Matrix4) => m.elements.map((e) => Math.round(e * 1e6)).join(",");

const lastOrder = new Map<string, string[]>();

// The solid with every overlapping hole cut out, in the solid's own space, so
// moving or scaling the whole group reuses the result. Holes are cut in the
// order they last were, with changed ones last, so dragging one hole only
// redoes that one cut.
export function cutSolid(solid: SceneObject, holes: SceneObject[]): THREE.BufferGeometry | null {
    const solidBox = boundsIn([solid]);
    const inverse = objectMatrix(solid).invert();
    const parts = holes
        .filter((h) => boundsIn([h]).intersectsBox(solidBox))
        .map((h) => {
            const matrix = inverse.clone().multiply(objectMatrix(h));
            return { hole: h, matrix, id: `${geometryId(h.geometry)}:${key(matrix)}` };
        });
    if (!parts.length) return null;
    const previous = lastOrder.get(solid.id) ?? [];
    const rank = (id: string) => {
        const i = previous.indexOf(id);
        return i < 0 ? Infinity : i;
    };
    parts.sort((a, b) => rank(a.id) - rank(b.id));
    lastOrder.set(solid.id, parts.map((p) => p.id));

    const prefixes = [String(geometryId(solid.geometry))];
    for (const p of parts) prefixes.push(`${prefixes[prefixes.length - 1]}|${p.id}`);
    let start = parts.length;
    while (start > 0 && !cache.has(prefixes[start])) start--;
    if (start === parts.length) return recall(prefixes[start])!;

    const cached = start > 0 ? recall(prefixes[start])! : null;
    let result: Brush = cached ? (resultBrushes.get(cached) ?? new Brush(cached)) : brushOf(solid.geometry, false);
    result.matrixAutoUpdate = false;
    result.matrix.identity();
    result.updateMatrixWorld(true);
    try {
        for (let i = start; i < parts.length; i++) {
            const { hole, matrix } = parts[i];
            const brush = brushOf(hole.geometry, matrix.determinant() < 0);
            brush.matrixAutoUpdate = false;
            brush.matrix.copy(matrix);
            brush.matrixWorld.copy(matrix);
            const next = evaluator.evaluate(result, brush, SUBTRACTION);
            next.matrixAutoUpdate = false;
            next.updateMatrixWorld(true);
            resultBrushes.set(next.geometry, next);
            remember(prefixes[i + 1], next.geometry);
            result = next;
        }
    } catch (error) {
        console.warn("Couldn't cut holes", error);
        return null;
    }
    return result.geometry;
}

// Cut geometry for every solid in a group that also has holes.
export function cutGeometries(objects: SceneObject[]): Map<string, THREE.BufferGeometry> {
    const cuts = new Map<string, THREE.BufferGeometry>();
    for (const { solids, holes } of holeGroups(objects).values()) {
        for (const solid of solids) {
            const cut = cutSolid(solid, holes);
            if (cut) cuts.set(solid.id, cut);
        }
    }
    return cuts;
}

// What a file export should contain: solids with their holes cut, no holes.
export function solidMeshes(objects: SceneObject[]): { object: SceneObject; geometry: THREE.BufferGeometry }[] {
    const cuts = cutGeometries(objects);
    return objects.filter((o) => !o.hole).map((o) => ({ object: o, geometry: cuts.get(o.id)?.clone() ?? buildGeometry(o.geometry) }));
}
