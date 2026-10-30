import { describe, expect, it, vi } from "vitest";
import { handleAccounts } from "./accounts";
import { testDatabase } from "./test/d1";

function env(extra: Partial<Env> = {}) {
    return { DB: testDatabase(), CHAT_LIMITER: { limit: vi.fn(async () => ({ success: true })) }, ...extra } as unknown as Env;
}

type Body = { ok?: boolean; devCode?: string; user?: { id: string; email: string; name: string | null } | null; error?: string };
const read = (r: Response) => r.json() as Promise<Body>;

const call = (e: Env, path: string, init: { method?: string; body?: unknown; cookie?: string; host?: string } = {}) =>
    handleAccounts(
        new Request(`http://${init.host ?? "localhost:5173"}${path}`, {
            method: init.method ?? "POST",
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
            headers: init.cookie ? { cookie: init.cookie } : {},
        }),
        e
    ) as Promise<Response>;

async function signIn(e: Env, email = "Ann@Example.com") {
    const start = await read(await call(e, "/api/auth/start", { body: { email } }));
    const res = await call(e, "/api/auth/verify", { body: { email, code: start.devCode } });
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    return { res, cookie };
}

describe("sign in with an email code", () => {
    it("creates an account, sets a session cookie and knows who you are", async () => {
        const e = env();
        const { res, cookie } = await signIn(e);
        expect(res.status).toBe(200);
        expect(res.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Lax/);
        const me = await read(await call(e, "/api/me", { method: "GET", cookie }));
        expect(me.user).toMatchObject({ email: "ann@example.com", name: null });
        const renamed = await read(await call(e, "/api/me", { method: "PATCH", cookie, body: { name: "Ann" } }));
        expect(renamed.user?.name).toBe("Ann");
        // Signing in again with the same email reuses the account.
        const again = await read((await signIn(e, "ann@example.com")).res);
        expect(again.user?.id).toBe(me.user?.id);
    });

    it("rejects wrong codes and locks out after five tries", async () => {
        const e = env();
        await call(e, "/api/auth/start", { body: { email: "bob@example.com" } });
        for (let i = 0; i < 5; i++) {
            const res = await call(e, "/api/auth/verify", { body: { email: "bob@example.com", code: "000000" } });
            expect([400]).toContain(res.status);
        }
        expect((await call(e, "/api/auth/verify", { body: { email: "bob@example.com", code: "000000" } })).status).toBe(429);
    });

    it("won't send codes faster than every 30 seconds", async () => {
        const e = env();
        expect((await call(e, "/api/auth/start", { body: { email: "cy@example.com" } })).status).toBe(200);
        expect((await call(e, "/api/auth/start", { body: { email: "cy@example.com" } })).status).toBe(429);
    });

    it("never returns the code outside local development", async () => {
        const e = env();
        const res = await call(e, "/api/auth/start", { body: { email: "dee@example.com" }, host: "shapeshift.example" });
        expect(res.status).toBe(503);
        const withEmail = env({ RESEND_API_KEY: "re_test" } as Partial<Env>);
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
        const sent = await read(await call(withEmail, "/api/auth/start", { body: { email: "dee@example.com" }, host: "shapeshift.example" }));
        expect(sent).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledOnce();
        fetchMock.mockRestore();
    });

    it("signs out and forgets the session", async () => {
        const e = env();
        const { cookie } = await signIn(e);
        const out = await call(e, "/api/auth/signout", { cookie });
        expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
        expect((await read(await call(e, "/api/me", { method: "GET", cookie }))).user).toBeNull();
    });

    it("validates input", async () => {
        const e = env();
        expect((await call(e, "/api/auth/start", { body: { email: "not an email" } })).status).toBe(400);
        expect((await call(e, "/api/auth/verify", { body: { email: "a@b.co", code: "12" } })).status).toBe(400);
        expect((await call(e, "/api/me", { method: "PATCH", body: { name: "x" } })).status).toBe(401);
    });
});
