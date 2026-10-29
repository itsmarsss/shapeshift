// Every tool the model can call: one per scene command, plus a few that read
// the scene or drive the editor. Shared by the Worker (to declare them) and the
// browser (to validate and run them).
import { z } from "zod";
import { aiTools } from "../scene/aiTools";
import { AI_COMMANDS, Command } from "../scene/schema";

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
    | { kind: "undo"; steps: number };

export type ParsedTool = { ok: true; request: ToolRequest } | { ok: false; error: string };

function issues(error: z.ZodError) {
    return error.issues
        .slice(0, 6)
        .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
        .join("; ");
}

export function parseToolCall(name: string, rawArgs: string): ParsedTool {
    let args: unknown;
    try {
        args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
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
        case "undo": {
            const parsed = AGENT_TOOLS.undo.args.safeParse(args);
            return parsed.success ? { ok: true, request: { kind: "undo", steps: parsed.data.steps ?? 1 } } : { ok: false, error: issues(parsed.error) };
        }
    }
    return { ok: false, error: `Unknown tool "${name}"` };
}
