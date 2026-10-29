import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { toThreeScene } from "./io";

describe("export", () => {
    it("exports lights pointing at their aim", () => {
        const scene = toThreeScene({
            version: 2,
            objects: [],
            environment: "none",
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
