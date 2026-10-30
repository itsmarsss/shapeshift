import { create } from "zustand";

// Lets code outside the canvas ask the camera to show the whole scene, such
// as after a template replaces it.
export const useFrameRequest = create<{ count: number }>(() => ({ count: 0 }));

export function frameScene() {
    useFrameRequest.setState((s) => ({ count: s.count + 1 }));
}
