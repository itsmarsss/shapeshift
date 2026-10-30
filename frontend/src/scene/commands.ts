import type { Axis, Command, Geometry, Light, LightType, Material, Primitive, SceneDoc, SceneObject, Vec3 } from "@shapeshift/shared/scene/schema";
import { current, isDraft } from "immer";
import * as THREE from "three";
import { booleanGeometry, boundsIn, hullPoints, localBounds, objectMatrix } from "./geometry";
import { LIGHT_PROPERTIES, OBJECT_PROPERTIES, currentValue, removeKeysAt, removeTracksFor, resolveAnimationTargets, setKey, valueFits } from "./animation";

export const DEFAULT_GEOMETRY: Record<Primitive, Geometry> = {
    box: { type: "box", width: 1, height: 1, depth: 1 },
    sphere: { type: "sphere", radius: 0.5 },
    cylinder: { type: "cylinder", radiusTop: 0.5, radiusBottom: 0.5, height: 1 },
    cone: { type: "cone", radius: 0.5, height: 1 },
    torus: { type: "torus", radius: 0.5, tube: 0.2 },
    plane: { type: "plane", width: 1, height: 1 },
    wedge: { type: "wedge", width: 1, height: 1, depth: 1 },
    roof: { type: "roof", width: 1, height: 1, depth: 1 },
    pyramid: { type: "pyramid", width: 1, height: 1, depth: 1 },
    halfSphere: { type: "halfSphere", radius: 0.5 },
    tube: { type: "tube", radius: 0.5, thickness: 0.1, height: 1 },
    polygon: { type: "polygon", radius: 0.5, sides: 6, height: 1 },
    star: { type: "star", radius: 0.5, innerRadius: 0.25, points: 5, height: 0.2 },
    text: { type: "text", text: "Text", size: 0.5, height: 0.1 },
    paraboloid: { type: "paraboloid", radius: 0.5, height: 1 },
};

export const DEFAULT_MATERIAL: Material = {
    color: "#c8ccd4",
    metalness: 0,
    roughness: 0.6,
    opacity: 1,
};

export const SHAPE_LABELS: Record<Primitive, string> = {
    box: "Box",
    sphere: "Sphere",
    cylinder: "Cylinder",
    cone: "Cone",
    torus: "Torus",
    plane: "Plane",
    wedge: "Wedge",
    roof: "Roof",
    pyramid: "Pyramid",
    halfSphere: "Half sphere",
    tube: "Tube",
    polygon: "Polygon",
    star: "Star",
    text: "Text",
    paraboloid: "Paraboloid",
};

