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

        expect((await call(e, mod, "/me")).body).toMatchObject({ role: "moderator", permissions: ["overview", "metrics", "feedback.read", "feedback.manage", "scenes.moderate", "explore.moderate"] });
        expect((await call(e, mod, "/feedback")).status).toBe(200);
        expect((await call(e, mod, "/explore")).status).toBe(200);
        expect((await call(e, mod, "/users")).status).toBe(403);
        expect((await call(e, mod, "/admins")).status).toBe(403);
        expect((await call(e, mod, "/admins", { method: "POST", body: { email: "mod@example.com", role: "superuser" } })).status).toBe(403);
    });

    it("runs the Model lab on the chosen model for admins, without counting prompts", async () => {
        const run = vi.fn(async () => new Response('data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n').body);
        const e = env({ AI: { run } } as unknown as Partial<Env>);
        const boss = await signIn(e, LOCAL_SUPERUSER);
        const mod = await signIn(e, "mod@example.com");
        await call(e, boss, "/admins", { method: "POST", body: { email: "mod@example.com", role: "moderator" } });
        const body = { messages: [{ role: "user", content: "hi" }] };
        expect((await call(e, mod, "/agent?model=@cf/openai/gpt-oss-120b", { method: "POST", body })).status).toBe(403);
        expect((await call(e, boss, "/agent?model=nope", { method: "POST", body })).status).toBe(400);

        const res = (await handleAdmin(req("/api/admin/agent?model=@cf/openai/gpt-oss-120b%23low", { method: "POST", body, cookie: boss }), e))!;
        expect(await res.text()).toContain('"content":"Hi"');
        expect(run).toHaveBeenCalledWith("@cf/openai/gpt-oss-120b", expect.objectContaining({ reasoning: { effort: "low" } }));
        expect(await e.DB.prepare("SELECT COUNT(*) AS n FROM usage").first()).toEqual({ n: 0 });
    });

    it("keeps Model lab runs to look at again, and deletes them", async () => {
        const e = env();
        const boss = await signIn(e, LOCAL_SUPERUSER);
        const record = { run: "abc123", model: "@cf/openai/gpt-oss-120b#low", prompt: "A table", ms: 61000, steps: 3, changes: 6, failed: 1, doc: { objects: [] }, log: [{ kind: "text", text: "Done" }], picture: btoa("jpeg") };
        expect((await call(e, boss, "/lab/runs", { method: "POST", body: record })).status).toBe(200);
        expect((await call(e, boss, "/lab/runs", { method: "POST", body: { ...record, model: "@cf/zai-org/glm-4.7-flash", error: "Too slow", picture: undefined } })).status).toBe(200);
        expect((await call(e, boss, "/lab/runs", { method: "POST", body: { nope: true } })).status).toBe(400);

        const list = (await call(e, boss, "/lab/runs")).body as { runs: { run: string; prompt: string; results: { model: string; ms: number; failed: number; error?: string; picture: boolean }[] }[] };
        expect(list.runs).toHaveLength(1);
        expect(list.runs[0]).toMatchObject({ run: "abc123", prompt: "A table" });
        expect(list.runs[0]!.results).toEqual([
            expect.objectContaining({ model: "@cf/openai/gpt-oss-120b#low", ms: 61000, failed: 1, picture: true }),
            expect.objectContaining({ model: "@cf/zai-org/glm-4.7-flash", error: "Too slow", picture: false }),
        ]);
        const one = (await call(e, boss, `/lab/runs/abc123/record?model=${encodeURIComponent(record.model)}`)).body;
        expect(one).toMatchObject({ prompt: "A table", log: [{ kind: "text", text: "Done" }] });

        expect((await call(e, boss, "/lab/runs/abc123", { method: "DELETE" })).status).toBe(200);
        expect(((await call(e, boss, "/lab/runs")).body as { runs: unknown[] }).runs).toHaveLength(0);
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

    it("charts sign-ups and plans, and says when usage numbers aren't set up", async () => {
        const e = env();
        const boss = await signIn(e, LOCAL_SUPERUSER);
        await signIn(e, "a@example.com");
        const db = (await call(e, boss, "/metrics?days=7")).body as { signups: { n: number }[]; people: { n: number }[]; revenue: { paying: number } };
        // Twice the window, to compare with the week before.
        expect(db.signups).toHaveLength(14);
        expect(db.signups.at(-1)!.n).toBe(2);
        expect(db.people.at(-1)!.n).toBe(2);
        expect(db.revenue.paying).toBe(0);
        expect((await call(e, boss, "/metrics/events")).body).toEqual({ configured: false });
        // Support can't see charts.
        await signIn(e, "s@example.com");
        await call(e, boss, "/admins", { method: "POST", body: { email: "s@example.com", role: "support" } });
        const support = await signIn(e, "s@example.com");
        expect((await call(e, support, "/metrics")).status).toBe(403);
    });

    it("shows a person, and signs them out, resets their prompts and deletes their account", async () => {
        const e = env() as Env & { SCENES: ReturnType<typeof testBucket> };
        const boss = await signIn(e, LOCAL_SUPERUSER);
        await signIn(e, "kid@school.edu");
        const id = ((await call(e, boss, "/users?q=kid")).body.users as { id: string }[])[0].id;
        await e.DB.prepare("INSERT INTO scenes (id, owner_id, title, size, created_at, updated_at, public_slug, listed) VALUES ('s1', ?1, 'Castle', 10, 1, 2, 'abcdefghij', 1)").bind(id).run();
        await e.SCENES.put(`scenes/${id}/s1.json`, "{}");
        await e.DB.prepare("INSERT INTO usage (subject, period, prompts, steps) VALUES (?1, ?2, 7, 20)").bind(`user:${id}`, new Date().toISOString().slice(0, 7)).run();

        const person = (await call(e, boss, `/users/${id}`)).body as { email: string; promptsThisMonth: number; activeSessions: number; scenes: { title: string }[] };
        expect(person).toMatchObject({ email: "kid@school.edu", promptsThisMonth: 7, activeSessions: 1 });
        expect(person.scenes.map((s) => s.title)).toEqual(["Castle"]);

        await call(e, boss, `/users/${id}/usage/reset`, { method: "POST" });
        await call(e, boss, `/users/${id}/signout`, { method: "POST" });
        expect((await call(e, boss, `/users/${id}`)).body).toMatchObject({ promptsThisMonth: 0, activeSessions: 0 });

        expect((await call(e, boss, "/scenes?shared=yes")).body.total).toBe(1);
        await call(e, boss, "/scenes/s1/unshare", { method: "POST" });
        expect((await call(e, boss, "/scenes?shared=yes")).body.total).toBe(0);

        expect((await call(e, boss, `/users/${id}`, { method: "DELETE" })).status).toBe(200);
        expect((await call(e, boss, `/users/${id}`)).status).toBe(404);
        expect(await e.SCENES.get(`scenes/${id}/s1.json`)).toBeNull();
        const entries = (await call(e, boss, "/log")).body.entries as { action: string }[];
        expect(entries.map((x) => x.action).sort()).toEqual(["delete account", "reset prompts", "sign out", "unshare"]);
    });

    it("lets only superusers delete accounts, and lists the dashboard feed", async () => {
        const e = env();
        const boss = await signIn(e, LOCAL_SUPERUSER);
        await signIn(e, "helper@example.com");
        await signIn(e, "victim@example.com");
        await call(e, boss, "/admins", { method: "POST", body: { email: "helper@example.com", role: "admin" } });
        const helper = await signIn(e, "helper@example.com");
        const id = ((await call(e, boss, "/users?q=victim")).body.users as { id: string }[])[0].id;
        expect((await call(e, helper, `/users/${id}`, { method: "DELETE" })).status).toBe(403);
        expect((await call(e, helper, `/users/${id}/signout`, { method: "POST" })).status).toBe(200);
        const dash = (await call(e, boss, "/dashboard")).body as { kpis: { people: { now: number } }; feed: { kind: string }[] };
        expect(dash.kpis.people.now).toBe(3);
        expect(dash.feed.some((f) => f.kind === "signup")).toBe(true);
        expect(dash.feed.some((f) => f.kind === "admin")).toBe(true);
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
