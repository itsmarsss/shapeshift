import { create } from "zustand";

type UIState = {
    showInspector: boolean;
    showChat: boolean;
    showSettings: boolean;
    setShowInspector: (v: boolean) => void;
    setShowChat: (v: boolean) => void;
    setShowSettings: (v: boolean) => void;
};

export const useUI = create<UIState>()((set) => ({
    showInspector: true,
    showChat: true,
    showSettings: false,
    setShowInspector: (showInspector) => set({ showInspector }),
    setShowChat: (showChat) => set({ showChat }),
    setShowSettings: (showSettings) => set({ showSettings }),
}));
