import * as THREE from "three";
import { DEFAULT_GEOMETRY, groupMembers, groupNames, restingPose } from "./commands";
import type { Axis, Command, Primitive, Vec3 } from "@shapeshift/shared/scene/schema";
import { hullPoints } from "./geometry";
import { useScene } from "./store";
import { useTools, workplaneQuaternion } from "../viewport/tools";

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

// The selection as command targets: a group that's wholly selected is named
// once so it moves as one piece.
export function selectionTargets(): string[] {
    const s = useScene.getState();
    const objects = selectedObjects();
    const targets: string[] = [];
    const done = new Set<string>();
    for (const o of objects) {
        if (done.has(o.id)) continue;
        const members = o.group ? groupMembers(s.doc, o.group) : [];
        if (members.length > 1 && members.every((m) => s.selectedIds.includes(m.id))) {
            targets.push(o.group!);
            for (const m of members) done.add(m.id);
        } else {
            targets.push(o.id);
            done.add(o.id);
        }
    }
    return targets;
}

export function dropSelection() {
    const targets = selectionTargets();
    if (!targets.length) return;
    const wp = useTools.getState().workplane;
    useScene.getState().run({ type: "drop", targets, ...(wp ? { origin: wp.origin, normal: wp.normal } : {}) }, { select: false });
}

export function alignSelection(axis: Axis, to: "min" | "center" | "max") {
    const targets = selectionTargets();
    if (targets.length > 1) useScene.getState().run({ type: "align", targets, axis, to }, { select: false });
}

export function mirrorSelection(axis: Axis) {
    const targets = selectionTargets();
    if (targets.length) useScene.getState().run({ type: "mirror", targets, axis }, { select: false });
}

export function setSelectionHole(hole: boolean) {
    const s = useScene.getState();
    if (s.selectedIds.length) s.run(selectedObjects().map((o): Command => ({ type: "hole", target: o.id, hole })), { select: false });
}

const SPOTS: [number, number][] = [];
for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) SPOTS.push([x * 1.5, z * 1.5]);
SPOTS.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));

// Adds a shape sitting on the workplane, in the nearest free spot.
export function addShape(primitive: Primitive) {
    const s = useScene.getState();
    const wp = useTools.getState().workplane;
    if (!wp) return s.run({ type: "add", primitive });
    const geometry = DEFAULT_GEOMETRY[primitive];
    const turn = workplaneQuaternion(wp);
    const rotation = turn.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...restingPose(geometry, 1).rotation)));
    const normal = new THREE.Vector3(...wp.normal).normalize();
    const points = hullPoints(geometry);
    const v = new THREE.Vector3();
    let low = Infinity;
    for (let i = 0; i < points.length; i += 3) low = Math.min(low, v.set(points[i], points[i + 1], points[i + 2]).applyQuaternion(rotation).dot(normal));
    const origin = new THREE.Vector3(...wp.origin);
    const spot =
        SPOTS.map(([x, z]) => new THREE.Vector3(x, 0, z).applyQuaternion(turn).add(origin)).find((p) =>
            s.doc.objects.every((o) => p.distanceTo(new THREE.Vector3(...o.position)) >= 1.2)
        ) ?? origin;
    const euler = new THREE.Euler().setFromQuaternion(rotation);
    return s.run({
        type: "add",
        primitive,
        position: spot.addScaledVector(normal, -low).toArray() as Vec3,
        rotation: [euler.x, euler.y, euler.z],
    });
}
