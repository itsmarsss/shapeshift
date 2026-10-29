import { describe, expect, it } from "vitest";
import recording from "./fixtures/two-open-hands.json";
import type { HandFrame } from "./gestures";
import { detectPose, POSES, PoseTracker, type Pose } from "./poses";

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

const right = (l: number[]): HandFrame[] => [{ handedness: "Right", landmarks: l }];

function run(seq: number[][]) {
    const tracker = new PoseTracker();
    return seq.flatMap((l, i) => tracker.update(right(l), i * 33).map((e) => e.pose));
}

describe("poses", () => {
    it("recognizes each finger touching the thumb", () => {
        for (const pose of Object.keys(POSES) as Pose[]) expect(detectPose(touching(openHand, POSES[pose]))).toBe(pose);
        expect(detectPose(openHand)).toBeNull();
    });

    it("never fires on a thumb-index pinch", () => {
        expect(detectPose(touching(openHand, 8))).toBeNull();
    });

    it("never fires in the recorded stream of open hands", () => {
        const tracker = new PoseTracker();
        for (const f of frames) expect(tracker.update(f.hands, f.time)).toEqual([]);
    });

    it("fires once per hold and only after the pose is held for a few frames", () => {
        const touch = touching(openHand, POSES.voice);
        expect(run([touch, touch, touch])).toEqual([]);
        expect(run(Array(30).fill(touch))).toEqual(["voice"]);
    });

    it("needs the fingers to part before firing again", () => {
        const touch = touching(openHand, POSES.mode);
        const seq = [...Array(6).fill(touch), ...Array(40).fill(openHand), ...Array(6).fill(touch)];
        expect(run(seq)).toEqual(["mode", "mode"]);
        expect(run([...Array(6).fill(touch), openHand, ...Array(6).fill(touch)])).toEqual(["mode"]);
    });

    it("ignores a brush past the threshold", () => {
        const touch = touching(openHand, POSES.undo);
        expect(run([touch, openHand, touch, openHand, touch, openHand])).toEqual([]);
    });
});
