import { create } from "zustand";
import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";
import { nanoid } from "nanoid";
import { applyCommand, type CommandResult } from "./commands";
import type { Command, SceneDoc } from "./schema";

enablePatches();

export type EditorMode = "object" | "edit" | "render";
export type TransformMode = "translate" | "rotate" | "scale";

export type Snap = {
    enabled: boolean;
    translate: number;
    rotate: number;
    scale: number;
};

type HistoryEntry = { patches: Patch[]; inverse: Patch[] };

type RunOptions = {
    coalesce?: string;
    select?: boolean;
};

export type SceneState = {
    doc: SceneDoc;
    past: HistoryEntry[];
    future: HistoryEntry[];
    openCoalesce: string | null;
    selectedId: string | null;
    mode: EditorMode;
    transformMode: TransformMode;
    snap: Snap;
    run: (commands: Command | Command[], options?: RunOptions) => CommandResult[];
    endCoalesce: () => void;
    undo: () => void;
    redo: () => void;
    load: (doc: SceneDoc) => void;
    select: (id: string | null) => void;
    setMode: (mode: EditorMode) => void;
    setTransformMode: (mode: TransformMode) => void;
    setSnap: (snap: Partial<Snap>) => void;
};

export const emptyDoc = (): SceneDoc => ({ version: 2, objects: [] });

const HISTORY_LIMIT = 200;

function pruneSelection(doc: SceneDoc, selectedId: string | null) {
    return selectedId && doc.objects.some((o) => o.id === selectedId) ? selectedId : null;
}

export const useScene = create<SceneState>()((set, get) => ({
    doc: emptyDoc(),
    past: [],
    future: [],
    openCoalesce: null,
    selectedId: null,
    mode: "object",
    transformMode: "translate",
    snap: { enabled: false, translate: 0.5, rotate: Math.PI / 12, scale: 0.1 },

    run: (commands, options = {}) => {
        const list = Array.isArray(commands) ? commands : [commands];
        const results: CommandResult[] = [];
        const state = get();
        const [doc, patches, inverse] = produceWithPatches(state.doc, (draft) => {
            for (const cmd of list) results.push(applyCommand(draft, cmd, () => nanoid(8)));
        });
        if (patches.length === 0) return results;

        const created = results.flatMap((r) => (r.ok ? r.created : []));
        const merge =
            options.coalesce !== undefined &&
            state.openCoalesce === options.coalesce &&
            state.future.length === 0 &&
            state.past.length > 0;

        const past = merge
            ? [
                  ...state.past.slice(0, -1),
                  {
                      patches: [...state.past[state.past.length - 1].patches, ...patches],
                      inverse: [...inverse, ...state.past[state.past.length - 1].inverse],
                  },
              ]
            : [...state.past, { patches, inverse }].slice(-HISTORY_LIMIT);

        set({
            doc,
            past,
            future: [],
            openCoalesce: options.coalesce ?? null,
            selectedId:
                options.select !== false && created.length > 0
                    ? created[created.length - 1]
                    : pruneSelection(doc, state.selectedId),
        });
        return results;
    },

    endCoalesce: () => set({ openCoalesce: null }),

    undo: () => {
        const { past, future, doc, selectedId } = get();
        const entry = past[past.length - 1];
        if (!entry) return;
        const next = applyPatches(doc, entry.inverse);
        set({
            doc: next,
            past: past.slice(0, -1),
            future: [entry, ...future],
            openCoalesce: null,
            selectedId: pruneSelection(next, selectedId),
        });
    },

    redo: () => {
        const { past, future, doc, selectedId } = get();
        const entry = future[0];
        if (!entry) return;
        const next = applyPatches(doc, entry.patches);
        set({
            doc: next,
            past: [...past, entry],
            future: future.slice(1),
            openCoalesce: null,
            selectedId: pruneSelection(next, selectedId),
        });
    },

    load: (doc) => set({ doc, past: [], future: [], openCoalesce: null, selectedId: null }),
    select: (id) => set({ selectedId: id }),
    setMode: (mode) => set({ mode }),
    setTransformMode: (transformMode) => set({ transformMode }),
    setSnap: (snap) => set((s) => ({ snap: { ...s.snap, ...snap } })),
}));

export const selectSelected = (s: SceneState) =>
    s.selectedId ? s.doc.objects.find((o) => o.id === s.selectedId) ?? null : null;
