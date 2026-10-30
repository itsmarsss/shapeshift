import { z } from "zod";
import type { PlanId } from "@shapeshift/shared/billing/plans";
import { emailConfigured, sendEmail } from "./email";

// Passwordless sign-in: we email a 6-digit code, the user types it in, and we
// set a session cookie. Nothing to remember, nothing to leak.

const CODE_MINUTES = 10;
const CODE_ATTEMPTS = 5;
// A new code for the same email at most this often, so guessing can't be sped
// up by asking for fresh codes.
const RESEND_SECONDS = 30;
const SESSION_DAYS = 30;
const COOKIE = "ss_session";

export const Email = z.string().trim().toLowerCase().email().max(254);

export type User = { id: string; email: string; name: string | null; plan: PlanId };

const now = () => Date.now();

export async function sha256(text: string) {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32) {
    const buf = crypto.getRandomValues(new Uint8Array(bytes));
    return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomCode() {
    // Rejection sampling keeps the six digits uniform.
    const buf = new Uint32Array(1);
    let n: number;
    do {
        crypto.getRandomValues(buf);
        n = buf[0];
    } while (n >= 4_294_000_000);
    return String(n % 1_000_000).padStart(6, "0");
}

export function json(body: unknown, init: ResponseInit = {}) {
    return Response.json(body, { ...init, headers: { "cache-control": "no-store", ...(init.headers ?? {}) } });
}

export function fail(status: number, error: string, code = "bad_request") {
    return json({ error, code }, { status });
}

export function isLocal(request: Request) {
    const host = new URL(request.url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export async function startSignIn(env: Env, request: Request, rawEmail: unknown): Promise<Response> {
    const parsed = Email.safeParse(rawEmail);
    if (!parsed.success) return fail(400, "Enter a valid email address.");
    const email = parsed.data;
    // Without an email provider, only local development may sign in, since the
    // code comes back in the response there.
    const local = isLocal(request);
    if (!emailConfigured(env) && !local) return fail(503, "Sign-in isn't set up on this server yet.", "not_configured");

    const pending = await env.DB.prepare("SELECT sent_at FROM login_codes WHERE email = ?1").bind(email).first<{ sent_at: number }>();
    if (pending && now() - pending.sent_at < RESEND_SECONDS * 1000) {
        const wait = Math.ceil((RESEND_SECONDS * 1000 - (now() - pending.sent_at)) / 1000);
        return fail(429, `Wait ${wait} seconds before asking for another code.`, "rate_limited");
    }
    const code = randomCode();
    await env.DB.prepare(
        "INSERT INTO login_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?1, ?2, ?3, 0, ?4) ON CONFLICT(email) DO UPDATE SET code_hash = ?2, expires_at = ?3, attempts = 0, sent_at = ?4"
    )
        .bind(email, await sha256(`${email}:${code}`), now() + CODE_MINUTES * 60_000, now())
        .run();
    const sent = await sendEmail(env, {
        to: email,
        subject: `${code} is your ShapeShift code`,
        text: `Your ShapeShift sign-in code is ${code}. It works for ${CODE_MINUTES} minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
        html: `<p>Your ShapeShift sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It works for ${CODE_MINUTES} minutes. If you didn't ask for this, you can ignore this email.</p>`,
    });
    if (!sent.ok) return fail(502, "We couldn't send the email. Try again in a moment.", "upstream");
    return json({ ok: true, ...(sent.dev && local ? { devCode: code } : {}) });
}

function sessionCookie(token: string, request: Request, maxAge: number) {
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function finishSignIn(env: Env, request: Request, rawEmail: unknown, rawCode: unknown): Promise<Response> {
    const email = Email.safeParse(rawEmail);
    const code = z.string().regex(/^\d{6}$/).safeParse(typeof rawCode === "string" ? rawCode.replace(/\s/g, "") : rawCode);
    if (!email.success || !code.success) return fail(400, "Enter the 6-digit code from the email.");

    const row = await env.DB.prepare("SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?1")
        .bind(email.data)
        .first<{ code_hash: string; expires_at: number; attempts: number }>();
    if (!row || row.expires_at < now()) return fail(400, "That code expired. Ask for a new one.", "expired");
    if (row.attempts >= CODE_ATTEMPTS) return fail(429, "Too many tries. Ask for a new code.", "rate_limited");
    if (row.code_hash !== (await sha256(`${email.data}:${code.data}`))) {
        await env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?1").bind(email.data).run();
        return fail(400, "That code isn't right. Check the email and try again.", "wrong_code");
    }

    await env.DB.prepare("DELETE FROM login_codes WHERE email = ?1").bind(email.data).run();
    let user = await env.DB.prepare("SELECT id, email, name, plan FROM users WHERE email = ?1").bind(email.data).first<User>();
    if (!user) {
        user = { id: crypto.randomUUID(), email: email.data, name: null, plan: "free" };
        await env.DB.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?1, ?2, NULL, ?3)").bind(user.id, user.email, now()).run();
    }
    const token = randomToken();
    await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)")
        .bind(await sha256(token), user.id, now(), now() + SESSION_DAYS * 86_400_000)
        .run();
    return json({ user }, { headers: { "set-cookie": sessionCookie(token, request, SESSION_DAYS * 86_400) } });
}

function readCookie(request: Request): string | null {
    const header = request.headers.get("cookie") ?? "";
    for (const part of header.split(";")) {
        const [k, ...v] = part.trim().split("=");
        if (k === COOKIE) return v.join("=") || null;
    }
    return null;
}

export async function currentUser(env: Env, request: Request): Promise<User | null> {
    const token = readCookie(request);
    if (!token) return null;
    return (
        (await env.DB.prepare(
            "SELECT u.id, u.email, u.name, u.plan FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2"
        )
            .bind(await sha256(token), now())
            .first<User>()) ?? null
    );
}

export async function signOut(env: Env, request: Request): Promise<Response> {
    const token = readCookie(request);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256(token)).run();
    return json({ ok: true }, { headers: { "set-cookie": sessionCookie("", request, 0) } });
}

export async function rename(env: Env, user: User, rawName: unknown): Promise<Response> {
    const name = z.string().trim().min(1).max(40).safeParse(rawName);
    if (!name.success) return fail(400, "Names can be 1 to 40 characters.");
    await env.DB.prepare("UPDATE users SET name = ?1 WHERE id = ?2").bind(name.data, user.id).run();
    return json({ user: { ...user, name: name.data } });
}
