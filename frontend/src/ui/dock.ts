import { create } from "zustand";

// The editor's panels laid out like Blender's areas: a column on each side
// holds stacks of panels, one above the other; a stack with several panels
// shows them as tabs. Panels are dragged by their header or tab to another
// stack (as a tab), between stacks (as a new one), or out over the view, where
// they float. Columns and stacks are resized by dragging their edges. The
// whole layout is remembered.

export type DockPanelId = "inspector" | "assistant" | "chat" | "history";
export type DockSide = "left" | "right";
export type Stack = { tabs: DockPanelId[]; active: DockPanelId; weight: number };

export const PANEL_IDS: DockPanelId[] = ["inspector", "assistant", "chat", "history"];
export const DOCK_MIN = 240;
export const DOCK_MAX = 560;

export type DropTarget = { kind: "tab"; side: DockSide; stack: number } | { kind: "split"; side: DockSide; index: number } | { kind: "float"; x: number; y: number };

type Layout = {
    columns: Record<DockSide, Stack[]>;
    width: Record<DockSide, number>;
    // Panels floating over the view, and where (null until moved).
    floating: Partial<Record<DockPanelId, { x: number; y: number } | null>>;
};

const KEY = "shapeshift-layout";
const DEFAULT: Layout = {
    columns: {
        left: [{ tabs: ["inspector"], active: "inspector", weight: 1 }],
        right: [
            { tabs: ["assistant", "chat"], active: "assistant", weight: 2 },
            { tabs: ["history"], active: "history", weight: 1 },
        ],
    },
    width: { left: 280, right: 360 },
    floating: {},
};

// A saved layout with every panel placed exactly once, or the default.
function valid(layout: Layout | null): layout is Layout {
    if (!layout?.columns?.left || !layout.columns.right || !layout.width) return false;
    const placed = [...layout.columns.left, ...layout.columns.right].flatMap((s) => s.tabs).concat(Object.keys(layout.floating ?? {}) as DockPanelId[]);
    return PANEL_IDS.every((id) => placed.filter((p) => p === id).length === 1) && placed.length === PANEL_IDS.length;
}

function load(): Layout {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Layout | null;
        return valid(saved) ? { ...saved, floating: saved.floating ?? {} } : DEFAULT;
    } catch {
        return DEFAULT;
    }
}

// The layout without `id` anywhere, dropping stacks it leaves empty.
function without(layout: Layout, id: DockPanelId): Layout {
    const columns = Object.fromEntries(
        (["left", "right"] as DockSide[]).map((side) => [
            side,
            layout.columns[side]
                .map((s) => {
                    const tabs = s.tabs.filter((t) => t !== id);
                    return { ...s, tabs, active: s.active === id ? tabs[0]! : s.active };
                })
                .filter((s) => s.tabs.length),
        ]),
    ) as Layout["columns"];
    const floating = { ...layout.floating };
    delete floating[id];
    return { ...layout, columns, floating };
}

type DockState = Layout & {
    // Where a panel is, if it's docked.
    find: (id: DockPanelId) => { side: DockSide; stack: number } | null;
    move: (id: DockPanelId, to: DropTarget) => void;
    // Floats a docked panel, or docks a floating one back on its side.
    toggleFloat: (id: DockPanelId) => void;
    setActive: (side: DockSide, stack: number, id: DockPanelId) => void;
    // Brings a panel to the front of its stack, as when it's opened.
    reveal: (id: DockPanelId) => void;
    setWidth: (side: DockSide, width: number) => void;
    setWeights: (side: DockSide, weights: number[]) => void;
    reset: () => void;
};

export const useDock = create<DockState>()((set, get) => {
    const commit = (layout: Layout) => {
        set(layout);
        try {
            localStorage.setItem(KEY, JSON.stringify({ columns: layout.columns, width: layout.width, floating: layout.floating }));
        } catch {
            // Remembering is optional.
        }
    };
    const current = (): Layout => {
        const { columns, width, floating } = get();
        return { columns, width, floating };
    };
    return {
        ...load(),
        find: (id) => {
            for (const side of ["left", "right"] as DockSide[]) {
                const stack = get().columns[side].findIndex((s) => s.tabs.includes(id));
                if (stack >= 0) return { side, stack };
            }
            return null;
        },
        move: (id, to) => {
            const was = get().find(id);
            let next = without(current(), id);
            if (to.kind === "float") {
                next = { ...next, floating: { ...next.floating, [id]: { x: to.x, y: to.y } } };
            } else {
                // Indices are measured before the panel left its old place.
                let stacks = current().columns[to.side];
                const removedStack = was && was.side === to.side && stacks[was.stack]!.tabs.length === 1 ? was.stack : -1;
                stacks = next.columns[to.side].map((s) => ({ ...s, tabs: [...s.tabs] }));
                if (to.kind === "tab") {
                    const i = removedStack >= 0 && to.stack > removedStack ? to.stack - 1 : to.stack;
                    const stack = stacks[i];
                    if (stack) stacks[i] = { ...stack, tabs: [...stack.tabs, id], active: id };
                    else stacks.push({ tabs: [id], active: id, weight: 1 });
                } else {
                    const i = removedStack >= 0 && to.index > removedStack ? to.index - 1 : to.index;
                    stacks.splice(Math.max(0, Math.min(stacks.length, i)), 0, { tabs: [id], active: id, weight: 1 });
                }
                next = { ...next, columns: { ...next.columns, [to.side]: stacks } };
            }
            commit(next);
        },
        toggleFloat: (id) => {
            const at = get().find(id);
            if (at) return get().move(id, { kind: "float", x: -1, y: -1 });
            // Back to a stack on the side it would usually be on.
            const side: DockSide = id === "inspector" ? "left" : "right";
            get().move(id, get().columns[side].length ? { kind: "tab", side, stack: 0 } : { kind: "split", side, index: 0 });
        },
        setActive: (side, stack, id) => {
            const columns = { ...get().columns, [side]: get().columns[side].map((s, i) => (i === stack ? { ...s, active: id } : s)) };
            commit({ ...current(), columns });
        },
        reveal: (id) => {
            const at = get().find(id);
            if (at && get().columns[at.side][at.stack]!.active !== id) get().setActive(at.side, at.stack, id);
        },
        setWidth: (side, width) => commit({ ...current(), width: { ...get().width, [side]: Math.round(Math.min(DOCK_MAX, Math.max(DOCK_MIN, width))) } }),
        setWeights: (side, weights) => commit({ ...current(), columns: { ...get().columns, [side]: get().columns[side].map((s, i) => ({ ...s, weight: Math.max(0.15, weights[i] ?? s.weight) })) } }),
        reset: () => commit(DEFAULT),
    };
});
