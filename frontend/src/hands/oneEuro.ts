export class OneEuroFilter {
    private x: number | null = null;
    private dx = 0;
    private t = 0;
    private minCutoff: number;
    private beta: number;
    private dCutoff: number;

    constructor(minCutoff = 1, beta = 0, dCutoff = 1) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
    }

    private static alpha(cutoff: number, dt: number) {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dt);
    }

    filter(value: number, timeMs: number): number {
        if (this.x === null) {
            this.x = value;
            this.t = timeMs;
            return value;
        }
        const dt = Math.max((timeMs - this.t) / 1000, 1e-3);
        this.t = timeMs;
        const dxRaw = (value - this.x) / dt;
        this.dx += OneEuroFilter.alpha(this.dCutoff, dt) * (dxRaw - this.dx);
        const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
        this.x += OneEuroFilter.alpha(cutoff, dt) * (value - this.x);
        return this.x;
    }

    reset() {
        this.x = null;
        this.dx = 0;
    }
}