export function restingPose(geometry: Geometry, scaleY: number): { position: Vec3; rotation: Vec3 } {
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
            return { position: [0, -localBounds(geometry).min.y * scaleY, 0], rotation: [0, 0, 0] };
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

export function findLight(doc: SceneDoc, target: string): Light | undefined {
    return (
        doc.lights.find((l) => l.id === target) ??
        doc.lights.find((l) => l.name === target) ??
        doc.lights.find((l) => l.name.toLowerCase() === target.toLowerCase())
    );
}

export const DEFAULT_LIGHTS: Record<LightType, Omit<Light, "id" | "name" | "type">> = {
    point: { position: [2, 3, 2], aim: [0, 0, 0], color: "#ffffff", intensity: 20, distance: 0, angle: Math.PI / 6 },
    spot: { position: [3, 5, 3], aim: [0, 0, 0], color: "#ffffff", intensity: 60, distance: 0, angle: Math.PI / 6 },
    directional: { position: [5, 8, 4], aim: [0, 0, 0], color: "#ffffff", intensity: 2, distance: 0, angle: Math.PI / 6 },
};

const LIGHT_LABELS: Record<LightType, string> = { point: "Point Light", spot: "Spot Light", directional: "Sun" };

type LightFields = Partial<Pick<Light, "position" | "aim" | "color" | "intensity" | "distance" | "angle">>;

function setLightFields(light: Light, fields: LightFields) {
    if (fields.position) light.position = fields.position;
    if (fields.aim) light.aim = fields.aim;
    if (fields.color !== undefined) light.color = fields.color;
    if (fields.intensity !== undefined) light.intensity = fields.intensity;
    if (fields.distance !== undefined) light.distance = fields.distance;
    if (fields.angle !== undefined) light.angle = fields.angle;
}

function applyToLight(doc: SceneDoc, light: Light, cmd: Command, newId: () => string): CommandResult {
    switch (cmd.type) {
        case "remove":
            doc.lights = doc.lights.filter((l) => l.id !== light.id);
            removeTracksFor(doc.animation, new Set([light.id]));
            return { ok: true, created: [] };
        case "rename":
            light.name = cmd.name;
            return { ok: true, created: [] };
        case "duplicate": {
            const id = newId();
            const offset = cmd.offset ?? [0.5, 0, 0.5];
            doc.lights.push({ ...copy(light), id, name: uniqueName(doc, light.name), position: add(light.position, offset), aim: add(light.aim, offset) });
            return { ok: true, created: [id] };
        }
        case "transform":
            if (cmd.position) light.position = cmd.relative ? add(light.position, cmd.position) : cmd.position;
            return { ok: true, created: [] };
        case "updateLight":
            setLightFields(light, cmd);
            return { ok: true, created: [] };
        default:
            return { ok: false, error: `"${light.name}" is a light, so ${cmd.type} doesn't apply. Use updateLight` };
    }
}

export function groupMembers(doc: SceneDoc, group: string): SceneObject[] {
    const exact = doc.objects.filter((o) => o.group === group);
    return exact.length ? exact : doc.objects.filter((o) => o.group?.toLowerCase() === group.toLowerCase());
}

export function groupNames(doc: SceneDoc): string[] {
    return [...new Set(doc.objects.flatMap((o) => (o.group ? [o.group] : [])))];
}

function uniqueGroupName(doc: SceneDoc, base: string): string {
    const taken = new Set([...groupNames(doc), ...doc.objects.map((o) => o.name), ...doc.lights.map((l) => l.name)]);
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

export function groupPivot(members: SceneObject[]): Vec3 {
    const sum = members.reduce<Vec3>((acc, o) => add(acc, o.position), [0, 0, 0]);
    return [sum[0] / members.length, sum[1] / members.length, sum[2] / members.length];
}

// Moves, turns and scales every member together around the group's center,
// as if the group were one object.
function transformGroup(members: SceneObject[], cmd: Extract<Command, { type: "transform" }>): CommandResult {
    if (!cmd.relative && (cmd.rotation || cmd.scale)) {
        return { ok: false, error: "Rotate or scale a group with relative: true" };
    }
    const pivot = new THREE.Vector3(...groupPivot(members));
    const shift = cmd.position
        ? cmd.relative
            ? new THREE.Vector3(...cmd.position)
            : new THREE.Vector3(...cmd.position).sub(pivot)
        : new THREE.Vector3();
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(cmd.rotation ?? [0, 0, 0])));
    const stretch = new THREE.Vector3(...(cmd.scale ?? [1, 1, 1]));
    for (const o of members) {
        const offset = new THREE.Vector3(...o.position).sub(pivot).multiply(stretch).applyQuaternion(turn);
        o.position = offset.add(pivot).add(shift).toArray() as Vec3;
        if (cmd.rotation) {
            const q = turn.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation)));
            o.rotation = new THREE.Euler().setFromQuaternion(q).toArray().slice(0, 3) as Vec3;
        }
        if (cmd.scale) o.scale = mul(o.scale, cmd.scale);
    }
    return { ok: true, created: [] };
}

