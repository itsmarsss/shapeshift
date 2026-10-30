import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { SceneDoc } from "@shapeshift/shared/scene/schema";
import { toThreeScene } from "./io";

describe("export", () => {
    it("exports lights pointing at their aim", () => {
        const scene = toThreeScene({
            version: 2,
            objects: [],
            environment: "none",
            animation: { duration: 4, loop: true, tracks: [] },
            lights: [{ id: "l", name: "Key", type: "spot", position: [0, 5, 0], aim: [0, 0, 0], color: "#ffffff", intensity: 40, distance: 0, angle: 0.5 }],
        });
        const light = scene.getObjectByName("Key") as THREE.SpotLight;
        expect(light.isSpotLight).toBe(true);
        expect(light.angle).toBe(0.5);
        // glTF lights shine down -Z, which should now point straight down.
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(light.quaternion);
        expect(forward.y).toBeCloseTo(-1);
    });
});

describe("animation export", () => {
    it("samples transform tracks into a clip named after each object", async () => {
        const { animationClip } = await import("./clip");
        const clip = animationClip({
            version: 2,
            environment: "none",
            lights: [],
            objects: [
                {
                    id: "b",
                    name: "Box",
                    geometry: { type: "box", width: 1, height: 1, depth: 1 },
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                    material: { color: "#ffffff", metalness: 0, roughness: 0.5, opacity: 1 },
                },
            ],
            animation: {
                duration: 2,
                loop: true,
                tracks: [
                    { target: "b", property: "position", keys: [{ time: 0, value: [0, 0, 0], easing: "linear" }, { time: 1, value: [3, 0, 0] }] },
                    { target: "b", property: "rotation", keys: [{ time: 0, value: [0, 0, 0] }, { time: 2, value: [0, Math.PI, 0] }] },
                    { target: "b", property: "color", keys: [{ time: 0, value: "#000000" }] },
                ],
            },
        })!;
        expect(clip.duration).toBe(2);
        expect(clip.tracks.map((t) => t.name)).toEqual(["Box.position", "Box.quaternion"]);
        expect(clip.tracks[0].times).toHaveLength(31);
        expect(Array.from(clip.tracks[0].values.slice(-3))).toEqual([3, 0, 0]);
    });
});

describe("3D print export", () => {
    const doc = (): SceneDoc => ({
        version: 2,
        environment: "none",
        lights: [],
        animation: { duration: 4, loop: true, tracks: [] },
        objects: [
            {
                id: "a",
                name: "Tower",
                geometry: { type: "box", width: 1, height: 2, depth: 1 },
                position: [3, 1, 0],
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
                material: { color: "#ffffff", metalness: 0, roughness: 0.6, opacity: 1 },
            },
            {
                id: "b",
                name: "Ball",
                geometry: { type: "sphere", radius: 0.5 },
                position: [-3, 0.5, 0],
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
                material: { color: "#ffffff", metalness: 0, roughness: 0.6, opacity: 1 },
            },
        ],
    });

    async function bounds(data: DataView) {
        const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
        const geometry = new STLLoader().parse(data.buffer as ArrayBuffer);
        geometry.computeBoundingBox();
        return geometry.boundingBox!;
    }

    it("scales the print to its longest side, standing upright on the bed", async () => {
        const { stlBuffer } = await import("./io");
        const box = await bounds(await stlBuffer(doc(), { size: 100, ids: ["a"] }));
        // 2 tall becomes 100 mm along Z, the slicer's up axis.
        expect(box.max.z - box.min.z).toBeCloseTo(100, 3);
        expect(box.min.z).toBeCloseTo(0, 3);
        expect(box.max.x - box.min.x).toBeCloseTo(50, 3);
        expect((box.max.x + box.min.x) / 2).toBeCloseTo(0, 3);
    });

    it("prints every object when none are picked", async () => {
        const { stlBuffer } = await import("./io");
        const box = await bounds(await stlBuffer(doc(), { size: 80 }));
        // From x = -3.5 to 3.5 is the longest side.
        expect(box.max.x - box.min.x).toBeCloseTo(80, 3);
    });
});
