import { OneEuroFilter } from "./oneEuro";
import { handDistance } from "./depth";

export type Handedness = "Left" | "Right";
export type HandFrame = { handedness: Handedness; landmarks: number[]; world?: number[] };

export type HandState = {
    handedness: Handedness;
    pinching: boolean;
    x: number;
    y: number;
    pinchId: number;
    startX: number;
    startY: number;
    // Distance from the camera in meters, smoothed, or null if unknown.
    depth: number | null;
    // The distance when the current pinch started.
    startDepth: number | null;
};

// Thumb and index tips this close (as a share of the palm's length) are a
// pinch, and this far apart again let go of it.
export const PINCH_START = 0.2;
export const PINCH_END = 0.32;
// Fingers that snap shut but stop just short of touching (some hands can't
// quite close the gap, or the tracker keeps one) still count: a ratio under
// this that fell by nearly a third within the last moment is a pinch too. A
// hand that just rests half closed doesn't move like that.
export const PINCH_LOOSE = 0.3;
const CLOSE_DROP = 0.7;
const CLOSE_WINDOW_MS = 400;
// A pinch lets go once the fingers open this much past how tight it got, so a
// loose pinch doesn't drop at the first wobble.
const RELEASE_GAP = 0.14;

export const tuning = { sensitivity: 1, smoothing: 0.5 };
const minCutoff = () => 3 - tuning.smoothing * 2.6;
const CONFIRM_FRAMES = 2;
const LOST_FRAMES = 5;
// How far in from each edge of the camera's view the screen's edge sits.
// Tracking gets shaky as a hand nears the edge of the picture, so the screen
// runs out well before the camera does.
const MARGIN = 0.2;

const THUMB_TIP = 4;
const INDEX_TIP = 8;
const WRIST = 0;
const MIDDLE_MCP = 9;

function point(l: number[], i: number) {
    return [l[i * 3], l[i * 3 + 1]] as const;
}

function dist(a: readonly [number, number], b: readonly [number, number]) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

// How far apart the thumb and index tips are, as a share of the palm's length.
// Measured in real space when there are world landmarks: there, lengths don't
// change as the hand tilts or turns, where in the picture a palm seen at an
// angle looks short and throws the ratio off.
export function pinchRatio(landmarks: number[], world?: number[]): number {
    if (world && world.length >= 63) {
        const d = (a: number, b: number) => Math.hypot(world[a * 3] - world[b * 3], world[a * 3 + 1] - world[b * 3 + 1], world[a * 3 + 2] - world[b * 3 + 2]);
        const scale = d(WRIST, MIDDLE_MCP);
        return scale > 0 ? d(THUMB_TIP, INDEX_TIP) / scale : Infinity;
    }
    const scale = dist(point(landmarks, WRIST), point(landmarks, MIDDLE_MCP));
    return scale > 0 ? dist(point(landmarks, THUMB_TIP), point(landmarks, INDEX_TIP)) / scale : Infinity;
}

const remap = (v: number) => Math.min(1, Math.max(0, (v - MARGIN) / (1 - MARGIN * 2)));

class HandTrack {
    pinching = false;
    present = false;
    private streak = 0;
    private missing = 0;
    // The ratio over the last moment, and the tightest it got in this pinch.
    private recent: { time: number; ratio: number }[] = [];
    private tightest = Infinity;
    private fx = new OneEuroFilter(1.2, 6);
    private fy = new OneEuroFilter(1.2, 6);
    x = 0.5;
    y = 0.5;
    pinchId = 0;
    startX = 0.5;
    startY = 0.5;
    depth: number | null = null;
    startDepth: number | null = null;
    // Steadier than x and y: distance is the noisiest thing a webcam measures.
    // Still, a deliberate reach (around 0.3 m/s) opens the filter up enough
    // that pushing doesn't lag behind the hand.
    private fz = new OneEuroFilter(0.6, 1.5);


    update(frame: HandFrame | undefined, time: number, aspect = 16 / 9) {
        if (!frame) {
            if (++this.missing > LOST_FRAMES) {
                this.present = false;
                this.pinching = false;
                this.streak = 0;
                this.recent = [];
                this.fx.reset();
                this.fy.reset();
                this.fz.reset();
                this.depth = null;
            }
            return;
        }
        this.missing = 0;
        this.present = true;

        this.fx.minCutoff = this.fy.minCutoff = minCutoff();
        const thumb = point(frame.landmarks, THUMB_TIP);
        const index = point(frame.landmarks, INDEX_TIP);
        this.x = remap(this.fx.filter(1 - (thumb[0] + index[0]) / 2, time));
        this.y = remap(this.fy.filter((thumb[1] + index[1]) / 2, time));

        const distance = handDistance(frame.landmarks, frame.world, aspect);
        this.depth = distance === null ? null : this.fz.filter(distance, time);

        const ratio = pinchRatio(frame.landmarks, frame.world);
        const s = tuning.sensitivity;
        this.recent = this.recent.filter((r) => time - r.time <= CLOSE_WINDOW_MS);
        this.recent.push({ time, ratio });
        let flipping: boolean;
        if (this.pinching) {
            this.tightest = Math.min(this.tightest, ratio);
            flipping = ratio > Math.max(PINCH_END * s, this.tightest + RELEASE_GAP * s);
        } else {
            const peak = Math.max(...this.recent.map((r) => r.ratio));
            flipping = ratio < PINCH_START * s || (ratio < PINCH_LOOSE * s && ratio < peak * CLOSE_DROP);
        }
        this.streak = flipping ? this.streak + 1 : 0;
        if (this.streak >= CONFIRM_FRAMES) {
            this.pinching = !this.pinching;
            this.streak = 0;
            if (this.pinching) {
                this.tightest = ratio;
                this.pinchId++;
                this.startX = this.x;
                this.startY = this.y;
                this.startDepth = this.depth;
            }
        }
    }
}

export class GestureTracker {
    private tracks: Record<Handedness, HandTrack> = { Left: new HandTrack(), Right: new HandTrack() };

    update(frames: HandFrame[], time: number, aspect?: number): HandState[] {
        const out: HandState[] = [];
        for (const handedness of ["Left", "Right"] as const) {
            const track = this.tracks[handedness];
            track.update(frames.find((f) => f.handedness === handedness), time, aspect);
            if (track.present)
                out.push({
                    handedness,
                    pinching: track.pinching,
                    x: track.x,
                    y: track.y,
                    pinchId: track.pinchId,
                    startX: track.startX,
                    startY: track.startY,
                    depth: track.depth,
                    startDepth: track.startDepth,
                });
        }
        return out;
    }
}
