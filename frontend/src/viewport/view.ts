import { create } from "zustand";

export type Axis = "x" | "y" | "z";

export type Section = {
    on: boolean;
    axis: Axis;
    // Keep the other side of the cut.
    flip: boolean;
    // Where the cut is across the model, from 0 to 1.
    at: number;
};

// How you're looking at the model right now. None of it is part of the scene,
// so it isn't undoable and doesn't reach anyone else in a shared room.
type ViewState = {
    hidden: ReadonlySet<string>;
    section: Section;
    explode: number;
    setHidden: (ids: string[], hidden: boolean) => void;
    isolate: (ids: string[], all: string[]) => void;
    showAll: () => void;
    setSection: (section: Partial<Section>) => void;
    setExplode: (explode: number) => void;
};

export const MAX_EXPLODE = 1;

export const useView = create<ViewState>()((set) => ({
    hidden: new Set(),
    section: { on: false, axis: "x", flip: false, at: 0.5 },
    explode: 0,
    setHidden: (ids, hidden) =>
        set((s) => {
            const next = new Set(s.hidden);
            for (const id of ids) {
                if (hidden) next.add(id);
                else next.delete(id);
            }
            return { hidden: next };
        }),
    isolate: (ids, all) => {
        const keep = new Set(ids);
        set({ hidden: new Set(all.filter((id) => !keep.has(id))) });
    },
    showAll: () => set({ hidden: new Set() }),
    setSection: (section) => set((s) => ({ section: { ...s.section, ...section } })),
    setExplode: (explode) => set({ explode: Math.min(MAX_EXPLODE, Math.max(0, explode)) }),
}));
