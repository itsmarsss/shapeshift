import { beforeEach, describe, expect, it } from "vitest";
import { Command, SceneDoc } from "./schema";
import { emptyDoc, useScene } from "./store";

const s = () => useScene.getState();

beforeEach(() => s().load(emptyDoc()));

describe("commands", () => {
    it("adds objects with unique names and selects the new one", () => {
        s().run({ type: "add", primitive: "box" });
        s().run({ type: "add", primitive: "box" });
        expect(s().doc.objects.map((o) => o.name)).toEqual(["Box", "Box 2"]);
        expect(s().doc.objects[1].position).not.toEqual(s().doc.objects[0].position);
        expect(s().selectedId).toBe(s().doc.objects[1].id);
    });

    it("targets objects by id or name, case-insensitively", () => {
        s().run({ type: "add", primitive: "sphere", name: "Moon" });
        s().run({ type: "material", target: "moon", color: "#ff0000" });
        expect(s().doc.objects[0].material.color).toBe("#ff0000");
    });

    it("applies relative transforms", () => {
        s().run({ type: "add", primitive: "box", position: [1, 0, 0] });
        s().run({ type: "transform", target: "Box", position: [1, 2, 0], scale: [2, 2, 2], relative: true });
        const o = s().doc.objects[0];
        expect(o.position).toEqual([2, 2, 0]);
        expect(o.scale).toEqual([2, 2, 2]);
    });

    it("reports missing targets without changing the scene", () => {
        const [r] = s().run({ type: "remove", target: "nope" });
        expect(r.ok).toBe(false);
        expect(s().past).toHaveLength(0);
    });

    it("clears the selection when the selected object is removed", () => {
        s().run({ type: "add", primitive: "box" });
        s().run({ type: "remove", target: "Box" });
        expect(s().selectedId).toBeNull();
    });
});

describe("history", () => {
    it("undoes and redoes every kind of change", () => {
        s().run({ type: "add", primitive: "box" });
        s().run({ type: "rename", target: "Box", name: "Crate" });
        s().run({ type: "material", target: "Crate", roughness: 0.1 });
        s().undo();
        expect(s().doc.objects[0].material.roughness).toBe(0.6);
        s().undo();
        expect(s().doc.objects[0].name).toBe("Box");
        s().undo();
        expect(s().doc.objects).toHaveLength(0);
        s().redo();
        s().redo();
        expect(s().doc.objects[0].name).toBe("Crate");
    });

    it("treats a batch of commands as one step", () => {
        s().run([
            { type: "add", primitive: "box" },
            { type: "add", primitive: "sphere" },
        ]);
        expect(s().past).toHaveLength(1);
        s().undo();
        expect(s().doc.objects).toHaveLength(0);
    });

    it("coalesces a drag into one step until it ends", () => {
        s().run({ type: "add", primitive: "box", position: [0, 0, 0] });
        for (let x = 1; x <= 5; x++) s().run({ type: "transform", target: "Box", position: [x, 0, 0] }, { coalesce: "drag" });
        s().endCoalesce();
        s().run({ type: "transform", target: "Box", position: [9, 0, 0] }, { coalesce: "drag" });
        expect(s().past).toHaveLength(3);
        s().undo();
        expect(s().doc.objects[0].position).toEqual([5, 0, 0]);
        s().undo();
        expect(s().doc.objects[0].position).toEqual([0, 0, 0]);
    });

    it("drops the redo stack after a new change", () => {
        s().run({ type: "add", primitive: "box" });
        s().undo();
        s().run({ type: "add", primitive: "cone" });
        s().redo();
        expect(s().doc.objects.map((o) => o.name)).toEqual(["Cone"]);
    });
});

describe("schema", () => {
    it("rejects bad commands", () => {
        expect(Command.safeParse({ type: "material", target: "a", color: "red" }).success).toBe(false);
        expect(Command.safeParse({ type: "add", primitive: "teapot" }).success).toBe(false);
    });

    it("round-trips a document", () => {
        s().run({ type: "add", primitive: "torus" });
        expect(SceneDoc.parse(JSON.parse(JSON.stringify(s().doc)))).toEqual(s().doc);
    });
});

describe("booleans and insert", () => {
    it("subtracts one object from another and removes the tool", () => {
        s().run({ type: "add", primitive: "box", position: [0, 0, 0] });
        s().run({ type: "add", primitive: "sphere", position: [0.5, 0, 0] });
        const [r] = s().run({ type: "boolean", operation: "subtract", target: "Box", tool: "Sphere" });
        expect(r.ok).toBe(true);
        expect(s().doc.objects).toHaveLength(1);
        const g = s().doc.objects[0].geometry;
        expect(g.type).toBe("mesh");
        if (g.type === "mesh") expect(g.indices.length % 3).toBe(0);
        s().undo();
        expect(s().doc.objects.map((o) => o.geometry.type)).toEqual(["box", "sphere"]);
    });

    it("inserts objects with fresh ids", () => {
        s().run({ type: "add", primitive: "box" });
        const copy = structuredClone(s().doc.objects[0]);
        s().run({ type: "insert", objects: [copy] });
        const ids = s().doc.objects.map((o) => o.id);
        expect(new Set(ids).size).toBe(2);
        expect(s().doc.objects[1].name).toBe("Box 2");
    });
});
