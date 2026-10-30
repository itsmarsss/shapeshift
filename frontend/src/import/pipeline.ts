import * as THREE from "three";
import { mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Material, SceneObject, Vec3 } from "@shapeshift/shared/scene/schema";
import { encodeMesh, hashMesh } from "../scene/meshCodec";
import { ImportError, type ImportResult, type Progress, type RGB, type RawModel, type RawPart } from "./types";

const DEFAULT_COLOR = new THREE.Color().setRGB(0.78, 0.8, 0.83, THREE.SRGBColorSpace).toArray() as RGB;
const MATERIAL: Omit<Material, "color"> = { metalness: 0.1, roughness: 0.55, opacity: 1 };

type Mesh = { positions: Float32Array; normals: Float32Array; indices: Uint32Array; colors?: Float32Array };

type Copy = { matrix: THREE.Matrix4; name: string; path: string[]; color: RGB; order: number };

type Unique = { mesh: Mesh; copies: Copy[]; signature: string };

const hex = (c: RGB) => `#${new THREE.Color(c[0], c[1], c[2]).getHexString()}`;

function sizeOf(positions: Float32Array) {
    const box = new THREE.Box3().setFromArray(positions);
    return box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length();
}

// Fills in whatever the file left out: an index so shared corners are stored
// once, and normals with sharp edges kept sharp.
export function completeMesh(part: Pick<RawPart, "positions" | "normals" | "indices" | "colors">): Mesh {
    if (part.normals && part.indices) return { positions: part.positions, normals: part.normals, indices: part.indices, colors: part.colors };
    let g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(part.positions, 3));
    if (part.normals) g.setAttribute("normal", new THREE.BufferAttribute(part.normals, 3));
    if (part.colors) g.setAttribute("color", new THREE.BufferAttribute(part.colors, 3));
    if (part.indices) g.setIndex(new THREE.BufferAttribute(part.indices, 1));
    if (!part.normals) g = toCreasedNormals(g, Math.PI / 6);
    if (!g.index) g = mergeVertices(g, Math.max(1e-9, sizeOf(part.positions) * 1e-7));
    return {
        positions: g.getAttribute("position").array as Float32Array,
        normals: g.getAttribute("normal").array as Float32Array,
        indices: Uint32Array.from(g.index!.array),
        colors: g.getAttribute("color")?.array as Float32Array | undefined,
    };
}

function checksum(a: ArrayLike<number>) {
    let h = 0x811c9dc5;
    for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 0x01000193);
    return (h >>> 0).toString(36);
}

function centroid(p: Float32Array) {
    const c = new THREE.Vector3();
    const n = p.length / 3;
    for (let i = 0; i < p.length; i += 3) c.set(c.x + p[i], c.y + p[i + 1], c.z + p[i + 2]);
    return c.divideScalar(n || 1);
}

const at = (p: Float32Array, i: number, v = new THREE.Vector3()) => v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);

// If `b` is `a` turned and moved, the matrix that does it. CAD files repeat
// parts like bolts as separate copies, and this finds them so each shape is
// stored and drawn once.
export function rigidMatch(a: Float32Array, b: Float32Array): THREE.Matrix4 | null {
    if (a.length !== b.length || a.length < 9) return null;
    const n = a.length / 3;
    const ca = centroid(a);
    const cb = centroid(b);
    const tolerance = sizeOf(a) * 1e-4 + 1e-9;
    const v = new THREE.Vector3();
    let i1 = 0;
    let far = -1;
    for (let i = 0; i < n; i++) {
        const d = at(a, i, v).distanceToSquared(ca);
        if (d > far) [far, i1] = [d, i];
    }
    const u = at(a, i1).sub(ca);
    let i2 = 0;
    let spread = -1;
    for (let i = 0; i < n; i++) {
        const d = at(a, i, v).sub(ca).cross(u).lengthSq();
        if (d > spread) [spread, i2] = [d, i];
    }
    const frame = (p: Float32Array, c: THREE.Vector3) => {
        const x = at(p, i1).sub(c);
        const z = x.clone().cross(at(p, i2).sub(c));
        if (x.lengthSq() < 1e-30 || z.lengthSq() < 1e-30) return null;
        x.normalize();
        z.normalize();
        return new THREE.Matrix4().makeBasis(x, z.clone().cross(x), z);
    };
    const fa = frame(a, ca);
    const fb = frame(b, cb);
    let rotation: THREE.Matrix4;
    if (fa && fb) rotation = fb.multiply(fa.transpose());
    else if (!fa && !fb) rotation = new THREE.Matrix4();
    else return null;
    const matrix = new THREE.Matrix4().makeTranslation(cb.x, cb.y, cb.z).multiply(rotation).multiply(new THREE.Matrix4().makeTranslation(-ca.x, -ca.y, -ca.z));
    const step = Math.max(1, Math.floor(n / 500));
    const w = new THREE.Vector3();
    for (let i = 0; i < n; i += step) {
        if (at(a, i, v).applyMatrix4(matrix).distanceTo(at(b, i, w)) > tolerance) return null;
    }
    if (at(a, n - 1, v).applyMatrix4(matrix).distanceTo(at(b, n - 1, w)) > tolerance) return null;
    return matrix;
}

