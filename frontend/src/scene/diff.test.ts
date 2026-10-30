import { beforeEach, describe, expect, it } from "vitest";
import { emptyDoc, useScene } from "./store";
import { applyDiff, diffDocs, mergeDiffs } from "./diff";
import type { SceneDoc } from "@shapeshift/shared/scene/schema";

const s = () => useScene.getState();
beforeEach(() => s().load(emptyDoc()));

// Stands in for an edit arriving from someone else: it changes the document
// without touching this user's history.
function external(fn: (doc: SceneDoc) => SceneDoc) {
    useScene.setState({ doc: fn(s().doc) });
}

describe("entity history", () => {
    it("undoes only my change after someone else inserted objects before it", () => {
        s().run({ type: "add", primitive: "box", name: "Mine" });
        s().run({ type: "material", target: "Mine", color: "#ff0000" });
        const theirs = { ...s().doc.objects[0], id: "theirs", name: "Theirs" };
        external((d) => ({ ...d, objects: [theirs, ...d.objects] }));
        s().undo();
        expect(s().doc.objects.map((o) => [o.name, o.material.color])).toEqual([
            ["Theirs", "#ff0000"],
            ["Mine", "#c8ccd4"],
        ]);
    });

    it("leaves someone else's edit to another object alone on undo and redo", () => {
        s().run([
            { type: "add", primitive: "box", name: "A" },
            { type: "add", primitive: "box", name: "B" },
        ]);
        s().run({ type: "transform", target: "A", position: [5, 0, 0] });
        external((d) => ({ ...d, objects: d.objects.map((o) => (o.name === "B" ? { ...o, position: [9, 9, 9] } : o)) }));
        s().undo();
        s().redo();
        expect(s().doc.objects.map((o) => o.position)).toEqual([
            [5, 0, 0],
            [9, 9, 9],
        ]);
    });

    it("puts a removed object back where it was", () => {
        s().run([
            { type: "add", primitive: "box", name: "A" },
            { type: "add", primitive: "box", name: "B" },
            { type: "add", primitive: "box", name: "C" },
        ]);
        s().run({ type: "remove", target: "B" });
        s().undo();
        expect(s().doc.objects.map((o) => o.name)).toEqual(["A", "B", "C"]);
    });

    it("merges steps and drops things added then removed", () => {
        const a = emptyDoc();
        const b = { ...a, objects: [{ ...emptyBox("x") }] };
        const c = { ...b, objects: [] };
        const merged = mergeDiffs(diffDocs(a, b), diffDocs(b, c));
        expect(merged.objects).toEqual([]);
        expect(applyDiff(b, diffDocs(a, b), "before")).toEqual(a);
    });
});

function emptyBox(id: string) {
    return {
        id,
        name: id,
        geometry: { type: "box" as const, width: 1, height: 1, depth: 1 },
        position: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
        material: { color: "#ffffff", metalness: 0, roughness: 0.5, opacity: 1 },
    };
}
