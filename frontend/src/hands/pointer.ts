import type { Handedness } from "./gestures";

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
