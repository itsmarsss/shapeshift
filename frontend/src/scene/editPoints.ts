import { useScene } from "./store";

// Editing a shape's points happens on the shape itself, not in a mode of its
// own: start it on the one selected shape (double-click it, Enter, or Edit
// points) and finish with Done, Esc, or by clicking off it.

export function startEditPoints(id?: string) {
    const s = useScene.getState();
    if (id && (s.selectedIds.length !== 1 || s.selectedId !== id)) s.select(id);
    const now = useScene.getState();
    if (now.selectedIds.length !== 1 || !now.doc.objects.some((o) => o.id === now.selectedId)) return;
    now.endCoalesce();
    now.setMode("edit");
}

export function stopEditPoints() {
    const s = useScene.getState();
    if (s.mode !== "edit") return;
    s.endCoalesce();
    s.setMode("object");
}

// Done when the shape being edited is no longer the one selection.
useScene.subscribe((s) => {
    if (s.mode === "edit" && (s.selectedIds.length !== 1 || !s.doc.objects.some((o) => o.id === s.selectedId))) s.setMode("object");
});
