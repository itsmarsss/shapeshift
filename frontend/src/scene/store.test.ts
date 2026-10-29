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

    it("adds primitives with explicit dimensions resting on the ground", () => {
        s().run({ type: "add", primitive: "cylinder", geometry: { type: "cylinder", radiusTop: 0.1, radiusBottom: 0.3, height: 2 } });
        expect(s().doc.objects[0].geometry).toEqual({ type: "cylinder", radiusTop: 0.1, radiusBottom: 0.3, height: 2 });
        expect(s().doc.objects[0].position[1]).toBe(1);
        const [r] = s().run({ type: "add", primitive: "box", geometry: { type: "sphere", radius: 1 } });
        expect(r.ok).toBe(false);
    });

    it("duplicates an object that was already edited", () => {
        s().run({ type: "add", primitive: "box" });
        s().run({ type: "transform", target: "Box", position: [1, 0, 0] });
        const [r] = s().run({ type: "duplicate", target: "Box", offset: [1, 0, 0] });
        expect(r.ok).toBe(true);
        expect(s().doc.objects.map((o) => o.position[0])).toEqual([1, 2]);
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

describe("edit geometry", () => {
    it("welds primitives into editable meshes with shared vertices", async () => {
        const { editableMesh } = await import("./geometry");
        const box = editableMesh({ type: "box", width: 1, height: 1, depth: 1 });
        expect(box.positions.length / 3).toBe(8);
        expect(box.indices.length / 3).toBe(12);
    });
});

describe("lights", () => {
    it("adds lights with defaults and lets every light field change", () => {
        s().run({ type: "addLight", light: "spot", name: "Key", color: "#ffeedd" });
        const key = s().doc.lights[0];
        expect(key).toMatchObject({ name: "Key", type: "spot", color: "#ffeedd", aim: [0, 0, 0] });
        expect(s().selectedId).toBe(key.id);
        s().run({ type: "updateLight", target: "key", intensity: 80, aim: [1, 0, 0], angle: 0.3 });
        expect(s().doc.lights[0]).toMatchObject({ intensity: 80, aim: [1, 0, 0], angle: 0.3 });
    });

    it("moves, renames, duplicates and removes lights with the object commands", () => {
        s().run({ type: "addLight", light: "point" });
        s().run({ type: "transform", target: "Point Light", position: [0, 1, 0], relative: true });
        expect(s().doc.lights[0].position).toEqual([2, 4, 2]);
        s().run({ type: "rename", target: "Point Light", name: "Bulb" });
        s().run({ type: "duplicate", target: "Bulb" });
        expect(s().doc.lights.map((l) => l.name)).toEqual(["Bulb", "Bulb 2"]);
        s().run({ type: "remove", target: "Bulb" });
        expect(s().doc.lights.map((l) => l.name)).toEqual(["Bulb 2"]);
        s().undo();
        expect(s().doc.lights).toHaveLength(2);
    });

    it("keeps object and light names apart and rejects mixed-up commands", () => {
        s().run({ type: "add", primitive: "box", name: "Lamp" });
        s().run({ type: "addLight", light: "point", name: "Lamp" });
        expect(s().doc.lights[0].name).toBe("Lamp 2");
        expect(s().run({ type: "updateLight", target: "Lamp", intensity: 1 })[0].ok).toBe(false);
        expect(s().run({ type: "material", target: "Lamp 2", color: "#ff0000" })[0].ok).toBe(false);
    });

    it("loads scenes saved before lights existed", () => {
        expect(SceneDoc.parse({ version: 2, objects: [] }).lights).toEqual([]);
    });
});

describe("groups", () => {
    function chair() {
        s().run([
            { type: "add", primitive: "box", name: "Seat", group: "Chair", position: [0, 1, 0] },
            { type: "add", primitive: "box", name: "Back", group: "Chair", position: [0, 2, -1] },
        ]);
    }

    it("targets every member by the group name", () => {
        chair();
        s().run({ type: "material", target: "chair", color: "#8b5a2b" });
        expect(s().doc.objects.map((o) => o.material.color)).toEqual(["#8b5a2b", "#8b5a2b"]);
        s().run({ type: "transform", target: "Chair", position: [2, 0, 0], relative: true });
        expect(s().doc.objects.map((o) => o.position)).toEqual([
            [2, 1, 0],
            [2, 2, -1],
        ]);
    });

    it("moves a group to an absolute spot by its center", () => {
        chair();
        s().run({ type: "transform", target: "Chair", position: [5, 1.5, -0.5] });
        expect(s().doc.objects.map((o) => o.position)).toEqual([
            [5, 1, 0],
            [5, 2, -1],
        ]);
    });

    it("turns a group around its center", () => {
        chair();
        s().run({ type: "transform", target: "Chair", rotation: [0, Math.PI, 0], relative: true });
        const [seat, back] = s().doc.objects;
        expect(back.position[2]).toBeCloseTo(0);
        expect(seat.position[2]).toBeCloseTo(-1);
        expect(Math.abs(back.rotation[1]) + Math.abs(back.rotation[0])).toBeGreaterThan(3);
        expect(s().run({ type: "transform", target: "Chair", rotation: [0, 1, 0] })[0].ok).toBe(false);
    });

    it("groups, duplicates, renames, ungroups and removes", () => {
        s().run([
            { type: "add", primitive: "sphere", name: "Wheel A" },
            { type: "add", primitive: "sphere", name: "Wheel B" },
            { type: "add", primitive: "box", name: "Body" },
        ]);
        s().run({ type: "group", name: "Car", targets: ["Wheel A", "Wheel B", "Body"] });
        expect(s().run({ type: "group", name: "Body", targets: ["Wheel A"] })[0].ok).toBe(false);
        const [dup] = s().run({ type: "duplicate", target: "Car" });
        expect(dup.ok && dup.created).toHaveLength(3);
        expect(s().doc.objects.filter((o) => o.group === "Car 2")).toHaveLength(3);
        s().run({ type: "rename", target: "Car 2", name: "Truck" });
        s().run({ type: "ungroup", target: "Car" });
        expect(s().doc.objects.filter((o) => o.group === undefined)).toHaveLength(3);
        s().run({ type: "remove", target: "Truck" });
        expect(s().doc.objects).toHaveLength(3);
        s().undo();
        expect(s().doc.objects).toHaveLength(6);
    });
});

describe("selection", () => {
    it("toggles extra objects in and keeps the last one primary", () => {
        s().run([
            { type: "add", primitive: "box", name: "A" },
            { type: "add", primitive: "box", name: "B" },
        ]);
        const [a, b] = s().doc.objects.map((o) => o.id);
        s().select(a);
        s().select(b, { toggle: true });
        expect(s().selectedIds).toEqual([a, b]);
        expect(s().selectedId).toBe(b);
        s().select(b, { toggle: true });
        expect(s().selectedIds).toEqual([a]);
        expect(s().selectedId).toBe(a);
    });

    it("drops removed objects from the selection", () => {
        s().run([
            { type: "add", primitive: "box", name: "A" },
            { type: "add", primitive: "box", name: "B" },
        ]);
        s().selectMany(s().doc.objects.map((o) => o.id));
        s().run({ type: "remove", target: "B" });
        expect(s().selectedIds).toEqual([s().doc.objects[0].id]);
    });
});
