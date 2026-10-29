import { findObject } from "../scene/commands";
import type { Command } from "../scene/schema";
import { useScene } from "../scene/store";
import { takeSnapshot, type View } from "../viewport/snapshot";
import { describeCommand, describeObject, describeScene, inspectObject } from "./assistant";
import { LIMITS, type WireMessage, type WireToolCall } from "./protocol";
import { parseToolCall } from "./tools";

export const MAX_OBJECTS = 1000;

export type Activity = {
    id: string;
    label: string;
    ok: boolean;
    error?: string;
    color?: string;
    image?: string;
    // True when this call changed the scene, as opposed to reading it.
    changed?: boolean;
    // The object the call was about, so the chat can select it.
    target?: string;
};

export type ToolMessage = Extract<WireMessage, { role: "tool" }>;

export type TurnContext = {
    // Every edit in a turn shares this key, so the whole turn is one undo step.
    coalesce: string;
    // Names the model asked for, mapped to the ids of the objects it created.
    // If "Leg" was taken and the new object became "Leg 2", the model can
    // still reach it as "Leg" for the rest of the turn.
    aliases: Map<string, string>;
    created: string[];
    changed: boolean;
};

export function newTurnContext(coalesce: string): TurnContext {
    return { coalesce, aliases: new Map(), created: [], changed: false };
}

function clip(text: string) {
    return text.length > LIMITS.toolResultChars ? `${text.slice(0, LIMITS.toolResultChars - 40)}… (truncated)` : text;
}

function resolveAlias(ctx: TurnContext, target: string): string {
    const doc = useScene.getState().doc;
    const alias = ctx.aliases.get(target.toLowerCase());
    // An exact id always wins; the alias only covers names this turn created.
    if (alias && !doc.objects.some((o) => o.id === target) && doc.objects.some((o) => o.id === alias)) return alias;
    return target;
}

function withAliases(cmd: Command, ctx: TurnContext): Command {
    if (cmd.type === "boolean") return { ...cmd, target: resolveAlias(ctx, cmd.target), tool: resolveAlias(ctx, cmd.tool) };
    if ("target" in cmd) return { ...cmd, target: resolveAlias(ctx, cmd.target) };
    return cmd;
}

function commandColor(cmd: Command): string | undefined {
    if (cmd.type === "add" || cmd.type === "material") return cmd.color;
    return undefined;
}

type Outcome = { activity: Omit<Activity, "id">; result: unknown; isError: boolean; images?: string[] };

function runCommand(original: Command, ctx: TurnContext): Outcome {
    const cmd = withAliases(original, ctx);
    const state = useScene.getState();
    const label = describeCommand(cmd, state.doc);

    if ((cmd.type === "add" || cmd.type === "duplicate") && state.doc.objects.length >= MAX_OBJECTS) {
        const error = `The scene already has ${MAX_OBJECTS} objects, the most it can hold`;
        return { activity: { label, ok: false, error }, result: { ok: false, error }, isError: true };
    }

    // Leave the selection alone while building; the turn selects what it made at the end.
    const [result] = state.run(cmd, { coalesce: ctx.coalesce, select: false });
    if (!result?.ok) {
        const error = result?.error ?? "The change could not be applied";
        return { activity: { label, ok: false, error }, result: { ok: false, error }, isError: true };
    }
    ctx.changed = true;
    ctx.created.push(...result.created);

    const { doc, selectedId } = useScene.getState();
    const touched = result.created.length
        ? result.created
        : "target" in cmd
          ? [findObject(doc, cmd.target)?.id].filter((id): id is string => !!id)
          : [];
    const objects = touched.flatMap((id) => {
        const o = doc.objects.find((x) => x.id === id);
        return o ? [describeObject(o, selectedId)] : [];
    });
    if (cmd.type === "add" && cmd.name && result.created[0]) ctx.aliases.set(cmd.name.toLowerCase(), result.created[0]);

    return {
        activity: { label, ok: true, color: commandColor(cmd), changed: true, target: touched[0] },
        result: { ok: true, ...(objects.length ? { objects } : {}) },
        isError: false,
    };
}

