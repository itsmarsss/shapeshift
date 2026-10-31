// How the assistant sees the scene, and how its actions are described back to
// the user.
import * as THREE from "three";
import { findLight, findObject, groupMembers, groupNames } from "../scene/commands";
import { localBounds } from "../scene/geometry";
import type { Command, Geometry, Light, SceneDoc, SceneObject, Vec3 } from "@shapeshift/shared/scene/schema";

const round = (v: number) => {
    const r = Math.round(v * 1000) / 1000;
    return Object.is(r, -0) ? 0 : r;
};
const fmt = (v: readonly number[]) => `[${v.map(round).join(", ")}]`;

function size(g: Geometry): string {
    switch (g.type) {
        case "box":
            return `${round(g.width)}x${round(g.height)}x${round(g.depth)}`;
        case "sphere":
            return `radius ${round(g.radius)}`;
        case "cylinder":
            return g.radiusTop === g.radiusBottom
                ? `radius ${round(g.radiusTop)}, height ${round(g.height)}`
                : `radiusTop ${round(g.radiusTop)}, radiusBottom ${round(g.radiusBottom)}, height ${round(g.height)}`;
        case "cone":
            return `radius ${round(g.radius)}, height ${round(g.height)}`;
        case "torus":
            return `radius ${round(g.radius)}, tube ${round(g.tube)}`;
        case "plane":
            return `${round(g.width)}x${round(g.height)}`;
        case "wedge":
        case "roof":
        case "pyramid":
            return `${round(g.width)}x${round(g.height)}x${round(g.depth)}`;
        case "halfSphere":
            return `radius ${round(g.radius)}`;
        case "tube":
            return `radius ${round(g.radius)}, wall ${round(g.thickness)}, height ${round(g.height)}`;
        case "polygon":
            return `${g.sides} sides, radius ${round(g.radius)}, height ${round(g.height)}`;
        case "star":
            return `${g.points} points, radius ${round(g.radius)}, inner ${round(g.innerRadius)}, height ${round(g.height)}`;
        case "text":
            return `"${g.text}" size ${round(g.size)}, height ${round(g.height)}`;
        case "paraboloid":
            return `radius ${round(g.radius)}, height ${round(g.height)}`;
        case "mesh":
            return `${Math.floor(g.indices.length / 3)} triangles`;
    }
}

function localBox(g: Geometry): THREE.Box3 {
    const box = new THREE.Box3();
    switch (g.type) {
        case "box":
            return box.set(new THREE.Vector3(-g.width / 2, -g.height / 2, -g.depth / 2), new THREE.Vector3(g.width / 2, g.height / 2, g.depth / 2));
        case "sphere":
            return box.set(new THREE.Vector3(-g.radius, -g.radius, -g.radius), new THREE.Vector3(g.radius, g.radius, g.radius));
        case "cylinder": {
            const r = Math.max(g.radiusTop, g.radiusBottom);
            return box.set(new THREE.Vector3(-r, -g.height / 2, -r), new THREE.Vector3(r, g.height / 2, r));
        }
        case "cone":
            return box.set(new THREE.Vector3(-g.radius, -g.height / 2, -g.radius), new THREE.Vector3(g.radius, g.height / 2, g.radius));
        case "torus": {
            const r = g.radius + g.tube;
            return box.set(new THREE.Vector3(-r, -r, -g.tube), new THREE.Vector3(r, r, g.tube));
        }
        case "plane":
            return box.set(new THREE.Vector3(-g.width / 2, -g.height / 2, 0), new THREE.Vector3(g.width / 2, g.height / 2, 0));
        default:
            return localBounds(g);
    }
}

export function worldBounds(o: SceneObject): { min: Vec3; max: Vec3 } {
    const box = localBox(o.geometry);
    if (box.isEmpty()) return { min: o.position, max: o.position };
    const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(...o.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation)),
        new THREE.Vector3(...o.scale)
    );
    box.applyMatrix4(matrix);
    return { min: box.min.toArray(), max: box.max.toArray() };
}

