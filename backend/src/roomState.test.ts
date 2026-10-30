import { describe, expect, it } from "vitest";
import { emptyOps, ClientMessage, type Ops } from "@shapeshift/shared/collab/protocol";
import { RoomState, VersionList } from "./roomState";
import type { SceneObject } from "@shapeshift/shared/scene/schema";

const box = (id: string, x = 0): SceneObject => ({
    id,
    name: id,
    geometry: { type: "box", width: 1, height: 1, depth: 1 },
    position: [x, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    material: { color: "#ffffff", metalness: 0, roughness: 0.5, opacity: 1 },
});

const ops = (fn: (o: Ops) => void) => {
    const o = emptyOps();
    fn(o);
    return o;
};

describe("room state", () => {
    it("adds, replaces and removes by id, last write wins", () => {
        const room = new RoomState();
        room.apply(ops((o) => o.objects.upsert.push({ entity: box("a") }, { entity: box("b") })));
        room.apply(ops((o) => o.objects.upsert.push({ entity: box("a", 5) })));
        room.apply(ops((o) => o.objects.upsert.push({ entity: box("a", 7) })));
        expect(room.objects.map((x) => [x.id, x.position[0]])).toEqual([
            ["a", 7],
            ["b", 0],
        ]);
        room.apply(ops((o) => o.objects.remove.push("a")));
        expect(room.objects.map((x) => x.id)).toEqual(["b"]);
        expect(room.version).toBe(4);
    });

    it("restores an entity at the index it asks for", () => {
        const room = new RoomState([box("a"), box("c")]);
        room.apply(ops((o) => o.objects.upsert.push({ entity: box("b"), index: 1 })));
        expect(room.objects.map((x) => x.id)).toEqual(["a", "b", "c"]);
    });

    it("refuses changes past the size limit without applying them", () => {
        const room = new RoomState(Array.from({ length: 2000 }, (_, i) => box(`o${i}`)));
        const result = room.apply(ops((o) => o.objects.upsert.push({ entity: box("one-too-many") })));
        expect(result.ok).toBe(false);
        expect(room.objects).toHaveLength(2000);
        expect(room.version).toBe(0);
    });

    it("validates client messages", () => {
        expect(ClientMessage.safeParse({ type: "ops", id: "1", ops: emptyOps() }).success).toBe(true);
        expect(ClientMessage.safeParse({ type: "ops", id: "1", ops: { objects: { upsert: [{ entity: { id: "x" } }], remove: [] }, lights: { upsert: [], remove: [] } } }).success).toBe(false);
        expect(ClientMessage.safeParse({ type: "rename", name: "   " }).success).toBe(false);
    });
});

describe("room chat", () => {
    const turn = (id: string, authorId = "ann") => ({
        id,
        author: { id: authorId, name: "Ann", color: "#f76b15" },
        prompt: "build a chair",
        items: [],
        status: "running" as const,
        startedAt: 1,
    });

    it("records and updates turns, and only the author can change one", () => {
        const room = new RoomState();
        expect(room.recordTurn(turn("t1"), "ann").ok).toBe(true);
        expect(room.recordTurn({ ...turn("t1"), status: "done" }, "ann").ok).toBe(true);
        expect(room.chat).toHaveLength(1);
        expect(room.chat[0].status).toBe("done");
        expect(room.recordTurn(turn("t1", "bob"), "bob").ok).toBe(false);
        expect(room.recordTurn(turn("t2", "ann"), "bob").ok).toBe(false);
    });

    it("keeps only the newest turns", () => {
        const room = new RoomState();
        let dropped: string[] = [];
        for (let i = 0; i < 45; i++) {
            const r = room.recordTurn(turn(`t${i}`), "ann");
            if (r.ok) dropped = dropped.concat(r.dropped);
        }
        expect(room.chat).toHaveLength(40);
        expect(room.chat[0].id).toBe("t5");
        expect(dropped).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    });
});

describe("room versions", () => {
    const data = { objects: [box("a")], lights: [] };

    it("saves versions and refuses empty or oversized ones", () => {
        const list = new VersionList();
        expect(list.add(data, { label: "First", at: 1, by: "Ann", auto: false }, "v1").ok).toBe(true);
        expect(list.versions[0]).toMatchObject({ id: "v1", objects: 1, lights: 0 });
        expect(list.add({ objects: [], lights: [] }, { label: "x", at: 2, by: "Ann", auto: false }, "v2").ok).toBe(false);
        const huge = { objects: Array.from({ length: 2000 }, (_, i) => ({ ...box(`b${i}`), geometry: { type: "mesh" as const, positions: Array(300).fill(1.2345), indices: [] } })), lights: [] };
        expect(list.add(huge, { label: "x", at: 3, by: "Ann", auto: false }, "v3").ok).toBe(false);
    });

    it("drops the oldest automatic versions first", () => {
        const list = new VersionList();
        list.add(data, { label: "Kept", at: 0, by: "Ann", auto: false }, "named");
        for (let i = 0; i < 31; i++) list.add(data, { label: "Auto", at: i + 1, by: "room", auto: true }, `auto${i}`);
        expect(list.versions).toHaveLength(30);
        expect(list.versions[0].id).toBe("named");
        expect(list.versions.some((v) => v.id === "auto0")).toBe(false);
    });

    it("saves an automatic version only after changes and not too often", () => {
        const list = new VersionList();
        expect(list.autoDue(0, 0, 0)).toBe(false);
        expect(list.autoDue(10 * 60_000, 3, 0)).toBe(true);
        list.add(data, { label: "Auto", at: 10 * 60_000, by: "room", auto: true }, "a");
        expect(list.autoDue(11 * 60_000, 5, 3)).toBe(false);
        expect(list.autoDue(21 * 60_000, 5, 3)).toBe(true);
    });
});
