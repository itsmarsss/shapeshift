import type { CSSProperties } from "react";
import { useCollab } from "../collab/session";
import { useCompact } from "./compact";
import { DOCK_SIDE, useDock, type DockPanelId } from "./dock";
import { useInspectorVisible } from "./inspector";
import { useDraggable } from "./hooks";
import { useUI } from "./store";

// Which panels are open and docked right now, and so how wide each side's
// column is. Phones have bottom sheets instead, so nothing docks there.
export function useDockLayout() {
    const compact = useCompact();
    const mode = useDock((s) => s.mode);
    const width = useDock((s) => s.width);
    const open: Record<DockPanelId, boolean> = {
        inspector: useInspectorVisible(),
        assistant: useUI((s) => s.showChat),
        chat: useCollab((s) => s.chatOpen && (s.status === "live" || s.status === "reconnecting")),
    };
    const docked = (id: DockPanelId) => !compact && open[id] && mode[id] === "dock";
    const left = docked("inspector") ? width.inspector : 0;
    // The assistant and the room chat share the right column, one above the other.
    const right = docked("assistant") ? width.assistant : docked("chat") ? width.chat : 0;
    const stacked = docked("assistant") && docked("chat");
    return { compact, open, docked, left, right, stacked };
}

// Where a docked panel sits in its column.
export function dockedStyle(id: DockPanelId, layout: ReturnType<typeof useDockLayout>): CSSProperties {
    const side = DOCK_SIDE[id];
    const w = side === "left" ? layout.left : layout.right;
    const vertical: CSSProperties = !layout.stacked
        ? { top: "var(--topbar)", bottom: 0 }
        : id === "assistant"
          ? { top: "var(--topbar)", bottom: "calc((100% - var(--topbar)) * 0.4)" }
          : { top: "calc(var(--topbar) + (100% - var(--topbar)) * 0.6)", bottom: 0 };
    return {
        position: "absolute",
        ...vertical,
        [side]: 0,
        [side === "left" ? "right" : "left"]: "auto",
        width: w,
        height: "auto",
        maxHeight: "none",
        borderRadius: 0,
        borderTop: "none",
        borderBottom: layout.stacked && id === "assistant" ? "1px solid var(--border)" : "none",
        [side === "left" ? "borderLeft" : "borderRight"]: "none",
        boxShadow: "none",
    };
}

// Where a dockable panel goes, and the handle to drag it by while it floats.
export function useDockPanel<T extends HTMLElement>(id: DockPanelId) {
    const layout = useDockLayout();
    const docked = layout.docked(id);
    const drag = useDraggable<T>(`panel-${id}`, { keepTransform: true });
    const floating = !layout.compact && !docked;
    return {
        docked,
        ref: drag.ref,
        style: docked ? dockedStyle(id, layout) : floating ? drag.style : undefined,
        // Dragged by its header while it floats.
        handle: floating ? drag.handle : {},
    };
}
