import * as THREE from "three";
import { mergeGeometries, mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { Font, type FontData } from "three/examples/jsm/loaders/FontLoader.js";
import helvetiker from "three/examples/fonts/helvetiker_regular.typeface.json";
import type { Brush } from "three-bvh-csg";
import { requireCsg } from "./csg";
import type { Geometry, SceneObject, Vec3 } from "@shapeshift/shared/scene/schema";

const SEGMENTS = 48;

let font: Font | null = null;

function flat(geometry: THREE.BufferGeometry) {
    const out = geometry.index ? geometry.toNonIndexed() : geometry;
    out.computeVertexNormals();
    return out;
}

function centered(geometry: THREE.BufferGeometry) {
    geometry.computeBoundingBox();
    const c = geometry.boundingBox!.getCenter(new THREE.Vector3());
    return geometry.translate(-c.x, -c.y, -c.z);
}

function inverted(geometry: THREE.BufferGeometry) {
    const index = geometry.index!;
    for (let i = 0; i < index.count; i += 3) {
        const b = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, b);
    }
    const normal = geometry.getAttribute("normal");
    for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
    return geometry;
}

function prism(shape: THREE.Shape, height: number, curveSegments = 12) {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments });
    geometry.clearGroups();
    return centered(geometry);
}

function profile(points: [number, number][]) {
    return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
}

function standing(geometry: THREE.BufferGeometry) {
    return centered(geometry.rotateX(-Math.PI / 2));
}

function textGeometry(text: string, size: number, height: number) {
    font ??= new Font(helvetiker as unknown as FontData);
    const geometry = new TextGeometry(text, { font, size, depth: height, curveSegments: 6, bevelEnabled: false });
    geometry.clearGroups();
    return standing(geometry);
}

function starShape(points: number, outer: number, inner: number) {
    const corners: [number, number][] = [];
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 ? inner : outer;
        const a = Math.PI / 2 + (i * Math.PI) / points;
        corners.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return profile(corners);
}

function star(points: number, outer: number, inner: number, height: number) {
    const geometry = new THREE.ExtrudeGeometry(starShape(points, outer, inner), { depth: height, bevelEnabled: false });
    geometry.clearGroups();
    return geometry.translate(0, 0, -height / 2).rotateX(-Math.PI / 2);
}

function tube(radius: number, thickness: number, height: number) {
    const inner = Math.max(radius - thickness, radius * 0.01);
    const outerWall = new THREE.CylinderGeometry(radius, radius, height, SEGMENTS, 1, true);
    const innerWall = inverted(new THREE.CylinderGeometry(inner, inner, height, SEGMENTS, 1, true));
    const top = new THREE.RingGeometry(inner, radius, SEGMENTS).rotateX(-Math.PI / 2).translate(0, height / 2, 0);
    const bottom = new THREE.RingGeometry(inner, radius, SEGMENTS).rotateX(Math.PI / 2).translate(0, -height / 2, 0);
    return mergeGeometries([outerWall, innerWall, top, bottom])!;
}

function halfSphere(radius: number) {
    const dome = new THREE.SphereGeometry(radius, SEGMENTS, SEGMENTS / 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const base = new THREE.CircleGeometry(radius, SEGMENTS).rotateX(Math.PI / 2);
    return centered(mergeGeometries([dome, base])!);
}

function paraboloid(radius: number, height: number) {
    const steps = 24;
    const points: THREE.Vector2[] = [];
    for (let i = steps; i >= 0; i--) {
        const t = i / steps;
        points.push(new THREE.Vector2(radius * Math.sqrt(t), height * (1 - t)));
    }
    const side = new THREE.LatheGeometry(points, SEGMENTS);
    const base = new THREE.CircleGeometry(radius, SEGMENTS).rotateX(Math.PI / 2);
    return centered(mergeGeometries([side, base])!);
}

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
        case "wedge":
            return prism(profile([[-g.width / 2, -g.height / 2], [g.width / 2, -g.height / 2], [-g.width / 2, g.height / 2]]), g.depth);
        case "roof":
            return prism(profile([[-g.width / 2, -g.height / 2], [g.width / 2, -g.height / 2], [0, g.height / 2]]), g.depth);
        case "pyramid":
            return flat(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).scale(g.width, g.height, g.depth));
        case "halfSphere":
            return halfSphere(g.radius);
        case "tube":
            return tube(g.radius, g.thickness, g.height);
        case "polygon":
            return flat(new THREE.CylinderGeometry(g.radius, g.radius, g.height, g.sides));
        case "star":
            return star(g.points, g.radius, Math.min(g.innerRadius, g.radius * 0.99), g.height);
        case "text":
            return textGeometry(g.text, g.size, g.height);
        case "paraboloid":
            return paraboloid(g.radius, g.height);
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
        default:
            return buildGeometry(g);
    }
}

