import { create } from "zustand";

// Where the big panels live: docked to a side of the editor, like Blender's
// sidebars, where they take their own column and the 3D view shrinks to fit;
// or floating over the view as cards that can be dragged anywhere. Each
// panel's choice and docked width are remembered.

export type DockPanelId = "inspector" | "assistant" | "chat";
export type DockMode = "dock" | "float";

export const DOCK_SIDE: Record<DockPanelId, "left" | "right"> = { inspector: "left", assistant: "right", chat: "right" };
export const DOCK_MIN = 260;
export const DOCK_MAX = 520;

type Saved = { mode: Record<DockPanelId, DockMode>; width: Record<DockPanelId, number> };
const KEY = "shapeshift-dock";
const DEFAULTS: Saved = {
    mode: { inspector: "dock", assistant: "dock", chat: "float" },
    width: { inspector: 280, assistant: 360, chat: 320 },
};

function load(): Saved {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
        return { mode: { ...DEFAULTS.mode, ...saved?.mode }, width: { ...DEFAULTS.width, ...saved?.width } };
    } catch {
        return DEFAULTS;
    }
}

type DockState = Saved & {
    setMode: (id: DockPanelId, mode: DockMode) => void;
    setWidth: (id: DockPanelId, width: number) => void;
};

export const useDock = create<DockState>()((set, get) => {
    const save = () => {
        try {
            const { mode, width } = get();
            localStorage.setItem(KEY, JSON.stringify({ mode, width }));
        } catch {
            // Remembering is optional.
        }
    };
    return {
        ...load(),
        setMode: (id, mode) => (set((s) => ({ mode: { ...s.mode, [id]: mode } })), save()),
        setWidth: (id, width) => (set((s) => ({ width: { ...s.width, [id]: Math.round(Math.min(DOCK_MAX, Math.max(DOCK_MIN, width))) } })), save()),
    };
});