export function describeObject(o: SceneObject, selectedId: string | null = null): string {
    const b = worldBounds(o);
    const m = o.material;
    return [
        `"${o.name}" id=${o.id}`,
        o.group ? `in group "${o.group}"` : null,
        o.hole ? "hole" : null,
        `${o.geometry.type} ${size(o.geometry)}`,
        `at ${fmt(o.position)}`,
        o.rotation.some((r) => r !== 0) ? `rotation ${fmt(o.rotation)}` : null,
        o.scale.some((s) => s !== 1) ? `scale ${fmt(o.scale)}` : null,
        [
            m.color,
            m.metalness ? `metalness ${round(m.metalness)}` : null,
            m.roughness !== 0.6 ? `roughness ${round(m.roughness)}` : null,
            m.opacity < 1 ? `opacity ${round(m.opacity)}` : null,
            m.emissiveIntensity ? `glows ${m.emissive ?? m.color} at ${round(m.emissiveIntensity)}` : null,
            m.transmission ? `transmission ${round(m.transmission)}` : null,
        ]
            .filter(Boolean)
            .join(" "),
        `bounds ${fmt(b.min)} to ${fmt(b.max)}`,
        o.id === selectedId ? "(selected)" : null,
    ]
        .filter(Boolean)
        .join(", ");
}

export function describeLight(l: Light, selectedId: string | null = null): string {
    return [
        `Light "${l.name}" id=${l.id}`,
        l.type,
        `at ${fmt(l.position)}`,
        l.type === "point" ? null : `aimed at ${fmt(l.aim)}`,
        `${l.color} intensity ${round(l.intensity)}`,
        l.type !== "directional" && l.distance ? `range ${round(l.distance)}` : null,
        l.type === "spot" ? `angle ${round(l.angle)}` : null,
        l.id === selectedId ? "(selected)" : null,
    ]
        .filter(Boolean)
        .join(", ");
}

const SCENE_OBJECT_LIMIT = 200;

export function describeScene(doc: SceneDoc, selectedId: string | null, selectedIds: string[] = []): string {
    const lights = doc.lights.length
        ? doc.lights.map((l) => describeLight(l, selectedId))
        : ["No lights yet, so the editor's default studio lighting is on."];
    if (doc.environment !== "none") lights.push(`Environment lighting: ${doc.environment}.`);
    if (doc.animation.tracks.length) {
        const names = new Map([...doc.objects, ...doc.lights].map((e) => [e.id, e.name]));
        const tracks = doc.animation.tracks
            .slice(0, 60)
            .map((t) => `"${names.get(t.target) ?? t.target}" ${t.property} keys at ${t.keys.map((k) => `${round(k.time)}s`).join(", ")}`);
        lights.push(`Animation (${round(doc.animation.duration)}s, ${doc.animation.loop ? "loops" : "plays once"}): ${tracks.join("; ")}.`);
    }
    if (!doc.objects.length) return ["The scene has no objects.", ...lights].join("\n");
    const listed = doc.objects.slice(0, SCENE_OBJECT_LIMIT);
    const selected = doc.objects.find((o) => o.id === selectedId);
    if (selected && !listed.includes(selected)) listed.push(selected);
    const lines = listed.map((o) => describeObject(o, selectedId));
    if (doc.objects.length > listed.length) lines.push(`…and ${doc.objects.length - listed.length} more objects. Use inspect to read them.`);
    for (const group of groupNames(doc)) {
        const members = groupMembers(doc, group);
        if (members.some((o) => o.hole) && members.some((o) => !o.hole)) lines.push(`Group "${group}" shows and exports as its solids with its holes cut out.`);
    }
    lines.push(...lights);
    if (selectedIds.length > 1) lines.push(`${selectedIds.length} objects are selected; "these" or "them" means all of them: ${selectedIds.join(", ")}.`);
    else if (!selected && !doc.lights.some((l) => l.id === selectedId)) lines.push("Nothing is selected.");
    return lines.join("\n");
}

