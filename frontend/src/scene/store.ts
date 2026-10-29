import { create } from "zustand";
import { produce } from "immer";
import { nanoid } from "nanoid";
import { applyCommand, type CommandResult } from "./commands";
import { applyDiff, diffDocs, isEmptyDiff, mergeDiffs, type DocDiff } from "./diff";
import type { Command, SceneDoc } from "./schema";

export type EditorMode = "object" | "edit" | "render";
export type TransformMode = "translate" | "rotate" | "scale";

export type Snap = {
    enabled: boolean;
    translate: number;
    rotate: number;
    scale: number;
};

// One undo step: the before and after state of every entity it touched.
type HistoryEntry = DocDiff;

type RunOptions = {
    coalesce?: string;
    select?: boolean;
};

export type SceneState = {
    doc: SceneDoc;
    past: HistoryEntry[];
    future: HistoryEntry[];
    openCoalesce: string | null;
    // The primary selection, which the inspector and gizmo follow.
    selectedId: string | null;
    // Everything selected, primary last.
    selectedIds: string[];
    mode: EditorMode;
    transformMode: TransformMode;
    snap: Snap;
    run: (commands: Command | Command[], options?: RunOptions) => CommandResult[];
    endCoalesce: () => void;
    undo: () => void;
    redo: () => void;
    load: (doc: SceneDoc) => void;
    select: (id: string | null, options?: { toggle?: boolean }) => void;
    selectMany: (ids: string[]) => void;
    setMode: (mode: EditorMode) => void;
    setTransformMode: (mode: TransformMode) => void;
    setSnap: (snap: Partial<Snap>) => void;
};

export const emptyDoc = (): SceneDoc => ({ version: 2, objects: [], lights: [] });

const HISTORY_LIMIT = 200;

function exists(doc: SceneDoc, id: string) {
    return doc.objects.some((o) => o.id === id) || doc.lights.some((l) => l.id === id);
}

function selection(ids: string[]) {
    return { selectedIds: ids, selectedId: ids[ids.length - 1] ?? null };
}

function pruneSelection(doc: SceneDoc, ids: string[]) {
    return selection(ids.filter((id) => exists(doc, id)));
}

export const useScene = create<SceneState>()((set, get) => ({
    doc: emptyDoc(),
    past: [],
    future: [],
    openCoalesce: null,
    selectedId: null,
    selectedIds: [],
    mode: "object",
    transformMode: "translate",
    snap: { enabled: false, translate: 0.5, rotate: Math.PI / 12, scale: 0.1 },

    run: (commands, options = {}) => {
        const list = Array.isArray(commands) ? commands : [commands];
        const results: CommandResult[] = [];
        const state = get();
        const doc = produce(state.doc, (draft) => {
            for (const cmd of list) results.push(applyCommand(draft, cmd, () => nanoid(8)));
        });
        const diff = diffDocs(state.doc, doc);
        if (isEmptyDiff(diff)) return results;

        const created = results.flatMap((r) => (r.ok ? r.created : []));
        const merge =
            options.coalesce !== undefined &&
            state.openCoalesce === options.coalesce &&
            state.future.length === 0 &&
            state.past.length > 0;

        const past = merge
            ? [...state.past.slice(0, -1), mergeDiffs(state.past[state.past.length - 1], diff)]
            : [...state.past, diff].slice(-HISTORY_LIMIT);

        set({
            doc,
            past,
            future: [],
            openCoalesce: options.coalesce ?? null,
            ...(options.select !== false && created.length > 0
                ? selection([created[created.length - 1]])
                : pruneSelection(doc, state.selectedIds)),
        });
        return results;
    },

    endCoalesce: () => set({ openCoalesce: null }),

    undo: () => {
        const { past, future, doc, selectedIds } = get();
        const entry = past[past.length - 1];
        if (!entry) return;
        const next = applyDiff(doc, entry, "before");
        set({
            doc: next,
            past: past.slice(0, -1),
            future: [entry, ...future],
            openCoalesce: null,
            ...pruneSelection(next, selectedIds),
        });
    },

    redo: () => {
        const { past, future, doc, selectedIds } = get();
        const entry = future[0];
        if (!entry) return;
        const next = applyDiff(doc, entry, "after");
        set({
            doc: next,
            past: [...past, entry],
            future: future.slice(1),
            openCoalesce: null,
            ...pruneSelection(next, selectedIds),
        });
    },

    load: (doc) => set({ doc, past: [], future: [], openCoalesce: null, ...selection([]) }),
    select: (id, options = {}) =>
        set((s) => {
            if (id === null) return selection([]);
            if (!options.toggle) return selection([id]);
            return selection(s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id]);
        }),
    selectMany: (ids) => set(selection([...new Set(ids)])),
    setMode: (mode) => set({ mode }),
    setTransformMode: (transformMode) => set({ transformMode }),
    setSnap: (snap) => set((s) => ({ snap: { ...s.snap, ...snap } })),
}));

export const selectSelected = (s: SceneState) =>
    s.selectedId ? s.doc.objects.find((o) => o.id === s.selectedId) ?? null : null;

export const selectSelectedObjects = (s: SceneState) => s.doc.objects.filter((o) => s.selectedIds.includes(o.id));

export const selectSelectedLight = (s: SceneState) =>
    s.selectedId ? s.doc.lights.find((l) => l.id === s.selectedId) ?? null : null;