function applyToGroup(doc: SceneDoc, group: string, members: SceneObject[], cmd: Command, newId: () => string): CommandResult {
    const ids = new Set(members.map((o) => o.id));
    switch (cmd.type) {
        case "remove":
            doc.objects = doc.objects.filter((o) => !ids.has(o.id));
            removeTracksFor(doc.animation, ids);
            return { ok: true, created: [] };
        case "transform":
            return transformGroup(members, cmd);
        case "material":
            for (const o of members) {
                if (cmd.color !== undefined) o.material.color = cmd.color;
                if (cmd.metalness !== undefined) o.material.metalness = cmd.metalness;
                if (cmd.roughness !== undefined) o.material.roughness = cmd.roughness;
                if (cmd.opacity !== undefined) o.material.opacity = cmd.opacity;
            if (cmd.emissive !== undefined) o.material.emissive = cmd.emissive;
            if (cmd.emissiveIntensity !== undefined) o.material.emissiveIntensity = cmd.emissiveIntensity;
            if (cmd.transmission !== undefined) o.material.transmission = cmd.transmission;
            }
            return { ok: true, created: [] };
        case "rename":
            for (const o of members) o.group = cmd.name;
            return { ok: true, created: [] };
        case "ungroup":
            for (const o of members) delete o.group;
            return { ok: true, created: [] };
        case "duplicate": {
            const name = uniqueGroupName(doc, group);
            const offset = cmd.offset ?? [1, 0, 1];
            const created: string[] = [];
            for (const o of members) {
                const id = newId();
                doc.objects.push({ ...copy(o), id, name: uniqueName(doc, o.name), group: name, position: add(o.position, offset) });
                created.push(id);
            }
            return { ok: true, created };
        }
        default:
            return { ok: false, error: `"${group}" is a group, so ${cmd.type} doesn't apply to it. Target one of its objects instead` };
    }
}

export function uniqueName(doc: SceneDoc, base: string): string {
    const taken = new Set([...doc.objects.map((o) => o.name), ...doc.lights.map((l) => l.name)]);
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) {
        const candidate = `${base} ${i}`;
        if (!taken.has(candidate)) return candidate;
    }
}

// Commands run inside Immer, where structuredClone can't copy a draft.
const copy = <T>(value: T): T => structuredClone(isDraft(value) ? current(value) : value);

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

function applyAnimation(doc: SceneDoc, cmd: Extract<Command, { type: "keyframe" | "animate" | "removeKeyframe" | "clearAnimation" | "timeline" }>): CommandResult {
    const anim = doc.animation;
    const find = (t: string) => findObject(doc, t) ?? findLight(doc, t);
    switch (cmd.type) {
        case "timeline":
            if (cmd.duration !== undefined) anim.duration = cmd.duration;
            if (cmd.loop !== undefined) anim.loop = cmd.loop;
            return { ok: true, created: [] };
        case "clearAnimation": {
            if (!cmd.only) {
                anim.tracks = [];
                return { ok: true, created: [] };
            }
            const targets = resolveAnimationTargets(doc, cmd.only, find);
            if (!targets.length) return { ok: false, error: `No object, light or group named "${cmd.only}"` };
            removeTracksFor(anim, new Set(targets.map((t) => t.id)));
            return { ok: true, created: [] };
        }
        default:
            break;
    }
    const targets = resolveAnimationTargets(doc, cmd.target, find);
    if (!targets.length) return { ok: false, error: `No object, light or group named "${cmd.target}"` };

    if (cmd.type === "removeKeyframe") {
        const removed = targets.reduce((n, t) => n + removeKeysAt(anim, t.id, cmd.time, cmd.property), 0);
        return removed ? { ok: true, created: [] } : { ok: false, error: `No keyframe at ${cmd.time}s` };
    }

    if (cmd.type === "animate") {
        if (!cmd.keys.every((k) => valueFits(cmd.property, k.value))) {
            return { ok: false, error: `Values for ${cmd.property} must be ${cmd.property === "color" ? "#rrggbb colors" : cmd.property === "intensity" ? "numbers" : "[x, y, z] arrays"}` };
        }
        for (const t of targets) {
            if (currentValue(t, cmd.property) === undefined) return { ok: false, error: `"${t.name}" has no ${cmd.property} to animate` };
            const existing = anim.tracks.find((tr) => tr.target === t.id && tr.property === cmd.property);
            if (existing && cmd.replace !== false) existing.keys = [];
            for (const key of cmd.keys) setKey(anim, t.id, cmd.property, key);
        }
        return { ok: true, created: [] };
    }

    // keyframe: record current (or given) values at a time.
    for (const t of targets) {
        const props = cmd.properties ?? ("geometry" in t ? OBJECT_PROPERTIES : LIGHT_PROPERTIES);
        for (const property of props) {
            const value = (cmd.values as Record<string, unknown> | undefined)?.[property] ?? currentValue(t, property);
            if (value === undefined) continue;
            setKey(anim, t.id, property, { time: cmd.time, value: value as never, ...(cmd.easing ? { easing: cmd.easing } : {}) });
        }
    }
    return { ok: true, created: [] };
}

