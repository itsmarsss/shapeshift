import { describe, expect, it } from "vitest";
import recording from "./fixtures/two-open-hands.json";
import { handDistance, WEBCAM_FOV } from "./depth";

type Recorded = { time: number; hands: { handedness: string; landmarks: number[] }[] };
const frames = recording as Recorded[];
const real = frames[0].hands[0].landmarks;

// A synthetic hand: world landmarks in meters, projected through a pinhole
// camera at `distance`, optionally turned around the vertical axis.
function project(distance: number, turn = 0, aspect = 16 / 9) {
    const world: number[] = [];
    for (let i = 0; i < 21; i++) {
        // Build a plausible flat hand from the recorded one, centered and scaled to about 18 cm.
        const x = (real[i * 3] - real[0]) * 0.9;
        const y = (real[i * 3 + 1] - real[1]) * 0.9;
        world.push(x * Math.cos(turn), y, x * Math.sin(turn));
    }
    const focal = 1 / (2 * Math.tan(WEBCAM_FOV / 2));
    const image: number[] = [];
    for (let i = 0; i < 21; i++) {
        const z = distance + world[i * 3 + 2];
        image.push(0.5 + (focal * world[i * 3]) / z, 0.5 + (focal * world[i * 3 + 1] * aspect) / z, 0);
    }
    return { world, image, aspect };
}

describe("hand distance", () => {
    it("recovers the distance of a hand facing the camera", () => {
        for (const d of [0.3, 0.5, 0.9]) {
            const { image, world, aspect } = project(d);
            expect(handDistance(image, world, aspect)).toBeCloseTo(d, 2);
        }
    });

    it("barely changes when the hand turns", () => {
        const at = (turn: number) => {
            const { image, world, aspect } = project(0.6, turn);
            return handDistance(image, world, aspect)!;
        };
        const flat = at(0);
        const turned = at(0.9);
        expect(Math.abs(turned - flat) / flat).toBeLessThan(0.01);
    });

    it("gets closer as the hand gets bigger, even without world landmarks", () => {
        const far = handDistance(real, undefined, 16 / 9)!;
        const scaled = real.map((v, i) => (i % 3 === 2 ? v : 0.5 + (v - 0.5) * 2));
        const near = handDistance(scaled, undefined, 16 / 9)!;
        expect(near).toBeCloseTo(far / 2, 3);
        expect(far).toBeGreaterThan(0.1);
        expect(far).toBeLessThan(3);
    });
});
