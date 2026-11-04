import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import styled from "styled-components";
import { ChatsCircle, ClockCounterClockwise, PictureInPicture, SidebarSimple, SlidersHorizontal, Sparkle } from "@phosphor-icons/react";
import { isRow, SIDES, useDock, type DockPanelId, type DockSide } from "../ui/dock";
import { across, acrossSize, dropZones, rowTop, TAB_HEIGHT, TOPBAR, useDockDrag, useDockLayout, usePanelDrag, type DockLayout, type PlacedStack } from "../ui/useDockLayout";
import { IconButton } from "./ui";

// What the dock draws around the panels: tabs for stacks with several open
// panels, handles to resize columns, rows and stacks, and while a panel is being
// dragged, where it can go.

const PANEL_NAMES: Record<DockPanelId, string> = { inspector: "Inspector", assistant: "Assistant", chat: "Room chat", history: "History" };
const PANEL_ICONS = { inspector: SlidersHorizontal, assistant: Sparkle, chat: ChatsCircle, history: ClockCounterClockwise };

export function DockToggle({ id }: { id: DockPanelId }) {
    const layout = useDockLayout();
    const toggle = useDock((s) => s.toggleFloat);
    if (layout.compact) return null;
    const docked = layout.docked(id);
    const side = id === "inspector" ? "left" : "right";
    return (
        <IconButton title={docked ? "Pop out as a floating panel" : `Dock to the ${side} side`} onPointerDown={(e) => e.stopPropagation()} onClick={() => toggle(id)}>
            {docked ? <PictureInPicture size={16} /> : <SidebarSimple size={16} style={side === "right" ? { transform: "scaleX(-1)" } : undefined} />}
        </IconButton>
    );
}

const Tabs = styled.div`
    position: absolute;
    z-index: 31;
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: ${TAB_HEIGHT}px;
    padding: 0 6px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: none;
`;

const Tab = styled.button<{ $active: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid ${(p) => (p.$active ? "var(--border)" : "transparent")};
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    background: ${(p) => (p.$active ? "var(--surface)" : "transparent")};
    color: ${(p) => (p.$active ? "var(--text)" : "var(--text-muted)")};
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    margin-bottom: -1px;

    &:hover {
        color: var(--text);
    }
`;

// Where a stack's tab strip goes: across its top, in a column or a row.
function tabsPlace(stack: PlacedStack, layout: DockLayout) {
    if (stack.side === "top" || stack.side === "bottom")
        return { top: rowTop(stack.side, stack.side === "top" ? layout.top : layout.bottom), left: across(stack.from), width: acrossSize(stack.size) };
    return { top: `calc(var(--topbar) + (100% - var(--topbar)) * ${stack.from})`, [stack.side]: 0, width: stack.side === "left" ? layout.left : layout.right };
}

function StackTabs({ stack, layout }: { stack: PlacedStack; layout: DockLayout }) {
    const setActive = useDock((s) => s.setActive);
    return (
        <Tabs role="tablist" aria-label="Panels" style={tabsPlace(stack, layout)}>
            {stack.open.map((id) => (
                <TabButton key={id} id={id} active={stack.shown === id} onSelect={() => setActive(stack.side, stack.index, id)} />
            ))}
        </Tabs>
    );
}

function TabButton({ id, active, onSelect }: { id: DockPanelId; active: boolean; onSelect: () => void }) {
    const drag = usePanelDrag(id);
    const Icon = PANEL_ICONS[id];
    return (
        <Tab type="button" role="tab" data-drag aria-selected={active} $active={active} onClick={onSelect} {...drag} title={`${PANEL_NAMES[id]} · drag to move`}>
            <Icon size={13} weight={active ? "fill" : "regular"} />
            {PANEL_NAMES[id]}
        </Tab>
    );
}

const Grip = styled.div<{ $axis: "x" | "y" }>`
    position: absolute;
    z-index: 32;
    touch-action: none;
    cursor: ${(p) => (p.$axis === "x" ? "col-resize" : "row-resize")};

    &::after {
        content: "";
        position: absolute;
        ${(p) => (p.$axis === "x" ? "top: 0; bottom: 0; left: 3px; width: 2px;" : "left: 0; right: 0; top: 3px; height: 2px;")}
        transition: background 0.15s ease;
    }
    &:hover::after,
    &[data-active]::after {
        background: var(--accent);
    }
`;

// Drag a column's or row's inner edge to resize it.
function SideGrip({ side, size }: { side: DockSide; size: number }) {
    const setSize = useDock((s) => s.setSize);
    const grip = useRef<HTMLDivElement>(null);
    const row = isRow(side);
    const start = (e: ReactPointerEvent) => {
        e.preventDefault();
        const from = row ? e.clientY : e.clientX;
        grip.current?.setAttribute("data-active", "");
        const move = (ev: PointerEvent) => {
            const at = row ? ev.clientY : ev.clientX;
            setSize(side, size + (side === "left" || side === "top" ? at - from : from - at));
        };
        const up = () => {
            grip.current?.removeAttribute("data-active");
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };
    const place = row
        ? { left: "var(--dock-left)", right: "var(--dock-right)", height: 8, ...(side === "top" ? { top: `calc(var(--topbar) + ${size - 4}px)` } : { bottom: size - 4 }) }
        : { top: "var(--topbar)", bottom: 0, width: 8, [side]: size - 4 };
    return <Grip ref={grip} $axis={row ? "y" : "x"} role="separator" aria-orientation={row ? "horizontal" : "vertical"} title="Drag to resize" onPointerDown={start} style={place} />;
}

// Drag the line between two stacks to give one more room.
function StackGrip({ side, stacks, at, layout }: { side: DockSide; stacks: PlacedStack[]; at: number; layout: DockLayout }) {
    const setWeights = useDock((s) => s.setWeights);
    const columns = useDock((s) => s.columns);
    const grip = useRef<HTMLDivElement>(null);
    const above = stacks[at]!;
    const below = stacks[at + 1]!;
    const start = (e: ReactPointerEvent) => {
        e.preventDefault();
        const row = isRow(side);
        const from = row ? e.clientX : e.clientY;
        const body = row ? window.innerWidth - layout.left - layout.right : window.innerHeight - TOPBAR;
        const total = stacks.reduce((n, s) => n + s.weight, 0);
        grip.current?.setAttribute("data-active", "");
        const move = (ev: PointerEvent) => {
            const delta = (((row ? ev.clientX : ev.clientY) - from) / body) * total;
            const pair = above.weight + below.weight;
            const a = Math.min(pair - 0.15, Math.max(0.15, above.weight + delta));
            const weights = columns[side].map((s, i) => (i === above.index ? a : i === below.index ? pair - a : s.weight));
            setWeights(side, weights);
        };
        const up = () => {
            grip.current?.removeAttribute("data-active");
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };
    const place = isRow(side)
        ? { width: 8, height: side === "top" ? layout.top : layout.bottom, top: rowTop(side as "top" | "bottom", side === "top" ? layout.top : layout.bottom), left: `calc(${across(below.from)} - 4px)` }
        : { height: 8, width: side === "left" ? layout.left : layout.right, [side]: 0, top: `calc(var(--topbar) + (100% - var(--topbar)) * ${below.from} - 4px)` };
    const vertical = isRow(side);
    return <Grip ref={grip} $axis={vertical ? "x" : "y"} role="separator" aria-orientation={vertical ? "vertical" : "horizontal"} title="Drag to resize" onPointerDown={start} style={place} />;
}

const Zone = styled.div<{ $on: boolean }>`
    position: fixed;
    z-index: 950;
    pointer-events: none;
    border-radius: 10px;
    border: ${(p) => (p.$on ? "2px solid var(--accent)" : "1px dashed color-mix(in srgb, var(--accent) 45%, transparent)")};
    background: ${(p) => (p.$on ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "transparent")};
    transition: all 0.12s ease;
`;

const Ghost = styled.div`
    position: fixed;
    z-index: 960;
    pointer-events: none;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--accent);
    color: var(--accent-text);
    font-size: 12px;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    translate: 12px 12px;
