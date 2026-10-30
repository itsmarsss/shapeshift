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
    showOnboarding: boolean;
    setShowInspector: (v: boolean) => void;
    setShowChat: (v: boolean) => void;
    setShowSettings: (v: boolean) => void;
    setShowOnboarding: (v: boolean) => void;
};

// On small screens the inspector and the assistant share the bottom of the
// screen, so opening one closes the other, and both start closed.
export const useUI = create<UIState>()((set) => ({
    showInspector: !isCompact(),
    showChat: !isCompact(),
    showSettings: false,
    showOnboarding: needsOnboarding(),
    setShowInspector: (showInspector) => set(showInspector && isCompact() ? { showInspector, showChat: false } : { showInspector }),
    setShowChat: (showChat) => set(showChat && isCompact() ? { showChat, showInspector: false } : { showChat }),
    setShowSettings: (showSettings) => set({ showSettings }),
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
