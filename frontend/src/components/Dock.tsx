import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import styled from "styled-components";
import { PictureInPicture, SidebarSimple } from "@phosphor-icons/react";
import { DOCK_SIDE, useDock, type DockPanelId } from "../ui/dock";
import { useDockLayout } from "../ui/useDockLayout";
import { IconButton } from "./ui";

// The pieces a dockable panel uses: where it goes, a button to dock it or
// pop it out, and a handle to make a docked one wider.

export function DockToggle({ id }: { id: DockPanelId }) {
    const mode = useDock((s) => s.mode[id]);
    const setMode = useDock((s) => s.setMode);
    const compact = useDockLayout().compact;
    if (compact) return null;
    const docked = mode === "dock";
    return (
        <IconButton
            title={docked ? "Pop out as a floating panel" : `Dock to the ${DOCK_SIDE[id]} side`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMode(id, docked ? "float" : "dock")}
        >
            {docked ? <PictureInPicture size={16} /> : <SidebarSimple size={16} style={DOCK_SIDE[id] === "right" ? { transform: "scaleX(-1)" } : undefined} />}
        </IconButton>
    );
}

const Grip = styled.div`
    position: absolute;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: col-resize;
    z-index: 2;
    touch-action: none;

    &::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 3px;
        width: 2px;
        background: transparent;
        transition: background 0.15s ease;
    }
    &:hover::after,
    &[data-active]::after {
        background: var(--accent);
    }
`;

// Drag the inner edge of a docked panel to make it wider or narrower.
export function DockResizer({ id }: { id: DockPanelId }) {
    const layout = useDockLayout();
    // Stacked on the right, the two panels share one column: the assistant's.
    const target: DockPanelId = layout.stacked && DOCK_SIDE[id] === "right" ? "assistant" : id;
    const setWidth = useDock((s) => s.setWidth);
    const width = useDock((s) => s.width[target]);
    const docked = layout.docked(id);
    const grip = useRef<HTMLDivElement>(null);
    if (!docked) return null;
    const side = DOCK_SIDE[id];
    const start = (e: ReactPointerEvent) => {
        e.preventDefault();
        const from = e.clientX;
        grip.current?.setAttribute("data-active", "");
        const move = (ev: PointerEvent) => setWidth(target, width + (side === "left" ? ev.clientX - from : from - ev.clientX));
        const up = () => {
            grip.current?.removeAttribute("data-active");
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };
    const style: CSSProperties = side === "left" ? { right: -4 } : { left: -4 };
    return <Grip ref={grip} style={style} onPointerDown={start} title="Drag to resize" role="separator" aria-orientation="vertical" />;
}
