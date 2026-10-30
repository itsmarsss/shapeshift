import { describe, expect, it, vi } from "vitest";
import { handleAccounts } from "./accounts";
import { handleScenes } from "./scenes";
import { handlePublic } from "./publicScenes";
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
