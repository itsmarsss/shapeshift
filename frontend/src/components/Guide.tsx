import { useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { X } from "@phosphor-icons/react";
import { pop } from "../ui/motion";
import { hideGuide, useGuide } from "./guideStore";
import { IconButton } from "./ui";

// Draws the guide: a pulsing ring around its control and a note beside it.
// Pressing the control, Escape or the note's X puts it away.

const ping = keyframes`
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); }
    100% { box-shadow: 0 0 0 14px transparent; }
`;

const Ring = styled.div`
    position: fixed;
    z-index: 900;
    border: 2px solid var(--accent);
    border-radius: 12px;
    pointer-events: none;
    transition: all 0.2s ease;
    @media (prefers-reduced-motion: no-preference) {
        animation: ${ping} 1.2s ease-out infinite;
    }
`;

const Note = styled(m.div)`
    position: fixed;
    z-index: 901;
    width: 240px;
    display: flex;
    gap: 6px;
    align-items: flex-start;
    padding: 10px 6px 10px 12px;
    border-radius: 12px;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 500;
    line-height: 1.4;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);

    span {
        flex: 1;
    }
    button {
        color: inherit;
        flex-shrink: 0;
    }
    button:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.18);
        color: inherit;
    }
`;

type Box = { x: number; y: number; w: number; h: number };

function find(selector: string): Element | null {
    for (const el of document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return el;
    }
    return null;
}

export function Guide() {
    const guide = useGuide((s) => s.guide);
    const [box, setBox] = useState<Box | null>(null);

    // Follows the control as panels slide and the window resizes.
    useEffect(() => {
        if (!guide) return;
        let raf = 0;
        const tick = () => {
            const r = find(guide.target)?.getBoundingClientRect();
            setBox((b) => (!r ? null : b && b.x === r.left && b.y === r.top && b.w === r.width && b.h === r.height ? b : { x: r.left, y: r.top, w: r.width, h: r.height }));
            raf = requestAnimationFrame(tick);
        };
        tick();
        const press = (e: PointerEvent) => {
            const el = find(guide.target);
            if (el && el.contains(e.target as Node)) hideGuide();
        };
        const key = (e: KeyboardEvent) => e.key === "Escape" && hideGuide();
        window.addEventListener("pointerdown", press, true);
        window.addEventListener("keydown", key);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("pointerdown", press, true);
            window.removeEventListener("keydown", key);
        };
    }, [guide]);

    // The note goes on whichever side has room: below, above, or beside.
    const W = 240;
    let note: { left: number; top: number };
    if (!box) note = { left: window.innerWidth / 2 - W / 2, top: window.innerHeight / 2 - 40 };
    else {
        const below = box.y + box.h + 12;
        const fitsBelow = below + 90 < window.innerHeight;
        const left = Math.min(Math.max(8, box.x + box.w / 2 - W / 2), window.innerWidth - W - 8);
        note = box.h > window.innerHeight * 0.5 ? { left: Math.min(box.x + box.w + 12, window.innerWidth - W - 8), top: box.y + 12 } : fitsBelow ? { left, top: below } : { left, top: Math.max(8, box.y - 90) };
    }

    return (
        <AnimatePresence>
            {guide && (
                <m.div key={guide.target + guide.text} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {box && <Ring style={{ left: box.x - 4, top: box.y - 4, width: box.w + 8, height: box.h + 8 }} />}
                    <Note {...pop} role="status" style={note}>
                        <span>{guide.text}</span>
                        <IconButton $size={24} title="Close the guide" onClick={hideGuide}>
                            <X size={14} />
                        </IconButton>
                    </Note>
                </m.div>
            )}
        </AnimatePresence>
    );
}
