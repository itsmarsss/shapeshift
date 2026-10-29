import { groupNames } from "./commands";
import type { Command } from "./schema";
import { useScene } from "./store";

// Editor actions on the whole selection, shared by shortcuts and the inspector.

const selectedObjects = () => {
    const s = useScene.getState();
    return s.doc.objects.filter((o) => s.selectedIds.includes(o.id));
};

export function removeSelection() {
    const s = useScene.getState();
    if (!s.selectedIds.length) return;
    s.run(s.selectedIds.map((id): Command => ({ type: "remove", target: id })));
}

export function duplicateSelection() {
    const s = useScene.getState();
    if (!s.selectedIds.length) return;
    const results = s.run(
        s.selectedIds.map((id): Command => ({ type: "duplicate", target: id })),
        { select: false }
    );
    s.selectMany(results.flatMap((r) => (r.ok ? r.created : [])));
}

export function groupSelection(name?: string) {
    const objects = selectedObjects();
    if (objects.length < 2) return;
    const s = useScene.getState();
    const taken = new Set([...groupNames(s.doc), ...s.doc.objects.map((o) => o.name), ...s.doc.lights.map((l) => l.name)]);
    let group = name?.trim() || "Group";
    for (let i = 2; taken.has(group); i++) group = `${name?.trim() || "Group"} ${i}`;
    s.run({ type: "group", name: group, targets: objects.map((o) => o.id) });
}

export function ungroupSelection() {
    const s = useScene.getState();
    const groups = new Set(selectedObjects().flatMap((o) => (o.group ? [o.group] : [])));
    if (groups.size) s.run([...groups].map((g): Command => ({ type: "ungroup", target: g })));
}

export function selectAll() {
    const s = useScene.getState();
    s.selectMany(s.doc.objects.map((o) => o.id));
}
