import { z } from "zod";
import { AI_COMMANDS, Command } from "./schema";

const DESCRIPTIONS: Record<(typeof AI_COMMANDS)[number], string> = {
    add: "Add a primitive. Without a position it rests on the ground in the nearest free spot.",
    remove: "Delete an object.",
    duplicate: "Copy an object, offset by `offset` (default [0.5, 0, 0.5]).",
    transform: "Set position, rotation (radians) and scale. With relative: true, position and rotation are added and scale is multiplied.",
    material: "Change color (#rrggbb), metalness, roughness or opacity (all 0 to 1).",
    rename: "Rename an object.",
    boolean: "Combine two objects. union merges them, subtract cuts `tool` out of `target`, intersect keeps the overlap. `tool` is removed.",
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
