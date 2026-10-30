import { afterEach, describe, expect, it, vi } from "vitest";
import { MESH_LIMITS, gunzip, gzip, packMeshes, unpackMeshes } from "@shapeshift/shared/scene/meshes";
import { decodeMesh, encodeMesh, hashMesh } from "./meshCodec";
import { buildMeshGeometry, loadMesh, meshHashes, putMeshes, uploadMeshes } from "./meshStore";

const triangle = (z = 0) =>
    encodeMesh({
        positions: new Float32Array([0, 0, z, 1, 0, z, 0, 1, z]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        colors: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]),
        indices: new Uint32Array([0, 1, 2]),
    });

afterEach(() => vi.unstubAllGlobals());

describe("mesh codec", () => {
    it("round-trips positions, normals, colors and indices", () => {
        const mesh = decodeMesh(triangle(2));
        expect([...mesh.positions]).toEqual([0, 0, 2, 1, 0, 2, 0, 1, 2]);
        expect([...mesh.normals!]).toEqual([0, 0, 127, 0, 0, 127, 0, 0, 127]);
        expect([...mesh.colors!]).toEqual([255, 0, 0, 0, 255, 0, 0, 0, 255]);
        expect(mesh.indices).toBeInstanceOf(Uint16Array);
        expect([...mesh.indices]).toEqual([0, 1, 2]);
    });

    it("uses 32-bit indices only for big meshes", () => {
        const positions = new Float32Array(70_000 * 3);
        const mesh = decodeMesh(encodeMesh({ positions, indices: new Uint32Array([0, 69_999, 1]) }));
        expect(mesh.indices).toBeInstanceOf(Uint32Array);
        expect([...mesh.indices]).toEqual([0, 69_999, 1]);
        expect(mesh.normals).toBeNull();
    });

    it("hashes by content", async () => {
        expect(await hashMesh(triangle())).toBe(await hashMesh(triangle()));
        expect(await hashMesh(triangle())).not.toBe(await hashMesh(triangle(1)));
        expect(await hashMesh(triangle())).toMatch(/^[0-9a-f]{32}$/);
    });

    it("rejects data that isn't a mesh", () => {
        expect(() => decodeMesh(new ArrayBuffer(32))).toThrow();
    });

    it("builds a geometry that shares the stored bytes", () => {
        const buffer = triangle();
        const g = buildMeshGeometry(buffer);
        expect(g.getAttribute("position").array.buffer).toBe(buffer);
        expect(g.getAttribute("normal").normalized).toBe(true);
        expect(g.getAttribute("color").count).toBe(3);
        expect(g.boundingBox!.max.x).toBe(1);
    });
});

describe("mesh uploads", () => {
    it("packs and unpacks gzipped meshes", async () => {
        const a = { hash: await hashMesh(triangle()), gzip: await gzip(new Uint8Array(triangle())) };
        const b = { hash: await hashMesh(triangle(1)), gzip: await gzip(new Uint8Array(triangle(1))) };
        const out = unpackMeshes(packMeshes([a, b]))!;
        expect(out.map((m) => m.hash)).toEqual([a.hash, b.hash]);
        expect(await gunzip(out[1].gzip)).toEqual(new Uint8Array(triangle(1)));
        expect(unpackMeshes(packMeshes([a]).subarray(0, 40))).toBeNull();
    });

    it("refuses to inflate past the limit", async () => {
        const big = await gzip(new Uint8Array(1000));
        await expect(gunzip(big, 100)).rejects.toThrow(/too large/);
    });

    it("uploads only the meshes the server doesn't have", async () => {
        const have = triangle(5);
        const need = triangle(6);
        const [hasHash, needHash] = [await hashMesh(have), await hashMesh(need)];
        await putMeshes([{ hash: hasHash, buffer: have }, { hash: needHash, buffer: need }], true);
        const sent: string[][] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init: RequestInit) => {
                if (url === "/api/meshes/missing") return Response.json({ missing: [needHash] });
                sent.push(unpackMeshes(new Uint8Array(await new Response(init.body).arrayBuffer()))!.map((m) => m.hash));
                return Response.json({ stored: 1 });
            })
        );
        await uploadMeshes([hasHash, needHash]);
        expect(sent).toEqual([[needHash]]);
        await uploadMeshes([hasHash, needHash]);
        expect(sent).toHaveLength(1);
        expect(MESH_LIMITS.packBytes).toBeLessThan(MESH_LIMITS.requestBytes);
    });

    it("downloads a mesh it doesn't have and checks its hash", async () => {
        const buffer = triangle(7);
        const hash = await hashMesh(buffer);
        const packed = await gzip(new Uint8Array(buffer));
        vi.stubGlobal("fetch", vi.fn(async () => new Response(packed as BodyInit)));
        const g = await loadMesh(hash);
        expect(g?.getAttribute("position").getZ(0)).toBe(7);

        const wrong = "0".repeat(32);
        vi.stubGlobal("fetch", vi.fn(async () => new Response(packed as BodyInit)));
        expect(await loadMesh(wrong)).toBeNull();
    });

    it("lists the meshes a scene uses", () => {
        const geometry = { type: "asset" as const, hash: "a".repeat(32), min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number], triangles: 1 };
        const o = { id: "1", name: "x", geometry, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], material: { color: "#ffffff", metalness: 0, roughness: 1, opacity: 1 } } as const;
        expect(meshHashes({ objects: [o, { ...o, id: "2" }] as never })).toEqual(["a".repeat(32)]);
    });
});
