import { describe, expect, it, vi } from "vitest";
import { handleAccounts } from "./accounts";
import { handleScenes } from "./scenes";
import { testDatabase } from "./test/d1";
import { testBucket } from "./test/r2";

type Body = { devCode?: string; scene?: { id: string; title: string; size: number }; scenes?: { id: string; title: string }[]; doc?: { objects: unknown[] }; error?: string };
const read = (r: Response) => r.json() as Promise<Body>;

function env() {
    return { DB: testDatabase(), SCENES: testBucket(), CHAT_LIMITER: { limit: vi.fn(async () => ({ success: true })) } } as unknown as Env & { SCENES: ReturnType<typeof testBucket> };
}

const req = (path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) =>
    new Request(`http://localhost:5173${path}`, {
        method: init.method ?? "GET",
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        headers: init.cookie ? { cookie: init.cookie } : {},
    });

async function signIn(e: Env, email: string) {
    const start = await read((await handleAccounts(req("/api/auth/start", { method: "POST", body: { email } }), e))!);
    const res = (await handleAccounts(req("/api/auth/verify", { method: "POST", body: { email, code: start.devCode } }), e))!;
    return res.headers.get("set-cookie")!.split(";")[0];
}

const scene = (n = 1) => ({
    version: 2,
    objects: Array.from({ length: n }, (_, i) => ({
        id: `o${i}`,
        name: `Box ${i}`,
        geometry: { type: "box", width: 1, height: 1, depth: 1 },
        position: [i, 0.5, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        material: { color: "#ffffff", metalness: 0, roughness: 0.5, opacity: 1 },
    })),
});

const thumb = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

describe("cloud scenes", () => {
    it("saves, lists, opens, updates and deletes your scenes", async () => {
        const e = env();
        const cookie = await signIn(e, "ann@example.com");
        const created = await handleScenes(req("/api/scenes", { method: "POST", cookie, body: { title: "Chair", doc: scene(2), thumbnail: thumb } }), e);
        expect(created!.status).toBe(201);
        const { scene: saved } = await read(created!);
        expect(saved).toMatchObject({ title: "Chair" });

        const list = await read((await handleScenes(req("/api/scenes", { cookie }), e))!);
        expect(list.scenes?.map((s) => s.title)).toEqual(["Chair"]);

        const opened = await read((await handleScenes(req(`/api/scenes/${saved!.id}`, { cookie }), e))!);
        expect(opened.doc?.objects).toHaveLength(2);
        expect((await handleScenes(req(`/api/scenes/${saved!.id}/thumbnail`, { cookie }), e))!.headers.get("content-type")).toBe("image/jpeg");

        const renamed = await read((await handleScenes(req(`/api/scenes/${saved!.id}`, { method: "PUT", cookie, body: { title: "Armchair", doc: scene(3) } }), e))!);
        expect(renamed.scene).toMatchObject({ title: "Armchair" });
        expect((await read((await handleScenes(req(`/api/scenes/${saved!.id}`, { cookie }), e))!)).doc?.objects).toHaveLength(3);

        expect((await handleScenes(req(`/api/scenes/${saved!.id}`, { method: "DELETE", cookie }), e))!.status).toBe(200);
        expect(e.SCENES.files.size).toBe(0);
        expect((await read((await handleScenes(req("/api/scenes", { cookie }), e))!)).scenes).toEqual([]);
    });

    it("keeps each person's scenes private", async () => {
        const e = env();
        const ann = await signIn(e, "ann@example.com");
        const bob = await signIn(e, "bob@example.com");
        const { scene: saved } = await read((await handleScenes(req("/api/scenes", { method: "POST", cookie: ann, body: { doc: scene() } }), e))!);
        expect((await handleScenes(req(`/api/scenes/${saved!.id}`, { cookie: bob }), e))!.status).toBe(404);
        expect((await handleScenes(req(`/api/scenes/${saved!.id}`, { method: "DELETE", cookie: bob }), e))!.status).toBe(404);
        expect((await read((await handleScenes(req("/api/scenes", { cookie: bob }), e))!)).scenes).toEqual([]);
        expect((await handleScenes(req("/api/scenes"), e))!.status).toBe(401);
    });

    it("rejects invalid scenes and bad thumbnails", async () => {
        const e = env();
        const cookie = await signIn(e, "ann@example.com");
        expect((await handleScenes(req("/api/scenes", { method: "POST", cookie, body: { doc: { version: 2, objects: [{ id: "x" }] } } }), e))!.status).toBe(400);
        expect((await handleScenes(req("/api/scenes", { method: "POST", cookie, body: { doc: scene(), thumbnail: "data:text/html,<script>" } }), e))!.status).toBe(400);
        expect(e.SCENES.files.size).toBe(0);
    });

    it("ignores paths that aren't scene routes", async () => {
        expect(await handleScenes(req("/api/agent"), env())).toBeNull();
    });
});
