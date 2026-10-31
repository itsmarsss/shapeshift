import type { HandFrame, Handedness } from "./gestures";

// An open hand, held still for a moment, opens the hand menu. All four
// fingers have to be stretched out and the thumb clear of the index, so a
// pinch, a fist or a relaxed half-curl never counts. An open hand is also how
// people hold their hand between pinches, so it has to stay still, and not
// right after a pinch, or the menu would keep opening in the way of grabbing.

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
export const HOLD_MS = 800;
// How far the wrist may wander during the hold, as a share of the frame.
const STILL = 0.035;
// A hand that just let go of a pinch is still working, not asking for the menu.
const AFTER_PINCH_MS = 1000;
// Thumb to index, as a share of the palm, under which the hand counts as pinching.
const PINCHING = 0.32;

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
    private since: Partial<Record<Handedness, { time: number; x: number; y: number }>> = {};
    private fired: Partial<Record<Handedness, boolean>> = {};
    private pinchedAt: Partial<Record<Handedness, number>> = {};

    update(frames: HandFrame[], time: number): Handedness | null {
        let opened: Handedness | null = null;
        for (const handedness of ["Left", "Right"] as const) {
            const frame = frames.find((f) => f.handedness === handedness);
            const l = frame?.landmarks;
            if (l) {
                const palm = dist(l, WRIST, MIDDLE_MCP);
                if (palm > 0 && dist(l, THUMB_TIP, INDEX_TIP) / palm < PINCHING) this.pinchedAt[handedness] = time;
            }
            if (!l || !isOpenPalm(l)) {
                delete this.since[handedness];
                this.fired[handedness] = false;
                continue;
            }
            const start = this.since[handedness];
            // Moving, or only just done pinching: start the hold again from here.
            if (!start || Math.hypot(l[0] - start.x, l[1] - start.y) > STILL || time - (this.pinchedAt[handedness] ?? -Infinity) < AFTER_PINCH_MS) {
                this.since[handedness] = { time, x: l[0], y: l[1] };
                continue;
            }
            if (!this.fired[handedness] && time - start.time >= HOLD_MS) {
                this.fired[handedness] = true;
                opened ??= handedness;
            }
        }
        return opened;
    }
}
