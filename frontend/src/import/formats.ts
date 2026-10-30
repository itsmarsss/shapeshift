export const FORMATS = {
    step: ["step", "stp"],
    iges: ["iges", "igs"],
    stl: ["stl"],
    obj: ["obj"],
    "3mf": ["3mf"],
    gltf: ["gltf", "glb"],
    svg: ["svg"],
} as const;

export type Format = keyof typeof FORMATS;

export const ACCEPT = Object.values(FORMATS)
    .flat()
    .map((e) => `.${e}`)
    .join(",");

export const extension = (file: string) => file.split(".").pop()?.toLowerCase() ?? "";

export function formatOf(file: string): Format | null {
    const ext = extension(file);
    return (Object.keys(FORMATS) as Format[]).find((f) => (FORMATS[f] as readonly string[]).includes(ext)) ?? null;
}

export const baseName = (file: string) => file.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "") || "Model";
