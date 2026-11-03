// Staging for the assistant's edits. A step's commands all land in the scene
// at once (so a stop never leaves one half done), but they're shown one at a
// time: new shapes grow into place a moment apart, and changed ones glow
// briefly. SceneMesh reads this every frame while something is animating.

// Slow enough to watch a build come together, piece by piece.
export const STAGGER_MS = 110;
const GROW_MS = 380;
const GLOW_MS = 650;

const growing = new Map<string, number>();
const glowing = new Map<string, number>();
// When the next shape may start growing, so a batch comes in one by one.
let nextStart = 0;
let redraw = () => {};

// The 3D view hands over a way to ask for frames, since it only draws on change.
export function attachRedraw(fn: () => void) {
    redraw = fn;
}

// New shapes: each starts after the one before.
export function reveal(ids: string[]) {
    const now = performance.now();
    nextStart = Math.max(nextStart, now);
    for (const id of ids) {
        growing.set(id, nextStart);
        nextStart += STAGGER_MS;
    }
    redraw();
}

// Shapes that changed: a short glow, in the same order.
export function flash(ids: string[]) {
    const now = performance.now();
    nextStart = Math.max(nextStart, now);
    for (const id of ids) glowing.set(id, nextStart);
    nextStart += STAGGER_MS / 2;
    redraw();
}

// Overshoots a little, then settles.
const easeOutBack = (t: number) => {
    const c = 1.6;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// How big (0 to 1) and how much extra glow a shape has right now, or null
// once it's back to normal.
export function spawnState(id: string, now: number): { scale: number; glow: number } | null {
    const grow = growing.get(id);
    const shine = glowing.get(id);
    if (grow === undefined && shine === undefined) return null;
    let scale = 1;
    let glow = 0;
    if (grow !== undefined) {
        const t = (now - grow) / GROW_MS;
        if (t >= 1) growing.delete(id);
        else {
            scale = t <= 0 ? 0 : easeOutBack(t);
            glow = t > 0 ? 0.35 * (1 - t) : 0;
        }
    }
    if (shine !== undefined) {
        const t = (now - shine) / GLOW_MS;
        if (t >= 1) glowing.delete(id);
        else if (t > 0) glow = Math.max(glow, 0.5 * Math.sin(Math.PI * t));
    }
    return growing.has(id) || glowing.has(id) ? { scale, glow } : null;
}
