import { useCallback, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { create } from "zustand";
import { useCollab } from "../collab/session";
import { useCompact } from "./compact";
import { isRow, PANEL_IDS, SIDES, useDock, type DockPanelId, type DockSide, type DropTarget, type Stack } from "./dock";
import { useInspectorVisible } from "./inspector";
import { useUI } from "./store";

// Where each panel is right now, worked out from the layout and which panels
// are open: closed ones take no room, a column or row with nothing open folds away,
// and a stack shows tabs once two of its panels are open. Phones have bottom
// sheets instead, so nothing docks there.

export const TAB_HEIGHT = 34;
export const TOPBAR = 48;

export type PlacedStack = Stack & { side: DockSide; index: number; open: DockPanelId[]; shown: DockPanelId; from: number; size: number };

export function usePanelsOpen(): Record<DockPanelId, boolean> {
    return {
        inspector: useInspectorVisible(),
        assistant: useUI((s) => s.showChat),
        chat: useCollab((s) => s.chatOpen && (s.status === "live" || s.status === "reconnecting")),
        history: useUI((s) => s.showHistory),
    };
}

// The stacks of one column or row that have something open, with where each
// starts and how much of it each takes: fractions of the height under the top
// bar for a column, of the width between the columns for a row.
export function placeColumn(stacks: Stack[], side: DockSide, open: Record<DockPanelId, boolean>): PlacedStack[] {
    const shown = stacks.map((s, index) => ({ ...s, side, index, open: s.tabs.filter((t) => open[t]) })).filter((s) => s.open.length);
    const total = shown.reduce((n, s) => n + s.weight, 0) || 1;
    let from = 0;
    return shown.map((s) => {
        const size = s.weight / total;
        const placed = { ...s, shown: s.open.includes(s.active) ? s.active : s.open[0]!, from, size };
        from += size;
        return placed;
    });
}

export function useDockLayout() {
    const compact = useCompact();
    const columns = useDock((s) => s.columns);
    const width = useDock((s) => s.width);
    const height = useDock((s) => s.height);
    const floating = useDock((s) => s.floating);
    const open = usePanelsOpen();
    const place = (side: DockSide) => (compact ? [] : placeColumn(columns[side], side, open));
    const stacks: Record<DockSide, PlacedStack[]> = { left: place("left"), right: place("right"), top: place("top"), bottom: place("bottom") };
    // How much of the screen each side takes, nothing when it's empty.
    const left = stacks.left.length ? width.left : 0;
    const right = stacks.right.length ? width.right : 0;
    const top = stacks.top.length ? height.top : 0;
    const bottom = stacks.bottom.length ? height.bottom : 0;
    const where = (id: DockPanelId) => SIDES.flatMap((side) => stacks[side]).find((s) => s.open.includes(id));
    const docked = (id: DockPanelId) => !!where(id);
    return { compact, open, stacks, left, right, top, bottom, width, height, floating, where, docked };
}

export type DockLayout = ReturnType<typeof useDockLayout>;

const vertical = (from: number, size: number, tabs: boolean): CSSProperties => ({
    top: `calc(var(--topbar) + (100% - var(--topbar)) * ${from} + ${tabs ? TAB_HEIGHT : 0}px)`,
    height: `calc((100% - var(--topbar)) * ${size} - ${tabs ? TAB_HEIGHT : 0}px)`,
});

// Across the space between the columns, where rows sit.
export const across = (fraction: number) => `calc(var(--dock-left) + (100% - var(--dock-left) - var(--dock-right)) * ${fraction})`;
export const acrossSize = (fraction: number) => `calc((100% - var(--dock-left) - var(--dock-right)) * ${fraction})`;

// Where a stack's tabs (or its panel, without tabs) start, from the top of the screen.
export const rowTop = (side: "top" | "bottom", height: number) => (side === "top" ? "var(--topbar)" : `calc(100% - ${height}px)`);

// Where a docked panel sits in its column or row: hidden while another tab of
// its stack is in front.
export function dockedStyle(id: DockPanelId, layout: DockLayout): CSSProperties | undefined {
    const s = layout.where(id);
    if (!s) return undefined;
    const tabs = s.open.length > 1;
    const last = s.from + s.size > 0.999;
    const line = "1px solid var(--border)";
    const common: CSSProperties = { position: "absolute", maxHeight: "none", borderRadius: 0, boxShadow: "none", transform: "none", translate: "none", ...(s.shown === id ? {} : { display: "none" }) };
    if (isRow(s.side)) {
        const tab = tabs ? TAB_HEIGHT : 0;
        const height = s.side === "top" ? layout.top : layout.bottom;
        return {
            ...common,
            left: across(s.from),
            width: acrossSize(s.size),
            right: "auto",
            top: `calc(${rowTop(s.side, height)} + ${tab}px)`,
            bottom: "auto",
            height: height - tab,
            borderLeft: "none",
            borderRight: last ? "none" : line,
            borderTop: s.side === "top" || tabs ? "none" : line,
            borderBottom: s.side === "bottom" ? "none" : line,
        };
    }
    return {
        ...common,
        ...vertical(s.from, s.size, tabs),
        bottom: "auto",
        [s.side]: 0,
        [s.side === "left" ? "right" : "left"]: "auto",
        width: s.side === "left" ? layout.left : layout.right,
        borderTop: "none",
        borderBottom: last ? "none" : line,
        [s.side === "left" ? "borderLeft" : "borderRight"]: "none",
    };
}

// A drag in progress: the panel, the pointer, and where it would land.
type Drag = { id: DockPanelId; x: number; y: number; target: DropTarget | null };
export const useDockDrag = create<{ drag: Drag | null }>()(() => ({ drag: null }));

// The places a dragged panel can go, in screen pixels, each with the outline
// of where it would end up. Worked out from the same layout the panels use.
export function dropZones(layout: DockLayout, w = window.innerWidth, h = window.innerHeight) {
    const zones: { target: DropTarget; rect: DOMRect; preview: DOMRect }[] = [];
    const body = h - TOPBAR;
    const rect = (x: number, y: number, rw: number, rh: number) => new DOMRect(x, y, rw, rh);
    for (const side of ["left", "right"] as const) {
        const stacks = layout.stacks[side];
        const colWidth = side === "left" ? layout.left : layout.right;
        if (!stacks.length) {
            // An empty side: a band along its edge starts a new column there.
            const band = 72;
            const x = side === "left" ? 0 : w - band;
            const width = layout.width[side];
            zones.push({ target: { kind: "split", side, index: layout.stacks[side].length }, rect: rect(x, TOPBAR, band, body), preview: rect(side === "left" ? 0 : w - width, TOPBAR, width, body) });
            continue;
        }
        const x = side === "left" ? 0 : w - colWidth;
        stacks.forEach((s, i) => {
            const top = TOPBAR + body * s.from;
            const height = body * s.size;
            const edge = Math.min(36, height / 4);
            // The middle of a stack: join it as a tab.
            zones.push({ target: { kind: "tab", side, stack: s.index }, rect: rect(x, top + edge, colWidth, height - edge * 2), preview: rect(x, top, colWidth, height) });
            // Its top edge: a new stack above it.
            zones.push({ target: { kind: "split", side, index: s.index }, rect: rect(x, top, colWidth, edge), preview: rect(x, top, colWidth, Math.min(height / 2, body / 3)) });
            // The last one's bottom edge: a new stack at the bottom.
            if (i === stacks.length - 1)
                zones.push({ target: { kind: "split", side, index: s.index + 1 }, rect: rect(x, top + height - edge, colWidth, edge), preview: rect(x, top + height / 2, colWidth, height / 2) });
        });
    }
    // Rows run between the columns: across the top under the bar, and along the bottom.
    const x0 = layout.left;
    const span = w - layout.left - layout.right;
    for (const side of ["top", "bottom"] as const) {
        const stacks = layout.stacks[side];
        const rowHeight = side === "top" ? layout.top : layout.bottom;
        if (!stacks.length) {
            // An empty row: a band along its edge starts one there.
            const band = 56;
            const height = layout.height[side];
            zones.push({
                target: { kind: "split", side, index: 0 },
                rect: rect(x0, side === "top" ? TOPBAR : h - band, span, band),
                preview: rect(x0, side === "top" ? TOPBAR : h - height, span, height),
            });
            continue;
        }
        const y = side === "top" ? TOPBAR : h - rowHeight;
        stacks.forEach((s, i) => {
            const left = x0 + span * s.from;
            const width = span * s.size;
            const edge = Math.min(48, width / 4);
            // The middle of a stack: join it as a tab.
            zones.push({ target: { kind: "tab", side, stack: s.index }, rect: rect(left + edge, y, width - edge * 2, rowHeight), preview: rect(left, y, width, rowHeight) });
            // Its left edge: a new stack before it.
            zones.push({ target: { kind: "split", side, index: s.index }, rect: rect(left, y, edge, rowHeight), preview: rect(left, y, Math.min(width / 2, span / 3), rowHeight) });
            // The last one's right edge: a new stack at the end.
            if (i === stacks.length - 1)
                zones.push({ target: { kind: "split", side, index: s.index + 1 }, rect: rect(left + width - edge, y, edge, rowHeight), preview: rect(left + width / 2, y, width / 2, rowHeight) });
        });
    }
    return zones;
}

const inside = (r: DOMRect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

// Dragging a panel by its header or tab. A press that hardly moves is still a
// click; past a few pixels it becomes a drag that shows where it can go.
export function usePanelDrag(id: DockPanelId) {
    const layoutRef = useRef<DockLayout | null>(null);
    const moved = useRef(false);
    const layout = useDockLayout();
    layoutRef.current = layout;
    const onPointerDown = useCallback(
        (e: ReactPointerEvent<HTMLElement>) => {
            if (e.button !== 0 || layoutRef.current?.compact) return;
            if ((e.target as HTMLElement).closest("button:not([data-drag]), input, select, textarea, a")) return;
            const from = { x: e.clientX, y: e.clientY };
            const panel = (e.currentTarget.closest("[data-panel]") as HTMLElement | null)?.getBoundingClientRect();
            const grab = panel ? { x: from.x - panel.left, y: from.y - panel.top } : { x: 20, y: 16 };
            moved.current = false;
            const move = (ev: PointerEvent) => {
                if (!moved.current && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 6) return;
                if (!moved.current) {
                    // No text gets selected while a panel is carried.
                    document.body.style.userSelect = "none";
                    window.getSelection()?.removeAllRanges();
                }
                moved.current = true;
                const zone = dropZones(layoutRef.current!).find((z) => inside(z.rect, ev.clientX, ev.clientY));
                const target: DropTarget = zone?.target ?? { kind: "float", x: Math.max(8, ev.clientX - grab.x), y: Math.max(TOPBAR + 8, ev.clientY - grab.y) };
                useDockDrag.setState({ drag: { id, x: ev.clientX, y: ev.clientY, target } });
            };
            const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                document.body.style.userSelect = "";
                const drag = useDockDrag.getState().drag;
                useDockDrag.setState({ drag: null });
                if (moved.current && drag?.target) useDock.getState().move(id, drag.target);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
        },
        [id],
    );
    // A drag that ends over a button isn't a press of it.
    const onClickCapture = useCallback((e: React.MouseEvent) => {
        if (moved.current) {
            e.stopPropagation();
            e.preventDefault();
            moved.current = false;
        }
    }, []);
    return { onPointerDown, onClickCapture, style: { cursor: "grab", touchAction: "none" } as CSSProperties };
}

// Where a panel goes, and the handle to drag it by.
export function useDockPanel<T extends HTMLElement>(id: DockPanelId) {
    const layout = useDockLayout();
    const ref = useRef<T>(null);
    const handle = usePanelDrag(id);
    const docked = layout.docked(id);
    const spot = layout.floating[id];
    const floatingStyle: CSSProperties | undefined = spot && spot.x >= 0 ? { position: "fixed", left: spot.x, top: spot.y, right: "auto", bottom: "auto", zIndex: 70 } : undefined;
    return {
        docked,
        ref,
        style: layout.compact ? undefined : docked ? dockedStyle(id, layout) : floatingStyle,
        handle: layout.compact ? {} : handle,
        panel: { "data-panel": id },
    };
}

export { PANEL_IDS };
