import { nanoid } from "nanoid";
import { useEditor } from "../store/editor";
import type { SceneObject } from "../types";
import { buildSceneFromObjects, exportSceneToGLB } from "../utils/io";
import type { Diff, SceneSnapshot, ToolResult } from "./types";

const materialRegistry: Record<string, { id: string; name: string; pbr: { baseColorHex?: string; metalness?: number; roughness?: number } }> = {};

const COLOR_MAP: Record<string, string> = {
    red: "#ff4d4f",
    green: "#52c41a",
    blue: "#1890ff",
    yellow: "#fadb14",
    orange: "#fa8c16",
    purple: "#722ed1",
    pink: "#eb2f96",
    white: "#ffffff",
    black: "#000000",
    gray: "#8c8c8c",
};

function nowState() {
    return (useEditor as any).getState?.();
}

function snapshot(): SceneSnapshot {
    const st = nowState();
    const objects: SceneObject[] = st?.objects ?? [];
    const selectedId: string | null = st?.selectedId ?? null;
    const entities = objects.map((o) => ({
        id: o.id,
        name: o.name,
        type: "mesh" as const,
        transform: {
            position: [o.position.x, o.position.y, o.position.z] as [number, number, number],
            rotation: [o.rotation.x, o.rotation.y, o.rotation.z] as [number, number, number],
            scale: [o.scale.x, o.scale.y, o.scale.z] as [number, number, number],
        },
        geom: mapGeom(o),
        material: {
            id: o.id,
            name: o.name + " Material",
            baseColorHex: o.material.color,
            metalness: o.material.metalness,
            roughness: o.material.roughness,
        },
    }));
    const counts = { meshes: objects.length, lights: (st?.lights ?? []).length, cameras: 0 };
    return {
        units: "meters",
        upAxis: "Y",
        counts,
        selection: selectedId ? [selectedId] : [],
        entities,
        capabilities: [
            "get_scene_summary",
            "find",
            "get_selection",
            "create_primitive",
            "select",
            "transform",
            "duplicate",
            "delete",
            "create_material",
            "assign_material",
            "export_glb",
            "image_to_3d",
        ],
    };
}

function mapGeom(o: SceneObject): SceneSnapshot["entities"][number]["geom"] {
    switch (o.geometry) {
        case "box":
            return { kind: "cube" };
        case "sphere":
            return { kind: "sphere" };
        case "plane":
            return { kind: "plane" };
        case "cylinder":
            return { kind: "cylinder" };
        default:
            return {};
    }
}

function diff(beforeIds: string[], afterIds: string[], updatedIds: string[] = []): Diff {
    const before = new Set(beforeIds);
    const after = new Set(afterIds);
    const addedIds = Array.from(after).filter((id) => !before.has(id));
    const removedIds = Array.from(before).filter((id) => !after.has(id));
    return { addedIds, removedIds, updatedIds };
}

function idsOfObjects(): string[] {
    const st = nowState();
    return ((st?.objects ?? []) as SceneObject[]).map((o) => o.id);
}

function ok(partial: Partial<ToolResult> = {}): ToolResult {
    const res = { success: true, diagnostics: [], changes: { addedIds: [], removedIds: [], updatedIds: [] }, snapshot: snapshot(), ...partial } as ToolResult;
    return res;
}

function fail(diags: string[]): ToolResult {
    const res = { success: false, diagnostics: diags, snapshot: snapshot() } as ToolResult;
    return res;
}

// READ
export function get_scene_summary(): ToolResult {
    const s = ok();
    console.log("[Tool] get_scene_summary -> counts:", s.snapshot?.counts);
    return s;
}

export function find(args: { type?: "mesh" | "light" | "camera"; nameContains?: string; tag?: string }): ToolResult {
    const st = nowState();
    const objects: SceneObject[] = st?.objects ?? [];
    const subset = objects.filter((o) => (args?.nameContains ? o.name.toLowerCase().includes(args.nameContains.toLowerCase()) : true));
    const ids = subset.map((o) => o.id);
    console.log("[Tool] find:", args, "->", ids);
    return ok({ payload: { ids } });
}

export function get_selection(): ToolResult {
    const st = nowState();
    const id = st?.selectedId ?? null;
    console.log("[Tool] get_selection ->", id ? [id] : []);
    return ok({ payload: { ids: id ? [id] : [] } });
}

