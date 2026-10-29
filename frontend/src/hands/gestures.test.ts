import { describe, expect, it } from "vitest";
import recording from "./fixtures/two-open-hands.json";
import { GestureTracker, PINCH_END, PINCH_START, pinchRatio, type HandFrame } from "./gestures";

type Recorded = { time: number; hands: HandFrame[] };
const frames = recording as Recorded[];
const openHand = frames[0].hands.find((h) => h.handedness === "Right")!.landmarks;

function rng(seed: number) {
    return () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296 - 0.5;
    };
}

function withPinch(base: number[], amount: number): number[] {
    const l = base.slice();
    for (const i of [3, 4]) {
        l[i * 3] += (base[8 * 3] - base[i * 3]) * amount * (i === 4 ? 1 : 0.6);
        l[i * 3 + 1] += (base[8 * 3 + 1] - base[i * 3 + 1]) * amount * (i === 4 ? 1 : 0.6);
    }
    return l;
}

function shift(l: number[], dx: number, dy: number, jitter = 0, rand = rng(1)) {
    return l.map((v, i) => v + (i % 3 === 0 ? dx : i % 3 === 1 ? dy : 0) + rand() * jitter);
}

function amountForRatio(target: number) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (pinchRatio(withPinch(openHand, mid)) > target) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

function replay(seq: (number[] | null)[]) {
    const tracker = new GestureTracker();
    return seq.map((l, i) => tracker.update(l ? [{ handedness: "Right", landmarks: l }] : [], i * 33)[0] ?? null);
}

describe("recorded stream", () => {
    it("never pinches with two open hands", () => {
        const tracker = new GestureTracker();
        for (const f of frames) {
            const states = tracker.update(f.hands, f.time);
            expect(states.every((s) => !s.pinching)).toBe(true);
        }
    });
});

describe("pinch state machine", () => {
    const rand = rng(7);

    it("ignores a resting hand with tracking noise", () => {
        const seq = Array.from({ length: 120 }, () => shift(openHand, 0, 0, 0.004, rand));
        expect(replay(seq).some((s) => s?.pinching)).toBe(false);
    });

    it("pinches once, drags, and releases once", () => {
        const pinched = withPinch(openHand, 1);
        const seq = [
            ...Array.from({ length: 10 }, () => shift(openHand, 0, 0, 0.002, rand)),
            ...Array.from({ length: 6 }, (_, i) => withPinch(openHand, (i + 1) / 6)),
            ...Array.from({ length: 20 }, (_, i) => shift(pinched, i * 0.01, 0, 0.002, rand)),
            ...Array.from({ length: 6 }, (_, i) => shift(withPinch(openHand, 1 - (i + 1) / 6), 0.2, 0)),
            ...Array.from({ length: 10 }, () => shift(openHand, 0.2, 0, 0.002, rand)),
        ];
        const states = replay(seq);
        const flips = states.filter((s, i) => i > 0 && s?.pinching !== states[i - 1]?.pinching);
        expect(flips).toHaveLength(2);
        const during = states.filter((s) => s?.pinching).map((s) => s!.x);
        expect(during[during.length - 1]).toBeLessThan(during[0]);
    });

    it("does not flicker between the start and end thresholds", () => {
        const low = amountForRatio(PINCH_START + 0.02);
        const high = amountForRatio(PINCH_END - 0.02);
        const seq = Array.from({ length: 60 }, (_, i) => withPinch(openHand, i % 2 ? low : high));
        expect(replay(seq).some((s) => s?.pinching)).toBe(false);
    });

    it("needs two frames below the threshold to start", () => {
        const pinched = withPinch(openHand, 1);
        const states = replay([openHand, pinched, openHand, pinched, pinched]);
        expect(states.map((s) => s?.pinching)).toEqual([false, false, false, false, true]);
    });

    it("rides out brief tracking dropouts but releases when the hand is gone", () => {
        const pinched = withPinch(openHand, 1);
        const states = replay([pinched, pinched, null, null, null, pinched, ...Array(8).fill(null)]);
        expect(states[5]?.pinching).toBe(true);
        expect(states[states.length - 1]).toBeNull();
    });
});

describe("thresholds", () => {
    it("keep a relaxed hand well clear of the release threshold", () => {
        for (const h of frames[0].hands) expect(pinchRatio(h.landmarks)).toBeGreaterThan(PINCH_END + 0.05);
    });
});

describe("pinch start position", () => {
    it("remembers where each pinch began, even after the hand moves", () => {
        const pinched = withPinch(openHand, 1);
        const states = replay([openHand, pinched, pinched, shift(pinched, 0.1, 0), shift(pinched, 0.2, 0)]);
        const last = states[states.length - 1]!;
        expect(last.pinchId).toBe(1);
        expect(last.startX).toBeCloseTo(states[2]!.x, 5);
        expect(last.x).toBeLessThan(last.startX);
    });
});
