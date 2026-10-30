import { z } from "zod";
import { SceneDoc } from "@shapeshift/shared/scene/schema";
import { PLANS } from "@shapeshift/shared/billing/plans";
import { currentUser, fail, json, type User } from "./auth";

// Saved scenes. The scene file goes to R2 (one object per scene, under the
// owner's id) and D1 keeps the list, so listing never reads the files.

export const SCENE_LIMITS = { bytes: 8_000_000, perUser: 200, titleChars: 80, thumbnailChars: 80_000 } as const;

const SaveBody = z.object({
    title: z.string().trim().min(1).max(SCENE_LIMITS.titleChars).optional(),
    doc: z.unknown().optional(),
    // A small JPEG preview as a data URL.
    thumbnail: z
        .string()
        .max(SCENE_LIMITS.thumbnailChars)
        .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
        .optional(),
});

type SceneRow = { id: string; title: string; size: number; created_at: number; updated_at: number; public_slug: string | null };

// Ten characters from a 62-letter alphabet: too many to guess.
function randomSlug() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return [...bytes].map((b) => alphabet[b % 62]).join("");
}

export const fileKey = (owner: string, id: string) => `scenes/${owner}/${id}.json`;
export const thumbKey = (owner: string, id: string) => `scenes/${owner}/${id}.jpg`;

const meta = (r: SceneRow) => ({ id: r.id, title: r.title, size: r.size, createdAt: r.created_at, updatedAt: r.updated_at, publicSlug: r.public_slug });

async function readBody(request: Request) {
    const text = await request.text();
    if (text.length > SCENE_LIMITS.bytes + SCENE_LIMITS.thumbnailChars + 1000) return { error: fail(413, "That scene is too large to save.", "too_large") };
    try {
        const parsed = SaveBody.safeParse(JSON.parse(text));
        if (!parsed.success) return { error: fail(400, `Invalid scene: ${parsed.error.issues[0]?.message ?? "bad shape"}`) };
        return { body: parsed.data };
    } catch {
        return { error: fail(400, "Invalid request.") };
    }
}

function checkDoc(doc: unknown): { text: string } | { error: Response } {
    const parsed = SceneDoc.safeParse(doc);
    if (!parsed.success) return { error: fail(400, `That isn't a valid scene: ${parsed.error.issues[0]?.message ?? "bad shape"}`) };
    const text = JSON.stringify(parsed.data);
    if (text.length > SCENE_LIMITS.bytes) return { error: fail(413, "That scene is too large to save.", "too_large") };
    return { text };
}

async function putThumbnail(env: Env, owner: string, id: string, dataUrl: string) {
    const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (c) => c.charCodeAt(0));
    await env.SCENES.put(thumbKey(owner, id), bytes, { httpMetadata: { contentType: "image/jpeg" } });
}

async function owned(env: Env, user: User, id: string) {
    return env.DB.prepare("SELECT id, title, size, created_at, updated_at, public_slug FROM scenes WHERE id = ?1 AND owner_id = ?2").bind(id, user.id).first<SceneRow>();
}

