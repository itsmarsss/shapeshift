import { describe, expect, it } from "vitest";
import recording from "./fixtures/two-open-hands.json";
import type { HandFrame } from "./gestures";
import { HOLD_MS, isOpenPalm, PalmTracker } from "./palm";

type Recorded = { time: number; hands: HandFrame[] };
const frames = recording as Recorded[];
const openHand = frames[0].hands.find((h) => h.handedness === "Right")!.landmarks;

// Pulls the given landmarks most of the way to the wrist, like curling fingers.
function curled(base: number[], points: number[]): number[] {
    const l = base.slice();
    for (const i of points) {
        l[i * 3] = base[0] + (base[i * 3] - base[0]) * 0.45;
        l[i * 3 + 1] = base[1] + (base[i * 3 + 1] - base[1]) * 0.45;
    }
    return l;
}

const pinch = (base: number[]) => {
    const l = base.slice();
    l[4 * 3] = base[8 * 3];
    l[4 * 3 + 1] = base[8 * 3 + 1];
    return l;
};

describe("open palm", () => {
    it("recognizes the recorded open hands", () => {
        for (const hand of frames[0].hands) expect(isOpenPalm(hand.landmarks)).toBe(true);
    });

    it("doesn't count a fist, a curled finger or a pinch", () => {
        expect(isOpenPalm(curled(openHand, [8, 12, 16, 20]))).toBe(false);
        expect(isOpenPalm(curled(openHand, [16]))).toBe(false);
        expect(isOpenPalm(pinch(openHand))).toBe(false);
    });

    it("fires once after the palm is held, and again only after it closes", () => {
        const t = new PalmTracker();
        const open: HandFrame[] = [{ handedness: "Right", landmarks: openHand }];
        const fist: HandFrame[] = [{ handedness: "Right", landmarks: curled(openHand, [8, 12, 16, 20]) }];
        const fired: (string | null)[] = [];
        for (let time = 0; time <= HOLD_MS + 300; time += 33) fired.push(t.update(open, time));
        expect(fired.filter(Boolean)).toEqual(["Right"]);
        t.update(fist, 1000);
        const again: (string | null)[] = [];
        for (let time = 1033; time <= 1033 + HOLD_MS + 66; time += 33) again.push(t.update(open, time));
        expect(again.filter(Boolean)).toEqual(["Right"]);
    });
});
