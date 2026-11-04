// Handles in the 3D view that a hand can grab like a mouse would: the size
// boxes around a selection and the arrows, rings and squares of the transform
// gizmo. Each kind registers where its handles are on screen and how to work
// them, and hand control snaps its cursor onto the nearest one.

// A point is in window pixels.
export type HandlePoint = { key: string; x: number; y: number };

export type HandleSet = {
    // What a pinch does, shown by the hand cursor ("Pinch to resize").
    verb: string;
    // While dragging ("Resizing").
    doing: string;
    // The point on any of its handles nearest a window point, right now.
    nearest: (x: number, y: number) => HandlePoint | null;
    // Lights up a handle (or none) as the hand comes near.
    hover: (key: string | null) => void;
    // Starts dragging a handle; `x, y` is where the cursor is drawn on it.
    grab: (key: string, x: number, y: number) => boolean;
    drag: (x: number, y: number) => void;
    release: () => void;
};

const sets = new Set<HandleSet>();

// Registers a set of handles until the returned function is called.
export function addHandles(set: HandleSet): () => void {
    sets.add(set);
    return () => {
        sets.delete(set);
    };
}

export type NearHandle = { set: HandleSet; point: HandlePoint; gap: number };

// The handle nearest a window point within `reach` pixels, if any.
export function handleNear(x: number, y: number, reach: number): NearHandle | null {
    let best: NearHandle | null = null;
    for (const set of sets) {
        const point = set.nearest(x, y);
        if (!point) continue;
        const gap = Math.hypot(point.x - x, point.y - y);
        if (gap <= reach && (!best || gap < best.gap)) best = { set, point, gap };
    }
    return best;
}

// What each hand is near and what one is dragging, for the hand cursor's label.
export const handHandles: { near: Record<string, NearHandle | null>; active: HandleSet | null } = { near: {}, active: null };
