import { afterEach, describe, expect, it, vi } from "vitest";
import { anthropicProvider } from "./anthropic";

function sse(events: object[]) {
    const body = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
    return new Response(body, { headers: { "content-type": "text/event-stream", "request-id": "req_test" } });
}

const message = { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } };

afterEach(() => vi.unstubAllGlobals());

describe("anthropic provider", () => {
    it("sends a cache-friendly request and parses the streamed step", async () => {
        const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
            sse([
                { type: "message_start", message },
                { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
                { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig123" } },
                { type: "content_block_stop", index: 0 },
                { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
                { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Adding a box." } },
                { type: "content_block_stop", index: 1 },
                { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "add", input: {} } },
                { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"primitive":' } },
                { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '"box"}' } },
                { type: "content_block_stop", index: 2 },
                { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 20 } },
                { type: "message_stop" },
            ])
        );
        vi.stubGlobal("fetch", fetchMock);

        const provider = anthropicProvider({ ANTHROPIC_API_KEY: "test", AGENT_MODEL: "claude-opus-5-5", AGENT_EFFORT: "medium" } as Env & { ANTHROPIC_API_KEY: string });
        const text: string[] = [];
        const tools: string[] = [];
        const out = await provider.step([{ role: "user", content: "add a box", scene: "The scene is empty." }], {
            onText: (t) => text.push(t),
            onToolStart: (n) => tools.push(n),
        });

        expect(text.join("")).toBe("Adding a box.");
        expect(tools).toEqual(["add"]);
        expect(out.stop).toBe("tool_use");
        expect(out.message.tool_calls).toEqual([{ id: "toolu_1", name: "add", arguments: '{"primitive":"box"}' }]);
        expect(out.message.raw?.[0]).toMatchObject({ type: "thinking", signature: "sig123" });

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain("/v1/messages");
        const headers = new Headers(init.headers);
        expect(headers.get("anthropic-beta")).toContain("thinking-binding-controls-2026-08-01");
        expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
            model: "claude-opus-5-5",
            stream: true,
            fallbacks: "default",
            cache_control: { type: "ephemeral" },
            output_config: { effort: "medium" },
            thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
        });
        expect(body.betas).toBeUndefined();
        expect(body.tools.map((t: { name: string }) => t.name)).toContain("inspect");
        expect(body.messages[0].content[0].text).toContain("<scene>");
    });

    it("maps rate limits to a retryable error", async () => {
        const fetchMock = vi.fn(async () =>
            Response.json({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }, { status: 429, headers: { "retry-after": "7", "retry-after-ms": "1" } })
        );
        vi.stubGlobal("fetch", fetchMock);
        const provider = anthropicProvider({ ANTHROPIC_API_KEY: "test", AGENT_MODEL: "", AGENT_EFFORT: "" } as Env & { ANTHROPIC_API_KEY: string });
        await expect(provider.step([{ role: "user", content: "hi" }], { onText: () => {}, onToolStart: () => {} })).rejects.toMatchObject({ code: "rate_limited", retryAfter: 7 });
        // The SDK retries twice before giving up.
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});
