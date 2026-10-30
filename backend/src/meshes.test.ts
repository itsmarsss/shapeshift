import { describe, expect, it, vi } from "vitest";
import { gzip, meshHash, packMeshes } from "@shapeshift/shared/scene/meshes";
import { handleMeshes, meshKey } from "./meshes";
import { testBucket } from "./test/r2";

function env(allowed = true) {
    return { SCENES: testBucket(), CHAT_LIMITER: { limit: vi.fn(async () => ({ success: allowed })) } } as unknown as Env & { SCENES: ReturnType<typeof testBucket> };
}

const post = (path: string, body: BodyInit) => new Request(`http://localhost${path}`, { method: "POST", body });

async function mesh(seed: number) {
    const bytes = new Uint8Array(1000).map((_, i) => (i * seed) % 251);
    return { bytes, hash: await meshHash(bytes), gzip: await gzip(bytes) };
}

describe("meshes", () => {
    it("stores uploaded meshes and serves them by hash", async () => {
        const e = env();
        const a = await mesh(3);
        const b = await mesh(7);
        const res = (await handleMeshes(post("/api/meshes", packMeshes([a, b]) as BodyInit), e))!;
        expect(res.status).toBe(200);
        expect(e.SCENES.files.has(meshKey(a.hash))).toBe(true);

        const got = (await handleMeshes(new Request(`http://localhost/api/meshes/${b.hash}`), e))!;
        expect(got.headers.get("cache-control")).toContain("immutable");
        expect(new Uint8Array(await got.arrayBuffer())).toEqual(b.gzip);
    });

    it("says which meshes it's missing", async () => {
        const e = env();
        const a = await mesh(3);
        const b = await mesh(7);
        await handleMeshes(post("/api/meshes", packMeshes([a]) as BodyInit), e);
        const res = (await handleMeshes(post("/api/meshes/missing", JSON.stringify({ hashes: [a.hash, b.hash] })), e))!;
        expect(await res.json()).toEqual({ missing: [b.hash] });
    });

    it("rejects a mesh that doesn't match its hash", async () => {
        const e = env();
        const a = await mesh(3);
        const b = await mesh(7);
        const res = (await handleMeshes(post("/api/meshes", packMeshes([{ hash: a.hash, gzip: b.gzip }]) as BodyInit), e))!;
        expect(res.status).toBe(400);
        expect(e.SCENES.files.size).toBe(0);
    });

    it("rejects garbage and unknown hashes", async () => {
        const e = env();
        expect((await handleMeshes(post("/api/meshes", new Uint8Array([1, 2, 3]) as BodyInit), e))!.status).toBe(400);
        expect((await handleMeshes(new Request("http://localhost/api/meshes/nothex"), e))!.status).toBe(400);
        expect((await handleMeshes(new Request(`http://localhost/api/meshes/${"a".repeat(32)}`), e))!.status).toBe(404);
    });

    it("limits how often one address can upload", async () => {
        const res = (await handleMeshes(post("/api/meshes/missing", JSON.stringify({ hashes: [] })), env(false)))!;
        expect(res.status).toBe(429);
    });

    it("ignores other paths", async () => {
        expect(await handleMeshes(new Request("http://localhost/api/scenes"), env())).toBeNull();
    });
});