function resolveUnits(doc: SceneDoc, targets: string[]): SceneObject[][] | string {
    const seen = new Set<string>();
    const units: SceneObject[][] = [];
    for (const t of targets) {
        const obj = findObject(doc, t);
        const members = obj ? [obj] : groupMembers(doc, t);
        if (!members.length) return `No object or group named "${t}"`;
        const fresh = members.filter((o) => !seen.has(o.id));
        for (const o of fresh) seen.add(o.id);
        if (fresh.length) units.push(fresh);
    }
    return units;
}

const AXIS_INDEX: Record<Axis, number> = { x: 0, y: 1, z: 2 };

function translate(objects: SceneObject[], delta: THREE.Vector3) {
    for (const o of objects) o.position = [o.position[0] + delta.x, o.position[1] + delta.y, o.position[2] + delta.z];
}

function setMatrix(o: SceneObject, m: THREE.Matrix4) {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    m.decompose(position, quaternion, scale);
    const rotation = new THREE.Euler().setFromQuaternion(quaternion);
    o.position = position.toArray() as Vec3;
    o.rotation = [rotation.x, rotation.y, rotation.z];
    o.scale = scale.toArray() as Vec3;
}

function applyArrange(doc: SceneDoc, cmd: Extract<Command, { type: "align" | "mirror" | "drop" }>): CommandResult {
    const units = resolveUnits(doc, cmd.targets);
    if (typeof units === "string") return { ok: false, error: units };
    if (cmd.type === "align") {
        if (units.length < 2) return { ok: false, error: "Align needs at least two objects or groups" };
        const i = AXIS_INDEX[cmd.axis];
        const boxes = units.map((u) => boundsIn(u));
        const all = boxes.reduce((acc, b) => acc.union(b), new THREE.Box3());
        const pick = (b: THREE.Box3) => (cmd.to === "min" ? b.min.getComponent(i) : cmd.to === "max" ? b.max.getComponent(i) : (b.min.getComponent(i) + b.max.getComponent(i)) / 2);
        const goal = pick(all);
        units.forEach((u, k) => translate(u, new THREE.Vector3().setComponent(i, goal - pick(boxes[k]))));
        return { ok: true, created: [] };
    }
    if (cmd.type === "mirror") {
        const objects = units.flat();
        const center = boundsIn(objects).getCenter(new THREE.Vector3());
        const flip = new THREE.Vector3(1, 1, 1).setComponent(AXIS_INDEX[cmd.axis], -1);
        const reflect = new THREE.Matrix4()
            .makeTranslation(center.x, center.y, center.z)
            .multiply(new THREE.Matrix4().makeScale(flip.x, flip.y, flip.z))
            .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
        for (const o of objects) setMatrix(o, reflect.clone().multiply(objectMatrix(o)));
        return { ok: true, created: [] };
    }
    const origin = new THREE.Vector3(...(cmd.origin ?? [0, 0, 0]));
    const normal = new THREE.Vector3(...(cmd.normal ?? [0, 1, 0]));
    if (normal.lengthSq() < 1e-12) return { ok: false, error: "normal can't be [0, 0, 0]" };
    normal.normalize();
    const v = new THREE.Vector3();
    for (const unit of units) {
        let low = Infinity;
        for (const o of unit) {
            const m = objectMatrix(o);
            const points = hullPoints(o.geometry);
            for (let i = 0; i < points.length; i += 3) low = Math.min(low, v.set(points[i], points[i + 1], points[i + 2]).applyMatrix4(m).sub(origin).dot(normal));
        }
        if (Number.isFinite(low)) translate(unit, normal.clone().multiplyScalar(-low));
    }
    return { ok: true, created: [] };
}