`;

// While a panel is dragged: where it would land, and its name at the pointer.
function DropPreview() {
    const drag = useDockDrag((s) => s.drag);
    const layout = useDockLayout();
    if (!drag) return null;
    const zones = dropZones(layout);
    const t = drag.target;
    const hit = t && t.kind !== "float" ? zones.find((z) => JSON.stringify(z.target) === JSON.stringify(t)) : null;
    const where = !t ? "" : t.kind === "float" ? "Float here" : t.kind === "tab" ? "Add as a tab" : "New panel here";
    return (
        <>
            {/* Every place it could go, faintly, and the one it will go, clearly. */}
            {zones.map((z, i) => z !== hit && <Zone key={i} $on={false} style={{ left: z.rect.left + 3, top: z.rect.top + 3, width: z.rect.width - 6, height: z.rect.height - 6 }} />)}
            {hit && <Zone $on style={{ left: hit.preview.left, top: hit.preview.top, width: hit.preview.width, height: hit.preview.height }} />}
            <Ghost style={{ left: drag.x, top: drag.y }}>
                {PANEL_NAMES[drag.id]} · {where}
            </Ghost>
        </>
    );
}

export function DockFrames() {
    const layout = useDockLayout();
    const reveal = useDock((s) => s.reveal);
    // A panel that opens comes to the front of its stack.
    const was = useRef(layout.open);
    useEffect(() => {
        for (const id of Object.keys(layout.open) as DockPanelId[]) if (layout.open[id] && !was.current[id]) reveal(id);
        was.current = layout.open;
    }, [layout.open, reveal]);
    if (layout.compact) return null;
    return (
        <>
            {SIDES.map((side) => {
                const stacks = layout.stacks[side];
                if (!stacks.length) return null;
                return (
                    <div key={side}>
                        {stacks.map((s) => s.open.length > 1 && <StackTabs key={`tabs-${s.index}`} stack={s} layout={layout} />)}
                        {stacks.slice(0, -1).map((_, i) => (
                            <StackGrip key={`grip-${i}`} side={side} stacks={stacks} at={i} layout={layout} />
                        ))}
                        <SideGrip side={side} size={layout[side]} />
                    </div>
                );
            })}
            <DropPreview />
        </>
    );
}
