import { create } from "zustand";
import { isCompact } from "./compact";

const ONBOARDED_KEY = "shapeshift-onboarded";

function needsOnboarding() {
    if (typeof window === "undefined" || new URL(location.href).searchParams.has("room")) return false;
    try {
        return !localStorage.getItem(ONBOARDED_KEY);
    } catch {
        return false;
    }
}

type UIState = {
    showInspector: boolean;
    showChat: boolean;
    showSettings: boolean;
    showTemplates: boolean;
    showHistory: boolean;
    showParts: boolean;
    showOnboarding: boolean;
    setShowInspector: (v: boolean) => void;
    setShowChat: (v: boolean) => void;
    setShowSettings: (v: boolean) => void;
    setShowTemplates: (v: boolean) => void;
    setShowHistory: (v: boolean) => void;
    setShowParts: (v: boolean) => void;
    setShowOnboarding: (v: boolean) => void;
};

// On small screens the inspector, the assistant and the history share the
// bottom of the screen, so opening one closes the others, and all start closed.
export const useUI = create<UIState>()((set) => ({
    showInspector: !isCompact(),
    showChat: !isCompact(),
    showSettings: false,
    showOnboarding: needsOnboarding(),
    showTemplates: false,
    showHistory: false,
    showParts: false,
    setShowInspector: (showInspector) => set(showInspector && isCompact() ? { showInspector, showChat: false, showHistory: false, showParts: false } : { showInspector }),
    setShowChat: (showChat) => set(showChat && isCompact() ? { showChat, showInspector: false, showHistory: false, showParts: false } : { showChat }),
    // The part list and the history sit in the same place.
    setShowHistory: (showHistory) => set(showHistory ? { showHistory, showParts: false, ...(isCompact() ? { showInspector: false, showChat: false } : {}) } : { showHistory }),
    setShowParts: (showParts) => set(showParts ? { showParts, showHistory: false, ...(isCompact() ? { showInspector: false, showChat: false } : {}) } : { showParts }),
    setShowSettings: (showSettings) => set({ showSettings }),
    setShowTemplates: (showTemplates) => set({ showTemplates }),
    setShowOnboarding: (showOnboarding) => {
        if (!showOnboarding) {
            try {
                localStorage.setItem(ONBOARDED_KEY, "1");
            } catch {
                // Storage is optional.
            }
        }
        set({ showOnboarding });
    },
}));
