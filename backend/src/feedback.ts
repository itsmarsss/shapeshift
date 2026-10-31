import { z } from "zod";
import { currentUser, Email, fail, json } from "./auth";

// POST /api/feedback from the app's feedback box. Kept in D1 (and the scene
// picture in R2) for the team to read; see dev notes for the query.

const MAX_PICTURE = 400_000;

const Body = z.object({
    message: z.string().trim().min(1).max(4000),
    email: z.union([Email, z.literal("")]).optional(),
    page: z.string().max(100).optional(),
    picture: z
        .string()
        .max(MAX_PICTURE)
        .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
        .optional(),
});

export const feedbackPictureKey = (id: string) => `feedback/${id}.jpg`;

export async function handleFeedback(request: Request, env: Env): Promise<Response | null> {
    if (new URL(request.url).pathname !== "/api/feedback") return null;
    if (request.method !== "POST") return fail(405, "Method not allowed.");

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.CHAT_LIMITER.limit({ key: `feedback:${ip}` });
    if (!success) return fail(429, "That's a lot of feedback at once. Wait a moment and try again.", "rate_limited");

    const text = await request.text();
    if (text.length > MAX_PICTURE + 10_000) return fail(413, "That's too large to send.", "too_large");
    let parsed: z.ZodSafeParseResult<z.infer<typeof Body>>;
    try {
        parsed = Body.safeParse(JSON.parse(text));
    } catch {
        return fail(400, "Invalid request.");
    }
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.path[0] === "email" ? "That email doesn't look right." : "Write a message first.");
    const { message, email, page, picture } = parsed.data;

    const user = await currentUser(env, request);
    const id = crypto.randomUUID();
    if (picture) {
        const bytes = Uint8Array.from(atob(picture.slice(picture.indexOf(",") + 1)), (c) => c.charCodeAt(0));
        await env.SCENES.put(feedbackPictureKey(id), bytes, { httpMetadata: { contentType: "image/jpeg" } });
    }
    await env.DB.prepare("INSERT INTO feedback (id, created_at, user_id, email, page, message, has_picture) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
        .bind(id, Date.now(), user?.id ?? null, email || user?.email || null, page ?? null, message, picture ? 1 : 0)
        .run();
    return json({ ok: true });
}
