import { create } from "zustand";
import { isCompact } from "./compact";

type UIState = {
    showInspector: boolean;
    showChat: boolean;
    showSettings: boolean;
    showTemplates: boolean;
    showHistory: boolean;
    setShowInspector: (v: boolean) => void;
    setShowChat: (v: boolean) => void;
    setShowSettings: (v: boolean) => void;
    setShowTemplates: (v: boolean) => void;
    setShowHistory: (v: boolean) => void;
};

// On small screens the inspector, the assistant and the history share the
// bottom of the screen, so opening one closes the others, and all start closed.
export const useUI = create<UIState>()((set) => ({
    showInspector: !isCompact(),
    showChat: !isCompact(),
    showSettings: false,
    showTemplates: false,
    showHistory: false,
    setShowInspector: (showInspector) => set(showInspector && isCompact() ? { showInspector, showChat: false, showHistory: false } : { showInspector }),
    setShowChat: (showChat) => set(showChat && isCompact() ? { showChat, showInspector: false, showHistory: false } : { showChat }),
    setShowHistory: (showHistory) => set(showHistory && isCompact() ? { showHistory, showInspector: false, showChat: false } : { showHistory }),
    setShowSettings: (showSettings) => set({ showSettings }),
    setShowTemplates: (showTemplates) => set({ showTemplates }),
}));
