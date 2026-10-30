import { meshHash } from "@shapeshift/shared/scene/meshes";

// The binary form of an imported mesh. Every section starts on a 4-byte
// boundary so the decoded arrays are views into the same buffer, with no copy.
//
//   "SSM1"  u32 vertices  u32 indices  u32 flags
//   f32 positions[vertices * 3]
//   i8  normals[vertices * 3]   (flag 1, scaled to -127..127)
//   u8  colors[vertices * 3]    (flag 2)
//   u16 or u32 indices          (u32 when flag 4)

const MAGIC = 0x314d5353;
const HEADER = 16;
const NORMALS = 1;
const COLORS = 2;
const WIDE = 4;

export type MeshData = {
    positions: Float32Array;
    normals?: Float32Array | Int8Array;
    colors?: Uint8Array;
    indices: Uint16Array | Uint32Array;
};

export type DecodedMesh = {
    positions: Float32Array;
    normals: Int8Array | null;
    colors: Uint8Array | null;
    indices: Uint16Array | Uint32Array;
};

const pad = (n: number) => (n + 3) & ~3;

export function encodeMesh(mesh: MeshData): ArrayBuffer {
    const vertices = mesh.positions.length / 3;
    const count = mesh.indices.length;
    const wide = vertices > 0xffff;
    const flags = (mesh.normals ? NORMALS : 0) | (mesh.colors ? COLORS : 0) | (wide ? WIDE : 0);
    const positionBytes = vertices * 12;
    const normalBytes = mesh.normals ? pad(vertices * 3) : 0;
    const colorBytes = mesh.colors ? pad(vertices * 3) : 0;
    const indexBytes = pad(count * (wide ? 4 : 2));
    const buffer = new ArrayBuffer(HEADER + positionBytes + normalBytes + colorBytes + indexBytes);
    const header = new Uint32Array(buffer, 0, 4);
    header.set([MAGIC, vertices, count, flags]);
    let at = HEADER;
    new Float32Array(buffer, at, vertices * 3).set(mesh.positions);
    at += positionBytes;
    if (mesh.normals) {
        const out = new Int8Array(buffer, at, vertices * 3);
        if (mesh.normals instanceof Int8Array) out.set(mesh.normals);
        else for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.max(-1, Math.min(1, mesh.normals[i])) * 127);
        at += normalBytes;
    }
    if (mesh.colors) {
        new Uint8Array(buffer, at, vertices * 3).set(mesh.colors);
        at += colorBytes;
    }
    if (wide) new Uint32Array(buffer, at, count).set(mesh.indices);
    else new Uint16Array(buffer, at, count).set(mesh.indices);
    return buffer;
}

export function decodeMesh(buffer: ArrayBuffer): DecodedMesh {
    if (buffer.byteLength < HEADER) throw new Error("Mesh data is truncated");
    const [magic, vertices, count, flags] = new Uint32Array(buffer, 0, 4);
    if (magic !== MAGIC) throw new Error("Not a mesh");
    let at = HEADER;
    const positions = new Float32Array(buffer, at, vertices * 3);
    at += vertices * 12;
    let normals: Int8Array | null = null;
    if (flags & NORMALS) {
        normals = new Int8Array(buffer, at, vertices * 3);
        at += pad(vertices * 3);
    }
    let colors: Uint8Array | null = null;
    if (flags & COLORS) {
        colors = new Uint8Array(buffer, at, vertices * 3);
        at += pad(vertices * 3);
    }
    const indices = flags & WIDE ? new Uint32Array(buffer, at, count) : new Uint16Array(buffer, at, count);
    return { positions, normals, colors, indices };
}

// 128 bits of SHA-256, as hex. Same bytes, same hash, so identical parts are stored once.
export const hashMesh = (buffer: ArrayBuffer) => meshHash(new Uint8Array(buffer));
