import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { cutGeometries, cutSolid, holeGroups, solidMeshes } from "./holes";
import { emptyDoc, useScene } from "./store";
import { stlBuffer, toThreeScene } from "./io";

const s = () => useScene.getState();
const get = (name: string) => s().doc.objects.find((o) => o.name === name)!;

function volume(geometry: THREE.BufferGeometry) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.getAttribute("position");
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let v = 0;
    for (let i = 0; i < p.count; i += 3) v += a.fromBufferAttribute(p, i).dot(b.fromBufferAttribute(p, i + 1).cross(c.fromBufferAttribute(p, i + 2))) / 6;
    return v;
}

beforeEach(() => {
    s().load(emptyDoc());
    s().run([
        { type: "add", primitive: "box", name: "Block", geometry: { type: "box", width: 2, height: 1, depth: 2 }, position: [0, 0.5, 0] },
        { type: "add", primitive: "box", name: "Cutter", position: [0, 0.5, 0], scale: [1, 2, 1] },
    ]);
    s().run({ type: "hole", target: "Cutter", hole: true });
});

describe("holes", () => {
    it("only cuts once solids and holes share a group", () => {
        expect(cutGeometries(s().doc.objects).size).toBe(0);
        s().run({ type: "group", name: "Part", targets: ["Block", "Cutter"] });
        expect(holeGroups(s().doc.objects).get("Part")?.holes.map((o) => o.name)).toEqual(["Cutter"]);
        const cut = cutGeometries(s().doc.objects).get(get("Block").id)!;
        expect(volume(cut)).toBeCloseTo(3, 3);
    });

    it("reuses the result when the whole group moves", () => {
        s().run({ type: "group", name: "Part", targets: ["Block", "Cutter"] });
        const first = cutSolid(get("Block"), [get("Cutter")]);
        s().run({ type: "transform", target: "Cutter", position: [1, 0, 0], relative: true });
        const moved = cutSolid(get("Block"), [get("Cutter")])!;
        expect(moved).not.toBe(first);
        expect(volume(moved)).toBeCloseTo(3.5, 3);
        s().run({ type: "transform", target: "Part", position: [5, 2, -3], rotation: [0, 1, 0], relative: true });
        expect(cutSolid(get("Block"), [get("Cutter")])).toBe(moved);
    });

    it("restores the parts when ungrouped", () => {
        s().run({ type: "group", name: "Part", targets: ["Block", "Cutter"] });
        s().run({ type: "ungroup", target: "Part" });
        expect(cutGeometries(s().doc.objects).size).toBe(0);
        expect(get("Block").geometry).toEqual({ type: "box", width: 2, height: 1, depth: 2 });
    });

    it("exports the cut solids and leaves holes out", async () => {
        s().run({ type: "group", name: "Part", targets: ["Block", "Cutter"] });
        const meshes = solidMeshes(s().doc.objects);
        expect(meshes.map((m) => m.object.name)).toEqual(["Block"]);
        const scene = toThreeScene(s().doc);
        expect(scene.children.filter((c) => c instanceof THREE.Mesh).map((c) => c.name)).toEqual(["Block"]);
        const stl = await stlBuffer(s().doc, { size: 100 });
        const triangles = stl.getUint32(80, true);
        expect(triangles).toBeGreaterThan(12);
    });
});
