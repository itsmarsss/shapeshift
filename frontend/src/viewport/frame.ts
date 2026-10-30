import { create } from "zustand";

// Lets code outside the canvas ask the camera to show the whole scene, such
// as after a template replaces it.
export const useFrameRequest = create<{ count: number; ids: string[] | null }>(() => ({ count: 0, ids: null }));

// Frames everything, or just the given objects.
export function frameScene(ids?: string[]) {
    useFrameRequest.setState((s) => ({ count: s.count + 1, ids: ids ?? null }));
}