// WRITE
export function create_primitive(args: { kind: "cube" | "sphere" | "plane" | "cylinder" | "cone"; name?: string; dims?: { x?: number; y?: number; z?: number; radius?: number; height?: number }; parentId?: string }): ToolResult {
    console.log("[Tool] create_primitive:", args);
    const before = idsOfObjects();
    const st = nowState();
    if (!st) return fail(["state_unavailable"]);
    const kMap: Record<string, string> = { cube: "box", sphere: "sphere", plane: "plane", cylinder: "cylinder", cone: "cone" };
    const kind = args?.kind as keyof typeof kMap;
    if (!kind || !(kind in kMap)) return fail(["unsupported_kind"]);

    const addObject = st.addObject as (kind: any, params?: any) => void;
    const updateName = st.updateName as (id: string, name: string) => void;
    addObject(kMap[kind] as any, toParams(kMap[kind] as any, args?.dims));
    const after = idsOfObjects();
    const d = diff(before, after);
    const newId = d.addedIds[0];
    if (newId && args?.name && updateName) updateName(newId, args.name);
    const res = ok({ changes: d });
    console.log("[Tool] create_primitive diff:", d);
    return res;
}

function toParams(kind: "box" | "sphere" | "plane" | "cylinder" | "cone", dims: any) {
    if (!dims) return undefined;
    if (kind === "box") return { width: dims.x ?? 1, height: dims.y ?? 1, depth: dims.z ?? 1 };
    if (kind === "sphere") return { radius: dims.radius ?? 0.5 };
    if (kind === "plane") return { width: dims.x ?? 1, height: dims.y ?? 1 };
    if (kind === "cylinder") return { radiusTop: dims.radius ?? 0.5, radiusBottom: dims.radius ?? 0.5, height: dims.height ?? 1 };
    if (kind === "cone") return { radius: dims.radius ?? 0.5, height: dims.height ?? 1 };
    return undefined;
}

export function select(args: { ids?: string[]; query?: { type?: string; nameContains?: string } }): ToolResult {
    console.log("[Tool] select:", args);
    const st = nowState();
    if (!st) return fail(["state_unavailable"]);
    const selectFn = st.select as (id: string | null) => void;
    let ids = args?.ids ?? [];
    if ((!ids || ids.length === 0) && args?.query?.nameContains) {
        const res = find({ nameContains: args.query.nameContains }).payload?.ids || [];
        ids = res;
    }
    selectFn(ids && ids.length ? ids[0] : null);
    const out = ok({ changes: { addedIds: [], removedIds: [], updatedIds: [] } });
    console.log("[Tool] select ->", ids && ids.length ? ids[0] : null);
    return out;
}

export function transform(args: { id: string; translate?: [number, number, number]; rotate?: [number, number, number]; scale?: [number, number, number]; space?: "world" | "local" }): ToolResult {
    console.log("[Tool] transform:", args);
    const st = nowState();
    if (!st) return fail(["state_unavailable"]);
    const obj = (st.objects as SceneObject[]).find((o) => o.id === args?.id);
    if (!obj) return fail(["not_found"]);

    if (args?.scale) {
        const sx = Math.abs(args.scale[0] ?? 1);
        const sy = Math.abs(args.scale[1] ?? 1);
        const sz = Math.abs(args.scale[2] ?? 1);
        if (sx > 100 || sy > 100 || sz > 100) return fail(["scale_exceeds_cap_100x"]);
    }

    const before = idsOfObjects();
    const updateTransform = st.updateTransform as (id: string, partial: any) => void;
    const partial: any = {};
    if (args?.translate) partial.position = { x: obj.position.x + args.translate[0], y: obj.position.y + args.translate[1], z: obj.position.z + args.translate[2] };
    if (args?.rotate) partial.rotation = { x: obj.rotation.x + args.rotate[0], y: obj.rotation.y + args.rotate[1], z: obj.rotation.z + args.rotate[2] };
    if (args?.scale) partial.scale = { x: obj.scale.x * args.scale[0], y: obj.scale.y * args.scale[1], z: obj.scale.z * args.scale[2] };
    updateTransform(obj.id, partial);
    const after = idsOfObjects();
    const d = diff(before, after, [obj.id]);
    console.log("[Tool] transform diff:", d);
    return ok({ changes: d });
}

