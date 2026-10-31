import { describe, expect, it, vi } from "vitest";
import { handleAccounts } from "./accounts";
import { handleScenes } from "./scenes";
import { handleExplore, handlePublic } from "./publicScenes";
import { testDatabase } from "./test/d1";
import { testBucket } from "./test/r2";

type Body = { devCode?: string; scene?: { id: string; publicSlug: string | null }; title?: string; author?: string | null; doc?: { objects: unknown[] } };
const read = (r: Response | null) => r!.json() as Promise<Body>;

const env = () => ({ DB: testDatabase(), SCENES: testBucket(), CHAT_LIMITER: { limit: vi.fn(async () => ({ success: true })) } }) as unknown as Env;

const req = (path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) =>
    new Request(`http://localhost${path}`, {
        method: init.method ?? "GET",
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        headers: init.cookie ? { cookie: init.cookie } : {},
    });

async function signIn(e: Env, email: string, name?: string) {
    const start = await read(await handleAccounts(req("/api/auth/start", { method: "POST", body: { email } }), e));
    const res = (await handleAccounts(req("/api/auth/verify", { method: "POST", body: { email, code: start.devCode } }), e))!;
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    if (name) await handleAccounts(req("/api/me", { method: "PATCH", body: { name }, cookie }), e);
    return cookie;
}

const doc = { version: 2, objects: [] };

describe("public share links", () => {
    it("publishes a scene anyone can open, keeps the link, and unpublishes it", async () => {
        const e = env();
        const ann = await signIn(e, "ann@example.com", "Ann");
        const { scene } = await read(await handleScenes(req("/api/scenes", { method: "POST", cookie: ann, body: { title: "Garden", doc } }), e));
        expect(scene!.publicSlug).toBeNull();

        const published = await read(await handleScenes(req(`/api/scenes/${scene!.id}/publish`, { method: "POST", cookie: ann }), e));
        const slug = published.scene!.publicSlug!;
        expect(slug).toMatch(/^[A-Za-z0-9]{10}$/);
        const again = await read(await handleScenes(req(`/api/scenes/${scene!.id}/publish`, { method: "POST", cookie: ann }), e));
        expect(again.scene!.publicSlug).toBe(slug);

        // No cookie needed, and no email in the response.
        const res = await handlePublic(req(`/api/public/${slug}`), e);
        const body = await read(res);
        expect(body).toMatchObject({ title: "Garden", author: "Ann" });
        expect(JSON.stringify(body)).not.toContain("ann@example.com");

        await handleScenes(req(`/api/scenes/${scene!.id}/publish`, { method: "DELETE", cookie: ann }), e);
        expect((await handlePublic(req(`/api/public/${slug}`), e))!.status).toBe(404);
    });

    it("only lets the owner publish", async () => {
        const e = env();
        const ann = await signIn(e, "ann@example.com");
        const bob = await signIn(e, "bob@example.com");
        const { scene } = await read(await handleScenes(req("/api/scenes", { method: "POST", cookie: ann, body: { doc } }), e));
        expect((await handleScenes(req(`/api/scenes/${scene!.id}/publish`, { method: "POST", cookie: bob }), e))!.status).toBe(404);
    });

    it("rejects made-up links", async () => {
        const e = env();
        expect((await handlePublic(req("/api/public/AAAAAAAAAA"), e))!.status).toBe(404);
        expect((await handlePublic(req("/api/public/short"), e))!.status).toBe(404);
        expect(await handlePublic(req("/api/other"), e)).toBeNull();
    });
});

describe("explore", () => {
    const explore = async (e: Env, query = "") => (await handleExplore(req("/api/explore" + query), e))!.json() as Promise<{ scenes: { slug: string; title: string; author: string | null }[]; next: number | null }>;

    it("lists only scenes their owners chose to show, without leaking who they are", async () => {
        const e = env();
        const cookie = await signIn(e, "maker@example.com", "Ada");
        const make = async (title: string) => (await read(await handleScenes(req("/api/scenes", { method: "POST", body: { title, doc }, cookie }), e))).scene!.id;
        const shared = await make("Shared only");
        const listed = await make("In Explore");
        await make("Private");
        await handleScenes(req(`/api/scenes/${shared}/publish`, { method: "POST", cookie }), e);
        const res = await read(await handleScenes(req(`/api/scenes/${listed}/listing`, { method: "POST", body: { listed: true }, cookie }), e));
        // Listing shares the link too, since that is what Explore opens.
        expect(res.scene!.publicSlug).toMatch(/^[A-Za-z0-9]{10}$/);

        const page = await explore(e);
        expect(page.scenes.map((s) => s.title)).toEqual(["In Explore"]);
        expect(page.scenes[0].author).toBe("Ada");
        expect(JSON.stringify(page)).not.toContain("maker@example.com");

        // Unsharing takes it out of Explore as well.
        await handleScenes(req(`/api/scenes/${listed}/publish`, { method: "DELETE", cookie }), e);
        expect((await explore(e)).scenes).toEqual([]);
    });

    it("pages through long lists", async () => {
        const e = env();
        const cookie = await signIn(e, "busy@example.com");
        // More scenes than the free plan keeps.
        await e.DB.prepare("UPDATE users SET plan = 'pro'").run();
        for (let i = 0; i < 26; i++) {
            const id = (await read(await handleScenes(req("/api/scenes", { method: "POST", body: { title: `Scene ${i}`, doc }, cookie }), e))).scene!.id;
            await handleScenes(req(`/api/scenes/${id}/listing`, { method: "POST", body: { listed: true }, cookie }), e);
            await new Promise((r) => setTimeout(r, 2));
        }
        const first = await explore(e);
        expect(first.scenes).toHaveLength(24);
        const second = await explore(e, `?before=${first.next}`);
        expect(second.scenes).toHaveLength(2);
        expect(second.next).toBeNull();
    });
});
