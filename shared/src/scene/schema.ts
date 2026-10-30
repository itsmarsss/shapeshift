import { z } from "zod";

export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3>;

export const PRIMITIVES = [
    "box",
    "sphere",
    "cylinder",
    "cone",
    "torus",
    "plane",
    "wedge",
    "roof",
    "pyramid",
    "halfSphere",
    "tube",
    "polygon",
    "star",
    "text",
    "paraboloid",
] as const;
export const Primitive = z.enum(PRIMITIVES);
export type Primitive = z.infer<typeof Primitive>;

const PRIMITIVE_GEOMETRIES = [
    z.object({ type: z.literal("box"), width: z.number().positive(), height: z.number().positive(), depth: z.number().positive() }),
    z.object({ type: z.literal("sphere"), radius: z.number().positive() }),
    z.object({ type: z.literal("cylinder"), radiusTop: z.number().nonnegative(), radiusBottom: z.number().nonnegative(), height: z.number().positive() }),
    z.object({ type: z.literal("cone"), radius: z.number().positive(), height: z.number().positive() }),
    z.object({ type: z.literal("torus"), radius: z.number().positive(), tube: z.number().positive() }),
    z.object({ type: z.literal("plane"), width: z.number().positive(), height: z.number().positive() }),
    z.object({ type: z.literal("wedge"), width: z.number().positive(), height: z.number().positive(), depth: z.number().positive() }).describe("A ramp sloping down toward +X"),
    z.object({ type: z.literal("roof"), width: z.number().positive(), height: z.number().positive(), depth: z.number().positive() }).describe("A gable roof with its ridge along Z"),
    z.object({ type: z.literal("pyramid"), width: z.number().positive(), height: z.number().positive(), depth: z.number().positive() }),
    z.object({ type: z.literal("halfSphere"), radius: z.number().positive() }).describe("A dome with a flat base"),
    z.object({ type: z.literal("tube"), radius: z.number().positive(), thickness: z.number().positive().describe("Wall thickness, less than radius"), height: z.number().positive() }),
    z.object({ type: z.literal("polygon"), radius: z.number().positive(), sides: z.number().int().min(3).max(64), height: z.number().positive() }).describe("A prism with a regular polygon base"),
    z.object({
        type: z.literal("star"),
        radius: z.number().positive(),
        innerRadius: z.number().positive().describe("Less than radius"),
        points: z.number().int().min(3).max(32),
        height: z.number().positive(),
    }),
    z.object({ type: z.literal("text"), text: z.string().min(1).max(100), size: z.number().positive(), height: z.number().positive().describe("Extrusion thickness") }).describe("Text lying flat, extruded upward"),
    z.object({ type: z.literal("paraboloid"), radius: z.number().positive(), height: z.number().positive() }),
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
    emissive: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #ff8800").optional().describe("Glow color"),
    emissiveIntensity: z.number().min(0).max(20).optional().describe("Glow strength, 0 for none, around 1 to 4 for neon"),
    transmission: z.number().min(0).max(1).optional().describe("How much light passes through, 1 for clear glass"),
});
export type Material = z.infer<typeof Material>;

export const ENVIRONMENTS = ["none", "studio", "sunset", "city", "night"] as const;
export const Environment = z.enum(ENVIRONMENTS);
export type Environment = z.infer<typeof Environment>;

