import { describe, expect, it, vi } from "vitest";
import { handleAccounts } from "./accounts";
import { handleAdmin, LOCAL_SUPERUSER } from "./admin";
import { testDatabase } from "./test/d1";
import { testBucket } from "./test/r2";

function env(extra: Partial<Env> = {}) {
    return { DB: testDatabase(), SCENES: testBucket(), CHAT_LIMITER: { limit: vi.fn(async () => ({ success: true })) }, ...extra } as unknown as Env;
}

const req = (url: string, init: { method?: string; body?: unknown; cookie?: string } = {}) =>
    new Request(url.startsWith("http") ? url : `http://localhost:5173${url}`, {
        method: init.method ?? "GET",
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        headers: init.cookie ? { cookie: init.cookie } : {},
    });

// Sign-in codes only show locally, so everyone signs in on localhost; the
// cookie then works against the live address too.
async function signIn(e: Env, email: string) {
    const start = (await (await handleAccounts(req("/api/auth/start", { method: "POST", body: { email } }), e))!.json()) as { devCode: string };
    const res = (await handleAccounts(req("/api/auth/verify", { method: "POST", body: { email, code: start.devCode } }), e))!;
    return res.headers.get("set-cookie")!.split(";")[0];
}

const call = async (e: Env, cookie: string, path: string, init: { method?: string; body?: unknown; live?: boolean } = {}) => {
    const res = (await handleAdmin(req(init.live ? `https://tryshapeshift.com/api/admin${path}` : `/api/admin${path}`, { ...init, cookie }), e))!;
    return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> };
};

describe("admin", () => {
    it("doesn't exist for people who aren't admins", async () => {
        const e = env();
        const cookie = await signIn(e, "kid@school.edu");
        expect((await call(e, cookie, "/me")).status).toBe(404);
        expect((await call(e, cookie, "/overview")).status).toBe(404);
        expect((await handleAdmin(req("/api/admin/me"), e))!.status).toBe(404);
    });

    it("lets superusers from the secret do everything on the live site, and the local one only locally", async () => {
        const e = env({ SUPERUSER_EMAILS: "Owner@Example.com, other@example.com" } as Partial<Env>);
        const owner = await signIn(e, "owner@example.com");
        const me = await call(e, owner, "/me", { live: true });
        expect(me.body).toMatchObject({ role: "superuser" });
        expect(me.body.permissions).toContain("admins.manage");
        const local = await signIn(e, LOCAL_SUPERUSER);
        expect((await call(e, local, "/me")).body).toMatchObject({ role: "superuser" });
        expect((await call(e, local, "/me", { live: true })).status).toBe(404);
    });

    it("gives each role only its permissions", async () => {
        const e = env();
        const boss = await signIn(e, LOCAL_SUPERUSER);
        const mod = await signIn(e, "mod@example.com");
        expect((await call(e, boss, "/admins", { method: "POST", body: { email: "nobody@example.com", role: "support" } })).body).toMatchObject({ code: "no_user" });
        expect((await call(e, boss, "/admins", { method: "POST", body: { email: "mod@example.com", role: "moderator" } })).status).toBe(200);

        expect((await call(e, mod, "/me")).body).toMatchObject({ role: "moderator", permissions: ["overview", "feedback.read", "feedback.manage", "explore.moderate"] });
        expect((await call(e, mod, "/feedback")).status).toBe(200);
        expect((await call(e, mod, "/explore")).status).toBe(200);
        expect((await call(e, mod, "/users")).status).toBe(403);
        expect((await call(e, mod, "/admins")).status).toBe(403);
        expect((await call(e, mod, "/admins", { method: "POST", body: { email: "mod@example.com", role: "superuser" } })).status).toBe(403);
    });

    it("changes plans by hand and logs what admins do", async () => {
        const e = env();
        const boss = await signIn(e, LOCAL_SUPERUSER);
        await signIn(e, "friend@example.com");
        const { body } = await call(e, boss, "/users?q=friend");
        const friend = (body.users as { id: string; plan: string }[])[0];
        expect(friend.plan).toBe("free");
        expect((await call(e, boss, `/users/${friend.id}/plan`, { method: "POST", body: { plan: "pro" } })).status).toBe(200);
        expect(((await call(e, boss, "/users?q=friend")).body.users as { plan: string; plan_status: string }[])[0]).toMatchObject({ plan: "pro", plan_status: "manual" });
        const entries = (await call(e, boss, "/log")).body.entries as { actor: string; action: string; detail: string }[];
        expect(entries[0]).toMatchObject({ actor: LOCAL_SUPERUSER, action: "plan", detail: "friend@example.com → pro" });
    });

    it("removes admins, but not yourself", async () => {
        const e = env();
        const boss = await signIn(e, LOCAL_SUPERUSER);
        const helper = await signIn(e, "help@example.com");
        await call(e, boss, "/admins", { method: "POST", body: { email: "help@example.com", role: "admin" } });
        const admins = (await call(e, boss, "/admins")).body.admins as { id: string | null; email: string; fixed: boolean }[];
        expect(admins.map((a) => [a.email, a.fixed])).toEqual([
            [LOCAL_SUPERUSER, true],
            ["help@example.com", false],
        ]);
        const id = admins[1].id!;
        expect((await call(e, helper, `/admins/${id}`, { method: "DELETE" })).status).toBe(403);
        expect((await call(e, boss, `/admins/${id}`, { method: "DELETE" })).status).toBe(200);
        expect((await call(e, helper, "/me")).status).toBe(404);
    });

    it("marks feedback read", async () => {
        const e = env();
        const boss = await signIn(e, LOCAL_SUPERUSER);
        await e.DB.prepare("INSERT INTO feedback (id, created_at, message, has_picture) VALUES ('f1', 1, 'hi', 0)").run();
        expect((await call(e, boss, "/overview")).body).toMatchObject({ unreadFeedback: 1 });
        await call(e, boss, "/feedback/f1/read", { method: "POST", body: { read: true } });
        expect((await call(e, boss, "/overview")).body).toMatchObject({ unreadFeedback: 0 });
        expect(((await call(e, boss, "/feedback")).body.items as { read: boolean }[])[0].read).toBe(true);
    });
});
