import { z } from "zod";
import { AI_COMMANDS, Command } from "./schema";

const DESCRIPTIONS: Record<(typeof AI_COMMANDS)[number], string> = {
    add: "Add a shape. Set geometry for exact dimensions (its type must match the primitive), or scale to stretch it. Without a position it rests on the ground in the nearest free spot.",
    remove: "Delete an object.",
    duplicate: "Copy an object, offset by `offset` (default [0.5, 0, 0.5]).",
    transform: "Set position, rotation (radians) and scale. With relative: true, position and rotation are added and scale is multiplied.",
    animate: "Animate one property of an object, light or group with keyframes over time, such as a spin, a bounce or a color change. Rotation values are radians and accumulate, so a full turn ends at 6.283.",
    keyframe: "Record the target's current position, rotation and scale (or the given values) as a keyframe at a time.",
    removeKeyframe: "Delete the keyframe at a time.",
    clearAnimation: "Remove all animation from an object, light or group, or from the whole scene.",
    timeline: "Set the animation length in seconds and whether it loops.",
    environment: "Set the lighting environment that metals, glass and shiny surfaces reflect: studio, sunset, city or night. none turns it off.",
    material: "Change color (#rrggbb), metalness, roughness or opacity (all 0 to 1). emissive and emissiveIntensity make it glow; transmission 1 with low roughness makes clear glass.",
    rename: "Rename an object.",
    addLight:
        "Add a light. point shines in every direction, spot shines a cone from position toward aim, directional is sunlight from the direction of position toward aim.",
    group: "Group objects under a name. Every other command can then target the group by that name to change all of its parts at once, such as moving or recoloring a whole chair.",
    ungroup: "Dissolve a group. Its objects stay where they are.",
    updateLight: "Change a light's position, aim, color, intensity, range or spot angle.",
    hole: "Mark an object or every part of a group as a hole or back as a solid. A group that has both renders and exports as its solids with the holes cut out, and the parts stay editable. Lone holes are not exported.",
    align: "Line up objects or groups along one axis by their world bounds: min, center or max of all of them together.",
    mirror: "Flip objects or groups across one axis, around their shared center.",
    drop: "Move objects or groups straight down until their lowest point rests on the ground, or on the surface given by origin and normal.",
    boolean: "Combine two objects into one mesh for good. union merges them, subtract cuts `tool` out of `target`, intersect keeps the overlap. `tool` is removed.",
};

type JsonSchema = Record<string, unknown> & { items?: unknown };

export function aiTools() {
    return AI_COMMANDS.map((type) => {
        const variant = Command.options.find((o) => o.shape.type.value === type) as z.ZodObject;
        const parameters = z.toJSONSchema(variant.omit({ type: true }), {
            target: "draft-7",
            io: "input",
            override: (ctx) => {
                const json = ctx.jsonSchema as JsonSchema;
                if (Array.isArray(json.items)) {
                    json.items = { type: "number" };
                    json.minItems = 3;
                    json.maxItems = 3;
                }
            },
        });
        delete (parameters as JsonSchema).$schema;
        return {
            type: "function" as const,
            function: { name: type, description: DESCRIPTIONS[type], parameters },
        };
    });
}
