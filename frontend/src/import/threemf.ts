import { Color, Matrix4, SRGBColorSpace } from "three";
import { unzipSync, strFromU8 } from "three/examples/jsm/libs/fflate.module.js";
import type { RGB, RawModel, RawPart } from "./types";
import { ImportError } from "./types";

const UNITS: Record<string, number> = { micron: 1e-6, millimeter: 1e-3, centimeter: 1e-2, inch: 0.0254, foot: 0.3048, meter: 1 };

type Tag = { name: string; attrs: Record<string, string>; close: boolean; selfClose: boolean };

function* tags(xml: string): Generator<Tag> {
    const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
    for (let m = re.exec(xml); m; m = re.exec(xml)) {
        const attrs: Record<string, string> = {};
        const ar = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        for (let a = ar.exec(m[3]); a; a = ar.exec(m[3])) attrs[a[1].replace(/^.*:/, "")] = a[2] ?? a[3];
        yield { name: m[2].replace(/^.*:/, ""), attrs, close: m[1] === "/", selfClose: m[4] === "/" };
    }
}

function matrixOf(transform?: string): Matrix4 {
    const m = new Matrix4();
    if (!transform) return m;
    const v = transform.trim().split(/\s+/).map(Number);
    if (v.length !== 12 || v.some((n) => !Number.isFinite(n))) return m;
    return m.set(v[0], v[3], v[6], v[9], v[1], v[4], v[7], v[10], v[2], v[5], v[8], v[11], 0, 0, 0, 1);
}

function colorOf(hex?: string): RGB | null {
    const match = hex?.match(/^#([0-9a-f]{6})/i);
    return match ? (new Color().setHex(parseInt(match[1], 16), SRGBColorSpace).toArray() as RGB) : null;
}

type MeshObject = { positions: number[]; triangles: number[]; triangleColors: (RGB | null)[] };
type ModelObject = { id: string; name: string; color: RGB | null; mesh?: MeshObject; components: { id: string; matrix: Matrix4 }[] };

export function parseModelXml(xml: string, name: string): RawModel {
    const palettes = new Map<string, RGB[]>();
    const objects = new Map<string, ModelObject>();
    const build: { id: string; matrix: Matrix4 }[] = [];
    let unit = 1e-3;
    let palette: RGB[] | null = null;
    let object: ModelObject | null = null;
    let objectPid: string | undefined;

    for (const tag of tags(xml)) {
        if (tag.close) {
            if (tag.name === "object") object = null;
            if (tag.name === "basematerials" || tag.name === "colorgroup") palette = null;
            continue;
        }
        const a = tag.attrs;
        switch (tag.name) {
            case "model":
                unit = UNITS[a.unit ?? "millimeter"] ?? 1e-3;
                break;
            case "basematerials":
            case "colorgroup":
                palette = [];
                palettes.set(a.id, palette);
                break;
            case "base":
                palette?.push(colorOf(a.displaycolor) ?? [0.6, 0.6, 0.6]);
                break;
            case "color":
                palette?.push(colorOf(a.color) ?? [0.6, 0.6, 0.6]);
                break;
            case "object": {
                objectPid = a.pid;
                const color = a.pid ? (palettes.get(a.pid)?.[Number(a.pindex ?? 0)] ?? null) : null;
                object = { id: a.id, name: a.name ?? "", color, components: [] };
                objects.set(a.id, object);
                break;
            }
            case "mesh":
                if (object) object.mesh = { positions: [], triangles: [], triangleColors: [] };
                break;
            case "vertex":
                object?.mesh?.positions.push(Number(a.x), Number(a.y), Number(a.z));
                break;
            case "triangle": {
                const mesh = object?.mesh;
                if (!mesh) break;
                mesh.triangles.push(Number(a.v1), Number(a.v2), Number(a.v3));
                const pid = a.pid ?? objectPid;
                mesh.triangleColors.push(a.p1 !== undefined && pid ? (palettes.get(pid)?.[Number(a.p1)] ?? null) : null);
                break;
            }
            case "component":
                object?.components.push({ id: a.objectid, matrix: matrixOf(a.transform) });
                break;
            case "item":
                build.push({ id: a.objectid, matrix: matrixOf(a.transform) });
                break;
        }
    }

    const parts: RawPart[] = [];
    const meshParts = new Map<string, Omit<RawPart, "name" | "path" | "shared">>();
    const meshPart = (o: ModelObject) => {
        let part = meshParts.get(o.id);
        if (part) return part;
        const mesh = o.mesh!;
        const colors = mesh.triangleColors;
        const varied = colors.some((c) => c && (c[0] !== colors[0]?.[0] || c[1] !== colors[0]?.[1] || c[2] !== colors[0]?.[2]));
        if (varied) {
            const positions = new Float32Array(mesh.triangles.length * 3);
            const vertexColors = new Float32Array(mesh.triangles.length * 3);
            mesh.triangles.forEach((v, i) => {
                positions.set(mesh.positions.slice(v * 3, v * 3 + 3), i * 3);
                vertexColors.set(colors[Math.floor(i / 3)] ?? o.color ?? [0.78, 0.8, 0.83], i * 3);
            });
            part = { positions, colors: vertexColors, color: o.color };
        } else {
            part = { positions: Float32Array.from(mesh.positions), indices: Uint32Array.from(mesh.triangles), color: colors[0] ?? o.color };
        }
        meshParts.set(o.id, part);
        return part;
    };

    const visit = (id: string, matrix: Matrix4, path: string[], depth: number) => {
        const o = objects.get(id);
        if (!o || depth > 16) return;
        if (o.mesh && o.mesh.triangles.length) parts.push({ ...meshPart(o), name: o.name || path[path.length - 1] || name, path, shared: { key: id, matrix: matrix.toArray() } });
        const next = o.components.length && o.name ? [...path, o.name] : path;
        for (const c of o.components) visit(c.id, matrix.clone().multiply(c.matrix), next, depth + 1);
    };
    for (const item of build) visit(item.id, item.matrix, [], 0);
    if (!parts.length) throw new ImportError("There's no geometry in that 3MF file.");
    return { name, parts, unitScale: unit, zUp: true };
}

export function read3MF(buffer: ArrayBuffer, name: string): RawModel {
    let files: Record<string, Uint8Array>;
    try {
        files = unzipSync(new Uint8Array(buffer));
    } catch {
        throw new ImportError("That 3MF file couldn't be opened. It may be damaged.");
    }
    const rels = files["_rels/.rels"] ? strFromU8(files["_rels/.rels"]) : "";
    const target = rels.match(/Target="\/?([^"]+\.model)"/i)?.[1];
    const key = (target && files[target] ? target : Object.keys(files).find((f) => /\.model$/i.test(f))) ?? null;
    if (!key) throw new ImportError("That 3MF file has no model in it.");
    return parseModelXml(strFromU8(files[key]), name);
}