// /api/scenes and /api/scenes/:id[/thumbnail]. Returns null for other paths.
export async function handleScenes(request: Request, env: Env): Promise<Response | null> {
    const { pathname } = new URL(request.url);
    const match = pathname.match(/^\/api\/scenes(?:\/([A-Za-z0-9-]{1,64}))?(\/thumbnail|\/publish)?$/);
    if (!match) return null;
    const [, id, sub] = match;
    const thumbnail = sub === "/thumbnail";

    const user = await currentUser(env, request);
    if (!user) return fail(401, "Sign in to save scenes to the cloud.", "unauthorized");

    if (!id) {
        if (request.method === "GET") {
            const { results } = await env.DB.prepare(
                "SELECT id, title, size, created_at, updated_at, public_slug FROM scenes WHERE owner_id = ?1 ORDER BY updated_at DESC LIMIT ?2"
            )
                .bind(user.id, SCENE_LIMITS.perUser)
                .all<SceneRow>();
            return json({ scenes: results.map(meta) });
        }
        if (request.method !== "POST") return fail(405, "Method not allowed.");
        const { body, error } = await readBody(request);
        if (error) return error;
        const doc = checkDoc(body.doc);
        if ("error" in doc) return doc.error;
        const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM scenes WHERE owner_id = ?1").bind(user.id).first<{ n: number }>();
        const allowed = PLANS[user.plan === "pro" ? "pro" : "free"].cloudScenes;
        if ((count?.n ?? 0) >= allowed) {
            return user.plan === "pro"
                ? fail(409, `You can keep ${allowed} scenes. Delete one to save another.`, "limit")
                : fail(409, `Free accounts keep up to ${allowed} scenes in the cloud. Upgrade to Pro to keep ${PLANS.pro.cloudScenes}, or delete one to save another.`, "plan_limit");
        }
        const sceneId = crypto.randomUUID();
        const at = Date.now();
        await env.SCENES.put(fileKey(user.id, sceneId), doc.text, { httpMetadata: { contentType: "application/json" } });
        if (body.thumbnail) await putThumbnail(env, user.id, sceneId, body.thumbnail);
        const row: SceneRow = { id: sceneId, title: body.title ?? "Untitled scene", size: doc.text.length, created_at: at, updated_at: at, public_slug: null };
        await env.DB.prepare("INSERT INTO scenes (id, owner_id, title, size, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)")
            .bind(row.id, user.id, row.title, row.size, at)
            .run();
        return json({ scene: meta(row) }, { status: 201 });
    }

    const row = await owned(env, user, id);
    // Someone else's scene looks the same as a missing one.
    if (!row) return fail(404, "That scene doesn't exist.", "not_found");

    if (sub === "/publish") {
        if (request.method === "POST") {
            // Keep the same link if it's already published.
            const slug = row.public_slug ?? randomSlug();
            await env.DB.prepare("UPDATE scenes SET public_slug = ?1, published_at = ?2 WHERE id = ?3").bind(slug, Date.now(), id).run();
            return json({ scene: meta({ ...row, public_slug: slug }) });
        }
        if (request.method === "DELETE") {
            await env.DB.prepare("UPDATE scenes SET public_slug = NULL, published_at = NULL WHERE id = ?1").bind(id).run();
            return json({ scene: meta({ ...row, public_slug: null }) });
        }
        return fail(405, "Method not allowed.");
    }

    if (thumbnail) {
        if (request.method !== "GET") return fail(405, "Method not allowed.");
        const file = await env.SCENES.get(thumbKey(user.id, id));
        if (!file) return fail(404, "No preview.", "not_found");
        return new Response(file.body, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=60" } });
    }

    switch (request.method) {
        case "GET": {
            const file = await env.SCENES.get(fileKey(user.id, id));
            if (!file) return fail(404, "That scene's file is missing.", "not_found");
            return json({ scene: meta(row), doc: JSON.parse(await file.text()) });
        }
        case "PUT": {
            const { body, error } = await readBody(request);
            if (error) return error;
            let size = row.size;
            if (body.doc !== undefined) {
                const doc = checkDoc(body.doc);
                if ("error" in doc) return doc.error;
                await env.SCENES.put(fileKey(user.id, id), doc.text, { httpMetadata: { contentType: "application/json" } });
                size = doc.text.length;
            }
            if (body.thumbnail) await putThumbnail(env, user.id, id, body.thumbnail);
            const updated: SceneRow = { ...row, title: body.title ?? row.title, size, updated_at: Date.now() };
            await env.DB.prepare("UPDATE scenes SET title = ?1, size = ?2, updated_at = ?3 WHERE id = ?4").bind(updated.title, size, updated.updated_at, id).run();
            return json({ scene: meta(updated) });
        }
        case "DELETE":
            await env.SCENES.delete([fileKey(user.id, id), thumbKey(user.id, id)]);
            await env.DB.prepare("DELETE FROM scenes WHERE id = ?1").bind(id).run();
            return json({ ok: true });
    }
    return fail(405, "Method not allowed.");
}
