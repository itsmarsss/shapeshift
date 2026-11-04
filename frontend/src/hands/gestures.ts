import { OneEuroFilter } from "./oneEuro";
import { handDistance } from "./depth";
import { Contact, handRatio, type ContactLimits } from "./contact";

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
// A quick close that stops just short of this still counts (see Contact).
export const PINCH_LOOSE = 0.3;
// How much past its tightest a pinch has to open to let go.
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

function point(l: number[], i: number) {
    return [l[i * 3], l[i * 3 + 1]] as const;
}

// How far apart the thumb and index tips are, as a share of the palm's length.
export const pinchRatio = (landmarks: number[], world?: number[]) => handRatio(landmarks, world, THUMB_TIP, INDEX_TIP);
export const PINCH: ContactLimits = { start: PINCH_START, loose: PINCH_LOOSE, end: PINCH_END, gap: RELEASE_GAP, confirm: CONFIRM_FRAMES };

const remap = (v: number) => Math.min(1, Math.max(0, (v - MARGIN) / (1 - MARGIN * 2)));

class HandTrack {
    pinching = false;
    present = false;
    private missing = 0;
    private contact = new Contact(PINCH);
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
                this.contact.reset();
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

        const was = this.pinching;
        this.pinching = this.contact.update(pinchRatio(frame.landmarks, frame.world), time, tuning.sensitivity);
        if (this.pinching && !was) {
            this.pinchId++;
            this.startX = this.x;
            this.startY = this.y;
            this.startDepth = this.depth;
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
