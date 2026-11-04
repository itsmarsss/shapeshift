import { describe, expect, it } from "vitest";
import recording from "./fixtures/two-open-hands.json";
import type { HandFrame } from "./gestures";
import { handRatio } from "./contact";
import { POSES, PoseTracker, TOUCH, type Pose } from "./poses";

type Recorded = { time: number; hands: HandFrame[] };
const frames = recording as Recorded[];
const openHand = frames[0].hands.find((h) => h.handedness === "Right")!.landmarks;

// Moves the thumb tip (and a little of the joint below it) onto a fingertip.
function touching(base: number[], fingertip: number, amount = 1): number[] {
    const l = base.slice();
    for (const i of [3, 4]) {
        const k = amount * (i === 4 ? 1 : 0.6);
        l[i * 3] += (base[fingertip * 3] - base[i * 3]) * k;
        l[i * 3 + 1] += (base[fingertip * 3 + 1] - base[i * 3 + 1]) * k;
    }
    return l;
}

const right = (l: number[], world?: number[]): HandFrame[] => [{ handedness: "Right", landmarks: l, world }];

function run(seq: number[][], world?: (l: number[]) => number[]) {
    const tracker = new PoseTracker();
    return seq.flatMap((l, i) => tracker.update(right(l, world?.(l)), i * 33).map((e) => e.pose));
}

// Moves the thumb most of the way, stopping a little short of the fingertip.
function nearly(fingertip: number) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (handRatio(touching(openHand, fingertip, mid), undefined, 4, fingertip) > TOUCH + 0.04) lo = mid;
        else hi = mid;
    }
    return touching(openHand, fingertip, lo);
}

describe("poses", () => {
    it("recognizes each finger touching the thumb", () => {
        for (const pose of Object.keys(POSES) as Pose[]) expect(run(Array(12).fill(touching(openHand, POSES[pose])))).toEqual([pose]);
        expect(run(Array(30).fill(openHand))).toEqual([]);
    });

    it("never fires on a thumb-index pinch", () => {
        expect(run(Array(30).fill(touching(openHand, 8)))).toEqual([]);
    });

    it("counts a quick close that stops just short, but not a hand resting that way", () => {
        const short = nearly(POSES.mode);
        expect(run([...Array(6).fill(openHand), ...Array(12).fill(short)])).toEqual(["mode"]);
        expect(run(Array(30).fill(short))).toEqual([]);
    });

    it("goes by real space when there are world landmarks", () => {
        // Apart in the picture but touching for real, as with a turned hand.
        expect(run(Array(12).fill(openHand), () => touching(openHand, POSES.undo))).toEqual(["undo"]);
        expect(run(Array(12).fill(touching(openHand, POSES.undo)), () => openHand)).toEqual([]);
    });

    it("never fires in the recorded stream of open hands", () => {
        const tracker = new PoseTracker();
        for (const f of frames) expect(tracker.update(f.hands, f.time)).toEqual([]);
    });

    it("fires once per hold and only after the pose is held for a few frames", () => {
        const touch = touching(openHand, POSES.voice);
        expect(run(Array(6).fill(touch))).toEqual([]);
        expect(run(Array(30).fill(touch))).toEqual(["voice"]);
    });

    it("needs the fingers to part before firing again", () => {
        const touch = touching(openHand, POSES.mode);
        const seq = [...Array(10).fill(touch), ...Array(40).fill(openHand), ...Array(10).fill(touch)];
        expect(run(seq)).toEqual(["mode", "mode"]);
        expect(run([...Array(10).fill(touch), openHand, ...Array(10).fill(touch)])).toEqual(["mode"]);
    });

    it("ignores a brush past the threshold", () => {
        const touch = touching(openHand, POSES.undo);
        expect(run([touch, openHand, touch, openHand, touch, openHand])).toEqual([]);
    });
});
