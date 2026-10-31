import { describe, expect, it } from "vitest";
import type { HandState } from "./gestures";
import { IntentTracker } from "./intents";

function hand(handedness: "Left" | "Right", pinching: boolean, x: number, y: number, pinchId: number, start = [x, y], depth: [number, number] | null = null): HandState {
    return { handedness, pinching, x, y, pinchId, startX: start[0], startY: start[1], depth: depth?.[1] ?? null, startDepth: depth?.[0] ?? null };
}

describe("intents", () => {
    it("starts at the pinch start point and moves by the deltas", () => {
        const t = new IntentTracker();
        const first = t.update([hand("Right", true, 0.55, 0.5, 1, [0.5, 0.5])]);
        expect(first).toEqual([
            { type: "start", handedness: "Right", x: 0.5, y: 0.5, depth: null },
            { type: "move", x: 0.55, y: 0.5, dx: expect.closeTo(0.05), dy: 0, depth: 0 },
        ]);
        expect(t.update([hand("Right", true, 0.6, 0.5, 1, [0.5, 0.5])])).toEqual([
            { type: "move", x: 0.6, y: 0.5, dx: expect.closeTo(0.05), dy: 0, depth: 0 },
        ]);
        expect(t.update([hand("Right", false, 0.6, 0.5, 1)])).toEqual([{ type: "end" }]);
    });

    it("does nothing with the leftover hand after a two-hand gesture", () => {
        const t = new IntentTracker();
        expect(t.update([hand("Left", true, 0.3, 0.5, 1), hand("Right", true, 0.7, 0.5, 1)])).toEqual([{ type: "pairStart", holding: null }]);
        const pan = t.update([hand("Left", true, 0.2, 0.4, 1, [0.3, 0.5]), hand("Right", true, 0.8, 0.4, 1, [0.7, 0.5])]);
        expect(pan).toEqual([{ type: "pair", zoom: expect.closeTo(0.2), panX: expect.closeTo(0), panY: expect.closeTo(-0.1), scale: expect.closeTo(1.5), twist: expect.closeTo(0) }]);
        const leftover = [
            t.update([hand("Left", false, 0.2, 0.4, 1), hand("Right", true, 0.85, 0.45, 1, [0.7, 0.5])]),
            t.update([hand("Right", false, 0.85, 0.45, 1)]),
        ];
        // The pair ends once; the hand still pinching does nothing until it pinches again.
        expect(leftover.flat()).toEqual([{ type: "end" }]);
    });

    it("hands a one-hand drag to both hands when the second joins, naming the holder", () => {
        const t = new IntentTracker();
        t.update([hand("Right", true, 0.5, 0.5, 1)]);
        expect(t.update([hand("Right", true, 0.5, 0.5, 1), hand("Left", true, 0.3, 0.5, 1)])).toEqual([{ type: "pairStart", holding: "Right" }]);
    });

    it("measures a twist of the hands, clockwise on screen", () => {
        const t = new IntentTracker();
        t.update([hand("Left", true, 0.3, 0.5, 1), hand("Right", true, 0.7, 0.5, 1)]);
        // The right hand goes down and the left up: a quarter turn clockwise.
        const [turn] = t.update([hand("Left", true, 0.5, 0.3, 1), hand("Right", true, 0.5, 0.7, 1)]);
        expect(turn).toMatchObject({ type: "pair", twist: expect.closeTo(Math.PI / 2), scale: expect.closeTo(1) });
    });

    it("lets the leftover hand act again after it re-pinches", () => {
        const t = new IntentTracker();
        t.update([hand("Left", true, 0.3, 0.5, 1), hand("Right", true, 0.7, 0.5, 1)]);
        t.update([hand("Right", true, 0.7, 0.5, 1)]);
        t.update([hand("Right", false, 0.7, 0.5, 1)]);
        expect(t.update([hand("Right", true, 0.6, 0.5, 2)])[0]).toEqual({ type: "start", handedness: "Right", x: 0.6, y: 0.5, depth: null });
    });

    it("reports how much closer the hand is, ignoring small wobbles", () => {
        const t = new IntentTracker();
        t.update([hand("Right", true, 0.5, 0.5, 1, [0.5, 0.5], [0.6, 0.6])]);
        const [wobble] = t.update([hand("Right", true, 0.5, 0.5, 1, [0.5, 0.5], [0.6, 0.59])]);
        expect(wobble).toMatchObject({ type: "move", depth: 0 });
        const [pulled] = t.update([hand("Right", true, 0.5, 0.5, 1, [0.5, 0.5], [0.6, 0.45])]);
        expect(pulled).toMatchObject({ type: "move", depth: expect.closeTo(0.135) });
        const [pushed] = t.update([hand("Right", true, 0.5, 0.5, 1, [0.5, 0.5], [0.6, 0.7])]);
        expect(pushed).toMatchObject({ type: "move", depth: expect.closeTo(-0.085) });
    });
});
