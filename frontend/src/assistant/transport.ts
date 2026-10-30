import type { AgentErrorCode, AgentEvent, AgentInfo, AgentRequest, StopReason, WireAssistantMessage } from "@shapeshift/shared/assistant/protocol";

export type StepResult = { message: WireAssistantMessage; stop: StopReason; model: string };

export type StepHandlers = {
    onText?: (text: string) => void;
    onToolStart?: (name: string) => void;
};

export type Transport = (request: AgentRequest, handlers: StepHandlers, signal: AbortSignal) => Promise<StepResult>;

export class AgentError extends Error {
    readonly code: AgentErrorCode | "network" | "aborted" | "timeout";
    readonly retryAfter?: number;
    constructor(code: AgentError["code"], message: string, retryAfter?: number) {
        super(message);
        this.name = "AgentError";
        this.code = code;
        this.retryAfter = retryAfter;
    }
    get retryable() {
        return this.code === "network" || this.code === "overloaded" || this.code === "upstream" || this.code === "timeout";
    }
}

const ENDPOINT = "/api/agent";
// The model can think for a while before its first token, so this only fires
// when the connection goes completely quiet.
const IDLE_TIMEOUT_MS = 150_000;
const RETRY_DELAYS_MS = [1_000, 3_000];

const MESSAGES: Record<AgentError["code"], string> = {
    bad_request: "That request couldn't be sent.",
    rate_limited: "You're sending requests too quickly. Wait a moment and try again.",
    overloaded: "The model is busy right now. Try again in a moment.",
    upstream: "The model didn't respond properly.",
    not_configured: "The assistant isn't set up on this server.",
    internal: "Something went wrong on the server.",
    network: "Couldn't reach the server. Check your connection.",
    aborted: "Stopped.",
    timeout: "The model took too long to respond.",
};

function sleep(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new AgentError("aborted", MESSAGES.aborted));
        }, { once: true });
    });
}

async function readStep(response: Response, handlers: StepHandlers, signal: AbortSignal, idle: () => void): Promise<StepResult> {
    const reader = response.body?.getReader();
    if (!reader) throw new AgentError("upstream", MESSAGES.upstream);
    const decoder = new TextDecoder();
    let buffer = "";
    let result: StepResult | null = null;

    const handle = (line: string) => {
        if (!line.trim()) return;
        let event: AgentEvent;
        try {
            event = JSON.parse(line);
        } catch {
            throw new AgentError("upstream", MESSAGES.upstream);
        }
        switch (event.type) {
            case "text":
                handlers.onText?.(event.text);
                break;
            case "tool_start":
                handlers.onToolStart?.(event.name);
                break;
            case "message":
                result = { message: event.message, stop: event.stop, model: event.model };
                break;
            case "error":
                throw new AgentError(event.code, event.error || MESSAGES[event.code], event.retryAfter);
        }
    };

    try {
        for (;;) {
            const { done, value } = await reader.read();
            idle();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buffer.indexOf("\n")) >= 0) {
                handle(buffer.slice(0, nl));
                buffer = buffer.slice(nl + 1);
            }
        }
        handle(buffer + decoder.decode());
    } catch (err) {
        if (signal.aborted) throw new AgentError("aborted", MESSAGES.aborted);
        if (err instanceof AgentError) throw err;
        throw new AgentError("network", MESSAGES.network);
    } finally {
        reader.releaseLock();
    }
    if (!result) throw new AgentError("upstream", "The connection closed before the model finished.");
    return result;
}

async function errorFromResponse(response: Response): Promise<AgentError> {
    const retryAfter = Number(response.headers.get("retry-after")) || undefined;
    const body = (await response.json().catch(() => null)) as { error?: string; code?: AgentErrorCode } | null;
    const code: AgentErrorCode =
        body?.code ?? (response.status === 429 ? "rate_limited" : response.status >= 500 ? "upstream" : "bad_request");
    return new AgentError(code, body?.error || MESSAGES[code], retryAfter);
}

export const httpTransport: Transport = async (request, handlers, outer) => {
    const body = JSON.stringify(request);
    for (let attempt = 0; ; attempt++) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        outer.addEventListener("abort", abort, { once: true });
        let timedOut = false;
        let timer = setTimeout(() => ((timedOut = true), controller.abort()), IDLE_TIMEOUT_MS);
        const idle = () => {
            clearTimeout(timer);
            timer = setTimeout(() => ((timedOut = true), controller.abort()), IDLE_TIMEOUT_MS);
        };
        let streamed = false;
        try {
            const response = await fetch(ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
                signal: controller.signal,
            });
            if (!response.ok) throw await errorFromResponse(response);
            return await readStep(
                response,
                {
                    onText: (t) => ((streamed = true), handlers.onText?.(t)),
                    onToolStart: (n) => ((streamed = true), handlers.onToolStart?.(n)),
                },
                controller.signal,
                idle
            );
        } catch (err) {
            if (outer.aborted) throw new AgentError("aborted", MESSAGES.aborted);
            const error =
                err instanceof AgentError
                    ? timedOut && err.code === "aborted"
                        ? new AgentError("timeout", MESSAGES.timeout)
                        : err
                    : timedOut
                      ? new AgentError("timeout", MESSAGES.timeout)
                      : new AgentError("network", MESSAGES.network);
            // Retrying after text has streamed would show it twice.
            if (!error.retryable || streamed || attempt >= RETRY_DELAYS_MS.length) throw error;
            await sleep(error.retryAfter ? error.retryAfter * 1000 : RETRY_DELAYS_MS[attempt], outer);
        } finally {
            clearTimeout(timer);
            outer.removeEventListener("abort", abort);
        }
    }
};

export async function fetchAgentInfo(): Promise<AgentInfo | null> {
    try {
        const response = await fetch(ENDPOINT, { method: "GET" });
        return response.ok ? ((await response.json()) as AgentInfo) : null;
    } catch {
        return null;
    }
}
