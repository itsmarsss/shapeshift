import { Contact, handRatio } from "./contact";
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

// Thumb to fingertip, as a share of the palm's length: touching under TOUCH
// (or a quick close to just short of it), let go past RELEASE. The same check
// as the pinch (see Contact).
export const TOUCH = 0.22;
export const RELEASE = 0.36;
const LIMITS = { start: TOUCH, loose: 0.3, end: RELEASE, gap: 0.14, confirm: 1 };
// The index has to stay clear of the thumb so a pinch never counts.
const INDEX_CLEAR = 0.45;
// About a third of a second, so a sloppy pinch that brushes another finger doesn't count.
const HOLD_FRAMES = 9;
const RELEASE_FRAMES = 3;
const COOLDOWN_MS = 900;

const POSE_NAMES = Object.keys(POSES) as Pose[];

class PoseTrack {
    // Whether each finger is touching the thumb, kept from frame to frame.
    private touch = Object.fromEntries(POSE_NAMES.map((p) => [p, new Contact(LIMITS)])) as Record<Pose, Contact>;
    private candidate: Pose | null = null;
    private streak = 0;
    private held: Pose | null = null;
    private clearStreak = 0;
    private lastFired = -Infinity;

    update(frame: HandFrame | undefined, time: number): Pose | null {
        if (!frame) {
            this.candidate = null;
            this.streak = 0;
            for (const p of POSE_NAMES) this.touch[p].reset();
            return null;
        }
        // The closest finger touching the thumb, while the index stays clear.
        const ratios = POSE_NAMES.map((p) => ({ p, r: handRatio(frame.landmarks, frame.world, THUMB_TIP, POSES[p]) }));
        const touching = ratios.filter(({ p, r }) => this.touch[p].update(r, time)).sort((a, b) => a.r - b.r);
        const indexClear = handRatio(frame.landmarks, frame.world, THUMB_TIP, INDEX_TIP) >= INDEX_CLEAR;
        // After a pose fires, wait for the fingers to part before arming again.
        if (this.held) {
            this.clearStreak = !this.touch[this.held].touching ? this.clearStreak + 1 : 0;
            if (this.clearStreak >= RELEASE_FRAMES) {
                this.held = null;
                this.clearStreak = 0;
            }
            return null;
        }
        const pose = indexClear ? (touching[0]?.p ?? null) : null;
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
