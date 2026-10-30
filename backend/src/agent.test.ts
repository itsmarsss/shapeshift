import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent, WireMessage } from "@shapeshift/shared/assistant/protocol";
import { agentStep } from "./agent";
import { toParams, toWire } from "./anthropic";

function env(run: (...args: unknown[]) => unknown, limited = false) {
    return {
        AI: { run: vi.fn(run) },
        CHAT_LIMITER: { limit: vi.fn(async () => ({ success: !limited })) },
        AGENT_MODEL: "claude-opus-5-5",
        AGENT_EFFORT: "medium",
    } as unknown as Env;
}

const post = (body: unknown) =>
    new Request("https://x/api/agent", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

async function events(res: Response): Promise<AgentEvent[]> {
    return (await res.text())
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
}

describe("/api/agent", () => {
    it("streams the model's step back", async () => {
        const e = env(async () => ({
            choices: [
                {
                    finish_reason: "tool_calls",
                    message: { content: "On it.", tool_calls: [{ id: "t1", function: { name: "add", arguments: { primitive: "box" } } }] },
                },
            ],
        }));
        const res = await agentStep(post({ messages: [{ role: "user", content: "add a box", scene: "The scene is empty." }] }), e);
        expect(res.headers.get("content-type")).toContain("ndjson");
        const out = await events(res);
        expect(out[0]).toEqual({ type: "text", text: "On it." });
        expect(out[1]).toMatchObject({
            type: "message",
            stop: "tool_use",
            message: { tool_calls: [{ id: "t1", name: "add", arguments: '{"primitive":"box"}' }] },
        });
        const sent = (e.AI.run as ReturnType<typeof vi.fn>).mock.calls[0][1] as { messages: { role: string; content: string }[] };
        expect(sent.messages[0].role).toBe("system");
        expect(sent.messages[1].content).toContain("<scene>\nThe scene is empty.\n</scene>");
    });

    it("rejects bad requests before calling the model", async () => {
        const e = env(async () => ({}));
        expect((await agentStep(post("{nope"), e)).status).toBe(400);
        expect((await agentStep(post({ messages: [] }), e)).status).toBe(400);
        expect((await agentStep(post({ messages: [{ role: "assistant", content: "hi" }] }), e)).status).toBe(400);
        expect((await agentStep(post({ messages: [{ role: "user", content: "x".repeat(5000) }] }), e)).status).toBe(400);
        expect(e.AI.run).not.toHaveBeenCalled();
    });

    it("rate limits per client", async () => {
        const res = await agentStep(post({ messages: [{ role: "user", content: "hi" }] }), env(async () => ({}), true));
        expect(res.status).toBe(429);
        expect(await res.json()).toMatchObject({ code: "rate_limited" });
    });

    it("reports model failures as an error event", async () => {
        const res = await agentStep(post({ messages: [{ role: "user", content: "hi" }] }), env(async () => Promise.reject(new Error("down"))));
        const out = await events(res);
        expect(out).toEqual([{ type: "error", code: "overloaded", error: expect.any(String) }]);
    });
});

describe("anthropic conversion", () => {
    const thinking = { type: "thinking", thinking: "", signature: "sig" };
    const toolUse = { type: "tool_use", id: "tu1", name: "add", input: { primitive: "box" } };

    it("replays assistant blocks verbatim and groups tool results into one user message", () => {
        const messages: WireMessage[] = [
            { role: "user", content: "two boxes", scene: "The scene is empty." },
            {
                role: "assistant",
                content: null,
                tool_calls: [{ id: "tu1", name: "add", arguments: "{}" }],
                raw: [thinking, toolUse] as never,
            },
            { role: "tool", tool_call_id: "tu1", content: '{"ok":true}' },
            { role: "tool", tool_call_id: "tu2", content: '{"ok":false}', is_error: true },
        ];
        const params = toParams(messages);
        expect(params).toHaveLength(3);
        expect(params[1]).toEqual({ role: "assistant", content: [thinking, toolUse] });
        expect(params[2]).toEqual({
            role: "user",
            content: [
                { type: "tool_result", tool_use_id: "tu1", content: '{"ok":true}' },
                { type: "tool_result", tool_use_id: "tu2", content: '{"ok":false}', is_error: true },
            ],
        });
    });

    it("sends snapshots as images inside the tool result", () => {
        const params = toParams([
            { role: "user", content: "look" },
            { role: "assistant", content: null, tool_calls: [{ id: "l1", name: "look", arguments: "{}" }] },
            { role: "tool", tool_call_id: "l1", content: '{"ok":true}', images: ["QUJD"] },
        ]);
        expect(params[2]).toEqual({
            role: "user",
            content: [
                {
                    type: "tool_result",
                    tool_use_id: "l1",
                    content: [
                        { type: "text", text: '{"ok":true}' },
                        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } },
                    ],
                },
            ],
        });
    });

    it("puts attached pictures before the prompt", () => {
        const [first] = toParams([{ role: "user", content: "build this", images: ["QUJD"] }]);
        expect(first).toEqual({
            role: "user",
            content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } },
                { type: "text", text: "build this" },
            ],
        });
    });

    const reply = (content: unknown[], stop_reason: string) => ({ content, stop_reason, model: "claude-opus-5-5" }) as unknown as Anthropic.Beta.Messages.BetaMessage;

    it("turns tool_use blocks into tool calls and keeps the raw blocks", () => {
        const { message, stop } = toWire(reply([thinking, { type: "text", text: "Adding." }, toolUse], "tool_use"));
        expect(stop).toBe("tool_use");
        expect(message.content).toBe("Adding.");
        expect(message.tool_calls).toEqual([{ id: "tu1", name: "add", arguments: '{"primitive":"box"}' }]);
        expect(message.raw).toHaveLength(3);
    });

    it("drops blocks from before a refusal fallback except text", () => {
        const { message } = toWire(
            reply([thinking, { type: "text", text: "Part " }, { type: "fallback" }, { ...thinking, signature: "after" }, { type: "text", text: "done" }], "end_turn")
        );
        expect(message.raw).toEqual([{ type: "text", text: "Part " }, { ...thinking, signature: "after" }, { type: "text", text: "done" }]);
    });

    it("never replays a tool call cut off by max_tokens", () => {
        const { message, stop } = toWire(reply([{ type: "text", text: "Building" }, toolUse], "max_tokens"));
        expect(stop).toBe("max_tokens");
        expect(message.tool_calls).toBeUndefined();
        expect(message.raw).toBeUndefined();
    });

    it("handles refusals", () => {
        const { message, stop } = toWire(reply([], "refusal"));
        expect(stop).toBe("refusal");
        expect(message.content).toBeTruthy();
    });
});
