import Anthropic from "@anthropic-ai/sdk";
import type { StopReason, WireAssistantMessage, WireMessage } from "../src/assistant/protocol";
import { TOOLS } from "../src/assistant/tools";
import { SYSTEM_PROMPT } from "./prompt";
import { ProviderError, userText, type Provider, type StepCallbacks } from "./provider";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
type UserBlock = Anthropic.Beta.Messages.BetaContentBlockParam;

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];

const TOOL_PARAMS: Anthropic.Beta.Messages.BetaTool[] = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Beta.Messages.BetaTool.InputSchema,
}));

const REPLAYED = new Set(["text", "thinking", "redacted_thinking", "tool_use"]);

// What to send back on the next request. Blocks go back unchanged so thinking
// stays valid. After a refusal fallback, only text from before the switch is
// kept, as the API requires.
function replayable(content: ContentBlock[]): ContentBlock[] {
    let boundary = -1;
    content.forEach((b, i) => b.type === "fallback" && (boundary = i));
    return content.filter((b, i) => REPLAYED.has(b.type) && (i > boundary || b.type === "text"));
}

export function toParams(messages: WireMessage[]): MessageParam[] {
    const out: MessageParam[] = [];
    const pushUser = (blocks: UserBlock[]) => {
        const last = out[out.length - 1];
        if (last?.role === "user" && Array.isArray(last.content)) last.content.push(...blocks);
        else out.push({ role: "user", content: blocks });
    };

    for (const m of messages) {
        if (m.role === "user") {
            pushUser([
                ...(m.images ?? []).map((data) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } })),
                { type: "text", text: userText(m) },
            ]);
        } else if (m.role === "tool") {
            const content = m.images?.length
                ? [
                      { type: "text" as const, text: m.content },
                      ...m.images.map((data) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } })),
                  ]
                : m.content;
            pushUser([{ type: "tool_result", tool_use_id: m.tool_call_id, content, ...(m.is_error ? { is_error: true } : {}) }]);
        } else if (m.raw?.length) {
            out.push({ role: "assistant", content: m.raw as unknown as Anthropic.Beta.Messages.BetaContentBlockParam[] });
        } else {
            const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
            if (m.content) content.push({ type: "text", text: m.content });
            for (const call of m.tool_calls ?? []) {
                let input: unknown = {};
                try {
                    input = JSON.parse(call.arguments || "{}");
                } catch {
                    input = {};
                }
                content.push({ type: "tool_use", id: call.id, name: call.name, input });
            }
            out.push({ role: "assistant", content: content.length ? content : [{ type: "text", text: "(no reply)" }] });
        }
    }
    return out;
}

export function toWire(message: Anthropic.Beta.Messages.BetaMessage): { message: WireAssistantMessage; stop: StopReason } {
    if (message.stop_reason === "refusal") {
        return { message: { role: "assistant", content: "I can't help with that request." }, stop: "refusal" };
    }
    const blocks = replayable(message.content);
    const text = blocks
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

    if (message.stop_reason === "max_tokens") {
        // A tool call cut off mid-way can't run, and replaying it without a
        // result would break the next request. Keep only the text.
        return { message: { role: "assistant", content: text || null }, stop: "max_tokens" };
    }

    const tool_calls = blocks
        .filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) }));
    return {
        message: {
            role: "assistant",
            content: text || null,
            ...(tool_calls.length ? { tool_calls } : {}),
            raw: blocks as unknown as WireAssistantMessage["raw"],
        },
        stop: tool_calls.length ? "tool_use" : "end",
    };
}

function mapError(err: unknown): ProviderError {
    if (err instanceof Anthropic.APIUserAbortError) return new ProviderError("upstream", "The request was cancelled.");
    if (err instanceof Anthropic.RateLimitError) {
        const retryAfter = Number(err.headers?.get?.("retry-after")) || undefined;
        return new ProviderError("rate_limited", "The model is rate limited. Try again shortly.", retryAfter);
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        return new ProviderError("not_configured", "The assistant's API key was rejected.");
    }
    if (err instanceof Anthropic.BadRequestError) return new ProviderError("upstream", "The model rejected the request.");
    if (err instanceof Anthropic.APIConnectionError) return new ProviderError("overloaded", "Couldn't reach the model.");
    if (err instanceof Anthropic.APIError && (err.status === 529 || (err.status ?? 0) >= 500)) {
        return new ProviderError("overloaded", "The model is busy right now. Try again in a moment.");
    }
    return new ProviderError("upstream", "The model request failed.");
}

export function anthropicProvider(env: Env & { ANTHROPIC_API_KEY: string }): Provider {
    const model = env.AGENT_MODEL || "claude-opus-5-5";
    const effort: Effort = (EFFORTS as readonly string[]).includes(env.AGENT_EFFORT) ? (env.AGENT_EFFORT as Effort) : "medium";
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });

    return {
        info: { provider: "anthropic", model },
        async step(messages: WireMessage[], callbacks: StepCallbacks) {
            try {
                const stream = client.beta.messages.stream(
                    {
                        model,
                        max_tokens: 32_000,
                        system: SYSTEM_PROMPT,
                        tools: TOOL_PARAMS,
                        messages: toParams(messages),
                        cache_control: { type: "ephemeral" },
                        thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
                        output_config: { effort },
                        fallbacks: "default",
                        betas: ["thinking-binding-controls-2026-08-01", "server-side-fallback-2026-07-01"],
                    },
                    { signal: callbacks.signal }
                );
                stream.on("text", (delta) => callbacks.onText(delta));
                stream.on("streamEvent", (event) => {
                    if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
                        callbacks.onToolStart(event.content_block.name);
                    }
                });
                const final = await stream.finalMessage();
                return { ...toWire(final), model: final.model };
            } catch (err) {
                const mapped = mapError(err);
                if (mapped.code !== "rate_limited") console.error("Anthropic request failed", err);
                throw mapped;
            }
        },
    };
}
