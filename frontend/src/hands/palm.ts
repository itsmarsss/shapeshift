import { Contact, handRatio } from "./contact";
import { PINCH, tuning, type HandFrame, type Handedness } from "./gestures";

// An open hand, held still for a moment, opens the hand menu. All four
// fingers have to be stretched out and the thumb clear of the index, so a
// pinch, a fist or a relaxed half-curl never counts. An open hand is also how
// people hold their hand between pinches, so it has to stay still, and not
// right after a pinch, or the menu would keep opening in the way of grabbing.

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
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

// Lengths are shares of the palm, in real space when there are world landmarks
// (see handRatio), so a tilted hand reads the same.
export function isOpenPalm(landmarks: number[], world?: number[]): boolean {
    if (handRatio(landmarks, world, THUMB_TIP, INDEX_TIP) < THUMB_CLEAR) return false;
    return TIPS.every((tip) => handRatio(landmarks, world, tip, WRIST) > EXTENDED);
}

// Fires once per open palm held for HOLD_MS, then waits for the hand to close
// (or leave) before it can fire again.
export class PalmTracker {
    private since: Partial<Record<Handedness, { time: number; x: number; y: number }>> = {};
    private fired: Partial<Record<Handedness, boolean>> = {};
    private pinchedAt: Partial<Record<Handedness, number>> = {};
    // The same pinch check the pointer uses.
    private pinch: Record<Handedness, Contact> = { Left: new Contact(PINCH), Right: new Contact(PINCH) };

    update(frames: HandFrame[], time: number): Handedness | null {
        let opened: Handedness | null = null;
        for (const handedness of ["Left", "Right"] as const) {
            const frame = frames.find((f) => f.handedness === handedness);
            const l = frame?.landmarks;
            // The same pinch, and the same sensitivity, as the pointer's.
            const pinching = !!l && this.pinch[handedness].update(handRatio(l, frame.world, THUMB_TIP, INDEX_TIP), time, tuning.sensitivity);
            if (pinching) this.pinchedAt[handedness] = time;
            if (!l) this.pinch[handedness].reset();
            if (!l || pinching || !isOpenPalm(l, frame?.world)) {
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
