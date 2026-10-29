import type { Handedness, HandState } from "./gestures";

export type Intent =
    | { type: "start"; x: number; y: number }
    | { type: "move"; x: number; y: number; dx: number; dy: number }
    | { type: "end" }
    | { type: "pair"; zoom: number; panX: number; panY: number };

export class IntentTracker {
    private used = new Map<Handedness, number>();
    private active: { handedness: Handedness; pinchId: number; x: number; y: number } | null = null;
    private pair: { dist: number; x: number; y: number } | null = null;

    update(hands: HandState[]): Intent[] {
        const intents: Intent[] = [];
        const pinching = hands.filter((h) => h.pinching);

        if (pinching.length >= 2) {
            if (this.active) {
                intents.push({ type: "end" });
                this.active = null;
            }
            for (const h of pinching) this.used.set(h.handedness, h.pinchId);
            const [a, b] = pinching;
            const now = { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            if (this.pair) intents.push({ type: "pair", zoom: now.dist - this.pair.dist, panX: now.x - this.pair.x, panY: now.y - this.pair.y });
            this.pair = now;
            return intents;
        }
        this.pair = null;

        if (this.active) {
            const { handedness, pinchId } = this.active;
            const h = pinching.find((p) => p.handedness === handedness && p.pinchId === pinchId);
            if (h) {
                intents.push({ type: "move", x: h.x, y: h.y, dx: h.x - this.active.x, dy: h.y - this.active.y });
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
            intents.push({ type: "start", x: fresh.startX, y: fresh.startY });
            intents.push({ type: "move", x: fresh.x, y: fresh.y, dx: fresh.x - fresh.startX, dy: fresh.y - fresh.startY });
        }
        return intents;
    }
}
