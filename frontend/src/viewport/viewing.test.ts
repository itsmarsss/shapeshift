import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { SceneObject, Vec3 } from "@shapeshift/shared/scene/schema";
import { boundsOf, explodeOffsets, sectionPlane, withOffsets } from "./viewing";
import { buildPartTree, ancestorKeys } from "../scene/partTree";

const part = (id: string, position: Vec3, path?: string[]): SceneObject => ({
    id,
    name: id,
    geometry: { type: "box", width: 1, height: 1, depth: 1 },
    position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    material: { color: "#ffffff", metalness: 0, roughness: 1, opacity: 1 },
    path,
});

describe("exploded view", () => {
    const parts = [part("a", [-1, 0.5, 0], ["Robot"]), part("b", [1, 0.5, 0], ["Robot"]), part("c", [0, 2.5, 0], ["Robot"])];

    it("pushes parts away from the middle of their assembly", () => {
        const offsets = explodeOffsets(parts, 1);
        expect(offsets.get("a")).toEqual([-1, -1, 0]);
        expect(offsets.get("b")).toEqual([1, -1, 0]);
        expect(offsets.get("c")).toEqual([0, 1, 0]);
        const moved = withOffsets(parts, explodeOffsets(parts, 0.5));
        expect(moved[0].position).toEqual([-1.5, 0, 0]);
    });

    it("leaves everything alone at zero", () => {
        expect(explodeOffsets(parts, 0).size).toBe(0);
        expect(withOffsets(parts, new Map())).toBe(parts);
    });

    it("explodes each model around its own center", () => {
        const other = [part("d", [10, 0.5, 0], ["Clamp"]), part("e", [12, 0.5, 0], ["Clamp"])];
        const offsets = explodeOffsets([...parts, ...other], 1);
        expect(offsets.get("d")).toEqual([-1, 0, 0]);
        expect(offsets.get("e")).toEqual([1, 0, 0]);
    });
});

describe("section plane", () => {
    const box = new THREE.Box3(new THREE.Vector3(-1, 0, -2), new THREE.Vector3(1, 4, 2));

    it("cuts across the model at the chosen point and keeps one side", () => {
        const plane = sectionPlane(box, { on: true, axis: "y", flip: false, at: 0.25 });
        expect(plane.distanceToPoint(new THREE.Vector3(0, 0.5, 0))).toBeGreaterThan(0);
        expect(plane.distanceToPoint(new THREE.Vector3(0, 1.5, 0))).toBeLessThan(0);
        expect(plane.distanceToPoint(new THREE.Vector3(0, 1, 0))).toBeCloseTo(0);
    });

    it("keeps the other side when flipped", () => {
        const plane = sectionPlane(box, { on: true, axis: "z", flip: true, at: 0.5 });
        expect(plane.distanceToPoint(new THREE.Vector3(0, 0, 1))).toBeGreaterThan(0);
        expect(plane.distanceToPoint(new THREE.Vector3(0, 0, -1))).toBeLessThan(0);
    });

    it("measures the model it cuts", () => {
        const b = boundsOf([part("a", [0, 0.5, 0]), part("b", [3, 0.5, 0])]);
        expect(b.min.toArray()).toEqual([-0.5, 0, -0.5]);
        expect(b.max.toArray()).toEqual([3.5, 1, 0.5]);
    });
});

describe("part tree", () => {
    it("nests parts under their assemblies and groups", () => {
        const objects = [part("bolt1", [0, 0, 0], ["Arm", "Base"]), part("bolt2", [0, 0, 0], ["Arm", "Base"]), part("lid", [0, 0, 0], ["Arm"]), { ...part("box", [0, 0, 0]), group: "Toys" }, part("ball", [0, 0, 0])];
        const tree = buildPartTree(objects);
        expect(tree.map((n) => n.name)).toEqual(["Arm", "Toys", "ball"]);
        const arm = tree[0];
        expect(arm.ids).toEqual(["bolt1", "bolt2", "lid"]);
        expect(arm.children.map((n) => n.name)).toEqual(["Base", "lid"]);
        expect(arm.children[0].children.map((n) => n.object?.id)).toEqual(["bolt1", "bolt2"]);
        expect(arm.children[0].depth).toBe(1);
        expect(ancestorKeys(objects[0])).toEqual(["/Arm", "/Arm/Base"]);
    });
});
