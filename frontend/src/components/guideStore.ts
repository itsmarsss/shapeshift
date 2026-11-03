import { create } from "zustand";

// A pointer at one control on screen, with a short note: "Pick a new color
// here". `target` is a CSS selector; the first visible match is used, and
// without one the note shows in the middle of the view.
export type Guide = { target: string; text: string };

export const useGuide = create<{ guide: Guide | null }>()(() => ({ guide: null }));

export const showGuide = (guide: Guide) => useGuide.setState({ guide });
export const hideGuide = () => useGuide.setState({ guide: null });
