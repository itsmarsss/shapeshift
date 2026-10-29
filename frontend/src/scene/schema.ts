import { z } from "zod";

export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3>;

export const PRIMITIVES = ["box", "sphere", "cylinder", "cone", "torus", "plane"] as const;
export const Primitive = z.enum(PRIMITIVES);
export type Primitive = z.infer<typeof Primitive>;

export const Geometry = z.discriminatedUnion("type", [
    z.object({ type: z.literal("box"), width: z.number().positive(), height: z.number().positive(), depth: z.number().positive() }),
    z.object({ type: z.literal("sphere"), radius: z.number().positive() }),
    z.object({ type: z.literal("cylinder"), radiusTop: z.number().nonnegative(), radiusBottom: z.number().nonnegative(), height: z.number().positive() }),
    z.object({ type: z.literal("cone"), radius: z.number().positive(), height: z.number().positive() }),
    z.object({ type: z.literal("torus"), radius: z.number().positive(), tube: z.number().positive() }),
    z.object({ type: z.literal("plane"), width: z.number().positive(), height: z.number().positive() }),
    z.object({ type: z.literal("mesh"), positions: z.array(z.number()), indices: z.array(z.number().int().nonnegative()) }),
]);
export type Geometry = z.infer<typeof Geometry>;

export const Material = z.object({
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    metalness: z.number().min(0).max(1),
    roughness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
});
export type Material = z.infer<typeof Material>;

export const SceneObject = z.object({
    id: z.string(),
    name: z.string(),
    geometry: Geometry,
    position: Vec3,
    rotation: Vec3,
    scale: Vec3,
    material: Material,
});
export type SceneObject = z.infer<typeof SceneObject>;

export const SceneDoc = z.object({
    version: z.literal(2),
    objects: z.array(SceneObject),
});
export type SceneDoc = z.infer<typeof SceneDoc>;

const Target = z.string().describe("Object id or exact name");

export const Command = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("add"),
        primitive: Primitive,
        name: z.string().optional(),
        position: Vec3.optional(),
        rotation: Vec3.optional().describe("Radians"),
        scale: Vec3.optional(),
        color: Material.shape.color.optional(),
    }),
    z.object({ type: z.literal("remove"), target: Target }),
    z.object({ type: z.literal("duplicate"), target: Target, offset: Vec3.optional() }),
    z.object({
        type: z.literal("transform"),
        target: Target,
        position: Vec3.optional(),
        rotation: Vec3.optional().describe("Radians"),
        scale: Vec3.optional(),
        relative: z.boolean().optional().describe("Add position/rotation and multiply scale instead of setting them"),
    }),
    z.object({
        type: z.literal("material"),
        target: Target,
        color: Material.shape.color.optional(),
        metalness: Material.shape.metalness.optional(),
        roughness: Material.shape.roughness.optional(),
        opacity: Material.shape.opacity.optional(),
    }),
    z.object({ type: z.literal("rename"), target: Target, name: z.string().min(1) }),
    z.object({ type: z.literal("geometry"), target: Target, geometry: Geometry }),
    z.object({ type: z.literal("clear") }),
]);
export type Command = z.infer<typeof Command>;
