import type { WireMessage } from "@shapeshift/shared/assistant/protocol";
import { aiStepResult } from "@shapeshift/shared/assistant/aiStream";
import { TOOLS, looseJson } from "@shapeshift/shared/assistant/tools";
import { SYSTEM_PROMPT } from "./prompt";
import { ProviderError, userText, type Provider } from "./provider";

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

// `model` may end in "#low", "#medium" or "#high" to say how long a model
// that reasons (like gpt-oss) should think, or "#nothink" to turn thinking
// off (like GLM's), for trying it in the Model lab. Thinking is most of a
// long reply, and so most of its time and CPU.
export function workersAiProvider(env: Env, model?: string): Provider {
    // Set in wrangler.jsonc, so a better free model is a config change.
    const [MODEL, effort] = (model || env.FREE_MODEL || DEFAULT_MODEL).split("#") as [string, string | undefined];
    const reasoning = effort && ["low", "medium", "high"].includes(effort) ? { reasoning: { effort } } : {};
    const thinking = effort !== "nothink";
    // Streamed, so its thinking and words show as they come instead of all at
    // the end. The stream goes to the browser untouched, which reads it
    // (shared/assistant/aiStream.ts): reading thousands of tiny events here
    // costs more CPU than the free Workers plan allows a request (about 10 ms).
    const start = async (messages: WireMessage[]) => {
        try {
            return (await env.AI.run(MODEL, {
                messages: toParams(messages),
                tools: TOOL_PARAMS,
                temperature: 0.2,
                max_tokens: 8192,
                stream: true,
                chat_template_kwargs: { enable_thinking: thinking },
                ...reasoning,
            } as never)) as unknown as ReadableStream<Uint8Array>;
        } catch (err) {
            console.error("Workers AI request failed", err);
            throw aiError(err);
        }
    };
    return {
        info: { provider: "workers-ai", model: MODEL },
        stream: async (messages) => ({ body: await start(messages), model: MODEL }),
        // The whole step read here, for tests and anything that needs the result in the Worker.
        step: async (messages, callbacks) => aiStepResult(await start(messages), callbacks, MODEL),
    };
}
