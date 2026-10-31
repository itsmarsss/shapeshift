import type { Handedness, HandState } from "./gestures";

export type Intent =
    | { type: "start"; handedness: Handedness; x: number; y: number; depth: number | null }
    // `depth` is how much closer to the camera the hand is than when the pinch started, in meters.
    | { type: "move"; x: number; y: number; dx: number; dy: number; depth: number }
    | { type: "end" }
    // Both hands are pinching. `holding` is the hand that was already pinching
    // on its own, if one was, so a held object can be stretched and turned.
    | { type: "pairStart"; holding: Handedness | null }
    // `zoom` and `pan*` are changes in the hands' distance and midpoint;
    // `scale` is the distance's ratio and `twist` how far the line between the
    // hands turned, in radians, clockwise on screen.
    | { type: "pair"; zoom: number; panX: number; panY: number; scale: number; twist: number };

// Ignore small changes so a steady hand doesn't drift objects.
const DEPTH_DEAD_ZONE = 0.015;

function closer(h: HandState): number {
    if (h.depth === null || h.startDepth === null) return 0;
    const d = h.startDepth - h.depth;
    return Math.abs(d) < DEPTH_DEAD_ZONE ? 0 : d - Math.sign(d) * DEPTH_DEAD_ZONE;
}

// Keeps an angle change in (-π, π], so crossing straight left doesn't jump a full turn.
function wrap(a: number) {
    return Math.atan2(Math.sin(a), Math.cos(a));
}

type Pair = { dist: number; x: number; y: number; angle: number };

export class IntentTracker {
    private used = new Map<Handedness, number>();
    private active: { handedness: Handedness; pinchId: number; x: number; y: number } | null = null;
    private pair: Pair | null = null;

    update(hands: HandState[]): Intent[] {
        const intents: Intent[] = [];
        // Left first, so the angle between the hands is measured the same way every frame.
        const pinching = hands.filter((h) => h.pinching).sort((a, b) => (a.handedness < b.handedness ? -1 : 1));

        if (pinching.length >= 2) {
            for (const h of pinching) this.used.set(h.handedness, h.pinchId);
            const [a, b] = pinching;
            const now: Pair = { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: Math.atan2(b.y - a.y, b.x - a.x) };
            if (!this.pair) {
                intents.push({ type: "pairStart", holding: this.active?.handedness ?? null });
                this.active = null;
            } else {
                intents.push({
                    type: "pair",
                    zoom: now.dist - this.pair.dist,
                    panX: now.x - this.pair.x,
                    panY: now.y - this.pair.y,
                    scale: this.pair.dist > 0 ? now.dist / this.pair.dist : 1,
                    twist: wrap(now.angle - this.pair.angle),
                });
            }
            this.pair = now;
            return intents;
        }
        if (this.pair) {
            this.pair = null;
            intents.push({ type: "end" });
        }

        if (this.active) {
            const { handedness, pinchId } = this.active;
            const h = pinching.find((p) => p.handedness === handedness && p.pinchId === pinchId);
            if (h) {
                intents.push({ type: "move", x: h.x, y: h.y, dx: h.x - this.active.x, dy: h.y - this.active.y, depth: closer(h) });
                this.active.x = h.x;
                this.active.y = h.y;
                return intents;
            }
            intents.push({ type: "end" });
            this.active = null;
        }

        const fresh = pinching.find((h) => this.used.get(h.handedness) !== h.pinchId);
        if (fresh) {
            this.used.set(fresh.handedness, fresh.pinchId);
            this.active = { handedness: fresh.handedness, pinchId: fresh.pinchId, x: fresh.x, y: fresh.y };
            intents.push({ type: "start", handedness: fresh.handedness, x: fresh.startX, y: fresh.startY, depth: fresh.startDepth });
            intents.push({ type: "move", x: fresh.x, y: fresh.y, dx: fresh.x - fresh.startX, dy: fresh.y - fresh.startY, depth: closer(fresh) });
        }
        return intents;
    }
}
