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

export const PINCH_START = 0.2;
export const PINCH_END = 0.32;

export const tuning = { sensitivity: 1, smoothing: 0.5 };
const minCutoff = () => 3 - tuning.smoothing * 2.6;
const CONFIRM_FRAMES = 2;
const LOST_FRAMES = 5;
const MARGIN = 0.12;

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

export function pinchRatio(landmarks: number[]): number {
    const scale = dist(point(landmarks, WRIST), point(landmarks, MIDDLE_MCP));
    return scale > 0 ? dist(point(landmarks, THUMB_TIP), point(landmarks, INDEX_TIP)) / scale : Infinity;
}

const remap = (v: number) => Math.min(1, Math.max(0, (v - MARGIN) / (1 - MARGIN * 2)));

class HandTrack {
    pinching = false;
    present = false;
    private streak = 0;
    private missing = 0;
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
    private fz = new OneEuroFilter(0.6, 0.6);


    update(frame: HandFrame | undefined, time: number, aspect = 16 / 9) {
        if (!frame) {
            if (++this.missing > LOST_FRAMES) {
                this.present = false;
                this.pinching = false;
                this.streak = 0;
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

        const ratio = pinchRatio(frame.landmarks);
        const flipping = this.pinching ? ratio > PINCH_END * tuning.sensitivity : ratio < PINCH_START * tuning.sensitivity;
        this.streak = flipping ? this.streak + 1 : 0;
        if (this.streak >= CONFIRM_FRAMES) {
            this.pinching = !this.pinching;
            this.streak = 0;
            if (this.pinching) {
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
