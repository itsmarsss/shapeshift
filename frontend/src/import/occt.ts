import { Color, SRGBColorSpace } from "three";
import type { RGB, RawModel, RawPart } from "./types";
import { ImportError } from "./types";

type OcctMesh = {
    name: string;
    color?: RGB;
    brep_faces: { first: number; last: number; color: RGB | null }[];
    attributes: { position: { array: number[] }; normal?: { array: number[] } };
    index: { array: number[] };
};
type OcctNode = { name: string; meshes: number[]; children: OcctNode[] };
export type OcctResult = { success: boolean; root: OcctNode; meshes: OcctMesh[] };
export type Occt = { ReadFile: (format: "step" | "iges", content: Uint8Array, params: Record<string, unknown> | null) => OcctResult };

// Tools that model with Y up. Everything else (Onshape, FreeCAD, CATIA, NX,
// recent Fusion) uses Z up, as do most STEP files.
const Y_UP = /solid\s*works|inventor|creo|pro\/engineer/i;

export function isYUp(header: string) {
    const match = header.match(/FILE_NAME\s*\(([\s\S]*?)\)\s*;/i);
    return Y_UP.test(match?.[1] ?? "");
}

function sameColor(a: RGB | null | undefined, b: RGB | null | undefined) {
    if (!a || !b) return a === b;
    return Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3 && Math.abs(a[2] - b[2]) < 1e-3;
}

// STEP colors are sRGB; the scene works in linear color.
const linear = (c: RGB | null | undefined): RGB | null => (c ? (new Color().setRGB(c[0], c[1], c[2], SRGBColorSpace).toArray() as RGB) : null);

function partFrom(mesh: OcctMesh, path: string[]): RawPart {
    const positions = Float32Array.from(mesh.attributes.position.array);
    const indices = Uint32Array.from(mesh.index.array);
    const base = linear(mesh.color);
    const faceColors = mesh.brep_faces.map((f) => linear(f.color) ?? base);
    const distinct = faceColors.filter((c, i) => faceColors.findIndex((d) => sameColor(c, d)) === i);
    let colors: Float32Array | undefined;
    let color = base;
    if (distinct.length === 1) color = distinct[0] ?? base;
    else if (distinct.length > 1) {
        // Faces in different colors: paint each face's corners.
        colors = new Float32Array(positions.length);
        const fallback: RGB = base ?? [0.78, 0.8, 0.83];
        mesh.brep_faces.forEach((face, i) => {
            const c = faceColors[i] ?? fallback;
            for (let t = face.first; t <= face.last; t++)
                for (let k = 0; k < 3; k++) {
                    const v = indices[t * 3 + k];
                    colors![v * 3] = c[0];
                    colors![v * 3 + 1] = c[1];
                    colors![v * 3 + 2] = c[2];
                }
        });
    }
    return {
        name: mesh.name || "Part",
        path,
        positions,
        normals: mesh.attributes.normal ? Float32Array.from(mesh.attributes.normal.array) : undefined,
        indices,
        colors,
        color,
    };
}

export function occtToModel(result: OcctResult, name: string, zUp: boolean): RawModel {
    if (!result.success) throw new ImportError("That file couldn't be read. It may be damaged or not a STEP or IGES file.");
    const parts: RawPart[] = [];
    // A file is often one assembly inside an unnamed root. Skip those wrappers
    // so the part list starts at the first useful level.
    let root = result.root;
    while (!root.meshes.length && root.children.length === 1) root = root.children[0];
    const walk = (node: OcctNode, path: string[]) => {
        for (const i of node.meshes) {
            const mesh = result.meshes[i];
            // A node holding one solid names that part better than the solid does.
            if (mesh) parts.push(partFrom(node.meshes.length === 1 && node.name ? { ...mesh, name: node.name } : mesh, node.meshes.length === 1 ? path.slice(0, -1) : path));
            result.meshes[i] = undefined as unknown as OcctMesh;
        }
        for (const child of node.children) walk(child, child.name ? [...path, child.name] : path);
    };
    walk(root, []);
    return { name, parts, unitScale: 1, zUp };
}

export async function readCad(occt: Occt, format: "step" | "iges", bytes: Uint8Array, name: string): Promise<RawModel> {
    const header = new TextDecoder().decode(bytes.subarray(0, 4000));
    const result = occt.ReadFile(format, bytes, { linearUnit: "meter" });
    return occtToModel(result, name, format === "iges" || !isYUp(header));
}
