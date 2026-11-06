import { afterEach, describe, expect, it, vi } from "vitest";
import { makeHttpTransport } from "./transport";

const sse = (...chunks: object[]) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
const delta = (d: object, finish_reason: string | null = null) => ({ choices: [{ delta: d, finish_reason }] });

afterEach(() => vi.unstubAllGlobals());

describe("transport", () => {
    it("reads a Workers AI stream the Worker passed through", async () => {
        const body = sse(delta({ reasoning_content: "Thinking." }), delta({ content: "On it." }), delta({ tool_calls: [{ index: 0, id: "t1", function: { name: "add", arguments: '{"primitive":"box"}' } }] }, "tool_calls"));
        vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { headers: { "x-agent-stream": "workers-ai", "x-agent-model": "@cf/zai-org/glm-4.7-flash" } })));
        const seen: string[] = [];
        const step = await makeHttpTransport("/api/agent")(
            { messages: [{ role: "user", content: "a box" }] },
            { onText: (t) => seen.push(`text:${t}`), onThinking: (t) => seen.push(`thinking:${t}`), onToolStart: (n) => seen.push(`tool:${n}`) },
            new AbortController().signal,
        );
        expect(seen).toEqual(["thinking:Thinking.", "text:On it.", "tool:add"]);
        expect(step).toEqual({ model: "@cf/zai-org/glm-4.7-flash", stop: "tool_use", message: { role: "assistant", content: "On it.", tool_calls: [{ id: "t1", name: "add", arguments: '{"primitive":"box"}' }] } });
    });

    it("calls an empty stream a cut-off reply", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("data: [DONE]\n\n", { headers: { "x-agent-stream": "workers-ai" } })));
        await expect(makeHttpTransport("/api/agent")({ messages: [{ role: "user", content: "hi" }] }, {}, new AbortController().signal)).rejects.toMatchObject({ code: "upstream" });
    });
});
