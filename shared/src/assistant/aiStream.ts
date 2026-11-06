import type { StopReason, WireAssistantMessage, WireToolCall } from "./protocol";

// Reads a Workers AI reply streamed as server-sent events. The browser does
// this (the Worker passes the stream through untouched, to stay inside the
// free Workers plan's CPU limit), and so can the Worker when it needs the
// whole step.

export type AiStreamCallbacks = {
    onText: (text: string) => void;
    onToolStart: (name: string) => void;
    onThinking?: (text: string) => void;
};

type LooseCall = { id?: string; name?: string; arguments?: unknown; function?: { name?: string; arguments?: unknown } };

export function normalizeCalls(calls: LooseCall[] | undefined): WireToolCall[] {
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
//
// Kept cheap: the free Workers plan allows about 10 ms of CPU a request, and
// a long reply is thousands of tiny events. Each network read's events are
// parsed in one go rather than one at a time.
export async function readAiStream(stream: ReadableStream<Uint8Array>, callbacks: AiStreamCallbacks) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
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

    const take = (block: string) => {
        const data: string[] = [];
        for (const raw of block.split("\n")) {
            const line = raw.trim();
            if (!line.startsWith("data:")) continue;
            const d = line.slice(5).trim();
            if (d && d !== "[DONE]") data.push(d);
        }
        if (!data.length) return;
        let chunks: Chunk[];
        try {
            chunks = JSON.parse(`[${data.join(",")}]`) as Chunk[];
        } catch {
            // One bad line: parse them one by one and skip it, rather than
            // failing the whole reply.
            chunks = data.flatMap((d) => {
                try {
                    return [JSON.parse(d) as Chunk];
                } catch {
                    return [];
                }
            });
        }
        for (const chunk of chunks) handle(chunk);
    };

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const end = buffer.lastIndexOf("\n");
        if (end < 0) continue;
        take(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
    }
    take(buffer + decoder.decode());
    const tool_calls = normalizeCalls(
        [...calls.entries()].sort(([a], [b]) => a - b).map(([, c]) => ({ id: c.id, name: c.name, arguments: c.arguments || c.whole || {} })),
    );
    return { content: content.trim(), tool_calls, finish };
}

// The step a streamed reply amounts to: its message, and why it stopped.
export async function aiStepResult(stream: ReadableStream<Uint8Array>, callbacks: AiStreamCallbacks, model: string): Promise<{ message: WireAssistantMessage; stop: StopReason; model: string }> {
    const { content, tool_calls, finish } = await readAiStream(stream, callbacks);
    // Tool calls cut off mid-way can't run.
    if (finish === "length") return { message: { role: "assistant", content: content || null }, stop: "max_tokens", model };
    return {
        message: { role: "assistant", content: content || null, ...(tool_calls.length ? { tool_calls } : {}) },
        stop: tool_calls.length ? "tool_use" : "end",
        model,
    };
}
