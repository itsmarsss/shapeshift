import type { TargetAndTransition, Transition, Variants } from "motion/react";

// Quick to start and soft to land, so things feel responsive rather than floaty.
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Spread onto an `m` component: `<m.div {...fade}>`.
type Pose = TargetAndTransition;
const preset = (initial: Pose, exit: Pose = initial, duration = 0.2): { initial: Pose; animate: Pose; exit: Pose; transition: Transition } => ({
    initial,
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit,
    transition: { duration, ease: EASE_OUT },
});

// Dimmed backgrounds behind dialogs.
export const fade = preset({ opacity: 0 }, { opacity: 0 }, 0.16);
// Dialogs grow in from slightly smaller.
export const pop = preset({ opacity: 0, scale: 0.96, y: 10 }, { opacity: 0, scale: 0.98, y: 4 }, 0.22);
// Menus drop from the button that opened them.
export const drop = preset({ opacity: 0, scale: 0.97, y: -6 }, { opacity: 0, scale: 0.98, y: -4 }, 0.14);
// Cards and notes that appear above something.
export const rise = preset({ opacity: 0, y: 12 }, { opacity: 0, y: 8 }, 0.24);
// Side panels slide in from their edge.
export const slide = (from: "left" | "right" | "bottom") =>
    preset(
        from === "bottom" ? { opacity: 0, y: 24 } : { opacity: 0, x: from === "left" ? -16 : 16 },
        from === "bottom" ? { opacity: 0, y: 16 } : { opacity: 0, x: from === "left" ? -10 : 10 },
        0.22
    );

// A page's sections and a grid's cards come in one after another.
export const list: Variants = {
    hidden: {},
    shown: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};
export const item: Variants = {
    hidden: { opacity: 0, y: 12 },
    shown: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } },
};
