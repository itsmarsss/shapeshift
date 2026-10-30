import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { RGB, RawModel, RawPart } from "./types";
import { ImportError } from "./types";

const MM = 0.001;
export const DEFAULT_COLOR = new THREE.Color().setRGB(0.78, 0.8, 0.83, THREE.SRGBColorSpace).toArray() as RGB;

const rgb = (c: THREE.Color): RGB => [c.r, c.g, c.b];

function attribute(g: THREE.BufferGeometry, name: string): Float32Array | undefined {
    const a = g.getAttribute(name);
    if (!a) return undefined;
    if (a instanceof THREE.InterleavedBufferAttribute || a.normalized || !(a.array instanceof Float32Array)) {
        const out = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
        return out;
    }
    return a.array;
}

// A three.js geometry as a part. Materials on groups of faces become vertex
// colors, so a multi-colored mesh keeps its colors as one part.
export function partFromGeometry(geometry: THREE.BufferGeometry, name: string, path: string[], colors: RGB[]): RawPart {
    let g = geometry;
    let vertexColors = attribute(g, "color");
    if (g.attributes.color && g.attributes.color.itemSize === 4) {
        const four = vertexColors!;
        vertexColors = new Float32Array((four.length / 4) * 3);
        for (let i = 0, j = 0; i < four.length; i += 4, j += 3) vertexColors.set(four.subarray(i, i + 3), j);
    }
    if (!vertexColors && g.groups.length > 1 && colors.length > 1) {
        if (g.index) g = g.toNonIndexed();
        vertexColors = new Float32Array(g.getAttribute("position").count * 3);
        for (const group of g.groups) {
            const c = colors[group.materialIndex ?? 0] ?? colors[0];
            const end = Math.min(group.start + group.count, vertexColors.length / 3);
            for (let v = group.start; v < end; v++) vertexColors.set(c, v * 3);
        }
    }
    return {
        name,
        path,
        positions: attribute(g, "position")!,
        normals: attribute(g, "normal"),
        indices: g.index ? Uint32Array.from(g.index.array) : undefined,
        colors: vertexColors,
        color: colors[0] ?? null,
    };
}

export function readSTL(buffer: ArrayBuffer, name: string): RawModel {
    const geometry = new STLLoader().parse(buffer);
    if (!geometry.getAttribute("position")?.count) throw new ImportError("That STL file has no triangles in it.");
    const loaded = geometry as THREE.BufferGeometry & { hasColors?: boolean };
    const part = partFromGeometry(geometry, name, [], []);
    if (!loaded.hasColors) part.colors = undefined;
    // STL files always give flat facet normals, so smooth curved surfaces.
    part.normals = undefined;
    return { name, parts: [part], unitScale: MM, zUp: true };
}

export function parseMTL(text: string): Map<string, RGB> {
    const colors = new Map<string, RGB>();
    let current: string | null = null;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line.startsWith("newmtl ")) current = line.slice(7).trim();
        else if (current && /^Kd\s/.test(line)) {
            const [r, g, b] = line.split(/\s+/).slice(1, 4).map(Number);
            if ([r, g, b].every(Number.isFinite)) colors.set(current, new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace).toArray() as RGB);
        }
    }
    return colors;
}

export function readOBJ(text: string, name: string, mtl?: string): RawModel {
    if (!/^\s*v\s/m.test(text)) throw new ImportError("That OBJ file has no vertices in it.");
    const colors = mtl ? parseMTL(mtl) : new Map<string, RGB>();
    const group = new OBJLoader().parse(text);
    const parts: RawPart[] = [];
    group.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const materials = (Array.isArray(node.material) ? node.material : [node.material]) as THREE.Material[];
        const palette = materials.map((m) => colors.get(m.name) ?? DEFAULT_COLOR);
        const part = partFromGeometry(node.geometry, node.name || name, [], palette);
        part.color = colors.get(materials[0]?.name) ?? null;
        parts.push(part);
    });
    if (!parts.length) throw new ImportError("That OBJ file has no faces in it.");
    return { name, parts, unitScale: MM, zUp: false };
}

export async function readGLTF(buffer: ArrayBuffer, name: string, siblings: Map<string, ArrayBuffer>): Promise<RawModel> {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const manager = new THREE.LoadingManager();
    const urls: string[] = [];
    manager.setURLModifier((url) => {
        const file = decodeURIComponent(url.split("/").pop() ?? url);
        const data = siblings.get(file);
        if (!data) return url;
        const blob = URL.createObjectURL(new Blob([data]));
        urls.push(blob);
        return blob;
    });
    let gltf;
    try {
        gltf = await new GLTFLoader(manager).parseAsync(buffer, "");
    } catch (error) {
        const message = error instanceof Error ? error.message : "";
        throw new ImportError(/draco|meshopt|KHR_/i.test(message) ? "That glTF file uses compression that isn't supported yet." : "That glTF file couldn't be read.");
    } finally {
        urls.forEach((u) => URL.revokeObjectURL(u));
    }
    gltf.scene.updateMatrixWorld(true);
    const parts: RawPart[] = [];
    gltf.scene.traverse((node) => {
        if (!(node instanceof THREE.Mesh) || !node.geometry.getAttribute("position")) return;
        const materials = (Array.isArray(node.material) ? node.material : [node.material]) as THREE.MeshStandardMaterial[];
        const path: string[] = [];
        for (let p = node.parent; p && p !== gltf.scene; p = p.parent) if (p.name) path.unshift(p.name);
        const part = partFromGeometry(node.geometry, node.name || name, path, materials.map((m) => (m?.color ? rgb(m.color) : DEFAULT_COLOR)));
        part.shared = { key: node.geometry.uuid + materials.map((m) => m?.uuid).join(), matrix: node.matrixWorld.toArray() };
        parts.push(part);
    });
    return { name, parts, unitScale: 1, zUp: false };
}
