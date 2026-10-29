import * as THREE from "three";
import { mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from "three-bvh-csg";
import type { Geometry, SceneObject, Vec3 } from "./schema";

export function buildGeometry(g: Geometry): THREE.BufferGeometry {
    switch (g.type) {
        case "box":
            return new THREE.BoxGeometry(g.width, g.height, g.depth);
        case "sphere":
            return new THREE.SphereGeometry(g.radius, 48, 24);
        case "cylinder":
            return new THREE.CylinderGeometry(g.radiusTop, g.radiusBottom, g.height, 48);
        case "cone":
            return new THREE.ConeGeometry(g.radius, g.height, 48);
        case "torus":
            return new THREE.TorusGeometry(g.radius, g.tube, 24, 64);
        case "plane":
            return new THREE.PlaneGeometry(g.width, g.height);
        case "mesh": {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(g.positions, 3));
            if (g.indices.length) geometry.setIndex(g.indices);
            return toCreasedNormals(geometry, Math.PI / 6);
        }
    }
}

function buildEditGeometry(g: Exclude<Geometry, { type: "mesh" }>): THREE.BufferGeometry {
    switch (g.type) {
        case "box":
            return new THREE.BoxGeometry(g.width, g.height, g.depth);
        case "sphere":
            return new THREE.SphereGeometry(g.radius, 16, 10);
        case "cylinder":
            return new THREE.CylinderGeometry(g.radiusTop, g.radiusBottom, g.height, 16);
        case "cone":
            return new THREE.ConeGeometry(g.radius, g.height, 16);
        case "torus":
            return new THREE.TorusGeometry(g.radius, g.tube, 10, 24);
        case "plane":
            return new THREE.PlaneGeometry(g.width, g.height, 2, 2);
    }
}

const editableCache = new WeakMap<Geometry, Extract<Geometry, { type: "mesh" }>>();

export function editableMesh(g: Geometry): Extract<Geometry, { type: "mesh" }> {
    if (g.type === "mesh") return g;
    let mesh = editableCache.get(g);
    if (!mesh) {
        mesh = toMeshGeometry(buildEditGeometry(g));
        editableCache.set(g, mesh);
    }
    return mesh;
}

export function toMeshGeometry(geometry: THREE.BufferGeometry): Extract<Geometry, { type: "mesh" }> {
    const welded = new THREE.BufferGeometry();
    welded.setAttribute("position", geometry.getAttribute("position").clone());
    if (geometry.index) welded.setIndex(geometry.index.clone());
    const merged = mergeVertices(welded, 1e-5);
    const positions = Array.from(merged.getAttribute("position").array, (v) => Math.round(v * 1e5) / 1e5);
    return { type: "mesh", positions, indices: Array.from(merged.index!.array) };
}

function brushFor(o: SceneObject): Brush {
    const brush = new Brush(buildGeometry(o.geometry));
    brush.position.set(...o.position);
    brush.rotation.set(...o.rotation);
    brush.scale.set(...o.scale);
    brush.updateMatrixWorld();
    return brush;
}

const OPERATIONS = { union: ADDITION, subtract: SUBTRACTION, intersect: INTERSECTION };

export function booleanGeometry(
    operation: keyof typeof OPERATIONS,
    a: SceneObject,
    b: SceneObject
): { geometry: Geometry; position: Vec3 } | null {
    const result = new Evaluator().evaluate(brushFor(a), brushFor(b), OPERATIONS[operation]);
    const geometry = result.geometry;
    if (!geometry.getAttribute("position")?.count) return null;
    geometry.computeBoundingBox();
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    return { geometry: toMeshGeometry(geometry), position: [center.x, center.y, center.z] };
}
