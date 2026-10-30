import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Store from "../scene/store";
import type { ClientMessage, ServerMessage } from "@shapeshift/shared/collab/protocol";
import type { SceneObject } from "@shapeshift/shared/scene/schema";

class FakeSocket {
    static OPEN = 1;
    static all: FakeSocket[] = [];
    readyState = 0;
    sent: ClientMessage[] = [];
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: ((e: { code: number }) => void) | null = null;
    url: string;
    constructor(url: string) {
        this.url = url;
        FakeSocket.all.push(this);
    }
    send(data: string) {
        this.sent.push(JSON.parse(data));
    }
    close() {
        this.readyState = 3;
    }
    // Test helpers.
    open() {
        this.readyState = 1;
    }
    receive(msg: ServerMessage) {
        this.onmessage?.({ data: JSON.stringify(msg) });
    }
    drop() {
        this.readyState = 3;
        this.onclose?.({ code: 1006 });
    }
    ops() {
        return this.sent.filter((m): m is Extract<ClientMessage, { type: "ops" }> => m.type === "ops");
    }
}

const box = (id: string, x = 0): SceneObject => ({
    id,
    name: id,
    geometry: { type: "box", width: 1, height: 1, depth: 1 },
    position: [x, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    material: { color: "#ffffff", metalness: 0, roughness: 0.5, opacity: 1 },
});

const peer = { id: "me", name: "Me", color: "#f76b15", presence: { selection: [] } };
const welcome = (objects: SceneObject[] = []): ServerMessage => ({ type: "welcome", you: peer, peers: [], objects, lights: [], version: 1, chat: [] });

let session: typeof import("./session");
let useScene: typeof Store.useScene;

beforeEach(async () => {
    vi.useFakeTimers();
    FakeSocket.all = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("location", new URL("http://localhost:5173/"));
    vi.stubGlobal("history", { replaceState: () => {} });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.resetModules();
    session = await import("./session");
    const store = await import("../scene/store");
    useScene = store.useScene;
    useScene.getState().load(store.emptyDoc());
});

afterEach(() => {
    session.useCollab.getState().leave();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const socket = () => FakeSocket.all[FakeSocket.all.length - 1];

describe("live session", () => {
    it("loads the room's scene, then sends local edits and applies remote ones without echoing them", () => {
        session.useCollab.getState().join("room-12345");
        socket().open();
        socket().receive(welcome([box("theirs")]));
        expect(useScene.getState().doc.objects.map((o) => o.id)).toEqual(["theirs"]);
        expect(session.useCollab.getState().status).toBe("live");

        useScene.getState().run({ type: "add", primitive: "sphere", name: "Mine" });
        expect(socket().ops()).toHaveLength(1);
        expect(socket().ops()[0].ops.objects.upsert[0].entity.name).toBe("Mine");

        socket().receive({ type: "ops", from: "them", version: 2, ops: { objects: { upsert: [{ entity: box("theirs", 4) }], remove: [] }, lights: { upsert: [], remove: [] } } });
        expect(useScene.getState().doc.objects.find((o) => o.id === "theirs")?.position[0]).toBe(4);
        expect(socket().ops()).toHaveLength(1);
        // Remote edits don't land in this user's undo history.
        useScene.getState().undo();
        expect(useScene.getState().doc.objects.map((o) => o.id)).toEqual(["theirs"]);
    });

    it("resends unconfirmed edits after reconnecting and keeps them on screen", () => {
        session.useCollab.getState().join("room-12345");
        socket().open();
        socket().receive(welcome());
        useScene.getState().run({ type: "add", primitive: "box", name: "Offline" });
        const first = socket();
        first.drop();
        expect(session.useCollab.getState().status).toBe("reconnecting");
        vi.advanceTimersByTime(600);
        const second = socket();
        expect(second).not.toBe(first);
        second.open();
        second.receive(welcome());
        expect(second.ops().map((m) => m.ops.objects.upsert[0].entity.name)).toEqual(["Offline"]);
        expect(useScene.getState().doc.objects.map((o) => o.name)).toEqual(["Offline"]);
    });

    it("seeds a new room with the sharer's scene", () => {
        useScene.getState().run({ type: "add", primitive: "cone", name: "Seed" });
        const link = session.useCollab.getState().share();
        expect(link).toMatch(/\?room=[A-Za-z0-9_-]{12}$/);
        socket().open();
        socket().receive(welcome());
        expect(socket().ops()[0].ops.objects.upsert.map((u) => u.entity.name)).toEqual(["Seed"]);
        expect(useScene.getState().doc.objects).toHaveLength(1);
    });
});
