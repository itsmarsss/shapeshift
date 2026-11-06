import { AgentRequest, LIMITS, type AgentErrorCode, type AgentEvent } from "@shapeshift/shared/assistant/protocol";
import { anthropicProvider } from "./anthropic";
import { ProviderError, type Provider } from "./provider";
import { workersAiProvider } from "./workersAi";
import { quotaMessage, refund, spend, subjectFor } from "./usage";
import type { PlanId } from "@shapeshift/shared/billing/plans";
import { MODELS, choiceOf, type ModelId } from "@shapeshift/shared/assistant/models";

// Pro gets the most capable model; everyone else a strong, cheaper one, which
// keeps free use affordable. Both are set in wrangler.jsonc.
export function modelFor(env: Env, plan: PlanId): string {
    return (plan === "pro" && env.AGENT_MODEL_PRO) || env.AGENT_MODEL || "claude-sonnet-5-5";
}

// The models this server can run, the default first: Claude when its key is
// set (as before), otherwise the fast free model.
export function availableModels(env: Env): ModelId[] {
    const free: ModelId[] = env.AI ? ["fast", "careful", "gpt-oss"] : [];
    return env.ANTHROPIC_API_KEY ? ["claude", ...free] : free;
}

// The provider for a picked model, falling back to the default for one this
// server can't run; and how many prompts a message on it uses.
export function pickModel(env: Env, plan: PlanId = "free", wanted?: ModelId): { provider: Provider; id: ModelId; cost: number } | null {
    const available = availableModels(env);
    const id = wanted && available.includes(wanted) ? wanted : available[0];
    if (!id) return null;
    const def = MODELS[id];
    const provider =
        def.provider === "anthropic"
            ? anthropicProvider({ ...env, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY! }, modelFor(env, plan))
            : // The fast model can be changed in config (FREE_MODEL).
              workersAiProvider(env, id === "fast" ? env.FREE_MODEL || def.model : def.model);
    return { provider, id, cost: def.cost };
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

export async function agentInfo(request: Request, env: Env) {
    const picked = pickModel(env, (await subjectFor(env, request)).plan);
    if (!picked) return fail("not_configured", "No model is configured.");
    return Response.json({ ...picked.provider.info, choices: availableModels(env).map((id) => choiceOf(MODELS[id])), default: picked.id });
}

// A model for the Model lab: a Workers AI id ("@cf/...", optionally with
// "#low" and the like), or a Claude model when the key is set.
export function labProvider(env: Env, model: string): Provider | null {
    if (/^@cf\/[\w.\-/]+(#(low|medium|high|nothink))?$/.test(model) && env.AI) return workersAiProvider(env, model);
    if (/^claude-[\w.-]+$/.test(model) && env.ANTHROPIC_API_KEY) return anthropicProvider({ ...env, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }, model);
    return null;
}

// `lab` runs a step on a chosen model for the Model lab, without counting it
// against anyone's prompts.
export async function agentStep(request: Request, env: Env, lab?: Provider): Promise<Response> {
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

    const subject = await subjectFor(env, request);
    const picked = lab ? { provider: lab, cost: 1 } : pickModel(env, subject.plan, parsed.data.model);
    if (!picked) return fail("not_configured", "No model is configured.");
    const { provider, cost } = picked;

    // Only a new message from the person counts as a prompt; the steps that
    // follow it carry tool results.
    const fresh = !lab && messages[messages.length - 1].role === "user";
    if (!lab && !(await spend(env, subject, fresh, cost))) return fail("quota", quotaMessage(subject.plan));

    // Workers AI: its stream goes straight to the browser, which reads it
    // (shared/assistant/aiStream.ts). Reading it here took more CPU than the
    // free Workers plan allows a request, and going over resets the Worker,
    // cutting off every reply it was serving at the time.
    if (provider.stream) {
        try {
            const { body, model } = await provider.stream(messages);
            return new Response(body, {
                headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-agent-stream": "workers-ai", "x-agent-model": model },
            });
        } catch (err) {
            const e = err instanceof ProviderError ? err : new ProviderError("internal", "Something went wrong.");
            if (!(err instanceof ProviderError)) console.error("Agent step failed", err);
            await refund(env, subject, fresh, cost).catch(() => {});
            return fail(e.code, e.message, e.retryAfter);
        }
    }

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const emit = (event: AgentEvent) => writer.write(encoder.encode(`${JSON.stringify(event)}\n`)).catch(() => {});
    // Text and thinking go out a few times a second rather than a token at a
    // time: a long reply is thousands of tokens, and writing each one costs
    // CPU the free Workers plan doesn't have (about 10 ms a request).
    let pending: { type: "text" | "thinking"; text: string } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        if (pending) void emit(pending);
        pending = null;
    };
    const queue = (type: "text" | "thinking", text: string) => {
        if (pending && pending.type !== type) flush();
        pending = { type, text: (pending?.text ?? "") + text };
        if (pending.text.length >= 2000) flush();
        else timer ??= setTimeout(flush, 120);
    };

    const run = async () => {
        try {
            const out = await provider.step(messages, {
                onText: (t) => queue("text", t),
                onToolStart: (name) => {
                    flush();
                    void emit({ type: "tool_start", name });
                },
                onThinking: (t) => queue("thinking", t),
                signal: request.signal,
            });
            flush();
            await emit({ type: "message", ...out });
        } catch (err) {
            const e = err instanceof ProviderError ? err : new ProviderError("internal", "Something went wrong.");
            if (!(err instanceof ProviderError)) console.error("Agent step failed", err);
            // A failure on our side or the model's doesn't use up the allowance.
            if (!request.signal.aborted) await refund(env, subject, fresh, cost).catch(() => {});
            flush();
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
