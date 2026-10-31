import type { Handedness } from "./gestures";

// Lets a hand use the interface the way a mouse does: point at a button and
// pinch to press it. Points are 0 to 1 across and down the window.

const PRESSABLE = [
    "button",
    "a[href]",
    "summary",
    "label",
    // Sliders and dropdowns don't respond to a click, so they're left out.
    'input:not([type="range"]):not([type="color"])',
    "textarea",
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="option"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[role="button"]',
].join(", ");

const TYPING = 'textarea, input:not([type]), input[type="text"], input[type="number"], input[type="search"], input[type="email"]';

// The control under the point, if it's part of the interface rather than the 3D view.
export function controlAt(x: number, y: number): HTMLElement | null {
    const el = document.elementFromPoint(x * window.innerWidth, y * window.innerHeight);
    if (!el || el.closest("canvas")) return null;
    const control = el.closest<HTMLElement>(PRESSABLE);
    if (!control || control.matches(':disabled, [aria-disabled="true"]')) return null;
    return control;
}

const hovered: Record<Handedness, HTMLElement | null> = { Left: null, Right: null };

function mark(el: HTMLElement | null, on: boolean) {
    // Another hand may still be over it.
    if (!el || (!on && (hovered.Left === el || hovered.Right === el))) return;
    if (on) el.dataset.handHover = "";
    else delete el.dataset.handHover;
}

// Highlights the control a hand is over, or clears it with null.
export function hoverControl(handedness: Handedness, el: HTMLElement | null) {
    const before = hovered[handedness];
    if (before === el) return;
    hovered[handedness] = el;
    mark(before, false);
    mark(el, true);
}

export function isOverControl(handedness: Handedness) {
    return hovered[handedness] !== null;
}

// What a pinch on a control does: fields get focus, everything else is clicked.
export function pressControl(el: HTMLElement) {
    if (el.matches(TYPING)) el.focus();
    else el.click();
    el.dataset.handPress = "";
    setTimeout(() => delete el.dataset.handPress, 180);
}

export function clearControls() {
    hoverControl("Left", null);
    hoverControl("Right", null);
}
