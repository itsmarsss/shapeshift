import { describe, expect, it } from "vitest";
import { emptyOps, ClientMessage, type Ops } from "../src/collab/protocol";
import { RoomState } from "./roomState";
import type { SceneObject } from "../src/scene/schema";

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
