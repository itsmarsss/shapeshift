import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { HAND_HOVER_EVENT } from "../hands/pointer";

// Tooltips for the editor's buttons, by mouse or by hand. A button's name
// (its title) shows first; keep pointing and a line about what it does
// follows. They replace the browser's own, which are slow to appear and never
// show for a hand.

// What buttons do, matched on the start of their names.
const ABOUT: [string, string][] = [
    ["Add a ", "Puts this ready-made object in the scene, as one group you can move"],
    ["Add ", "Puts this shape in the middle of the floor. Drag it to move it"],
    ["All shapes", "Every shape you can add, including stars, text and tubes"],
    ["Snap", "Moves, turns and resizes in even steps, so things line up"],
    ["Undo", "Takes back the last change (⌘Z)"],
    ["Redo", "Puts back what you undid (⇧⌘Z)"],
    ["History", "Every change so far. Click one to go back to it"],
    ["Animation timeline", "Keyframes for making things move, and recording a video"],
    ["Turn on hand control", "Control the editor with your hands through the camera"],
    ["Turn off hand control", "Stops the camera and hand tracking"],
    ["Inspector", "Size, colour and material of what's selected"],
    ["Assistant", "Describe what to build or change, by typing or out loud"],
    ["Settings", "Look, controls, hand tracking and your data"],
    ["Arrange", "Add, move and style shapes"],
    ["Reshape", "Drag the points of a shape to change its form"],
    ["Preview", "See it lit and shaded, without the editing helpers"],
    ["Drag to turn the view", "Drag to orbit, or click a face to look from that side"],
    ["Fit", "Moves the camera so everything (or the selection) is in view (F)"],
    ["Reset the view", "Back to the camera's starting angle"],
    ["Export for 3D printing", "Saves an STL at the size you choose"],
    ["Start from a template", "Opens a ready-made scene to change"],
    ["Send feedback", "Tell us what's working and what isn't"],
    ["Workplane", "Click a face, and new shapes and drags follow that surface"],
    ["Ruler", "Click two points to measure the distance between them"],
    ["Group", "Joins the selection so it moves as one (⌘G)"],
    ["Ungroup", "Splits a group back into its pieces (⇧⌘G)"],
    ["Delete", "Removes what's selected (Delete)"],
];

const NAME_DELAY = 350;
const ABOUT_DELAY = 1100;

const Tip = styled.div`
    position: fixed;
    z-index: 9000;
    max-width: 260px;
    padding: 7px 10px;
    border-radius: 9px;
    background: var(--text);
    color: var(--bg);
    font-size: 12px;
    line-height: 1.4;
    pointer-events: none;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);

    b {
        font-weight: 600;
    }
    span {
        display: block;
        margin-top: 2px;
        opacity: 0.75;
    }
    @media (prefers-reduced-motion: no-preference) {
        animation: tip-in 0.12s ease-out;
    }
    @keyframes tip-in {
        from {
            opacity: 0;
            transform: translateY(3px);
        }
    }
`;

// Where the tip sits: under the button, over it, or to its right (for the toolbar down the left edge).
type Side = "below" | "above" | "right";
type Shown = { el: HTMLElement; name: string; about: string | null; long: boolean; x: number; y: number; side: Side };

// The element's name, taking it off the element while the tip shows so the
// browser doesn't show its own as well.
function borrowTitle(el: HTMLElement): string | null {
    const title = el.getAttribute("title") ?? el.dataset.tipTitle ?? el.getAttribute("aria-label");
    // Browser tests find buttons by their title, so it stays put for them.
    if (el.hasAttribute("title") && !navigator.webdriver) {
        el.dataset.tipTitle = el.getAttribute("title")!;
        el.removeAttribute("title");
    }
    return title;
}

function giveBack(el: HTMLElement) {
    if (el.dataset.tipTitle !== undefined && !el.hasAttribute("title")) el.setAttribute("title", el.dataset.tipTitle);
    delete el.dataset.tipTitle;
}

const target = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>("[title], [data-tip-title]") : null);

export function Tooltips() {
    const [shown, setShown] = useState<Shown | null>(null);
    const timers = useRef<number[]>([]);
    const current = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const clear = () => {
            timers.current.forEach(clearTimeout);
            timers.current = [];
        };
        const hide = () => {
            clear();
            if (current.current) giveBack(current.current);
            current.current = null;
            setShown(null);
        };
        const show = (el: HTMLElement, fast: boolean) => {
            if (current.current === el) return;
            hide();
            const name = borrowTitle(el);
            if (!name) return;
            current.current = el;
            const about = el.dataset.tip ?? ABOUT.find(([start]) => name.startsWith(start))?.[1] ?? null;
            const place = (long: boolean) => {
                if (current.current !== el || !el.isConnected) return hide();
                const rect = el.getBoundingClientRect();
                const side: Side = rect.left < 120 ? "right" : rect.bottom + 70 < window.innerHeight ? "below" : "above";
                const x = side === "right" ? rect.right + 10 : Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140);
                const y = side === "right" ? rect.top + rect.height / 2 : side === "below" ? rect.bottom + 8 : rect.top - 8;
                setShown({ el, name, about: about !== name ? about : null, long, x, y, side });
            };
            timers.current.push(window.setTimeout(() => place(false), fast ? 0 : NAME_DELAY));
            if (about) timers.current.push(window.setTimeout(() => place(true), ABOUT_DELAY + (fast ? 0 : NAME_DELAY)));
        };

        const over = (e: PointerEvent) => {
            if (e.pointerType === "touch") return;
            const el = target(e.target);
            if (el) show(el, false);
            else if (current.current) hide();
        };
        const out = (e: PointerEvent) => {
            if (current.current && !current.current.contains(e.relatedTarget as Node | null)) hide();
        };
        // A hand pointing at a button gets its tip straight away.
        const hand = (e: Event) => {
            const el = (e as CustomEvent<HTMLElement | null>).detail;
            if (el && target(el)) show(target(el)!, true);
            else if (!el) hide();
        };
        document.addEventListener("pointerover", over);
        document.addEventListener("pointerout", out);
        document.addEventListener("pointerdown", hide, true);
        window.addEventListener(HAND_HOVER_EVENT, hand);
        return () => {
            hide();
            document.removeEventListener("pointerover", over);
            document.removeEventListener("pointerout", out);
            document.removeEventListener("pointerdown", hide, true);
            window.removeEventListener(HAND_HOVER_EVENT, hand);
        };
    }, []);

    if (!shown) return null;
    return (
        <Tip role="tooltip" style={{ left: shown.x, top: shown.y, translate: shown.side === "right" ? "0 -50%" : shown.side === "above" ? "-50% -100%" : "-50% 0" }}>
            <b>{shown.name}</b>
            {shown.long && shown.about && <span>{shown.about}</span>}
        </Tip>
    );
}