export function applyCommand(doc: SceneDoc, cmd: Command, newId: () => string): CommandResult {
    if (cmd.type === "align" || cmd.type === "mirror" || cmd.type === "drop") return applyArrange(doc, cmd);
    if (cmd.type === "hole") {
        const obj = findObject(doc, cmd.target);
        const members = obj ? [obj] : groupMembers(doc, cmd.target);
        if (!members.length) return { ok: false, error: `No object or group named "${cmd.target}"` };
        for (const o of members) {
            if (cmd.hole) o.hole = true;
            else delete o.hole;
        }
        return { ok: true, created: [] };
    }
    if (cmd.type === "keyframe" || cmd.type === "animate" || cmd.type === "removeKeyframe" || cmd.type === "clearAnimation" || cmd.type === "timeline") {
        return applyAnimation(doc, cmd);
    }
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
            name: uniqueName(doc, cmd.name ?? SHAPE_LABELS[cmd.primitive]),
            geometry,
            position: cmd.position ?? pose.position,
            rotation: cmd.rotation ?? pose.rotation,
            scale: cmd.scale ?? [1, 1, 1],
            material: { ...DEFAULT_MATERIAL, ...(cmd.color ? { color: cmd.color } : {}) },
            ...(cmd.group ? { group: cmd.group } : {}),
        });
        return { ok: true, created: [id] };
    }

    if (cmd.type === "addLight") {
        const id = newId();
        const light: Light = { id, name: uniqueName(doc, cmd.name ?? LIGHT_LABELS[cmd.light]), type: cmd.light, ...structuredClone(DEFAULT_LIGHTS[cmd.light]) };
        setLightFields(light, cmd);
        doc.lights.push(light);
        return { ok: true, created: [id] };
    }

    if (cmd.type === "group") {
        const found = cmd.targets.map((t) => findObject(doc, t) ?? groupMembers(doc, t));
        const missing = cmd.targets.filter((_, i) => Array.isArray(found[i]) && !(found[i] as SceneObject[]).length);
        if (missing.length) return { ok: false, error: `No object or group named ${missing.map((m) => `"${m}"`).join(", ")}` };
        if (doc.objects.some((o) => o.name === cmd.name) || doc.lights.some((l) => l.name === cmd.name)) {
            return { ok: false, error: `"${cmd.name}" is already the name of an object or light` };
        }
        for (const o of found.flat()) o.group = cmd.name;
        return { ok: true, created: [] };
    }

    if (cmd.type === "environment") {
        doc.environment = cmd.preset;
        return { ok: true, created: [] };
    }

    if (cmd.type === "clear") {
        doc.objects = [];
        doc.animation.tracks = [];
        doc.lights = [];
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
    if (!obj) {
        const light = findLight(doc, cmd.target);
        if (light) return applyToLight(doc, light, cmd, newId);
        const members = groupMembers(doc, cmd.target);
        if (members.length) return applyToGroup(doc, members[0].group!, members, cmd, newId);
        return { ok: false, error: `No object, light or group named "${cmd.target}"` };
    }

    switch (cmd.type) {
        case "remove":
            doc.objects = doc.objects.filter((o) => o.id !== obj.id);
            removeTracksFor(doc.animation, new Set([obj.id]));
            return { ok: true, created: [] };
        case "duplicate": {
            const id = newId();
            doc.objects.push({
                ...copy(obj),
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
            if (cmd.emissive !== undefined) obj.material.emissive = cmd.emissive;
            if (cmd.emissiveIntensity !== undefined) obj.material.emissiveIntensity = cmd.emissiveIntensity;
            if (cmd.transmission !== undefined) obj.material.transmission = cmd.transmission;
            return { ok: true, created: [] };
        case "rename":
            obj.name = cmd.name;
            return { ok: true, created: [] };
        case "geometry":
            obj.geometry = cmd.geometry;
            return { ok: true, created: [] };
        case "updateLight":
            return { ok: false, error: `"${obj.name}" is an object, not a light` };
        case "ungroup":
            if (!obj.group) return { ok: false, error: `"${obj.name}" isn't in a group` };
            delete obj.group;
            return { ok: true, created: [] };
    }
}
