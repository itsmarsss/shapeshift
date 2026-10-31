import { create } from "zustand";
import { useUI } from "./store";

// Dispatch this event to start or stop voice input from anywhere, such as a
// hand gesture. The chat's message field listens for it.
export const VOICE_TOGGLE_EVENT = "shapeshift:voice-toggle";

// `waiting` is set when listening was asked for before the assistant's
// message field had loaded; it starts listening as soon as it has.
export const useVoice = create<{ listening: boolean; waiting: boolean }>()(() => ({ listening: false, waiting: false }));

// Starts or stops talking to the assistant, opening it if it's closed.
export function toggleVoice() {
    const ui = useUI.getState();
    if (ui.showChat) window.dispatchEvent(new CustomEvent(VOICE_TOGGLE_EVENT));
    else {
        useVoice.setState({ waiting: true });
        ui.setShowChat(true);
    }
}