function runInspect(targets: string[], ctx: TurnContext): Outcome {
    const doc = useScene.getState().doc;
    const found = targets.map((t) => findObject(doc, resolveAlias(ctx, t)));
    const objects = found.filter((o) => !!o).map(inspectObject);
    const missing = targets.filter((_, i) => !found[i]);
    const names = objects.map((o) => o.name);
    return {
        activity: {
            label: `Inspected ${names.length === 1 ? names[0] : `${names.length} objects`}`,
            ok: objects.length > 0,
            target: objects.length === 1 ? objects[0].id : undefined,
        },
        result: { objects, ...(missing.length ? { missing } : {}) },
        isError: objects.length === 0,
    };
}

function runSelect(target: string | null, ctx: TurnContext): Outcome {
    const state = useScene.getState();
    if (target === null) {
        state.select(null);
        return { activity: { label: "Cleared the selection", ok: true }, result: { ok: true }, isError: false };
    }
    const obj = findObject(state.doc, resolveAlias(ctx, target));
    if (!obj) {
        const error = `No object named "${target}"`;
        return { activity: { label: `Select ${target}`, ok: false, error }, result: { ok: false, error }, isError: true };
    }
    state.select(obj.id);
    return { activity: { label: `Selected ${obj.name}`, ok: true }, result: { ok: true, selected: obj.id }, isError: false };
}

const VIEW_NAMES: Record<View, string> = {
    current: "the current view",
    front: "the front",
    back: "the back",
    left: "the left",
    right: "the right",
    top: "above",
    iso: "an angle",
};

function runLook(view: View, targets: string[] | undefined, ctx: TurnContext): Outcome {
    const doc = useScene.getState().doc;
    const ids = targets?.map((t) => findObject(doc, resolveAlias(ctx, t))?.id).filter((id): id is string => !!id);
    const shot = takeSnapshot({ view, targets: ids?.length ? ids : undefined });
    if (!shot) {
        const error = "The viewport isn't available";
        return { activity: { label: "Couldn't look at the scene", ok: false, error }, result: { ok: false, error }, isError: true };
    }
    return {
        activity: { label: `Looked from ${VIEW_NAMES[view]}`, ok: true, image: shot.dataUrl },
        result: { ok: true, view, size: `${shot.width}x${shot.height}`, note: "The picture is attached. The grid cells are 0.5 m, the red line is X and the blue line is Z." },
        isError: false,
        images: [shot.dataUrl.slice(shot.dataUrl.indexOf(",") + 1)],
    };
}

function runUndo(steps: number, ctx: TurnContext): Outcome {
    const state = useScene.getState();
    // Undo pops whole history entries, so stop merging this turn's edits into
    // whatever entry ends up on top.
    state.endCoalesce();
    const available = Math.min(steps, state.past.length);
    for (let i = 0; i < available; i++) useScene.getState().undo();
    if (available > 0) ctx.changed = true;
    const { doc, selectedId } = useScene.getState();
    return {
        activity: { label: available ? `Undid ${available === 1 ? "the last change" : `${available} changes`}` : "Nothing to undo", ok: available > 0, changed: available > 0 },
        result: { undone: available, scene: describeScene(doc, selectedId) },
        isError: false,
    };
}

export function executeToolCalls(calls: WireToolCall[], ctx: TurnContext): { messages: ToolMessage[]; activities: Activity[] } {
    const messages: ToolMessage[] = [];
    const activities: Activity[] = [];

    for (const call of calls) {
        const parsed = parseToolCall(call.name, call.arguments);
        let outcome: Outcome;
        if (!parsed.ok) {
            outcome = {
                activity: { label: `Couldn't run ${call.name}`, ok: false, error: parsed.error },
                result: { ok: false, error: parsed.error },
                isError: true,
            };
        } else {
            const req = parsed.request;
            try {
                outcome =
                    req.kind === "command"
                        ? runCommand(req.command, ctx)
                        : req.kind === "inspect"
                          ? runInspect(req.targets, ctx)
                          : req.kind === "select"
                            ? runSelect(req.target, ctx)
                            : req.kind === "look"
                              ? runLook(req.view, req.targets, ctx)
                              : runUndo(req.steps, ctx);
            } catch (err) {
                const error = err instanceof Error ? err.message : "The change failed";
                outcome = { activity: { label: `Couldn't run ${call.name}`, ok: false, error }, result: { ok: false, error }, isError: true };
            }
        }
        activities.push({ id: call.id, ...outcome.activity });
        messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: clip(JSON.stringify(outcome.result)),
            ...(outcome.isError ? { is_error: true } : {}),
            ...(outcome.images ? { images: outcome.images } : {}),
        });
    }
    return { messages, activities };
}