export function inspectObject(o: SceneObject) {
    const b = worldBounds(o);
    const geometry = o.geometry.type === "mesh" ? { type: "mesh", triangles: Math.floor(o.geometry.indices.length / 3) } : o.geometry;
    return {
        id: o.id,
        name: o.name,
        geometry,
        position: o.position.map(round),
        rotation: o.rotation.map(round),
        scale: o.scale.map(round),
        material: o.material,
        ...(o.hole ? { hole: true } : {}),
        ...(o.group ? { group: o.group } : {}),
        bounds: { min: b.min.map(round), max: b.max.map(round) },
    };
}

// Short labels for the activity list in the chat panel.

const DEG = 180 / Math.PI;

export function describeCommand(cmd: Command, doc: SceneDoc): string {
    const name = "target" in cmd ? findObject(doc, cmd.target)?.name ?? findLight(doc, cmd.target)?.name ?? cmd.target : "";
    switch (cmd.type) {
        case "add":
            return `Added ${cmd.name ?? `a ${cmd.primitive}`}`;
        case "remove":
            return `Removed ${name}`;
        case "duplicate":
            return `Duplicated ${name}`;
        case "transform": {
            const what = [cmd.position && "moved", cmd.rotation && "rotated", cmd.scale && "scaled"].filter(Boolean) as string[];
            const verb = what.length ? what.join(" and ") : "transformed";
            const detail = cmd.rotation && !cmd.position && !cmd.scale ? ` ${fmt(cmd.rotation.map((r) => r * DEG))}°` : "";
            return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${name}${detail}`;
        }
        case "material":
            return `Restyled ${name}`;
        case "rename":
            return `Renamed ${name} to ${cmd.name}`;
        case "geometry":
            return `Reshaped ${name}`;
        case "boolean": {
            const tool = findObject(doc, cmd.tool)?.name ?? cmd.tool;
            const verb = { union: "Merged", subtract: "Cut", intersect: "Intersected" }[cmd.operation];
            return cmd.operation === "subtract" ? `Cut ${tool} out of ${name}` : `${verb} ${name} with ${tool}`;
        }
        case "group":
            return `Grouped ${cmd.targets.length === 1 ? cmd.targets[0] : `${cmd.targets.length} objects`} as ${cmd.name}`;
        case "ungroup":
            return `Ungrouped ${name}`;
        case "animate":
            return `Animated ${name}'s ${cmd.property}`;
        case "keyframe":
            return `Keyed ${name} at ${round(cmd.time)}s`;
        case "removeKeyframe":
            return `Removed ${name}'s keyframe at ${round(cmd.time)}s`;
        case "clearAnimation":
            return cmd.only ? `Cleared ${findObject(doc, cmd.only)?.name ?? cmd.only}'s animation` : "Cleared all animation";
        case "timeline":
            return `Set the timeline to ${cmd.duration ? `${round(cmd.duration)}s` : ""}${cmd.duration && cmd.loop !== undefined ? ", " : ""}${cmd.loop === undefined ? "" : cmd.loop ? "looping" : "playing once"}`;
        case "environment":
            return cmd.preset === "none" ? "Turned off the environment lighting" : `Set the ${cmd.preset} environment`;
        case "addLight":
            return `Added ${cmd.name ?? `a ${cmd.light} light`}`;
        case "updateLight":
            return `Adjusted ${name}`;
        case "hole":
            return cmd.hole ? `Made ${name} a hole` : `Made ${name} solid`;
        case "align":
            return `Aligned ${cmd.targets.length} items on ${cmd.axis.toUpperCase()}`;
        case "mirror":
            return `Mirrored ${cmd.targets.length === 1 ? (findObject(doc, cmd.targets[0])?.name ?? cmd.targets[0]) : `${cmd.targets.length} items`} on ${cmd.axis.toUpperCase()}`;
        case "drop":
            return `Dropped ${cmd.targets.length === 1 ? (findObject(doc, cmd.targets[0])?.name ?? cmd.targets[0]) : `${cmd.targets.length} items`}`;
        case "insert":
            return `Inserted ${cmd.objects.length} objects`;
        case "clear":
            return "Cleared the scene";
    }
}
