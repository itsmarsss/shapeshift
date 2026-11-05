// Checks a build the way a person glancing at it would: is anything floating,
// sunk into the ground, stopping just short of what it should meet, or
// colliding with something else? The assistant gets these after its changes
// so it can fix them, and the Model lab counts them to score a run. Design:
// dev/text-to-cad-design.md.
//
// Everything works on world-space boxes, so it's quick and predictable. Boxes
// are generous for rotated parts and round ones, which means some floating
// parts read as touching (missed, not wrongly reported), and the overlap
// thresholds are high so a rough box doesn't cry wolf.
import type { SceneDoc, SceneObject, Vec3 } from "@shapeshift/shared/scene/schema";
import { worldBounds } from "../assistant/assistant";

export type IssueKind = "floating" | "gap" | "sunken" | "overlap";
export type Issue = { kind: IssueKind; ids: string[]; message: string };

// Parts this close to meeting count as meeting another part (or the ground):
// closer than a couple of centimeters doesn't show.
const MIN_TOLERANCE = 0.02;
// A floating part this close to a part of its own build was meant to meet it.
const GAP_MAX = 0.05;
// Separate things whose boxes share this much of the smaller one collide.
const COLLIDE = 0.25;
// Sunk this much of its height into the ground: put there by its center, not
// by its base. A little less is usually on purpose (a rock settled in).
const SUNK = 0.25;

type Part = { o: SceneObject; min: Vec3; max: Vec3; build: string };

const round = (v: number) => (Math.round(v * 100) / 100).toString();
const smallest = (p: Part) => Math.min(...[0, 1, 2].map((i) => p.max[i] - p.min[i]));
const volume = (p: Part) => [0, 1, 2].reduce((v, i) => v * Math.max(0, p.max[i] - p.min[i]), 1);
const tolerance = (a: Part, b?: Part) => Math.max(MIN_TOLERANCE, 0.02 * Math.min(smallest(a), b ? smallest(b) : Infinity));

// How far apart two boxes are (0 when they touch or overlap).
function gap(a: Part, b: Part) {
    const d = [0, 1, 2].map((i) => Math.max(0, a.min[i] - b.max[i], b.min[i] - a.max[i]));
    return Math.hypot(d[0], d[1], d[2]);
}

function shared(a: Part, b: Part) {
    return [0, 1, 2].reduce((v, i) => v * Math.max(0, Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])), 1);
}

// Inside a plain, unturned box, and clear of all its faces: it can't show.
// Round and turned shapes have boxes bigger than they are, and decorations
// (stripes, hubcaps, windows) sit on a face poking out, so neither counts.
function buried(inner: Part, outer: Part) {
    const g = outer.o.geometry.type;
    if (g !== "box" || outer.o.rotation.some((r) => Math.abs(r) > 1e-3)) return false;
    const margin = tolerance(inner, outer);
    return [0, 1, 2].every((i) => inner.min[i] > outer.min[i] + margin && inner.max[i] < outer.max[i] - margin);
}

const footprintsMeet = (a: Part, b: Part) => a.min[0] < b.max[0] && b.min[0] < a.max[0] && a.min[2] < b.max[2] && b.min[2] < a.max[2];

function names(parts: Part[]) {
    const shown = parts.slice(0, 3).map((p) => p.o.name);
    return parts.length > 3 ? `${shown.join(", ")} and ${parts.length - 3} more` : shown.join(" and ");
}

/**
 * The problems in a scene. With `only`, just the problems involving those
 * objects (what the assistant changed), so it isn't told about the rest.
 */
