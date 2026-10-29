import { describe, expect, it } from "vitest";
import type { HandState } from "./gestures";
import { IntentTracker } from "./intents";

function hand(handedness: "Left" | "Right", pinching: boolean, x: number, y: number, pinchId: number, start = [x, y]): HandState {
    return { handedness, pinching, x, y, pinchId, startX: start[0], startY: start[1] };
}

describe("intents", () => {
    it("starts at the pinch start point and moves by the deltas", () => {
        const t = new IntentTracker();
        const first = t.update([hand("Right", true, 0.55, 0.5, 1, [0.5, 0.5])]);
        expect(first).toEqual([
            { type: "start", handedness: "Right", x: 0.5, y: 0.5 },
            { type: "move", x: 0.55, y: 0.5, dx: expect.closeTo(0.05), dy: 0 },
        ]);
        expect(t.update([hand("Right", true, 0.6, 0.5, 1, [0.5, 0.5])])).toEqual([
            { type: "move", x: 0.6, y: 0.5, dx: expect.closeTo(0.05), dy: 0 },
        ]);
        expect(t.update([hand("Right", false, 0.6, 0.5, 1)])).toEqual([{ type: "end" }]);
    });

    it("does nothing with the leftover hand after a two-hand gesture", () => {
        const t = new IntentTracker();
        t.update([hand("Left", true, 0.3, 0.5, 1), hand("Right", true, 0.7, 0.5, 1)]);
        const pan = t.update([hand("Left", true, 0.2, 0.4, 1, [0.3, 0.5]), hand("Right", true, 0.8, 0.4, 1, [0.7, 0.5])]);
        expect(pan).toEqual([{ type: "pair", zoom: expect.closeTo(0.2), panX: expect.closeTo(0), panY: expect.closeTo(-0.1) }]);
        const leftover = [
            t.update([hand("Left", false, 0.2, 0.4, 1), hand("Right", true, 0.8, 0.4, 1, [0.7, 0.5])]),
            t.update([hand("Left", false, 0.2, 0.4, 1), hand("Right", true, 0.85, 0.45, 1, [0.7, 0.5])]),
            t.update([hand("Right", false, 0.85, 0.45, 1)]),
        ];
        expect(leftover.flat()).toEqual([]);
    });

    it("ends a one-hand drag when the second hand joins", () => {
        const t = new IntentTracker();
        t.update([hand("Right", true, 0.5, 0.5, 1)]);
        expect(t.update([hand("Right", true, 0.5, 0.5, 1), hand("Left", true, 0.3, 0.5, 1)])).toEqual([{ type: "end" }]);
    });

    it("lets the leftover hand act again after it re-pinches", () => {
        const t = new IntentTracker();
        t.update([hand("Left", true, 0.3, 0.5, 1), hand("Right", true, 0.7, 0.5, 1)]);
        t.update([hand("Right", true, 0.7, 0.5, 1)]);
        t.update([hand("Right", false, 0.7, 0.5, 1)]);
        expect(t.update([hand("Right", true, 0.6, 0.5, 2)])[0]).toEqual({ type: "start", handedness: "Right", x: 0.6, y: 0.5 });
    });
});