function sameColors(a?: Float32Array, b?: Float32Array) {
    if (!a || !b) return a === b;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-3) return false;
    return true;
}

// A single color for the whole part when every vertex has the same one.
function flatColor(colors: Float32Array): RGB | null {
    for (let i = 3; i < colors.length; i += 3) {
        if (Math.abs(colors[i] - colors[0]) > 1e-3 || Math.abs(colors[i + 1] - colors[1]) > 1e-3 || Math.abs(colors[i + 2] - colors[2]) > 1e-3) return null;
    }
    return colors.length ? [colors[0], colors[1], colors[2]] : null;
}

function transform(positions: Float32Array, normals: Float32Array | undefined, matrix: THREE.Matrix4) {
    const out = new Float32Array(positions.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 3) {
        v.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(matrix);
        out[i] = v.x;
        out[i + 1] = v.y;
        out[i + 2] = v.z;
    }
    let outNormals: Float32Array | undefined;
    if (normals) {
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
        outNormals = new Float32Array(normals.length);
        for (let i = 0; i < normals.length; i += 3) {
            v.set(normals[i], normals[i + 1], normals[i + 2]).applyMatrix3(normalMatrix).normalize();
            outNormals[i] = v.x;
            outNormals[i + 1] = v.y;
            outNormals[i + 2] = v.z;
        }
    }
    return { positions: out, normals: outNormals };
}

function toInt8(normals: Float32Array) {
    const out = new Int8Array(normals.length);
    for (let i = 0; i < normals.length; i++) out[i] = Math.round(Math.max(-1, Math.min(1, normals[i])) * 127);
    return out;
}

