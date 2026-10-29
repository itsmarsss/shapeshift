import { create } from "zustand";

// Dispatch this event to start or stop voice input from anywhere, such as a
// hand gesture. The chat's message field listens for it.
export const VOICE_TOGGLE_EVENT = "shapeshift:voice-toggle";

export const useVoice = create<{ listening: boolean }>()(() => ({ listening: false }));
