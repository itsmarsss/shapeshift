import type { HandFrame, Handedness } from "./gestures";

// Hand poses that trigger editor commands. Each touches the thumb to a finger
// other than the index, so none of them can be mistaken for the thumb-index
// pinch that drags and orbits.
export const POSES = {
    voice: 12, // thumb to middle fingertip: talk to the assistant
    mode: 16, // thumb to ring fingertip: next editor mode
    undo: 20, // thumb to pinky fingertip: undo
} as const;
export type Pose = keyof typeof POSES;
export type PoseEvent = { pose: Pose; handedness: Handedness };

const THUMB_TIP = 4;
const INDEX_TIP = 8;
const WRIST = 0;
const MIDDLE_MCP = 9;

export const TOUCH = 0.22;
export const RELEASE = 0.36;
// The index has to stay clear of the thumb so a pinch never counts.
const INDEX_CLEAR = 0.45;
// About a third of a second, so a sloppy pinch that brushes another finger doesn't count.
const HOLD_FRAMES = 9;
const RELEASE_FRAMES = 3;
const COOLDOWN_MS = 900;

function ratio(l: number[], a: number, b: number): number {
    const scale = Math.hypot(l[WRIST * 3] - l[MIDDLE_MCP * 3], l[WRIST * 3 + 1] - l[MIDDLE_MCP * 3 + 1]);
    if (!(scale > 0)) return Infinity;
    return Math.hypot(l[a * 3] - l[b * 3], l[a * 3 + 1] - l[b * 3 + 1]) / scale;
}

// The pose a single frame shows, if any: the closest finger touching the thumb.
export function detectPose(landmarks: number[]): Pose | null {
    if (ratio(landmarks, THUMB_TIP, INDEX_TIP) < INDEX_CLEAR) return null;
    let best: { pose: Pose; r: number } | null = null;
    for (const pose of Object.keys(POSES) as Pose[]) {
        const r = ratio(landmarks, THUMB_TIP, POSES[pose]);
        if (r < TOUCH && (!best || r < best.r)) best = { pose, r };
    }
    return best?.pose ?? null;
}

function released(landmarks: number[], pose: Pose) {
    return ratio(landmarks, THUMB_TIP, POSES[pose]) > RELEASE;
}

class PoseTrack {
    private candidate: Pose | null = null;
    private streak = 0;
    private held: Pose | null = null;
    private clearStreak = 0;
    private lastFired = -Infinity;

    update(frame: HandFrame | undefined, time: number): Pose | null {
        if (!frame) {
            this.candidate = null;
            this.streak = 0;
            return null;
        }
        // After a pose fires, wait for the fingers to part before arming again.
        if (this.held) {
            this.clearStreak = released(frame.landmarks, this.held) ? this.clearStreak + 1 : 0;
            if (this.clearStreak >= RELEASE_FRAMES) {
                this.held = null;
                this.clearStreak = 0;
            }
            return null;
        }
        const pose = detectPose(frame.landmarks);
        if (pose && pose === this.candidate) this.streak++;
        else {
            this.candidate = pose;
            this.streak = pose ? 1 : 0;
        }
        if (pose && this.streak >= HOLD_FRAMES && time - this.lastFired >= COOLDOWN_MS) {
            this.held = pose;
            this.candidate = null;
            this.streak = 0;
            this.lastFired = time;
            return pose;
        }
        return null;
    }
}

export class PoseTracker {
    private tracks: Record<Handedness, PoseTrack> = { Left: new PoseTrack(), Right: new PoseTrack() };

    update(frames: HandFrame[], time: number): PoseEvent[] {
        const events: PoseEvent[] = [];
        for (const handedness of ["Left", "Right"] as const) {
            const pose = this.tracks[handedness].update(frames.find((f) => f.handedness === handedness), time);
            if (pose) events.push({ pose, handedness });
        }
        return events;
    }
}