export const SceneObject = z.object({
    id: z.string(),
    name: z.string(),
    geometry: Geometry,
    position: Vec3,
    rotation: Vec3,
    scale: Vec3,
    material: Material,
    group: z.string().min(1).optional(),
    hole: z.boolean().optional(),
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

export const ANIM_PROPERTIES = ["position", "rotation", "scale", "color", "intensity"] as const;
export const AnimProperty = z.enum(ANIM_PROPERTIES);
export type AnimProperty = z.infer<typeof AnimProperty>;

export const EASINGS = ["linear", "ease", "step"] as const;
export const Easing = z.enum(EASINGS);
export type Easing = z.infer<typeof Easing>;

export const AnimValue = z.union([Vec3, z.number(), Material.shape.color]);
export type AnimValue = z.infer<typeof AnimValue>;

export const Keyframe = z.object({
    time: z.number().min(0).max(600).describe("Seconds"),
    value: AnimValue.describe("[x, y, z] for position, rotation (radians) and scale; #rrggbb for color; a number for intensity"),
    easing: Easing.optional().describe("How it moves toward the next keyframe. Defaults to ease"),
});
export type Keyframe = z.infer<typeof Keyframe>;

export const Track = z.object({
    target: z.string().describe("Object or light id"),
    property: AnimProperty,
    keys: z.array(Keyframe).max(500),
});
export type Track = z.infer<typeof Track>;

export const Animation = z.object({
    duration: z.number().positive().max(600),
    loop: z.boolean(),
    tracks: z.array(Track).max(1000),
});
export type Animation = z.infer<typeof Animation>;

export const emptyAnimation = (): Animation => ({ duration: 4, loop: true, tracks: [] });

export const SceneDoc = z.object({
    version: z.literal(2),
    objects: z.array(SceneObject),
    lights: z.array(Light).default([]),
    environment: Environment.default("none"),
    animation: Animation.default(emptyAnimation),
});
export type SceneDoc = z.infer<typeof SceneDoc>;

const Target = z.string().describe("Object id or exact name");
const Targets = z.array(z.string()).min(1).describe("Object ids, exact names or group names");

export const AXES = ["x", "y", "z"] as const;
export const Axis = z.enum(AXES);
export type Axis = z.infer<typeof Axis>;

export const Command = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("add"),
        primitive: Primitive,
        name: z.string().optional(),
        group: z.string().min(1).optional().describe("Put the new object in this group"),
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
        emissive: Material.shape.emissive,
        emissiveIntensity: Material.shape.emissiveIntensity,
        transmission: Material.shape.transmission,
    }),
    z.object({
        type: z.literal("keyframe"),
        target: Target,
        time: Keyframe.shape.time,
        properties: z.array(AnimProperty).min(1).optional().describe("Which properties to key. Defaults to position, rotation and scale, or position, color and intensity for a light"),
        values: z
            .object({ position: Vec3.optional(), rotation: Vec3.optional(), scale: Vec3.optional(), color: Material.shape.color.optional(), intensity: z.number().min(0).optional() })
            .optional()
            .describe("Values to record. Missing ones use the target's current values"),
        easing: Easing.optional(),
    }),
    z.object({
        type: z.literal("animate"),
        target: Target,
        property: AnimProperty,
        keys: z.array(Keyframe).min(1).max(200),
        replace: z.boolean().optional().describe("Replace the property's existing keyframes. Defaults to true"),
    }),
    z.object({
        type: z.literal("removeKeyframe"),
        target: Target,
        time: Keyframe.shape.time,
        property: AnimProperty.optional().describe("Omit to remove the keyframe for every property at that time"),
    }),
    z.object({ type: z.literal("clearAnimation"), only: Target.optional().describe("An object, light or group to clear. Omit to remove all animation") }),
    z.object({
        type: z.literal("timeline"),
        duration: Animation.shape.duration.optional().describe("Length in seconds"),
        loop: z.boolean().optional(),
    }),
    z.object({ type: z.literal("environment"), preset: Environment.describe("Image-based lighting around the scene. none uses plain lights only") }),
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
    z.object({
        type: z.literal("group"),
        name: z.string().min(1).describe("Group name. Commands can then target the whole group by it"),
        targets: z.array(Target).min(1),
    }),
    z.object({ type: z.literal("ungroup"), target: Target.describe("Group name") }),
    z.object({ type: z.literal("hole"), target: Target.describe("Object or group"), hole: z.boolean().describe("true makes it a hole, false a solid") }),
    z.object({
        type: z.literal("align"),
        targets: Targets.describe("Objects or groups to line up. A group moves as one piece"),
        axis: Axis,
        to: z.enum(["min", "center", "max"]).describe("Line up their low sides, centers or high sides"),
    }),
    z.object({ type: z.literal("mirror"), targets: Targets, axis: Axis.describe("Flip across the plane through their center that is perpendicular to this axis") }),
    z.object({
        type: z.literal("drop"),
        targets: Targets.describe("Objects or groups. A group drops as one piece"),
        origin: Vec3.optional().describe("A point on the surface to drop onto. Defaults to the ground"),
        normal: Vec3.optional().describe("Up direction of that surface. Defaults to [0, 1, 0]"),
    }),
    z.object({ type: z.literal("insert"), objects: z.array(SceneObject) }),
    z.object({ type: z.literal("clear") }),
]);

export const AI_COMMANDS = ["add", "remove", "duplicate", "transform", "material", "rename", "hole", "align", "mirror", "drop", "boolean", "addLight", "updateLight", "group", "ungroup", "environment", "animate", "keyframe", "removeKeyframe", "clearAnimation", "timeline"] as const;
export type Command = z.infer<typeof Command>;
