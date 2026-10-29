import { z } from "zod";

export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3>;

export const PRIMITIVES = ["box", "sphere", "cylinder", "cone", "torus", "plane"] as const;
export const Primitive = z.enum(PRIMITIVES);
export type Primitive = z.infer<typeof Primitive>;

const PRIMITIVE_GEOMETRIES = [
    z.object({ type: z.literal("box"), width: z.number().positive(), height: z.number().positive(), depth: z.number().positive() }),
    z.object({ type: z.literal("sphere"), radius: z.number().positive() }),
    z.object({ type: z.literal("cylinder"), radiusTop: z.number().nonnegative(), radiusBottom: z.number().nonnegative(), height: z.number().positive() }),
    z.object({ type: z.literal("cone"), radius: z.number().positive(), height: z.number().positive() }),
    z.object({ type: z.literal("torus"), radius: z.number().positive(), tube: z.number().positive() }),
    z.object({ type: z.literal("plane"), width: z.number().positive(), height: z.number().positive() }),
] as const;

export const PrimitiveGeometry = z.discriminatedUnion("type", PRIMITIVE_GEOMETRIES);
export type PrimitiveGeometry = z.infer<typeof PrimitiveGeometry>;

export const Geometry = z.discriminatedUnion("type", [
    ...PRIMITIVE_GEOMETRIES,
    z.object({ type: z.literal("mesh"), positions: z.array(z.number()), indices: z.array(z.number().int().nonnegative()) }),
]);
export type Geometry = z.infer<typeof Geometry>;

export const Material = z.object({
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #ff8800"),
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

export const LIGHT_TYPES = ["point", "spot", "directional"] as const;
export const LightType = z.enum(LIGHT_TYPES);
export type LightType = z.infer<typeof LightType>;

const LightProps = {
    color: Material.shape.color,
    intensity: z.number().min(0).max(1000).describe("Point and spot lights use candela (10 to 50 lights a room), directional uses lux (1 to 4)"),
    distance: z.number().min(0).describe("Range of a point or spot light. 0 means no limit"),
    angle: z.number().min(0.02).max(Math.PI / 2).describe("Spot cone half-angle in radians"),
};

export const Light = z.object({
    id: z.string(),
    name: z.string(),
    type: LightType,
    position: Vec3,
    aim: Vec3.describe("The point a spot or directional light shines toward"),
    ...LightProps,
});
export type Light = z.infer<typeof Light>;

export const SceneDoc = z.object({
    version: z.literal(2),
    objects: z.array(SceneObject),
    lights: z.array(Light).default([]),
});
export type SceneDoc = z.infer<typeof SceneDoc>;

const Target = z.string().describe("Object id or exact name");

export const Command = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("add"),
        primitive: Primitive,
        name: z.string().optional(),
        geometry: PrimitiveGeometry.optional().describe("Dimensions. Its type must match the primitive"),
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
    z.object({
        type: z.literal("boolean"),
        operation: z.enum(["union", "subtract", "intersect"]),
        target: Target.describe("First object, kept and replaced by the result"),
        tool: Target.describe("Second object, removed after the operation"),
    }),
    z.object({
        type: z.literal("addLight"),
        light: LightType,
        name: z.string().optional(),
        position: Vec3.optional(),
        aim: Light.shape.aim.optional(),
        color: LightProps.color.optional(),
        intensity: LightProps.intensity.optional(),
        distance: LightProps.distance.optional(),
        angle: LightProps.angle.optional(),
    }),
    z.object({
        type: z.literal("updateLight"),
        target: Target,
        position: Vec3.optional(),
        aim: Light.shape.aim.optional(),
        color: LightProps.color.optional(),
        intensity: LightProps.intensity.optional(),
        distance: LightProps.distance.optional(),
        angle: LightProps.angle.optional(),
    }),
    z.object({ type: z.literal("insert"), objects: z.array(SceneObject) }),
    z.object({ type: z.literal("clear") }),
]);

export const AI_COMMANDS = ["add", "remove", "duplicate", "transform", "material", "rename", "boolean", "addLight", "updateLight"] as const;
export type Command = z.infer<typeof Command>;
