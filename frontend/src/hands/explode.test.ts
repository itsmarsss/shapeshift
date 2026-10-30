import { describe, expect, it } from "vitest";
import recording from "./fixtures/two-open-hands.json";
import { GestureTracker, type HandFrame } from "./gestures";
import { IntentTracker } from "./intents";
import { spreadExplode } from "./explode";

type Recorded = { time: number; hands: HandFrame[] };
const frames = recording as Recorded[];

// A recorded hand with the thumb tip moved onto the index tip, shifted
// sideways by `dx` of the image width.
function pinching(frame: HandFrame, dx: number): HandFrame {
    const l = frame.landmarks.slice();
    l[4 * 3] = l[8 * 3];
    l[4 * 3 + 1] = l[8 * 3 + 1];
    for (let i = 0; i < l.length; i += 3) l[i] += dx;
    return { ...frame, landmarks: l };
}

function spread(steps: number, step: number) {
    const gestures = new GestureTracker();
    const intents = new IntentTracker();
    const [left, right] = frames[0].hands;
    let explode = 0;
    for (let i = 0; i < steps; i++) {
        // In the recording the left hand is on the image's left, so pulling apart moves its landmarks left.
        const hands = [pinching(left, -i * step), pinching(right, i * step)];
        for (const intent of intents.update(gestures.update(hands, i * 33))) {
            if (intent.type === "pair") explode = spreadExplode(explode, intent.zoom);
        }
    }
    return explode;
}

describe("two-hand explode", () => {
    it("opens the model as recorded hands pinch and pull apart", () => {
        expect(spread(30, 0.004)).toBeGreaterThan(0.2);
    });

    it("closes it as the hands come together", () => {
        expect(spread(30, -0.004)).toBe(0);
    });

    it("stays within the slider's range", () => {
        expect(spreadExplode(0.9, 1)).toBe(1);
        expect(spreadExplode(0.1, -1)).toBe(0);
    });
});
