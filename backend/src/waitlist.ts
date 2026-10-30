import { z } from "zod";
import { Email, fail, json } from "./auth";
import { sendEmail } from "./email";

const Body = z.object({ email: Email, source: z.string().trim().max(40).optional() });

// POST /api/waitlist. Joining twice is fine and doesn't send a second email.
export async function handleWaitlist(request: Request, env: Env): Promise<Response | null> {
    if (new URL(request.url).pathname !== "/api/waitlist") return null;
    if (request.method !== "POST") return fail(405, "Method not allowed.");

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.CHAT_LIMITER.limit({ key: `waitlist:${ip}` });
    if (!success) return fail(429, "Too many requests. Wait a moment and try again.", "rate_limited");

    const text = await request.text();
    let parsed: z.ZodSafeParseResult<z.infer<typeof Body>>;
    try {
        parsed = Body.safeParse(JSON.parse(text.slice(0, 2000)));
    } catch {
        return fail(400, "Invalid request.");
    }
    if (!parsed.success) return fail(400, "Enter a valid email address.");
    const { email, source } = parsed.data;

    const result = await env.DB.prepare("INSERT INTO waitlist (email, source, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(email) DO NOTHING")
        .bind(email, source ?? null, Date.now())
        .run();
    const joined = (result.meta as { changes?: number }).changes === 1;
    if (joined) {
        await sendEmail(env, {
            to: email,
            subject: "You're on the ShapeShift waitlist",
            text: "Thanks for joining the ShapeShift waitlist. We'll email you when there's something new to try.\n\nYou can already build in the browser at https://shapeshift.hanzpo.com",
        });
    }
    return json({ ok: true, already: !joined });
}
