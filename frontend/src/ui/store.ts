import { create } from "zustand";
import { isCompact } from "./compact";

type UIState = {
    showInspector: boolean;
    showChat: boolean;
    showSettings: boolean;
    setShowInspector: (v: boolean) => void;
    setShowChat: (v: boolean) => void;
    setShowSettings: (v: boolean) => void;
};

// On small screens the inspector and the assistant share the bottom of the
// screen, so opening one closes the other, and both start closed.
export const useUI = create<UIState>()((set) => ({
    showInspector: !isCompact(),
    showChat: !isCompact(),
    showSettings: false,
    setShowInspector: (showInspector) => set(showInspector && isCompact() ? { showInspector, showChat: false } : { showInspector }),
    setShowChat: (showChat) => set(showChat && isCompact() ? { showChat, showInspector: false } : { showChat }),
    setShowSettings: (showSettings) => set({ showSettings }),
}));
