import { useEffect, useRef } from "react";
import styled from "styled-components";
import { useSettings } from "../settings/store";
import { useHandActivity, useHandMenu, type HandActivity } from "./menu";
import { live, useHandHover } from "./tracker";
import type { HandState } from "./gestures";

const Layer = styled.div`
    position: absolute;
    inset: 0;
    pointer-events: none;
    // Above the panels and the hand menu, since the hands may be steering any of them.
    z-index: 90;
`;

// One cursor per hand. Its look and label say what a pinch will do, or what
// the pinch is doing now.
const Cursor = styled.div`
    position: absolute;
    left: 0;
    top: 0;
    display: none;

    i {
        position: absolute;
        width: 18px;
        height: 18px;
        margin: -9px 0 0 -9px;
        border-radius: 50%;
        border: 2px solid var(--cursor);
        transition: width 0.12s ease, height 0.12s ease, margin 0.12s ease, background 0.12s ease;
    }
    &[data-state="ready"] i {
        width: 30px;
        height: 30px;
        margin: -15px 0 0 -15px;
        border-color: var(--accent);
    }
    &[data-state="active"] i {
        background: var(--accent);
        border-color: var(--accent);
    }
    span {
        position: absolute;
        left: 20px;
        top: 12px;
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--surface);
        border: 1px solid var(--border);
        color: var(--text);
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
    }
    span:empty {
        display: none;
    }
`;

const Link = styled.svg`
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;

    line {
        stroke: var(--accent);
        stroke-width: 2;
        stroke-dasharray: 6 6;
    }
`;

const DOING: Record<Exclude<HandActivity, null>, string> = {
    object: "Moving",
    vertex: "Moving point",
    stretch: "Resize · turn",
    orbit: "Looking around",
    camera: "Zoom · pan",
};

function cursorFor(h: HandState, activity: HandActivity, hovered: boolean, objectHand: string, pair: boolean): { state: string; label: string } {
    // With both hands pinching, one label is enough.
    if (h.pinching) return { state: "active", label: activity && !(pair && h.handedness !== objectHand) ? DOING[activity] : "" };
    // Only the object hand grabs things; the other one always looks around.
    if (hovered && h.handedness === objectHand) return { state: "ready", label: "Pinch to grab" };
    return { state: "idle", label: "" };
}

export function HandOverlay() {
    const layer = useRef<HTMLDivElement>(null);
    const cursors = useRef<(HTMLDivElement | null)[]>([]);
    const link = useRef<SVGLineElement>(null);

    useEffect(() => {
        let raf = 0;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const el = layer.current;
            if (!el) return;
            const { width, height } = el.getBoundingClientRect();
            const { activity } = useHandActivity.getState();
            const hovered = useHandHover.getState().hoveredId !== null;
            const menuOpen = useHandMenu.getState().open !== null;
            const objectHand = useSettings.getState().handObject;
            const pair = live.hands.filter((h) => h.pinching).length >= 2;
            cursors.current.forEach((c, i) => {
                if (!c) return;
                const h = live.hands[i];
                c.style.display = h ? "block" : "none";
                if (!h) return;
                c.style.translate = `${h.x * width}px ${h.y * height}px`;
                const { state, label } = menuOpen ? { state: "idle", label: "" } : cursorFor(h, activity, hovered, objectHand, pair);
                c.dataset.state = state;
                const tag = c.querySelector("span");
                if (tag && tag.textContent !== label) tag.textContent = label;
            });
            // A line between the hands while both pinch.
            const [a, b] = live.hands;
            const both = a?.pinching && b?.pinching && !menuOpen;
            const line = link.current;
            if (line) {
                line.style.display = both ? "" : "none";
                if (both) {
                    line.setAttribute("x1", String(a.x * width));
                    line.setAttribute("y1", String(a.y * height));
                    line.setAttribute("x2", String(b.x * width));
                    line.setAttribute("y2", String(b.y * height));
                }
            }
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <Layer ref={layer}>
            <Link aria-hidden>
                <line ref={link} style={{ display: "none" }} />
            </Link>
            {[0, 1].map((i) => (
                <Cursor key={i} ref={(el) => void (cursors.current[i] = el)}>
                    <i />
                    <span />
                </Cursor>
            ))}
        </Layer>
    );
}
