import { AI_COMMANDS, Command, type SceneDoc } from "../scene/schema";
import { findObject } from "../scene/commands";

export type ToolCall = { function?: { name?: string; arguments?: string } };

const DEG = 180 / Math.PI;
const fmt = (v: number[]) => `[${v.map((n) => Math.round(n * 100) / 100).join(", ")}]`;

function size(o: SceneDoc["objects"][number]): string {
    const g = o.geometry;
    switch (g.type) {
        case "box":
            return `${g.width}x${g.height}x${g.depth}`;
        case "sphere":
            return `radius ${g.radius}`;
        case "cylinder":
            return `radius ${Math.max(g.radiusTop, g.radiusBottom)}, height ${g.height}`;
        case "cone":
            return `radius ${g.radius}, height ${g.height}`;
        case "torus":
            return `radius ${g.radius}, tube ${g.tube}`;
        case "plane":
            return `${g.width}x${g.height}`;
        case "mesh":
            return `${g.indices.length / 3} triangles`;
    }
}

export function describeScene(doc: SceneDoc, selectedId: string | null): string {
    const lines = doc.objects.map((o) =>
        [
            `"${o.name}"`,
            `${o.geometry.type} ${size(o)}`,
            `at ${fmt(o.position)}`,
            `rotation ${fmt(o.rotation.map((r) => r * DEG))} degrees`,
            `scale ${fmt(o.scale)}`,
            o.material.color,
            o.id === selectedId ? "(selected)" : "",
        ]
            .filter(Boolean)
            .join(", ")
    );
    return lines.join("\n");
}

export function toCommands(calls: ToolCall[]): { commands: Command[]; errors: string[] } {
    const commands: Command[] = [];
    const errors: string[] = [];
    for (const call of calls) {
        const name = call.function?.name ?? "";
        if (!(AI_COMMANDS as readonly string[]).includes(name)) {
            errors.push(`Unknown action "${name}"`);
            continue;
        }
        let args: unknown = {};
        try {
            args = JSON.parse(call.function?.arguments || "{}");
        } catch {
            errors.push(`Couldn't read the arguments for ${name}`);
            continue;
        }
        const parsed = Command.safeParse({ ...(args as object), type: name });
        if (parsed.success) commands.push(parsed.data);
        else errors.push(`Invalid ${name}: ${parsed.error.issues[0]?.message ?? "bad arguments"}`);
    }
    return { commands, errors };
}

export function describeCommand(cmd: Command, doc: SceneDoc): string {
    const name = "target" in cmd ? findObject(doc, cmd.target)?.name ?? cmd.target : "";
    switch (cmd.type) {
        case "add":
            return `added ${cmd.name ?? `a ${cmd.primitive}`}`;
        case "remove":
            return `removed ${name}`;
        case "duplicate":
            return `duplicated ${name}`;
        case "transform":
            return `moved ${name}`;
        case "material":
            return `restyled ${name}`;
        case "rename":
            return `renamed ${name} to ${cmd.name}`;
        case "boolean":
            return `combined ${name} with ${cmd.tool}`;
        default:
            return cmd.type;
    }
}

export function summarize(commands: Command[], doc: SceneDoc): string {
    if (!commands.length) return "";
    const parts = commands.map((c) => describeCommand(c, doc));
    const text = parts.join(", ");
    return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}
