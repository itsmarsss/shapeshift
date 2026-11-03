// Every tool the model can call: one per scene command, plus a few that read
// the scene or drive the editor. Shared by the Worker (to declare them) and the
// browser (to validate and run them).
import { z } from "zod";
import { aiTools } from "../scene/aiTools";
import { AI_COMMANDS, Command } from "../scene/schema";
import { VIEWS, type View } from "../viewport/views";

const AGENT_TOOLS = {
    inspect: {
        description:
            "Read exact geometry, transform, material and world-space bounds for objects. Use it before precise edits when the scene summary is not enough.",
        args: z.object({
            targets: z.array(z.string().min(1)).min(1).max(50).describe("Object ids or exact names"),
        }),
    },
    select: {
        description: "Select an object in the editor, or pass null to clear the selection.",
        args: z.object({ target: z.string().min(1).nullable().describe("Object id or exact name") }),
    },
    look: {
        description:
            "Take a picture of the viewport to check how the scene looks. Use it after building or rearranging something with several parts, then fix anything that looks wrong. Views other than current frame the targets, or the whole scene.",
        args: z.object({
            view: z.enum(VIEWS).optional().describe("Camera angle. Defaults to iso"),
            targets: z.array(z.string().min(1)).max(50).optional().describe("Object ids or exact names to frame"),
        }),
    },
    undo: {
        description: "Undo the user's most recent changes. Only use when the user asks to undo or go back.",
        args: z.object({ steps: z.number().int().min(1).max(20).optional().describe("How many changes to undo. Defaults to 1") }),
    },
} as const;

type AgentToolName = keyof typeof AGENT_TOOLS;

export type ToolDefinition = {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
};

export const TOOLS: ToolDefinition[] = [
    ...aiTools().map((t) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })),
    ...(Object.keys(AGENT_TOOLS) as AgentToolName[]).map((name) => {
        const parameters = z.toJSONSchema(AGENT_TOOLS[name].args, { target: "draft-7", io: "input" }) as Record<string, unknown>;
        delete parameters.$schema;
        return { name, description: AGENT_TOOLS[name].description, parameters };
    }),
];

export type ToolRequest =
    | { kind: "command"; command: Command }
    | { kind: "inspect"; targets: string[] }
    | { kind: "select"; target: string | null }
    | { kind: "look"; view: View; targets?: string[] }
    | { kind: "undo"; steps: number };

export type ParsedTool = { ok: true; request: ToolRequest } | { ok: false; error: string };

function issues(error: z.ZodError) {
    return error.issues
        .slice(0, 6)
        .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
        .join("; ");
}

// Arguments as JSON, forgiving the slips smaller models make: a code fence
// around it, trailing commas, or text before or after the object.
export function looseJson(raw: string): unknown {
    const text = raw.trim();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        // Keep going with the repairs below.
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new SyntaxError("Not JSON");
    return JSON.parse(text.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1"));
}

// Text fields stay text even when they look like numbers ("1" as a name).
const TEXT_KEYS = new Set(["name", "target", "text", "group", "label", "preset", "color", "emissive", "primitive", "type", "property", "axis"]);

// Numbers sent as text ("0.5") become numbers, and a shape's size gets its
// type from the primitive when it's left out. Both are common slips.
function tidyArgs(value: unknown, key = ""): unknown {
    if (typeof value === "string" && !TEXT_KEYS.has(key) && /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(value.trim())) return Number(value);
    if (Array.isArray(value)) return value.map((v) => tidyArgs(v, key));
    if (value && typeof value === "object") {
        const out = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tidyArgs(v, k)]));
        const o = out as { primitive?: unknown; geometry?: Record<string, unknown> };
        if (o.geometry && typeof o.geometry === "object" && !o.geometry.type && typeof o.primitive === "string") o.geometry = { type: o.primitive, ...o.geometry };
        return out;
    }
    return value;
}

export function parseToolCall(name: string, rawArgs: string): ParsedTool {
    let args: unknown;
    try {
        args = tidyArgs(looseJson(rawArgs));
    } catch {
        return { ok: false, error: "The arguments were not valid JSON" };
    }
    if (!args || typeof args !== "object" || Array.isArray(args)) return { ok: false, error: "The arguments must be an object" };

    if ((AI_COMMANDS as readonly string[]).includes(name)) {
        // The tool name decides the command type, whatever the arguments say.
        const parsed = Command.safeParse({ ...args, type: name });
        return parsed.success ? { ok: true, request: { kind: "command", command: parsed.data } } : { ok: false, error: issues(parsed.error) };
    }

    switch (name) {
        case "inspect": {
            const parsed = AGENT_TOOLS.inspect.args.safeParse(args);
            return parsed.success ? { ok: true, request: { kind: "inspect", targets: parsed.data.targets } } : { ok: false, error: issues(parsed.error) };
        }
        case "select": {
            const parsed = AGENT_TOOLS.select.args.safeParse(args);
            return parsed.success ? { ok: true, request: { kind: "select", target: parsed.data.target } } : { ok: false, error: issues(parsed.error) };
        }
        case "look": {
            const parsed = AGENT_TOOLS.look.args.safeParse(args);
            return parsed.success
                ? { ok: true, request: { kind: "look", view: parsed.data.view ?? "iso", targets: parsed.data.targets } }
                : { ok: false, error: issues(parsed.error) };
        }
        case "undo": {
            const parsed = AGENT_TOOLS.undo.args.safeParse(args);
            return parsed.success ? { ok: true, request: { kind: "undo", steps: parsed.data.steps ?? 1 } } : { ok: false, error: issues(parsed.error) };
        }
    }
    return { ok: false, error: `Unknown tool "${name}"` };
}
