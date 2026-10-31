import { useEffect, useRef } from "react";
import styled, { keyframes } from "styled-components";
import { ArrowUUpLeft, Copy, Cube, Cylinder, Globe, Trash, type Icon } from "@phosphor-icons/react";
import type { Primitive } from "@shapeshift/shared/scene/schema";
import { ConeIcon, TorusIcon } from "../components/icons";
import { useScene } from "../scene/store";
import { restingAt } from "../scene/commands";
import { duplicateSelection, removeSelection } from "../scene/selection";
import { floorPointAt } from "../viewport/frame";
import { PalmTracker } from "./palm";
import { useHandMenu } from "./menu";
import { live, useHands } from "./tracker";

type Item = { label: string; Icon: Icon | typeof ConeIcon; act: (at: { x: number; y: number }) => void; needsSelection?: boolean };

function addShape(primitive: Primitive) {
    return ({ x, y }: { x: number; y: number }) => {
        const floor = floorPointAt(x, y);
        useScene.getState().run({ type: "add", primitive, ...(floor ? { position: restingAt(primitive, floor[0], floor[1]) } : {}) });
    };
}

const ITEMS: Item[] = [
    { label: "Box", Icon: Cube, act: addShape("box") },
    { label: "Sphere", Icon: Globe, act: addShape("sphere") },
    { label: "Cylinder", Icon: Cylinder, act: addShape("cylinder") },
    { label: "Cone", Icon: ConeIcon, act: addShape("cone") },
    { label: "Ring", Icon: TorusIcon, act: addShape("torus") },
    { label: "Duplicate", Icon: Copy, act: duplicateSelection, needsSelection: true },
    { label: "Delete", Icon: Trash, act: removeSelection, needsSelection: true },
    { label: "Undo", Icon: ArrowUUpLeft, act: () => useScene.getState().undo() },
];

const RADIUS = 104;
const HIT = 44;
// Moving the hand this far past the ring, losing it, or waiting closes the menu.
const LEAVE = RADIUS + 110;
const LOST_MS = 500;
const IDLE_MS = 6000;

const grow = keyframes`
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
`;

const Ring = styled.div`
    position: absolute;
    width: ${RADIUS * 2 + 80}px;
    height: ${RADIUS * 2 + 80}px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 70;
    animation: ${grow} 0.16s ease-out;
`;

const Hint = styled.div`
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 11px;
    white-space: nowrap;
`;

const Option = styled.div<{ $hover: boolean; $off: boolean }>`
    position: absolute;
    width: 64px;
    height: 64px;
    margin: -32px 0 0 -32px;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: ${(p) => (p.$hover ? "var(--accent)" : "var(--surface)")};
    color: ${(p) => (p.$hover ? "var(--accent-text)" : p.$off ? "var(--text-faint)" : "var(--text)")};
    border: 1px solid ${(p) => (p.$hover ? "var(--accent)" : "var(--border-strong)")};
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    transform: scale(${(p) => (p.$hover ? 1.12 : 1)});
    transition: transform 0.1s ease, background 0.1s ease;
    font-size: 10px;
    font-weight: 600;
`;

// The hand menu: hold an open palm and a ring of choices appears around the
// hand. Move to one and pinch to pick it; pinch on nothing, move away or wait
// to close it. New shapes land on the floor where the palm was.
export function HandMenu() {
    const status = useHands((s) => s.status);
    const open = useHandMenu((s) => s.open);
    const hover = useHandMenu((s) => s.hover);
    const hasSelection = useScene((s) => s.selectedIds.length > 0);
    const layer = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (status !== "running") return;
        const palms = new PalmTracker();
        let lastFrames = live.frames;
        let lostSince: number | null = null;
        let openedAt = 0;
        let raf = 0;
        const close = () => useHandMenu.setState({ open: null, hover: null });
        const tick = () => {
            raf = requestAnimationFrame(tick);
            if (live.frames === lastFrames) return;
            lastFrames = live.frames;
            const now = performance.now();
            const rect = layer.current?.parentElement?.getBoundingClientRect();
            if (!rect) return;
            const menu = useHandMenu.getState();
            const opened = palms.update(live.frames, now);

            if (!menu.open) {
                const hand = opened && live.hands.find((h) => h.handedness === opened);
                if (hand) {
                    openedAt = now;
                    lostSince = null;
                    useHandMenu.setState({ open: { handedness: hand.handedness, x: hand.x, y: hand.y, pinchId: hand.pinchId }, hover: null });
                }
                return;
            }

            const hand = live.hands.find((h) => h.handedness === menu.open!.handedness);
            if (!hand) {
                lostSince ??= now;
                if (now - lostSince > LOST_MS) close();
                return;
            }
            lostSince = null;
            const dx = (hand.x - menu.open.x) * rect.width;
            const dy = (hand.y - menu.open.y) * rect.height;
            if (Math.hypot(dx, dy) > LEAVE || now - openedAt > IDLE_MS) return close();

            let near: number | null = null;
            ITEMS.forEach((_, i) => {
                const a = (i / ITEMS.length) * Math.PI * 2 - Math.PI / 2;
                if (Math.hypot(dx - Math.cos(a) * RADIUS, dy - Math.sin(a) * RADIUS) < HIT) near = i;
            });
            if (near !== menu.hover) useHandMenu.setState({ hover: near });

            // A new pinch picks what the hand is over, or closes the menu.
            if (hand.pinching && hand.pinchId !== menu.open.pinchId) {
                const item = near === null ? null : ITEMS[near];
                const at = { x: menu.open.x, y: menu.open.y };
                close();
                useHandMenu.setState({ spent: { handedness: hand.handedness, pinchId: hand.pinchId } });
                if (item && !(item.needsSelection && !useScene.getState().selectedIds.length)) item.act(at);
            }
        };
        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            close();
        };
    }, [status]);

    return (
        <div ref={layer} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {open && (
                <Ring role="menu" aria-label="Hand menu" style={{ left: `${open.x * 100}%`, top: `${open.y * 100}%` }}>
                    <Hint>Pinch to choose</Hint>
                    {ITEMS.map((item, i) => {
                        const a = (i / ITEMS.length) * Math.PI * 2 - Math.PI / 2;
                        const off = Boolean(item.needsSelection && !hasSelection);
                        return (
                            <Option
                                key={item.label}
                                role="menuitem"
                                aria-disabled={off}
                                $hover={hover === i && !off}
                                $off={off}
                                style={{ left: `calc(50% + ${Math.cos(a) * RADIUS}px)`, top: `calc(50% + ${Math.sin(a) * RADIUS}px)` }}
                            >
                                <item.Icon size={22} />
                                {item.label}
                            </Option>
                        );
                    })}
                </Ring>
            )}
        </div>
    );
}
