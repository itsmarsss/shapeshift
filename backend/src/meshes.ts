import { z } from "zod";
import { MeshHash } from "@shapeshift/shared/scene/schema";
import { MESH_LIMITS, gunzip, meshHash, unpackMeshes } from "@shapeshift/shared/scene/meshes";
import { fail, json } from "./auth";

// Meshes from imported models, stored once each by the hash of their bytes.
// Scenes, share links and rooms only hold the hash, so anyone who can see a
// scene can fetch its meshes, and a hash can't be guessed.

export const meshKey = (hash: string) => `meshes/${hash}`;

const Check = z.object({ hashes: z.array(MeshHash).max(MESH_LIMITS.hashesPerCheck) });

async function missing(env: Env, hashes: string[]) {
    const out: string[] = [];
    for (let i = 0; i < hashes.length; i += 50) {
        const batch = hashes.slice(i, i + 50);
        const found = await Promise.all(batch.map((h) => env.SCENES.head(meshKey(h))));
        batch.forEach((h, k) => {
            if (!found[k]) out.push(h);
        });
    }
    return out;
}

// GET /api/meshes/:hash, POST /api/meshes/missing and POST /api/meshes.
export async function handleMeshes(request: Request, env: Env): Promise<Response | null> {
    const { pathname } = new URL(request.url);
    const match = pathname.match(/^\/api\/meshes(?:\/([^/]+))?$/);
    if (!match) return null;
    const [, sub] = match;

    if (sub && sub !== "missing") {
        if (request.method !== "GET") return fail(405, "Method not allowed.");
        if (!MeshHash.safeParse(sub).success) return fail(400, "Invalid mesh.");
        const file = await env.SCENES.get(meshKey(sub));
        if (!file) return fail(404, "That mesh doesn't exist.", "not_found");
        return new Response(file.body, {
            headers: { "content-type": "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
        });
    }
    if (request.method !== "POST") return fail(405, "Method not allowed.");

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.CHAT_LIMITER.limit({ key: `mesh:${ip}` });
    if (!success) return fail(429, "Too many uploads. Try again in a minute.", "rate_limited");

    if (sub === "missing") {
        const parsed = Check.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return fail(400, "Invalid request.");
        return json({ missing: await missing(env, [...new Set(parsed.data.hashes)]) });
    }

    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MESH_LIMITS.requestBytes) return fail(413, "That upload is too large.", "too_large");
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength > MESH_LIMITS.requestBytes) return fail(413, "That upload is too large.", "too_large");
    const meshes = unpackMeshes(body);
    if (!meshes) return fail(400, "Invalid upload.");
    for (const mesh of meshes) {
        let bytes: Uint8Array;
        try {
            bytes = await gunzip(mesh.gzip, MESH_LIMITS.meshBytes);
        } catch {
            return fail(400, "A mesh in that upload is damaged or too large.");
        }
        if ((await meshHash(bytes)) !== mesh.hash) return fail(400, "A mesh in that upload doesn't match its hash.");
        await env.SCENES.put(meshKey(mesh.hash), mesh.gzip, { httpMetadata: { contentType: "application/octet-stream" } });
    }
    return json({ stored: meshes.length });
}
