import { create } from "zustand";
import type { Handedness } from "./gestures";

// The hand menu that an open palm brings up, shared between the menu itself
// and hand control, which stands still while it's open.
export type HandMenuState = {
    open: { handedness: Handedness; x: number; y: number; pinchId: number } | null;
    hover: number | null;
    // The pinch that picked from (or closed) the menu, which mustn't also
    // grab or orbit once the menu is gone.
    spent: { handedness: Handedness; pinchId: number } | null;
};

export const useHandMenu = create<HandMenuState>()(() => ({ open: null, hover: null, spent: null }));
