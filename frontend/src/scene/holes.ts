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

const CACHE_LIMIT = 120;
const cache = new Map<string, THREE.BufferGeometry>();

function remember(key: string, geometry: THREE.BufferGeometry) {
    cache.set(key, geometry);
    if (cache.size > CACHE_LIMIT) {
        const [oldest, old] = cache.entries().next().value!;
        cache.delete(oldest);
        old.dispose();
    }
}

const key = (m: THREE.Matrix4) => m.elements.map((e) => Math.round(e * 1e6)).join(",");

// The solid with every overlapping hole cut out, in the solid's own space, so
// moving or scaling the whole group reuses the result.
export function cutSolid(solid: SceneObject, holes: SceneObject[]): THREE.BufferGeometry | null {
    const solidBox = boundsIn([solid]);
    const inverse = objectMatrix(solid).invert();
    const parts = holes
        .filter((h) => boundsIn([h]).intersectsBox(solidBox))
        .map((h) => ({ hole: h, matrix: inverse.clone().multiply(objectMatrix(h)) }));
    if (!parts.length) return null;
    const id = `${geometryId(solid.geometry)}|${parts.map((p) => `${geometryId(p.hole.geometry)}:${key(p.matrix)}`).join("|")}`;
    const hit = cache.get(id);
    if (hit) {
        cache.delete(id);
        cache.set(id, hit);
        return hit;
    }
    let result: Brush = brushOf(solid.geometry, false);
    result.matrix.identity();
    result.matrixAutoUpdate = false;
    result.updateMatrixWorld(true);
    try {
        for (const { hole, matrix } of parts) {
            const brush = brushOf(hole.geometry, matrix.determinant() < 0);
            brush.matrixAutoUpdate = false;
            brush.matrix.copy(matrix);
            brush.matrixWorld.copy(matrix);
            const next = evaluator.evaluate(result, brush, SUBTRACTION);
            next.matrixAutoUpdate = false;
            next.updateMatrixWorld(true);
            result = next;
        }
    } catch (error) {
        console.warn("Couldn't cut holes", error);
        return null;
    }
    remember(id, result.geometry);
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