const boundsCache = new WeakMap<Geometry, THREE.Box3>();

export function localBounds(g: Geometry): THREE.Box3 {
    let box = boundsCache.get(g);
    if (!box) {
        if (g.type === "mesh") box = new THREE.Box3().setFromArray(g.positions);
        else {
            const geometry = buildGeometry(g);
            geometry.computeBoundingBox();
            box = geometry.boundingBox!.clone();
            geometry.dispose();
        }
        boundsCache.set(g, box);
    }
    return box.clone();
}

const pointsCache = new WeakMap<Geometry, Float32Array>();

export function hullPoints(g: Geometry): Float32Array {
    let points = pointsCache.get(g);
    if (!points) {
        if (g.type === "mesh") points = Float32Array.from(g.positions);
        else {
            const geometry = buildGeometry(g);
            points = Float32Array.from(geometry.getAttribute("position").array);
            geometry.dispose();
        }
        pointsCache.set(g, points);
    }
    return points;
}

export function objectMatrix(o: Pick<SceneObject, "position" | "rotation" | "scale">): THREE.Matrix4 {
    return new THREE.Matrix4().compose(
        new THREE.Vector3(...o.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation)),
        new THREE.Vector3(...o.scale)
    );
}

export function boundsIn(objects: SceneObject[], frame?: THREE.Matrix4): THREE.Box3 {
    const box = new THREE.Box3();
    const inverse = frame ? frame.clone().invert() : null;
    const v = new THREE.Vector3();
    for (const o of objects) {
        const m = objectMatrix(o);
        if (inverse) m.premultiply(inverse);
        const points = hullPoints(o.geometry);
        for (let i = 0; i < points.length; i += 3) box.expandByPoint(v.set(points[i], points[i + 1], points[i + 2]).applyMatrix4(m));
    }
    return box;
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

export function flipWinding(geometry: THREE.BufferGeometry) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) {
        const a = g.getAttribute(name) as THREE.BufferAttribute;
        for (let i = 0; i < a.count; i += 3) {
            for (let k = 0; k < a.itemSize; k++) {
                const t = a.array[(i + 1) * a.itemSize + k];
                a.array[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k];
                a.array[(i + 2) * a.itemSize + k] = t;
            }
        }
    }
    return g;
}

export function brushFor(o: SceneObject): Brush {
    const geometry = buildGeometry(o.geometry);
    const mirrored = o.scale[0] * o.scale[1] * o.scale[2] < 0;
    const brush = new (requireCsg().Brush)(mirrored ? flipWinding(geometry) : geometry);
    brush.position.set(...o.position);
    brush.rotation.set(...o.rotation);
    brush.scale.set(...o.scale);
    brush.updateMatrixWorld();
    return brush;
}

const OPERATIONS = { union: "ADDITION", subtract: "SUBTRACTION", intersect: "INTERSECTION" } as const;

export function booleanGeometry(
    operation: keyof typeof OPERATIONS,
    a: SceneObject,
    b: SceneObject
): { geometry: Geometry; position: Vec3 } | null {
    const csg = requireCsg();
    const result = new csg.Evaluator().evaluate(brushFor(a), brushFor(b), csg[OPERATIONS[operation]]);
    const geometry = result.geometry;
    if (!geometry.getAttribute("position")?.count) return null;
    geometry.computeBoundingBox();
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    return { geometry: toMeshGeometry(geometry), position: [center.x, center.y, center.z] };
}
