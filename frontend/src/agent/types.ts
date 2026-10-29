import type * as Tools from "./tools";

export type SceneEntityType = "mesh" | "light" | "camera" | "empty";

export type SceneSnapshot = {
    units: "meters";
    upAxis: "Y";
    counts: { meshes: number; lights: number; cameras: number };
    selection: string[];
    entities: Array<{
        id: string;
        name: string;
        type: SceneEntityType;
        parentId?: string;
        childrenIds?: string[];
        transform: {
            position: [number, number, number];
            rotation: [number, number, number];
            scale: [number, number, number];
        };
        geom?: {
            kind?: "cube" | "sphere" | "plane" | "cylinder";
            stats?: { vertices: number; triangles: number };
            bounds?: { min: [number, number, number]; max: [number, number, number] };
        };
        material?: {
            id: string;
            name: string;
            baseColorHex?: string;
            metalness?: number;
            roughness?: number;
        };
    }>;
    bounds?: { min: [number, number, number]; max: [number, number, number] };
    capabilities: string[];
};

export type Diff = {
    addedIds: string[];
    removedIds: string[];
    updatedIds: string[];
};

export type ToolResult = {
    success: boolean;
    diagnostics?: string[];
    snapshot?: SceneSnapshot;
    changes?: Diff;
    payload?: { ids?: string[]; id?: string };
};

type ToolArgs = {
    get_scene_summary: Record<string, never>;
    find: Parameters<typeof Tools.find>[0];
    get_selection: Record<string, never>;
    create_primitive: Parameters<typeof Tools.create_primitive>[0];
    select: Parameters<typeof Tools.select>[0];
    transform: Parameters<typeof Tools.transform>[0];
    duplicate: Parameters<typeof Tools.duplicate>[0];
    delete: Parameters<typeof Tools.del>[0];
    create_material: Parameters<typeof Tools.create_material>[0];
    assign_material: Parameters<typeof Tools.assign_material>[0];
    export_glb: Parameters<typeof Tools.export_glb>[0];
    image_to_3d: Parameters<typeof Tools.image_to_3d>[0];
    update_name: Parameters<typeof Tools.update_name>[0];
};

export type ToolInvocation = {
    [K in keyof ToolArgs]: { name: K; args: ToolArgs[K] };
}[keyof ToolArgs];

export type StepResult = {
    tool: ToolInvocation;
    ok: boolean;
    diagnostics?: string[];
    diff?: Diff;
}; 