export function checkScene(doc: SceneDoc, options: { only?: Iterable<string> } = {}): Issue[] {
    const only = options.only ? new Set(options.only) : null;
    const parts: Part[] = doc.objects
        .filter((o) => !o.hole)
        .map((o) => {
            const b = worldBounds(o);
            return { o, min: b.min, max: b.max, build: o.group ?? `#${o.id}` };
        });
    const issues: Issue[] = [];
    const involves = (ps: Part[]) => !only || ps.some((p) => only.has(p.o.id));

    // Which parts touch which, and what rests on the ground.
    const touching = parts.map(() => [] as number[]);
    for (let i = 0; i < parts.length; i++)
        for (let j = i + 1; j < parts.length; j++)
            if (gap(parts[i], parts[j]) <= tolerance(parts[i], parts[j])) {
                touching[i].push(j);
                touching[j].push(i);
            }
    const held = new Set<number>();
    const queue = parts.flatMap((p, i) => (p.min[1] <= tolerance(p) ? [i] : []));
    for (const i of queue) held.add(i);
    while (queue.length)
        for (const j of touching[queue.pop()!])
            if (!held.has(j)) {
                held.add(j);
                queue.push(j);
            }

    // Floating: clusters of touching parts that nothing connects to the ground.
    const seen = new Set<number>();
    for (let i = 0; i < parts.length; i++) {
        if (held.has(i) || seen.has(i)) continue;
        const cluster: number[] = [];
        const stack = [i];
        seen.add(i);
        while (stack.length) {
            const k = stack.pop()!;
            cluster.push(k);
            for (const j of touching[k])
                if (!seen.has(j)) {
                    seen.add(j);
                    stack.push(j);
                }
        }
        const members = cluster.map((k) => parts[k]);
        if (!involves(members)) continue;
        const bottom = Math.min(...members.map((p) => p.min[1]));

        // Just short of a part of its own build: it was meant to meet it.
        let near: { part: Part; by: number } | null = null;
        for (const m of members)
            for (const p of parts)
                if (!cluster.includes(parts.indexOf(p)) && p.build === m.build && !p.build.startsWith("#")) {
                    const by = gap(m, p);
                    if (by <= GAP_MAX && (!near || by < near.by)) near = { part: p, by };
                }
        const ids = members.map((p) => p.o.id);
        const group = members[0].o.group;
        const whole = group && parts.filter((p) => p.o.group === group).length === members.length ? `Group "${group}"` : names(members);
        if (near) {
            issues.push({ kind: "gap", ids, message: `${whole} stops ${round(near.by)} m short of ${near.part.o.name} and isn't touching anything. Move it to meet ${near.part.o.name}.` });
            continue;
        }
        // What's under it, to say how far to come down.
        const under = parts.filter((p, k) => !cluster.includes(k) && p.max[1] <= bottom + 1e-6 && members.some((m) => footprintsMeet(m, p)));
        const below = under.reduce<Part | null>((best, p) => (!best || p.max[1] > best.max[1] ? p : best), null);
        const drop = bottom - (below ? below.max[1] : 0);
        issues.push({
            kind: "floating",
            ids,
            message: `${whole} floats ${round(drop)} m above ${below ? below.o.name : "the ground"}, touching nothing that holds it up. Lower it by ${round(drop)} m or attach it, unless it's meant to float.`,
        });
    }

    // Sunken: into the ground. Flat, wide things (hills, islands, water) are
    // ground themselves and often sit partly below it on purpose.
    for (const p of parts) {
        const height = p.max[1] - p.min[1];
        const terrain = Math.min(p.max[0] - p.min[0], p.max[2] - p.min[2]) >= 3 * height;
        if (terrain || -p.min[1] <= Math.max(tolerance(p), SUNK * height) || !involves([p])) continue;
        issues.push({ kind: "sunken", ids: [p.o.id], message: `${p.o.name} goes ${round(-p.min[1])} m below the ground. Raise it by that much.` });
    }

    // Overlap: separate builds colliding, or a part buried inside its own build.
    // Only named groups count as separate builds: loose parts are often one
    // build nobody grouped.
    for (let i = 0; i < parts.length; i++)
        for (let j = i + 1; j < parts.length; j++) {
            const [a, b] = [parts[i], parts[j]];
            const small = Math.min(volume(a), volume(b));
            if (small <= 1e-9 || !involves([a, b])) continue;
            const part = shared(a, b) / small;
            if (a.o.group && b.o.group && a.build !== b.build && part > COLLIDE) {
                issues.push({
                    kind: "overlap",
                    ids: [a.o.id, b.o.id],
                    message: `${a.o.name} and ${b.o.name} run into each other (${Math.round(part * 100)}% of the smaller one), though they're separate things. Move one aside.`,
                });
            } else if (a.build === b.build && (buried(a, b) || buried(b, a))) {
                const [inner, outer] = buried(a, b) ? [a, b] : [b, a];
                issues.push({ kind: "overlap", ids: [inner.o.id, outer.o.id], message: `${inner.o.name} is hidden inside ${outer.o.name}. Move it to where it should show, or remove it.` });
            }
        }
    return issues;
}

// "2 floating, 1 colliding", or "none", for the Model lab.
export function summarizeCounts(counts: Record<IssueKind, number>): string {
    const words: Record<IssueKind, string> = { floating: "floating", gap: "short of meeting", sunken: "sunken", overlap: "colliding or hidden" };
    const parts = (Object.keys(words) as IssueKind[]).filter((k) => counts[k]).map((k) => `${counts[k]} ${words[k]}`);
    return parts.length ? parts.join(", ") : "none";
}

export const issueTotal = (counts: Record<IssueKind, number>) => counts.floating + counts.gap + counts.sunken + counts.overlap;

// Counts by kind, for scoring a Model lab run.
export function issueCounts(issues: Issue[]): Record<IssueKind, number> {
    const counts: Record<IssueKind, number> = { floating: 0, gap: 0, sunken: 0, overlap: 0 };
    for (const i of issues) counts[i.kind]++;
    return counts;
}
