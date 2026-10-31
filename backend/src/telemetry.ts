import { fail, json } from "./auth";

// POST /api/events and /api/errors from the app's telemetry.ts. Events go to
// Workers Analytics Engine (when the binding is set); crash reports go to the
// Worker's logs, where Cloudflare's log alerts can pick them up. Nothing here
// identifies a person: an anonymous id the browser made up, an event name, a
// short label and a number.

const EVENTS = new Set([
    "app_open",
    "first_shape",
    "template_used",
    "assistant_prompt",
    "share_created",
    "remix_opened",
    "explore_listed",
    "hands_on",
    "export",
    "upgrade_clicked",
]);
const MAX_BODY = 4_000;

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
    const text = await request.text();
    if (text.length > MAX_BODY) return null;
    try {
        const value = JSON.parse(text);
        return value && typeof value === "object" ? value : null;
    } catch {
        return null;
    }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function handleTelemetry(request: Request, env: Env): Promise<Response | null> {
    const { pathname } = new URL(request.url);
    if (pathname !== "/api/events" && pathname !== "/api/errors") return null;
    if (request.method !== "POST") return fail(405, "Method not allowed.");
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.CHAT_LIMITER.limit({ key: `telemetry:${ip}` });
    if (!success) return new Response(null, { status: 204 });
    const body = await readJson(request);
    if (!body) return fail(400, "Invalid request.");

    if (pathname === "/api/events") {
        const event = str(body.event, 40);
        if (!EVENTS.has(event)) return fail(400, "Unknown event.");
        const value = typeof body.value === "number" && Number.isFinite(body.value) ? body.value : 0;
        // The binding is in wrangler.jsonc; tests and old configs may not have it.
        (env as Env & { EVENTS?: AnalyticsEngineDataset }).EVENTS?.writeDataPoint({ indexes: [event], blobs: [event, str(body.label, 40), str(body.id, 64)], doubles: [value] });
        return new Response(null, { status: 204 });
    }

    // Logged as one line so it's easy to search and alert on.
    console.error("client error", JSON.stringify({ where: str(body.where, 20), message: str(body.message, 300), stack: str(body.stack, 1200), page: str(body.page, 100) }));
    return json({ ok: true });
}
