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
    // The inspector was opened for scene settings while nothing was selected.
    sceneOpen: boolean;
    showChat: boolean;
    showSettings: boolean;
    showTemplates: boolean;
    showFeedback: boolean;
    showHistory: boolean;
    showOnboarding: boolean;
    setShowInspector: (v: boolean) => void;
    setShowChat: (v: boolean) => void;
    setShowSettings: (v: boolean) => void;
    setShowTemplates: (v: boolean) => void;
    setShowFeedback: (v: boolean) => void;
    setShowHistory: (v: boolean) => void;
    setShowOnboarding: (v: boolean) => void;
};

// On small screens the inspector, the assistant and the history share the
// bottom of the screen, so opening one closes the others, and all start closed.
// The assistant also starts closed on laptop-sized screens, where it would
// take a third of the view; the get-started card offers it instead.
export const useUI = create<UIState>()((set) => ({
    showInspector: !isCompact(),
    sceneOpen: false,
    showChat: !isCompact() && typeof window !== "undefined" && window.innerWidth >= 1400,
    showSettings: false,
    showOnboarding: needsOnboarding(),
    showTemplates: false,
    showFeedback: false,
    showHistory: false,
    setShowInspector: (showInspector) => set(showInspector && isCompact() ? { showInspector, showChat: false, showHistory: false } : { showInspector }),
    setShowChat: (showChat) => set(showChat && isCompact() ? { showChat, showInspector: false, showHistory: false } : { showChat }),
    setShowHistory: (showHistory) => set(showHistory && isCompact() ? { showHistory, showInspector: false, showChat: false } : { showHistory }),
    setShowSettings: (showSettings) => set({ showSettings }),
    setShowTemplates: (showTemplates) => set({ showTemplates }),
    setShowFeedback: (showFeedback) => set({ showFeedback }),
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
