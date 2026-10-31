import type { HandFrame, Handedness } from "./gestures";

// An open hand, held still for a moment, opens the hand menu. All four
// fingers have to be stretched out and the thumb clear of the index, so a
// pinch, a fist or a relaxed half-curl never counts.

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const TIPS = [8, 12, 16, 20];

// Fingertip distance from the wrist, as a multiple of the palm's length.
const EXTENDED = 1.45;
// Open hands measure about 0.43 here and pinches under 0.2; this is where a
// pinch counts as let go.
const THUMB_CLEAR = 0.32;
export const HOLD_MS = 450;

function dist(l: number[], a: number, b: number) {
    return Math.hypot(l[a * 3] - l[b * 3], l[a * 3 + 1] - l[b * 3 + 1]);
}

export function isOpenPalm(landmarks: number[]): boolean {
    const palm = dist(landmarks, WRIST, MIDDLE_MCP);
    if (!(palm > 0)) return false;
    if (dist(landmarks, THUMB_TIP, INDEX_TIP) / palm < THUMB_CLEAR) return false;
    return TIPS.every((tip) => dist(landmarks, tip, WRIST) / palm > EXTENDED);
}

// Fires once per open palm held for HOLD_MS, then waits for the hand to close
// (or leave) before it can fire again.
export class PalmTracker {
    private since: Partial<Record<Handedness, number>> = {};
    private fired: Partial<Record<Handedness, boolean>> = {};

    update(frames: HandFrame[], time: number): Handedness | null {
        let opened: Handedness | null = null;
        for (const handedness of ["Left", "Right"] as const) {
            const frame = frames.find((f) => f.handedness === handedness);
            if (!frame || !isOpenPalm(frame.landmarks)) {
                delete this.since[handedness];
                this.fired[handedness] = false;
                continue;
            }
            this.since[handedness] ??= time;
            if (!this.fired[handedness] && time - this.since[handedness]! >= HOLD_MS) {
                this.fired[handedness] = true;
                opened ??= handedness;
            }
        }
        return opened;
    }
}
