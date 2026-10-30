// How imported meshes travel between the editor and the Worker. Each mesh is
// gzipped and stored once under the hash of its uncompressed bytes.

export const MESH_LIMITS = {
    // One upload request, compressed.
    packBytes: 24_000_000,
    // The most the Worker accepts in one request, so a single big mesh still fits.
    requestBytes: 90_000_000,
    // One mesh, uncompressed.
    meshBytes: 256_000_000,
    hashesPerCheck: 5000,
} as const;

const HASH_CHARS = 32;

export type PackedMesh = { hash: string; gzip: Uint8Array };

// [32 hex chars of hash][u32 little-endian length][gzip bytes], repeated.
export function packMeshes(meshes: PackedMesh[]): Uint8Array {
    const size = meshes.reduce((n, m) => n + HASH_CHARS + 4 + m.gzip.byteLength, 0);
    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);
    let at = 0;
    for (const m of meshes) {
        for (let i = 0; i < HASH_CHARS; i++) out[at + i] = m.hash.charCodeAt(i);
        view.setUint32(at + HASH_CHARS, m.gzip.byteLength, true);
        out.set(m.gzip, at + HASH_CHARS + 4);
        at += HASH_CHARS + 4 + m.gzip.byteLength;
    }
    return out;
}

export function unpackMeshes(bytes: Uint8Array): PackedMesh[] | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const meshes: PackedMesh[] = [];
    let at = 0;
    while (at < bytes.byteLength) {
        if (at + HASH_CHARS + 4 > bytes.byteLength) return null;
        const hash = String.fromCharCode(...bytes.subarray(at, at + HASH_CHARS));
        if (!/^[0-9a-f]{32}$/.test(hash)) return null;
        const length = view.getUint32(at + HASH_CHARS, true);
        const start = at + HASH_CHARS + 4;
        if (start + length > bytes.byteLength) return null;
        meshes.push({ hash, gzip: bytes.subarray(start, start + length) });
        at = start + length;
    }
    return meshes;
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
    const source = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
    const reader = source.pipeThrough(stream as unknown as TransformStream<Uint8Array, Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
            await reader.cancel();
            throw new Error("Mesh is too large");
        }
        chunks.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
        out.set(c, at);
        at += c.byteLength;
    }
    return out;
}

export const gzip = (bytes: Uint8Array) => through(bytes, new CompressionStream("gzip"));
export const gunzip = (bytes: Uint8Array, limit?: number) => through(bytes, new DecompressionStream("gzip"), limit);

export async function meshHash(bytes: Uint8Array): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
    let hex = "";
    for (let i = 0; i < 16; i++) hex += digest[i].toString(16).padStart(2, "0");
    return hex;
}
