import { create } from "zustand";

// The editor's panels laid out like Blender's areas: a column on each side
// and a row along the top and bottom hold stacks of panels; a stack with several panels
// shows them as tabs. Panels are dragged by their header or tab to another
// stack (as a tab), between stacks (as a new one), or out over the view, where
// they float. Columns and stacks are resized by dragging their edges. The
// whole layout is remembered.

export type DockPanelId = "inspector" | "assistant" | "chat" | "history";
// Columns on the left and right hold stacks one above the other; rows along
// the top and bottom hold them side by side.
export type DockSide = "left" | "right" | "top" | "bottom";
export const SIDES: DockSide[] = ["left", "right", "top", "bottom"];
export const isRow = (side: DockSide) => side === "top" || side === "bottom";
export type Stack = { tabs: DockPanelId[]; active: DockPanelId; weight: number };

export const PANEL_IDS: DockPanelId[] = ["inspector", "assistant", "chat", "history"];
export const DOCK_MIN = 240;
export const DOCK_MAX = 560;
export const ROW_MIN = 120;
// The 3D view keeps at least this much height between the rows.
export const VIEW_MIN = 160;
const TOPBAR = 48;

export type DropTarget = { kind: "tab"; side: DockSide; stack: number } | { kind: "split"; side: DockSide; index: number } | { kind: "float"; x: number; y: number };

type Layout = {
    columns: Record<DockSide, Stack[]>;
    width: Record<"left" | "right", number>;
    height: Record<"top" | "bottom", number>;
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
        top: [],
        bottom: [],
    },
    width: { left: 280, right: 360 },
    height: { top: 220, bottom: 240 },
    floating: {},
};

// A saved layout with every panel placed exactly once, or the default. Ones
// saved before the top and bottom rows existed get empty rows.
function valid(layout: Layout | null): layout is Layout {
    if (!layout?.columns?.left || !layout.columns.right || !layout.width) return false;
    layout.columns.top ??= [];
    layout.columns.bottom ??= [];
    layout.height ??= DEFAULT.height;
    const placed = SIDES.flatMap((side) => layout.columns[side]).flatMap((s) => s.tabs).concat(Object.keys(layout.floating ?? {}) as DockPanelId[]);
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
        SIDES.map((side) => [
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
    // A column's width, or a row's height.
    setSize: (side: DockSide, size: number) => void;
    setWeights: (side: DockSide, weights: number[]) => void;
    reset: () => void;
};

export const useDock = create<DockState>()((set, get) => {
    const commit = (layout: Layout) => {
        set(layout);
        try {
            localStorage.setItem(KEY, JSON.stringify({ columns: layout.columns, width: layout.width, height: layout.height, floating: layout.floating }));
        } catch {
            // Remembering is optional.
        }
    };
    const current = (): Layout => {
        const { columns, width, height, floating } = get();
        return { columns, width, height, floating };
    };
    return {
        ...load(),
        find: (id) => {
            for (const side of SIDES) {
                const stack = get().columns[side].findIndex((s) => s.tabs.includes(id));
                if (stack >= 0) return { side, stack };
            }
            return null;
        },
        move: (id, to) => {
            const was = get().find(id);
            // Dropped back on its own stack: nothing moves, it just comes to the front.
            if (to.kind === "tab" && was && was.side === to.side && was.stack === to.stack) return get().setActive(was.side, was.stack, id);
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
        setSize: (side, size) => {
            if (!isRow(side)) return commit({ ...current(), width: { ...get().width, [side]: Math.round(Math.min(DOCK_MAX, Math.max(DOCK_MIN, size))) } });
            // Room for both rows and the view between them.
            const other = side === "top" ? "bottom" : "top";
            const taken = get().columns[other].length ? get().height[other] : 0;
            const most = Math.max(ROW_MIN, window.innerHeight - TOPBAR - VIEW_MIN - taken);
            commit({ ...current(), height: { ...get().height, [side]: Math.round(Math.min(most, Math.max(ROW_MIN, size))) } });
        },
        setWeights: (side, weights) => commit({ ...current(), columns: { ...get().columns, [side]: get().columns[side].map((s, i) => ({ ...s, weight: Math.max(0.15, weights[i] ?? s.weight) })) } }),
        reset: () => commit(DEFAULT),
    };
});
