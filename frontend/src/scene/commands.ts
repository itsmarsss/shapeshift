import type { Command, Geometry, Material, Primitive, SceneDoc, SceneObject, Vec3 } from "./schema";
import { booleanGeometry } from "./geometry";

export const DEFAULT_GEOMETRY: Record<Primitive, Geometry> = {
    box: { type: "box", width: 1, height: 1, depth: 1 },
    sphere: { type: "sphere", radius: 0.5 },
    cylinder: { type: "cylinder", radiusTop: 0.5, radiusBottom: 0.5, height: 1 },
    cone: { type: "cone", radius: 0.5, height: 1 },
    torus: { type: "torus", radius: 0.5, tube: 0.2 },
    plane: { type: "plane", width: 1, height: 1 },
};

export const DEFAULT_MATERIAL: Material = {
    color: "#c8ccd4",
    metalness: 0,
    roughness: 0.6,
    opacity: 1,
};

const LABELS: Record<Primitive, string> = {
    box: "Box",
    sphere: "Sphere",
    cylinder: "Cylinder",
    cone: "Cone",
    torus: "Torus",
    plane: "Plane",
};

function restingPose(geometry: Geometry, scaleY: number): { position: Vec3; rotation: Vec3 } {
    switch (geometry.type) {
        case "plane":
            return { position: [0, 0.001, 0], rotation: [-Math.PI / 2, 0, 0] };
        case "torus":
            return { position: [0, geometry.tube * scaleY, 0], rotation: [-Math.PI / 2, 0, 0] };
        case "sphere":
            return { position: [0, geometry.radius * scaleY, 0], rotation: [0, 0, 0] };
        case "box":
        case "cylinder":
        case "cone":
            return { position: [0, (geometry.height / 2) * scaleY, 0], rotation: [0, 0, 0] };
        default:
            return { position: [0, 0.5, 0], rotation: [0, 0, 0] };
    }
}

const SPOT_STEP = 1.5;
const SPOTS: [number, number][] = [];
for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) SPOTS.push([x * SPOT_STEP + 0, z * SPOT_STEP + 0]);
SPOTS.sort((a, b) => Math.hypot(...a) - Math.hypot(...b) || b[0] - a[0] || b[1] - a[1]);

function freeSpot(doc: SceneDoc): [number, number] {
    const spot = SPOTS.find(([px, pz]) =>
        doc.objects.every((o) => Math.hypot(o.position[0] - px, o.position[2] - pz) >= SPOT_STEP * 0.8)
    );
    return spot ?? [0, 0];
}

export type CommandResult = { ok: true; created: string[] } | { ok: false; error: string };

export function findObject(doc: SceneDoc, target: string): SceneObject | undefined {
    return (
        doc.objects.find((o) => o.id === target) ??
        doc.objects.find((o) => o.name === target) ??
        doc.objects.find((o) => o.name.toLowerCase() === target.toLowerCase())
    );
}

export function uniqueName(doc: SceneDoc, base: string): string {
    const taken = new Set(doc.objects.map((o) => o.name));
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) {
        const candidate = `${base} ${i}`;
        if (!taken.has(candidate)) return candidate;
    }
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

export function applyCommand(doc: SceneDoc, cmd: Command, newId: () => string): CommandResult {
    if (cmd.type === "add") {
        if (cmd.geometry && cmd.geometry.type !== cmd.primitive) {
            return { ok: false, error: `Geometry type "${cmd.geometry.type}" does not match primitive "${cmd.primitive}"` };
        }
        const id = newId();
        const geometry = structuredClone(cmd.geometry ?? DEFAULT_GEOMETRY[cmd.primitive]);
        const pose = restingPose(geometry, cmd.scale?.[1] ?? 1);
        if (!cmd.position) {
            const [x, z] = freeSpot(doc);
            pose.position = [x, pose.position[1], z];
        }
        doc.objects.push({
            id,
            name: uniqueName(doc, cmd.name ?? LABELS[cmd.primitive]),
            geometry,
            position: cmd.position ?? pose.position,
            rotation: cmd.rotation ?? pose.rotation,
            scale: cmd.scale ?? [1, 1, 1],
            material: { ...DEFAULT_MATERIAL, ...(cmd.color ? { color: cmd.color } : {}) },
        });
        return { ok: true, created: [id] };
    }

    if (cmd.type === "clear") {
        doc.objects = [];
        return { ok: true, created: [] };
    }

    if (cmd.type === "insert") {
        const created: string[] = [];
        for (const o of cmd.objects) {
            const id = newId();
            doc.objects.push({ ...structuredClone(o), id, name: uniqueName(doc, o.name) });
            created.push(id);
        }
        return { ok: true, created };
    }

    if (cmd.type === "boolean") {
        const a = findObject(doc, cmd.target);
        const b = findObject(doc, cmd.tool);
        if (!a) return { ok: false, error: `No object named "${cmd.target}"` };
        if (!b) return { ok: false, error: `No object named "${cmd.tool}"` };
        if (a.id === b.id) return { ok: false, error: "Pick two different objects" };
        const result = booleanGeometry(cmd.operation, a, b);
        if (!result) return { ok: false, error: "The result is empty" };
        a.geometry = result.geometry;
        a.position = result.position;
        a.rotation = [0, 0, 0];
        a.scale = [1, 1, 1];
        doc.objects = doc.objects.filter((o) => o.id !== b.id);
        return { ok: true, created: [] };
    }

    const obj = findObject(doc, cmd.target);
    if (!obj) return { ok: false, error: `No object named "${cmd.target}"` };

    switch (cmd.type) {
        case "remove":
            doc.objects = doc.objects.filter((o) => o.id !== obj.id);
            return { ok: true, created: [] };
        case "duplicate": {
            const id = newId();
            doc.objects.push({
                ...structuredClone(obj),
                id,
                name: uniqueName(doc, obj.name),
                position: add(obj.position, cmd.offset ?? [0.5, 0, 0.5]),
            });
            return { ok: true, created: [id] };
        }
        case "transform":
            if (cmd.position) obj.position = cmd.relative ? add(obj.position, cmd.position) : cmd.position;
            if (cmd.rotation) obj.rotation = cmd.relative ? add(obj.rotation, cmd.rotation) : cmd.rotation;
            if (cmd.scale) obj.scale = cmd.relative ? mul(obj.scale, cmd.scale) : cmd.scale;
            return { ok: true, created: [] };
        case "material":
            if (cmd.color !== undefined) obj.material.color = cmd.color;
            if (cmd.metalness !== undefined) obj.material.metalness = cmd.metalness;
            if (cmd.roughness !== undefined) obj.material.roughness = cmd.roughness;
            if (cmd.opacity !== undefined) obj.material.opacity = cmd.opacity;
            return { ok: true, created: [] };
        case "rename":
            obj.name = cmd.name;
            return { ok: true, created: [] };
        case "geometry":
            obj.geometry = cmd.geometry;
            return { ok: true, created: [] };
    }
}
