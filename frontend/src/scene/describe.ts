import type { DocDiff, EntityChange } from "./diff";

type Named = { id: string; name: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// The plain-language verb for one changed entity, judged by which fields differ.
function verb(change: EntityChange<Named & Record<string, unknown>>): string {
    const { before, after } = change;
    if (!before) return "Added";
    if (!after) return "Deleted";
    const changed = Object.keys(after).filter((key) => !same(before[key], after[key]));
    const only = (...keys: string[]) => changed.length > 0 && changed.every((key) => keys.includes(key));
    if (only("name")) return "Renamed";
    if (only("position", "aim")) return "Moved";
    if (only("rotation")) return "Rotated";
    if (only("scale")) return "Resized";
    if (only("position", "rotation", "scale", "aim")) return "Transformed";
    if (only("material")) {
        const keys = Object.keys(after.material as object).filter(
            (key) => !same((before.material as Record<string, unknown>)[key], (after.material as Record<string, unknown>)[key]),
        );
        return keys.length === 1 && keys[0] === "color" ? "Recolored" : "Restyled";
    }
    if (only("color")) return "Recolored";
    if (only("geometry")) return "Reshaped";
    if (only("group")) return after.group ? "Grouped" : "Ungrouped";
    return "Edited";
}

function subject(changes: EntityChange<Named>[], noun: string) {
    if (changes.length === 1) return (changes[0].after ?? changes[0].before)!.name;
    return `${changes.length} ${noun}s`;
}

// A short label for one undo step, like "Added Box" or "Moved 3 objects".
export function describeDiff(diff: DocDiff): string {
    const entities = [
        ...diff.objects.map((c) => ({ change: c as EntityChange<Named>, noun: "object", verb: verb(c as never) })),
        ...diff.lights.map((c) => ({ change: c as EntityChange<Named>, noun: "light", verb: verb(c as never) })),
    ];
    if (entities.length === 0) {
        if (diff.environment) return diff.environment.after === "none" ? "Removed lighting preset" : `Lighting set to ${diff.environment.after}`;
        if (diff.animation) return "Edited animation";
        return "Edited scene";
    }
    const verbs = new Set(entities.map((e) => e.verb));
    if (verbs.size > 1) return `Edited ${entities.length} items`;
    const [v] = verbs;
    const nouns = new Set(entities.map((e) => e.noun));
    const label = nouns.size === 1 ? subject(entities.map((e) => e.change), entities[0].noun) : `${entities.length} items`;
    return `${v} ${label}`;
}

// Which icon family a step belongs to, for the history list.
export function diffKind(diff: DocDiff): "add" | "remove" | "edit" {
    const all = [...diff.objects, ...diff.lights];
    if (all.length && all.every((c) => !c.before)) return "add";
    if (all.length && all.every((c) => !c.after)) return "remove";
    return "edit";
}