function toUint8(colors: Float32Array) {
    const out = new Uint8Array(colors.length);
    for (let i = 0; i < colors.length; i++) out[i] = Math.round(Math.max(0, Math.min(1, colors[i])) * 255);
    return out;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const vec = (v: THREE.Vector3 | THREE.Euler): Vec3 => [round(v.x), round(v.y), round(v.z)];

// Turns what a parser read into scene objects: converted to meters with Y up,
// repeated parts found and shared, every mesh centered on its own origin, and
// the whole model standing on the floor at the middle of the scene.
export async function buildImport(model: RawModel, progress: Progress = () => {}): Promise<ImportResult> {
    const parts = model.parts.filter((p) => p.positions.length >= 9);
    if (!parts.length) throw new ImportError("There's no geometry in that file.");

    const axes = model.zUp ? new THREE.Matrix4().makeRotationX(-Math.PI / 2) : new THREE.Matrix4();
    const toScene = axes.clone().multiply(new THREE.Matrix4().makeScale(model.unitScale, model.unitScale, model.unitScale));

    const uniques: Unique[] = [];
    const bySignature = new Map<string, Unique[]>();
    const byKey = new Map<string, Unique>();

    for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        if (index % 25 === 0) progress("Finding repeated parts", index / parts.length);
        const color = part.color ?? DEFAULT_COLOR;

        if (part.shared) {
            const source = new THREE.Matrix4().fromArray(part.shared.matrix);
            const scaled = source.clone();
            scaled.elements[12] *= model.unitScale;
            scaled.elements[13] *= model.unitScale;
            scaled.elements[14] *= model.unitScale;
            const matrix = axes.clone().multiply(scaled);
            let unique = byKey.get(part.shared.key);
            if (!unique) {
                const mesh = completeMesh(part);
                const scale = new THREE.Matrix4().makeScale(model.unitScale, model.unitScale, model.unitScale);
                unique = { mesh: { ...mesh, positions: transform(mesh.positions, undefined, scale).positions }, copies: [], signature: part.shared.key };
                byKey.set(part.shared.key, unique);
                uniques.push(unique);
            }
            unique.copies.push({ matrix, name: part.name, path: part.path, color, order: index });
            continue;
        }

        const complete = completeMesh(part);
        const moved = transform(complete.positions, complete.normals, toScene);
        const mesh: Mesh = { positions: moved.positions, normals: moved.normals!, indices: complete.indices, colors: complete.colors };
        const signature = `${mesh.positions.length}:${mesh.indices.length}:${checksum(mesh.indices)}:${mesh.colors ? checksum(toUint8(mesh.colors)) : ""}`;
        const candidates = bySignature.get(signature) ?? [];
        let placed = false;
        for (const candidate of candidates) {
            if (!sameColors(candidate.mesh.colors, mesh.colors)) continue;
            const match = rigidMatch(candidate.mesh.positions, mesh.positions);
            if (match) {
                candidate.copies.push({ matrix: match, name: part.name, path: part.path, color, order: index });
                placed = true;
                break;
            }
        }
        if (placed) continue;
        const unique: Unique = { mesh, copies: [{ matrix: new THREE.Matrix4(), name: part.name, path: part.path, color, order: index }], signature };
        candidates.push(unique);
        bySignature.set(signature, candidates);
        uniques.push(unique);
    }

    progress("Placing the model");
    // Center each shape on its own origin, so it turns and explodes around its middle.
    const world = new THREE.Box3();
    for (const u of uniques) {
        const box = new THREE.Box3().setFromArray(u.mesh.positions);
        const c = box.getCenter(new THREE.Vector3());
        const p = u.mesh.positions;
        for (let i = 0; i < p.length; i += 3) {
            p[i] -= c.x;
            p[i + 1] -= c.y;
            p[i + 2] -= c.z;
        }
        box.translate(c.clone().negate());
        for (const copy of u.copies) {
            copy.matrix.multiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z));
            world.union(box.clone().applyMatrix4(copy.matrix));
        }
    }
    const center = world.getCenter(new THREE.Vector3());
    const shift = new THREE.Matrix4().makeTranslation(-center.x, -world.min.y, -center.z);

    const objects: { object: SceneObject; order: number }[] = [];
    const meshes = new Map<string, ArrayBuffer>();
    let triangles = 0;
    for (let i = 0; i < uniques.length; i++) {
        if (i % 25 === 0) progress("Saving meshes", i / uniques.length);
        const { mesh, copies } = uniques[i];
        const single = mesh.colors ? flatColor(mesh.colors) : null;
        const colors = mesh.colors && !single ? mesh.colors : undefined;
        const buffer = encodeMesh({ positions: mesh.positions, normals: toInt8(mesh.normals), colors: colors && toUint8(colors), indices: mesh.indices });
        const hash = await hashMesh(buffer);
        meshes.set(hash, buffer);
        const box = new THREE.Box3().setFromArray(mesh.positions);
        const count = mesh.indices.length / 3;
        for (const copy of copies) {
            const m = shift.clone().multiply(copy.matrix);
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            m.decompose(position, quaternion, scale);
            const color = colors ? [1, 1, 1] as RGB : (single ?? copy.color);
            const object: SceneObject = {
                id: "",
                name: copy.name || model.name,
                geometry: { type: "asset", hash, min: vec(box.min), max: vec(box.max), triangles: count },
                position: vec(position),
                rotation: vec(new THREE.Euler().setFromQuaternion(quaternion)),
                scale: vec(scale),
                material: { ...MATERIAL, color: hex(color) },
                path: [model.name, ...copy.path].slice(0, 32),
            };
            objects.push({ object, order: copy.order });
            triangles += count;
        }
    }
    // Keep the parts in the order the file lists them.
    objects.sort((a, b) => a.order - b.order);
    return { objects: objects.map((o) => o.object), meshes: [...meshes].map(([hash, buffer]) => ({ hash, buffer })), triangles };
}
