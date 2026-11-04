import { create } from "zustand";
import type { Handedness } from "./gestures";

// The hand menu that an open palm brings up, shared between the menu itself
// and hand control, which stands still while it's open.
export type HandMenuState = {
    // `forShape` when the other hand was holding a shape as the palm opened:
    // the menu then offers things to do to it.
    open: { handedness: Handedness; x: number; y: number; pinchId: number; forShape: boolean } | null;
    hover: number | null;
    // The pinch that picked from (or closed) the menu, which mustn't also
    // grab or orbit once the menu is gone.
    spent: { handedness: Handedness; pinchId: number } | null;
};

export const useHandMenu = create<HandMenuState>()(() => ({ open: null, hover: null, spent: null }));

// What hand control is doing right now, so the cursors can say so.
export type HandActivity = "object" | "vertex" | "stretch" | "orbit" | "camera" | "slider" | "scroll" | "press" | "handle" | null;
// `reach` is how far a held shape is being pushed (positive: the hand reached
// toward the screen) or pulled, in meters past the dead zone. 0 when nothing is held.
export const useHandActivity = create<{ activity: HandActivity; reach: number }>()(() => ({ activity: null, reach: 0 }));

// A short note about what a gesture just did ("Copy placed"), shown by HandCommands.
export const useHandToast = create<{ id: number; text: string }>()(() => ({ id: 0, text: "" }));
export function handToast(text: string) {
    useHandToast.setState((s) => ({ id: s.id + 1, text }));
}
