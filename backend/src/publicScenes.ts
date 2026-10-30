import { fail, json } from "./auth";
import { fileKey, thumbKey } from "./scenes";

export type PublicScene = { title: string; author: string | null; updatedAt: number; ownerId: string };

const SLUG = /^[A-Za-z0-9]{10}$/;

export async function findPublic(env: Env, slug: string): Promise<(PublicScene & { id: string }) | null> {
    if (!SLUG.test(slug)) return null;
    const row = await env.DB.prepare(
        "SELECT s.id, s.title, s.updated_at, s.owner_id, u.name FROM scenes s JOIN users u ON u.id = s.owner_id WHERE s.public_slug = ?1"
    )
        .bind(slug)
        .first<{ id: string; title: string; updated_at: number; owner_id: string; name: string | null }>();
    return row ? { id: row.id, title: row.title, author: row.name, updatedAt: row.updated_at, ownerId: row.owner_id } : null;
}

// GET /api/public/:slug and /api/public/:slug/thumbnail. Anyone with the link
// can view; nothing here reveals the owner's email or other scenes.
export async function handlePublic(request: Request, env: Env): Promise<Response | null> {
    const match = new URL(request.url).pathname.match(/^\/api\/public\/([^/]+)(\/thumbnail)?$/);
    if (!match) return null;
    if (request.method !== "GET") return fail(405, "Method not allowed.");
    const scene = await findPublic(env, match[1]);
    if (!scene) return fail(404, "This link isn't shared anymore.", "not_found");

    if (match[2]) {
        const file = await env.SCENES.get(thumbKey(scene.ownerId, scene.id));
        if (!file) return fail(404, "No preview.", "not_found");
        return new Response(file.body, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=300" } });
    }
    const file = await env.SCENES.get(fileKey(scene.ownerId, scene.id));
    if (!file) return fail(404, "This scene is missing.", "not_found");
    return json({ title: scene.title, author: scene.author, updatedAt: scene.updatedAt, doc: JSON.parse(await file.text()) });
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Shared links unfurl in chat apps with the scene's title and preview, so the
// app's HTML gets per-scene tags before it's sent.
export async function sharePage(request: Request, env: Env, slug: string): Promise<Response> {
    const page = await env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    const scene = await findPublic(env, slug);
    if (!scene) return page;
    const origin = new URL(request.url).origin;
    const title = escape(`${scene.title} · ShapeShift`);
    const description = escape(scene.author ? `A 3D scene by ${scene.author}. Open it, look around, and remix it.` : "A 3D scene made in ShapeShift. Open it, look around, and remix it.");
    const image = `${origin}/api/public/${slug}/thumbnail`;
    const tags = `<meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="${image}"><meta name="twitter:card" content="summary_large_image">`;
    return new HTMLRewriter()
        .on("title", { element: (el) => void el.setInnerContent(title) })
        .on("meta[property^='og:']", { element: (el) => void el.remove() })
        .on("head", { element: (el) => void el.append(tags, { html: true }) })
        .transform(page);
}
