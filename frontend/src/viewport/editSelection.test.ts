import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { nearestVertex } from "./editSelection";
import type { SceneObject } from "../scene/schema";

const box: SceneObject = {
    id: "b",
    name: "Box",
    geometry: { type: "box", width: 1, height: 1, depth: 1 },
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    material: { color: "#ffffff", metalness: 0, roughness: 0.5, opacity: 1 },
};

function camera() {
    const c = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    c.position.set(0, 0.5, 5);
    c.lookAt(0, 0.5, 0);
    c.updateMatrixWorld();
    return c;
}

describe("nearestVertex", () => {
    it("picks the corner under the cursor", () => {
        const cam = camera();
        const corner = new THREE.Vector3(0.5, 1, 0.5).project(cam);
        const hit = nearestVertex(box, cam, new THREE.Vector2(corner.x + 0.01, corner.y), 1, 0.06);
        expect(hit?.world.toArray().map((v) => Math.round(v * 10) / 10)).toEqual([0.5, 1, 0.5]);
    });

    it("returns nothing when the cursor is far from every vertex", () => {
        expect(nearestVertex(box, camera(), new THREE.Vector2(0, 0), 1, 0.06)).toBeNull();
    });

    it("follows the object's transform", () => {
        const cam = camera();
        const moved = { ...box, position: [1, 0.5, 0] as [number, number, number], scale: [2, 1, 1] as [number, number, number] };
        const corner = new THREE.Vector3(2, 1, 0.5).project(cam);
        const hit = nearestVertex(moved, cam, new THREE.Vector2(corner.x, corner.y), 1, 0.06);
        expect(hit?.world.x).toBeCloseTo(2);
    });
});
