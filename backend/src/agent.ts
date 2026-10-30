import { AgentRequest, LIMITS, type AgentErrorCode, type AgentEvent } from "@shapeshift/shared/assistant/protocol";
import { anthropicProvider } from "./anthropic";
import { ProviderError, type Provider } from "./provider";
import { workersAiProvider } from "./workersAi";
import { quotaMessage, refund, spend, subjectFor } from "./usage";

export function pickProvider(env: Env): Provider | null {
    if (env.ANTHROPIC_API_KEY) return anthropicProvider({ ...env, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY });
    if (env.AI) return workersAiProvider(env);
    return null;
}

const STATUS: Record<AgentErrorCode, number> = {
    bad_request: 400,
    rate_limited: 429,
    overloaded: 503,
    upstream: 502,
    not_configured: 503,
    internal: 500,
    quota: 402,
};

function fail(code: AgentErrorCode, error: string, retryAfter?: number) {
    return Response.json(
        { error, code },
        { status: STATUS[code], headers: retryAfter ? { "retry-after": String(retryAfter) } : undefined }
    );
}

export function agentInfo(env: Env) {
    const provider = pickProvider(env);
    return provider ? Response.json(provider.info) : fail("not_configured", "No model is configured.");
}

export async function agentStep(request: Request, env: Env): Promise<Response> {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.CHAT_LIMITER.limit({ key: ip });
    if (!success) return fail("rate_limited", "Too many requests. Wait a moment and try again.", 30);

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > LIMITS.requestBytes) return fail("bad_request", "The conversation is too long. Start a new chat.");
    const text = await request.text();
    if (text.length > LIMITS.requestBytes) return fail("bad_request", "The conversation is too long. Start a new chat.");

    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return fail("bad_request", "The request was not valid JSON.");
    }
    const parsed = AgentRequest.safeParse(json);
    if (!parsed.success) return fail("bad_request", `Invalid request: ${parsed.error.issues[0]?.message ?? "bad shape"}`);
    const { messages } = parsed.data;
    if (messages[0].role !== "user") return fail("bad_request", "The conversation must start with a user message.");
    if (messages[messages.length - 1].role === "assistant") return fail("bad_request", "The conversation must end with a user message or tool results.");

    const provider = pickProvider(env);
    if (!provider) return fail("not_configured", "No model is configured.");

    // Only a new message from the person counts as a prompt; the steps that
    // follow it carry tool results.
    const fresh = messages[messages.length - 1].role === "user";
    const subject = await subjectFor(env, request);
    if (!(await spend(env, subject, fresh))) return fail("quota", quotaMessage(subject.plan));

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const emit = (event: AgentEvent) => writer.write(encoder.encode(`${JSON.stringify(event)}\n`)).catch(() => {});

    const run = async () => {
        try {
            const out = await provider.step(messages, {
                onText: (t) => void emit({ type: "text", text: t }),
                onToolStart: (name) => void emit({ type: "tool_start", name }),
                signal: request.signal,
            });
            await emit({ type: "message", ...out });
        } catch (err) {
            const e = err instanceof ProviderError ? err : new ProviderError("internal", "Something went wrong.");
            if (!(err instanceof ProviderError)) console.error("Agent step failed", err);
            // A failure on our side or the model's doesn't use up the allowance.
            if (!request.signal.aborted) await refund(env, subject, fresh).catch(() => {});
            await emit({ type: "error", code: e.code, error: e.message, ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}) });
        } finally {
            await writer.close().catch(() => {});
        }
    };
    void run();

    return new Response(readable, {
        headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
}
