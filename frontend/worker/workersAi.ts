import type { WireMessage, WireToolCall } from "../src/assistant/protocol";
import { TOOLS } from "../src/assistant/tools";
import { SYSTEM_PROMPT } from "./prompt";
import { ProviderError, userText, type Provider } from "./provider";

const MODEL = "@cf/zai-org/glm-4.7-flash";

const TOOL_PARAMS = TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
})) as ChatCompletionTool[];

function toParams(messages: WireMessage[]): ChatCompletionMessageParam[] {
    return [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m): ChatCompletionMessageParam => {
            if (m.role === "user") return { role: "user", content: userText(m) };
            if (m.role === "tool") {
                const note = m.images?.length ? "\n(A picture was taken, but this model can't see images. Rely on the bounds instead.)" : "";
                return { role: "tool", tool_call_id: m.tool_call_id, content: m.content + note };
            }
            return {
                role: "assistant",
                content: m.content ?? "",
                ...(m.tool_calls?.length
                    ? { tool_calls: m.tool_calls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.arguments } })) }
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

export function workersAiProvider(env: Env): Provider {
    return {
        info: { provider: "workers-ai", model: MODEL },
        async step(messages, callbacks) {
            let result: unknown;
            try {
                result = await env.AI.run(MODEL, {
                    messages: toParams(messages),
                    tools: TOOL_PARAMS,
                    temperature: 0.2,
                    max_tokens: 8192,
                    chat_template_kwargs: { enable_thinking: false },
                });
            } catch (err) {
                console.error("Workers AI request failed", err);
                throw new ProviderError("overloaded", "The model is busy right now. Try again in a moment.");
            }
            // Workers AI returns the OpenAI shape for this model; older models
            // return { response, tool_calls }.
            const r = result as {
                choices?: { message?: { content?: string | null; tool_calls?: LooseCall[] }; finish_reason?: string }[];
                response?: string;
                tool_calls?: LooseCall[];
            };
            const choice = r.choices?.[0];
            const content = (choice?.message?.content ?? r.response ?? "").trim();
            const tool_calls = normalizeCalls(choice?.message?.tool_calls ?? r.tool_calls);
            if (content) callbacks.onText(content);
            if (choice?.finish_reason === "length") {
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
