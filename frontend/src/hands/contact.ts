// How every gesture tells whether two parts of a hand are touching: the thumb
// and index for a pinch, the thumb and another finger for the shortcut poses.

const WRIST = 0;
const MIDDLE_MCP = 9;

// How far apart two landmarks are, as a share of the palm's length (wrist to
// middle knuckle). Measured in real space when there are world landmarks:
// there, lengths don't change as the hand tilts or turns, where in the picture
// a palm seen at an angle looks short and throws the ratio off.
export function handRatio(landmarks: number[], world: number[] | undefined, a: number, b: number): number {
    const l = world && world.length >= 63 ? world : landmarks;
    const z = l === world;
    const d = (i: number, j: number) => Math.hypot(l[i * 3] - l[j * 3], l[i * 3 + 1] - l[j * 3 + 1], z ? l[i * 3 + 2] - l[j * 3 + 2] : 0);
    const scale = d(WRIST, MIDDLE_MCP);
    return scale > 0 ? d(a, b) / scale : Infinity;
}

export type ContactLimits = {
    // Closer than this is touching.
    start: number;
    // Fingers that snap shut but stop just short (some hands can't quite close
    // the gap, or the tracker keeps one) still count: under this, after the
    // ratio fell by nearly a third within the last moment. A hand that just
    // rests half closed doesn't move like that.
    loose: number;
    // Touching ends once the fingers are this far apart again...
    end: number;
    // ...and this much past how tight the touch got, so a loose one doesn't
    // drop at the first wobble.
    gap: number;
    // Frames in a row a change has to hold before it counts.
    confirm: number;
};

const CLOSE_DROP = 0.7;
const CLOSE_WINDOW_MS = 400;

export class Contact {
    touching = false;
    private streak = 0;
    private recent: { time: number; ratio: number }[] = [];
    private tightest = Infinity;
    private limits: ContactLimits;

    constructor(limits: ContactLimits) {
        this.limits = limits;
    }

    // Takes this frame's ratio; `scale` loosens (above 1) or tightens every limit.
    update(ratio: number, time: number, scale = 1): boolean {
        const { start, loose, end, gap, confirm } = this.limits;
        this.recent = this.recent.filter((r) => time - r.time <= CLOSE_WINDOW_MS);
        this.recent.push({ time, ratio });
        let flipping: boolean;
        if (this.touching) {
            this.tightest = Math.min(this.tightest, ratio);
            flipping = ratio > Math.max(end * scale, this.tightest + gap * scale);
        } else {
            const peak = Math.max(...this.recent.map((r) => r.ratio));
            flipping = ratio < start * scale || (ratio < loose * scale && ratio < peak * CLOSE_DROP);
        }
        this.streak = flipping ? this.streak + 1 : 0;
        if (this.streak >= confirm) {
            this.touching = !this.touching;
            this.streak = 0;
            this.tightest = ratio;
        }
        return this.touching;
    }

    reset() {
        this.touching = false;
        this.streak = 0;
        this.recent = [];
        this.tightest = Infinity;
    }
}
