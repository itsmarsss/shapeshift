import type { SceneObject } from "@shapeshift/shared/scene/schema";

export type RGB = [number, number, number];

// One part as a parser found it, in the file's own units and axes.
export type RawPart = {
    name: string;
    // Assemblies the part sits in, outermost first, below the file itself.
    path: string[];
    positions: Float32Array;
    normals?: Float32Array;
    indices?: Uint32Array;
    // Per vertex, 0 to 1, for parts with more than one color.
    colors?: Float32Array;
    color?: RGB | null;
    // Set when the file itself reuses one mesh in several places. `positions`
    // are then in the mesh's own space and `matrix` places this copy.
    shared?: { key: string; matrix: number[] };
};

export type RawModel = {
    name: string;
    parts: RawPart[];
    // Meters per file unit.
    unitScale: number;
    // Most CAD tools and 3D printing formats treat Z as up; the scene uses Y.
    zUp: boolean;
};

export type ImportedMesh = { hash: string; buffer: ArrayBuffer };

export type ImportResult = {
    objects: SceneObject[];
    meshes: ImportedMesh[];
    triangles: number;
};

export type Progress = (label: string, fraction?: number) => void;

export class ImportError extends Error {}
