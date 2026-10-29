import { create } from "zustand";

type UIState = {
    showInspector: boolean;
    showChat: boolean;
    setShowInspector: (v: boolean) => void;
    setShowChat: (v: boolean) => void;
};

export const useUI = create<UIState>()((set) => ({
    showInspector: true,
    showChat: true,
    setShowInspector: (showInspector) => set({ showInspector }),
    setShowChat: (showChat) => set({ showChat }),
}));
