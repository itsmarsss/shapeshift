import type { Handedness } from "./gestures";
import { useSettings } from "../settings/store";

// Lets a hand use the interface the way a mouse does: point at a button and
// pinch to press it. Points are 0 to 1 across and down the window.

const PRESSABLE = [
    "button",
    "a[href]",
    "summary",
    "label",
    // Sliders are dragged rather than pressed (see slideTo); colour wells and
    // dropdowns don't respond to a click, so they're left out.
    'input:not([type="color"])',
    "textarea",
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="option"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[role="button"]',
].join(", ");

// Anything on the interface (a panel, a list, a dialog) rather than the 3D view.
export function interfaceAt(x: number, y: number): HTMLElement | null {
    const el = document.elementFromPoint(x * window.innerWidth, y * window.innerHeight);
    return el instanceof HTMLElement && !el.closest("canvas") ? el : null;
}

// The nearest part of the page around el that can scroll, if any.
export function scrollerFor(el: HTMLElement): HTMLElement | null {
    for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
        const style = getComputedStyle(n);
        const tall = /(auto|scroll)/.test(style.overflowY) && n.scrollHeight > n.clientHeight + 1;
        const wide = /(auto|scroll)/.test(style.overflowX) && n.scrollWidth > n.clientWidth + 1;
        if (tall || wide) return n;
    }
    return null;
}

export const isSlider = (el: HTMLElement): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === "range";

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

// Moves a slider to where the hand is across it. The value is set the way
// typing would, so React's onChange sees it.
export function slideTo(el: HTMLInputElement, x: number) {
    const rect = el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (x * window.innerWidth - rect.left) / rect.width));
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    const step = Number(el.step);
    let value = min + t * (max - min);
    if (step > 0) value = Math.round((value - min) / step) * step + min;
    if (String(value) === el.value) return;
    setValue.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
}

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

// Buttons pull a nearby hand cursor onto themselves, since a hand in the air
// can't be as exact as a mouse: within MAGNET pixels counts as on it, and a
// button it's already on holds it until it's STICK times as far away.
const MAGNET = 44;
// Settings → Hand control scales it; 0 is off.
const magnet = () => MAGNET * useSettings.getState().handMagnet;
const STICK = 1.6;
// Where each hand's cursor is drawn, pulled toward what it's on.
const drawn: Record<Handedness, [number, number] | null> = { Left: null, Right: null };

function gap(rect: DOMRect, x: number, y: number) {
    return Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom));
}

// The control a hand is on or near, with the stickiness above. Points are
// 0 to 1 across and down the window.
export function magnetAt(handedness: Handedness, x: number, y: number): HTMLElement | null {
    const px = x * window.innerWidth;
    const py = y * window.innerHeight;
    let best: HTMLElement | null = controlAt(x, y);
    let bestGap = best ? 0 : Infinity;
    if (!best) {
        for (const el of document.querySelectorAll<HTMLElement>(PRESSABLE)) {
            const rect = el.getBoundingClientRect();
            if (!rect.width || !rect.height || el.matches(':disabled, [aria-disabled="true"]')) continue;
            const g = gap(rect, px, py);
            const reach = el === hovered[handedness] ? magnet() * STICK : magnet();
            if (g > reach || g >= bestGap) continue;
            // Only if it's really there, not hidden under a dialog.
            const cx = Math.min(Math.max(px, rect.left + 1), rect.right - 1);
            const cy = Math.min(Math.max(py, rect.top + 1), rect.bottom - 1);
            if (document.elementFromPoint(cx, cy)?.closest(PRESSABLE) !== el) continue;
            best = el;
            bestGap = g;
        }
    }
    if (best) {
        const rect = best.getBoundingClientRect();
        // Drawn part of the way to the middle of it, so the pull shows.
        drawn[handedness] = [px + (rect.left + rect.width / 2 - px) * 0.45, py + (rect.top + rect.height / 2 - py) * 0.45];
    } else drawn[handedness] = null;
    return best;
}

// A shape the hand is near but not on pulls the cursor too; HandControls
// sets where (in window pixels) it should be drawn.
const shapePull: Record<Handedness, [number, number] | null> = { Left: null, Right: null };
export function pullToShape(handedness: Handedness, at: [number, number] | null) {
    shapePull[handedness] = at;
}

// Where to draw a hand's cursor in pixels, when a control or shape has pulled it.
export function cursorPull(handedness: Handedness): [number, number] | null {
    return drawn[handedness] ?? shapePull[handedness];
}

export function hoveredControl(handedness: Handedness): HTMLElement | null {
    return hovered[handedness];
}

function mark(el: HTMLElement | null, on: boolean) {
    // Another hand may still be over it.
    if (!el || (!on && (hovered.Left === el || hovered.Right === el))) return;
    if (on) el.dataset.handHover = "";
    else delete el.dataset.handHover;
}

// Sent when a hand moves onto a control (or off, with null), for its tooltip.
export const HAND_HOVER_EVENT = "shapeshift:hand-hover";

// Highlights the control a hand is over, or clears it with null.
export function hoverControl(handedness: Handedness, el: HTMLElement | null) {
    if (!el) drawn[handedness] = null;
    const before = hovered[handedness];
    if (before === el) return;
    hovered[handedness] = el;
    mark(before, false);
    mark(el, true);
    window.dispatchEvent(new CustomEvent(HAND_HOVER_EVENT, { detail: el }));
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
    drawn.Left = drawn.Right = null;
}
