import { currentUser, fail, finishSignIn, json, rename, signOut, startSignIn } from "./auth";

const MAX_BODY = 16_000;

async function body(request: Request): Promise<Record<string, unknown> | null> {
    const text = await request.text();
    if (text.length > MAX_BODY) return null;
    try {
        const value = JSON.parse(text);
        return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
        return null;
    }
}

// /api/auth/* and /api/me. Returns null for any other path.
export async function handleAccounts(request: Request, env: Env): Promise<Response | null> {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/auth/") && pathname !== "/api/me") return null;

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.CHAT_LIMITER.limit({ key: `auth:${ip}` });
    if (!success) return fail(429, "Too many requests. Wait a moment and try again.", "rate_limited");

    if (pathname === "/api/me") {
        const user = await currentUser(env, request);
        if (request.method === "GET") return json({ user });
        if (!user) return fail(401, "Sign in first.", "unauthorized");
        if (request.method === "PATCH") {
            const b = await body(request);
            return b ? rename(env, user, b.name) : fail(400, "Invalid request.");
        }
        return fail(405, "Method not allowed.");
    }

    if (request.method !== "POST") return fail(405, "Method not allowed.");
    const b = await body(request);
    if (!b && pathname !== "/api/auth/signout") return fail(400, "Invalid request.");
    switch (pathname) {
        case "/api/auth/start":
            return startSignIn(env, request, b!.email);
        case "/api/auth/verify":
            return finishSignIn(env, request, b!.email, b!.code);
        case "/api/auth/signout":
            return signOut(env, request);
    }
    return fail(404, "Not found.", "not_found");
}
