import { useSyncExternalStore } from "react";
import * as THREE from "three";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";
import type { SceneDoc } from "@shapeshift/shared/scene/schema";
import { MESH_LIMITS, gunzip, gzip, meshHash, packMeshes, type PackedMesh } from "@shapeshift/shared/scene/meshes";
import { decodeMesh } from "./meshCodec";
import { readStoredMesh, storeMesh } from "./meshDb";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const buffers = new Map<string, ArrayBuffer>();
const geometries = new Map<string, THREE.BufferGeometry>();
const loading = new Map<string, Promise<THREE.BufferGeometry | null>>();
const failed = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function changed() {
    version++;
    for (const fn of listeners) fn();
}

export function meshHashes(doc: Pick<SceneDoc, "objects">): string[] {
    return [...new Set(doc.objects.flatMap((o) => (o.geometry.type === "asset" ? [o.geometry.hash] : [])))];
}

export function buildMeshGeometry(buffer: ArrayBuffer): THREE.BufferGeometry {
    const mesh = decodeMesh(buffer);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    if (mesh.normals) geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3, true));
    if (mesh.colors) geometry.setAttribute("color", new THREE.BufferAttribute(mesh.colors, 3, true));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    if (!mesh.normals) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

// Picking a part means raycasting it. A bounds tree makes that fast on big
// meshes, and is built when the page is idle.
const treeQueue: THREE.BufferGeometry[] = [];
let treeTimer = 0;
const idle = (fn: () => void): number => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 500 }) : (setTimeout(fn, 50) as unknown as number));

function buildTrees() {
    treeTimer = 0;
    const start = performance.now();
    while (treeQueue.length && performance.now() - start < 30) {
        const g = treeQueue.shift()!;
        if (!g.boundsTree) g.computeBoundsTree();
    }
    if (treeQueue.length) treeTimer = idle(buildTrees);
}

function addGeometry(hash: string, buffer: ArrayBuffer) {
    buffers.set(hash, buffer);
    if (geometries.has(hash)) return;
    const geometry = buildMeshGeometry(buffer);
    geometries.set(hash, geometry);
    if (typeof window !== "undefined") {
        treeQueue.push(geometry);
        if (!treeTimer) treeTimer = idle(buildTrees);
    }
    changed();
}

// Adds meshes that were just made on this device, such as by an import.
export async function putMeshes(meshes: { hash: string; buffer: ArrayBuffer }[], stored = false) {
    for (const { hash, buffer } of meshes) addGeometry(hash, buffer);
    if (!stored) await Promise.all(meshes.map(({ hash, buffer }) => storeMesh(hash, buffer)));
}

const RETRY_MS = [1000, 2000, 4000, 8000, 8000, 8000];

async function download(hash: string): Promise<ArrayBuffer | null> {
    for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
            res = await fetch(`/api/meshes/${hash}`);
        } catch {
            res = new Response(null, { status: 503 });
        }
        if (res.ok) {
            const bytes = await gunzip(new Uint8Array(await res.arrayBuffer()), MESH_LIMITS.meshBytes);
            if ((await meshHash(bytes)) !== hash) return null;
            return bytes.buffer as ArrayBuffer;
        }
        // Someone in a shared room may still be uploading it.
        if (attempt >= RETRY_MS.length || (res.status !== 404 && res.status < 500)) return null;
        await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
    }
}

export function loadMesh(hash: string): Promise<THREE.BufferGeometry | null> {
    const ready = geometries.get(hash);
    if (ready) return Promise.resolve(ready);
    let pending = loading.get(hash);
    if (!pending) {
        pending = (async () => {
            let buffer = await readStoredMesh(hash);
            if (!buffer) {
                buffer = await download(hash).catch(() => null);
                if (buffer) void storeMesh(hash, buffer);
            }
            if (!buffer) {
                failed.add(hash);
                changed();
                return null;
            }
            addGeometry(hash, buffer);
            return geometries.get(hash)!;
        })();
        loading.set(hash, pending);
        void pending.finally(() => loading.delete(hash));
    }
    return pending;
}

export function meshGeometry(hash: string): THREE.BufferGeometry | undefined {
    return geometries.get(hash);
}

export function meshBuffer(hash: string): ArrayBuffer | undefined {
    return buffers.get(hash);
}

const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

// The geometry for a hash, loading it if needed. Undefined until it arrives.
export function useMeshGeometry(hash: string | null): THREE.BufferGeometry | undefined {
    useSyncExternalStore(subscribe, () => version);
    if (!hash) return undefined;
    const g = geometries.get(hash);
    if (!g && !failed.has(hash)) void loadMesh(hash);
    return g;
}

export function useMeshesMissing(hashes: string[]): number {
    useSyncExternalStore(subscribe, () => version);
    return hashes.filter((h) => !geometries.has(h)).length;
}

const uploaded = new Set<string>();

// Makes sure the Worker has every mesh the scene uses, so cloud saves, share
// links and shared rooms can load them on other devices.
export async function uploadMeshes(hashes: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const wanted = hashes.filter((h) => !uploaded.has(h));
    if (!wanted.length) return;
    const missing: string[] = [];
    for (let i = 0; i < wanted.length; i += MESH_LIMITS.hashesPerCheck) {
        const res = await fetch("/api/meshes/missing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hashes: wanted.slice(i, i + MESH_LIMITS.hashesPerCheck) }),
        });
        if (!res.ok) throw new Error("Couldn't upload the model.");
        missing.push(...((await res.json()) as { missing: string[] }).missing);
    }
    for (const h of wanted) if (!missing.includes(h)) uploaded.add(h);
    let batch: PackedMesh[] = [];
    let size = 0;
    let done = 0;
    const flush = async () => {
        if (!batch.length) return;
        const res = await fetch("/api/meshes", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: packMeshes(batch) as BlobPart });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't upload the model.");
        for (const m of batch) uploaded.add(m.hash);
        done += batch.length;
        onProgress?.(done, missing.length);
        batch = [];
        size = 0;
    };
    for (const hash of missing) {
        const buffer = buffers.get(hash) ?? (await readStoredMesh(hash));
        if (!buffer) continue;
        const packed = await gzip(new Uint8Array(buffer));
        if (size + packed.byteLength > MESH_LIMITS.packBytes) await flush();
        batch.push({ hash, gzip: packed });
        size += packed.byteLength;
    }
    await flush();
}
