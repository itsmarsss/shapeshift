import type { WireMessage, WireToolCall } from "@shapeshift/shared/assistant/protocol";
import { TOOLS, looseJson } from "@shapeshift/shared/assistant/tools";
import { SYSTEM_PROMPT } from "./prompt";
import { ProviderError, userText, type Provider, type StepCallbacks } from "./provider";

const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

const TOOL_PARAMS = TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
})) as ChatCompletionTool[];

// Says what actually went wrong, for the errors Workers AI gives a code to.
export function aiError(err: unknown): ProviderError {
    const text = err instanceof Error ? err.message : String(err);
    // The account's free daily allowance; it resets at midnight UTC.
    if (/\b4006\b|daily free allocation/i.test(text)) return new ProviderError("overloaded", "The free assistant has used up today's capacity. It's back after midnight UTC.");
    if (/\b5035\b|not available on the Workers Free plan/i.test(text)) return new ProviderError("not_configured", "This model needs Cloudflare's paid Workers plan.");
    return new ProviderError("overloaded", "The model is busy right now. Try again in a moment.");
}

// Workers AI refuses a whole request if an earlier call's arguments aren't
// valid JSON, so a broken one is sent back repaired, or empty.
function validJson(args: string) {
    try {
        return JSON.stringify(looseJson(args));
    } catch {
        return "{}";
    }
}

function toParams(messages: WireMessage[]): ChatCompletionMessageParam[] {
    return [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m): ChatCompletionMessageParam => {
            if (m.role === "user") {
                const note = m.images?.length ? "\n\n(The user attached a picture, but this model can't see images. Ask them to describe it.)" : "";
                return { role: "user", content: userText(m) + note };
            }
            if (m.role === "tool") {
                const note = m.images?.length ? "\n(A picture was taken, but this model can't see images. Rely on the bounds instead.)" : "";
                return { role: "tool", tool_call_id: m.tool_call_id, content: m.content + note };
            }
            return {
                role: "assistant",
                content: m.content ?? "",
                ...(m.tool_calls?.length
                    ? { tool_calls: m.tool_calls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: validJson(c.arguments) } })) }
                    : {}),
            };
        }),
    ];
}

type LooseCall = { id?: string; name?: string; arguments?: unknown; function?: { name?: string; arguments?: unknown } };

function normalizeCalls(calls: LooseCall[] | undefined): WireToolCall[] {
    return (calls ?? []).flatMap((c, i) => {
        const name = c.function?.name ?? c.name;
        if (!name) return [];
        const args = c.function?.arguments ?? c.arguments ?? {};
        return [{ id: c.id || `call_${Date.now().toString(36)}_${i}`, name, arguments: typeof args === "string" ? args : JSON.stringify(args) }];
    });
}

type Delta = { content?: string | null; reasoning_content?: string | null; reasoning?: string | null; tool_calls?: (LooseCall & { index?: number })[] };
type Chunk = { response?: string; tool_calls?: LooseCall[]; choices?: { delta?: Delta; message?: Delta; finish_reason?: string | null }[] };

// Reads Workers AI's server-sent events as they come, passing text and
// thinking on and noting each tool as it starts. Handles both shapes the
// service uses: OpenAI-style deltas, and the older { response, tool_calls }.
export async function readAiStream(stream: ReadableStream<Uint8Array>, callbacks: StepCallbacks) {
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let content = "";
    let finish: string | null = null;
    // Tool calls arrive in pieces, keyed by their index.
    const calls = new Map<number, { id?: string; name?: string; arguments: string; whole?: unknown }>();

    const handle = (chunk: Chunk) => {
        if (typeof chunk.response === "string" && chunk.response) {
            content += chunk.response;
            callbacks.onText(chunk.response);
        }
        for (const [i, c] of (chunk.tool_calls ?? []).entries()) {
            const name = c.function?.name ?? c.name;
            if (name && !calls.has(1000 + i)) callbacks.onToolStart(name);
            calls.set(1000 + i, { id: c.id, name, arguments: "", whole: c.function?.arguments ?? c.arguments ?? {} });
        }
        const choice = chunk.choices?.[0];
        if (!choice) return;
        if (choice.finish_reason) finish = choice.finish_reason;
        const d = choice.delta ?? choice.message ?? {};
        const thought = d.reasoning_content ?? d.reasoning;
        if (thought) callbacks.onThinking?.(thought);
        if (d.content) {
            content += d.content;
            callbacks.onText(d.content);
        }
        for (const c of d.tool_calls ?? []) {
            const index = c.index ?? calls.size;
            const call = calls.get(index) ?? { arguments: "" };
            if (c.id) call.id = c.id;
            const name = c.function?.name ?? c.name;
            if (name && !call.name) {
                call.name = name;
                callbacks.onToolStart(name);
            }
            const args = c.function?.arguments ?? c.arguments;
            if (typeof args === "string") call.arguments += args;
            else if (args && typeof args === "object") call.whole = args;
            calls.set(index, call);
        }
    };

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
                handle(JSON.parse(data) as Chunk);
            } catch {
                // A line that isn't JSON is skipped rather than failing the whole reply.
            }
        }
    }
    const tool_calls = normalizeCalls(
        [...calls.entries()].sort(([a], [b]) => a - b).map(([, c]) => ({ id: c.id, name: c.name, arguments: c.arguments || c.whole || {} })),
    );
    return { content: content.trim(), tool_calls, finish };
}

// `model` may end in "#low", "#medium" or "#high" to say how long a model
// that reasons (like gpt-oss) should think, for trying it in the Model lab.
export function workersAiProvider(env: Env, model?: string): Provider {
    // Set in wrangler.jsonc, so a better free model is a config change.
    const [MODEL, effort] = (model || env.FREE_MODEL || DEFAULT_MODEL).split("#") as [string, string | undefined];
    const reasoning = effort && ["low", "medium", "high"].includes(effort) ? { reasoning: { effort } } : {};
    return {
        info: { provider: "workers-ai", model: MODEL },
        async step(messages, callbacks) {
            let stream: ReadableStream<Uint8Array>;
            try {
                // Streamed, so its thinking and words show as they come
                // instead of all at the end.
                stream = (await env.AI.run(MODEL, {
                    messages: toParams(messages),
                    tools: TOOL_PARAMS,
                    temperature: 0.2,
                    max_tokens: 8192,
                    stream: true,
                    chat_template_kwargs: { enable_thinking: true },
                    ...reasoning,
                } as never)) as unknown as ReadableStream<Uint8Array>;
            } catch (err) {
                console.error("Workers AI request failed", err);
                throw aiError(err);
            }
            const { content, tool_calls, finish } = await readAiStream(stream, callbacks);
            if (finish === "length") {
                // Tool calls cut off mid-way can't run.
                return { message: { role: "assistant", content: content || null }, stop: "max_tokens", model: MODEL };
            }
            return {
                message: { role: "assistant", content: content || null, ...(tool_calls.length ? { tool_calls } : {}) },
                stop: tool_calls.length ? "tool_use" : "end",
                model: MODEL,
            };
        },
    };
}