export function duplicate(args: { ids: string[]; withChildren?: boolean }): ToolResult {
    console.log("[Tool] duplicate:", args);
    const st = nowState();
    if (!st) return fail(["state_unavailable"]);
    const ids = args?.ids ?? [];
    if (ids.length !== 1) return fail(["duplicate_requires_single_selection_mvp"]);
    const sel = st.select as (id: string | null) => void;
    sel(ids[0]);
    const before = idsOfObjects();
    (st.duplicateSelected as () => void)();
    const after = idsOfObjects();
    const d = diff(before, after);
    console.log("[Tool] duplicate diff:", d);
    return ok({ changes: d });
}

export function del(args: { ids: string[] }): ToolResult {
    console.log("[Tool] delete:", args);
    const st = nowState();
    if (!st) return fail(["state_unavailable"]);
    const ids = args?.ids ?? [];
    if (ids.length !== 1) return fail(["delete_requires_single_selection_mvp"]);
    const sel = st.select as (id: string | null) => void;
    sel(ids[0]);
    const before = idsOfObjects();
    ;(st.deleteSelected as () => void)();
    const after = idsOfObjects();
    const d = diff(before, after);
    console.log("[Tool] delete diff:", d);
    return ok({ changes: d });
}

export function create_material(args: { name: string; pbr: { baseColorHex?: string; metalness?: number; roughness?: number } }): ToolResult {
    const id = nanoid(6);
    materialRegistry[id] = { id, name: args?.name || "Material", pbr: args?.pbr || {} };
    console.log("[Tool] create_material ->", id);
    return ok({ payload: { id } });
}

export function assign_material(args: { id: string; materialId: string }): ToolResult {
    console.log("[Tool] assign_material:", args);
    const st = nowState();
    if (!st) return fail(["state_unavailable"]);
    const obj = (st.objects as SceneObject[]).find((o) => o.id === args?.id);
    if (!obj) return fail(["not_found"]);
    const updateMaterial = st.updateMaterial as (id: string, partial: any) => void;

    let pbr: { baseColorHex?: string; metalness?: number; roughness?: number } | null = null;
    const reg = materialRegistry[args.materialId];
    if (reg) pbr = reg.pbr;
    else {
        const lower = (args.materialId || "").toLowerCase();
        const hex = lower.startsWith("#") ? lower : (COLOR_MAP[lower] || null);
        if (hex) pbr = { baseColorHex: hex };
    }
    if (!pbr) return fail(["material_not_found"]);

    updateMaterial(obj.id, {
        color: pbr.baseColorHex,
        metalness: typeof pbr.metalness === "number" ? pbr.metalness : undefined,
        roughness: typeof pbr.roughness === "number" ? pbr.roughness : undefined,
    });
    const res = ok({ changes: { addedIds: [], removedIds: [], updatedIds: [obj.id] } });
    console.log("[Tool] assign_material -> updated", obj.id);
    return res;
}

export async function export_glb(args: { ids?: string[]; embedTextures?: boolean }): Promise<ToolResult> {
    console.log("[Tool] export_glb:", args);
    try {
        const st = nowState();
        if (!st) return fail(["state_unavailable"]);
        const scene = buildSceneFromObjects(st.objects as SceneObject[]);
        await exportSceneToGLB(scene, "scene.glb");
        const res = ok();
        console.log("[Tool] export_glb -> done");
        return res;
    } catch (e: any) {
        console.error("[Tool] export_glb error", e);
        return fail(["export_failed", String(e?.message || e)]);
    }
}

export function image_to_3d(args: { imageRef: string; outFormat: "glb" | "obj" }): ToolResult {
    console.log("[Tool] image_to_3d (stub):", args);
    return { success: true, diagnostics: ["job_queued"], snapshot: snapshot() };
}

export function update_name(args: { id: string; name: string }): ToolResult {
    console.log("[Tool] update_name:", args);
    const st = nowState();
    if (!st) return fail(["state_unavailable"]);
    const u = st.updateName as (id: string, name: string) => void;
    if (!args?.id || !args?.name) return fail(["missing_args"]);
    u(args.id, args.name);
    return ok({ changes: { addedIds: [], removedIds: [], updatedIds: [args.id] } });
} 