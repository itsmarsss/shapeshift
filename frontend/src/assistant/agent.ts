import { useScene } from "../scene/store";
import { describeScene } from "./assistant";
import { executeToolCalls, type Activity, type TurnContext } from "./executor";
import { LIMITS, type StopReason, type WireMessage } from "@shapeshift/shared/assistant/protocol";
import { AgentError, type Transport } from "./transport";
import { checkScene, type Issue } from "../scene/checks";

export type TurnHandlers = {
    onText?: (text: string) => void;
    onThinking?: (text: string) => void;
    onToolStart?: (name: string) => void;
    onActivities?: (activities: Activity[]) => void;
    onModel?: (model: string) => void;
};

export type TurnOutcome = { stop: StopReason | "max_steps" };

const REQUEST_BUDGET = Math.floor(LIMITS.requestBytes * 0.8);

// The most check results given to the model at once.
const MAX_ISSUES = 8;

// Problems in what this turn built or changed (see scene/checks.ts).
function turnIssues(ctx: TurnContext): Issue[] {
    return ctx.touched.size ? checkScene(useScene.getState().doc, { only: ctx.touched }) : [];
}

function listIssues(issues: Issue[]) {
    const shown = issues.slice(0, MAX_ISSUES).map((i) => `- ${i.message}`);
    if (issues.length > MAX_ISSUES) shown.push(`- and ${issues.length - MAX_ISSUES} more like these`);
    return shown.join("\n");
}

const size = (m: WireMessage) => JSON.stringify(m).length;

// The newest slice of the conversation that fits in one request, starting at a
// user prompt so tool results never lose the call they answer.
export function requestWindow(conversation: WireMessage[]): WireMessage[] {
    let start = conversation.length;
    let bytes = 0;
    for (let i = conversation.length - 1; i >= 0; i--) {
        bytes += size(conversation[i]);
        if (conversation.length - i > LIMITS.messages || bytes > REQUEST_BUDGET) break;
        if (conversation[i].role === "user") start = i;
    }
    if (start === conversation.length) {
        // A single turn bigger than the budget: keep the prompt and the newest steps.
        let prompt = conversation.length - 1;
        while (prompt >= 0 && conversation[prompt].role !== "user") prompt--;
        if (prompt < 0) return conversation.slice(-1);
        const tail: WireMessage[] = [];
        let total = size(conversation[prompt]);
        for (let i = conversation.length - 1; i > prompt; i--) {
            total += size(conversation[i]);
            if (total > REQUEST_BUDGET || tail.length >= LIMITS.messages - 1) break;
            tail.unshift(conversation[i]);
        }
        while (tail[0]?.role === "tool") tail.shift();
        return [conversation[prompt], ...tail];
    }
    return conversation.slice(start);
}

/**
 * Runs one user turn: asks the model for a step, runs its tool calls against
 * the scene, sends the results back, and repeats until the model answers
 * without calling tools. `conversation` is appended to as the turn goes, so
 * whatever finished before an error or a stop is kept and can be resumed.
 */
export async function runTurn(opts: {
    conversation: WireMessage[];
    prompt?: string;
    images?: string[];
    transport: Transport;
    signal: AbortSignal;
    ctx: TurnContext;
    handlers?: TurnHandlers;
    maxSteps?: number;
}): Promise<TurnOutcome> {
    const { conversation, transport, signal, ctx, handlers = {} } = opts;
    const maxSteps = opts.maxSteps ?? LIMITS.stepsPerTurn;

    if (opts.prompt !== undefined) {
        const { doc, selectedId, selectedIds } = useScene.getState();
        conversation.push({
            role: "user",
            content: opts.prompt.slice(0, LIMITS.promptChars),
            scene: describeScene(doc, selectedId, selectedIds).slice(0, LIMITS.sceneChars),
            ...(opts.images?.length ? { images: opts.images } : {}),
        });
    }

    for (let step = 0; step < maxSteps; step++) {
        if (signal.aborted) throw new AgentError("aborted", "Stopped.");
        const result = await transport(
            { messages: requestWindow(conversation) },
            { onText: handlers.onText, onThinking: handlers.onThinking, onToolStart: handlers.onToolStart },
            signal
        );
        handlers.onModel?.(result.model);
        conversation.push(result.message);

        const calls = result.message.tool_calls ?? [];
        if (!calls.length) {
            // Done, but with problems in what it built: one more look, once a
            // turn, before the turn ends. The chat shows turns rather than raw
            // messages, so this note isn't shown as if the user typed it.
            const issues = result.stop === "end" && !ctx.reviewed && step < maxSteps - 1 ? turnIssues(ctx) : [];
            if (!issues.length) return { stop: result.stop };
            ctx.reviewed = true;
            conversation.push({
                role: "user",
                content: `Automatic check, not from the user. These problems remain in what you built:\n${listIssues(issues)}\nFix them, or if they're intended, say so in one short sentence.`,
            });
            handlers.onActivities?.([{ id: `check-${step}`, label: `Checked the build: ${issues.length === 1 ? "1 thing" : `${issues.length} things`} to fix`, ok: true }]);
            continue;
        }

        // Tool calls run synchronously right after the reply arrives, so a
        // stop can never leave a call in the history without its result.
        const { messages, activities } = executeToolCalls(calls, ctx);
        // What the checks find in the build so far rides along with the
        // results, so even a model that never asks gets told.
        if (activities.some((a) => a.changed) && messages.length) {
            const issues = turnIssues(ctx);
            const last = messages[messages.length - 1];
            const note = `\n\nChecks of what you've built so far: ${issues.length ? `\n${listIssues(issues)}` : "no problems found."}`;
            last.content = last.content.slice(0, LIMITS.toolResultChars - note.length) + note;
        }
        conversation.push(...messages);
        handlers.onActivities?.(activities);
    }
    return { stop: "max_steps" };
}
