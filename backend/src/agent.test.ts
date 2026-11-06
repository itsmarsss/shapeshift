import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent, WireMessage } from "@shapeshift/shared/assistant/protocol";
import { agentInfo, agentStep } from "./agent";
import { aiStepResult } from "@shapeshift/shared/assistant/aiStream";
import { workersAiProvider } from "./workersAi";
import { toParams, toWire } from "./anthropic";
import { handleUsage } from "./usage";
import { testDatabase } from "./test/d1";

function env(run: (...args: unknown[]) => unknown, limited = false) {
    return {
        AI: { run: vi.fn(run) },
        DB: testDatabase(),
        CHAT_LIMITER: { limit: vi.fn(async () => ({ success: !limited })) },
        AGENT_MODEL: "claude-opus-5-5",
        AGENT_EFFORT: "medium",
    } as unknown as Env;
}

const post = (body: unknown) =>
    new Request("https://x/api/agent", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

// What Workers AI sends with stream: true, as server-sent events.
function sse(...chunks: object[]) {
    const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
    return new Response(body).body!;
}
const delta = (d: object, finish_reason: string | null = null) => ({ choices: [{ delta: d, finish_reason }] });
// One step on a given Workers AI model, as the Model lab asks for it.
const workersAiStep = (e: Env, model: string) => agentStep(post({ messages: [{ role: "user", content: "hi" }] }), e, workersAiProvider(e, model));

async function events(res: Response): Promise<AgentEvent[]> {
    return (await res.text())
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
}

describe("/api/agent", () => {
    it("passes Workers AI's stream straight through, for the browser to read", async () => {
        // Thinking, then words, then a tool call whose arguments come in pieces.
        const e = env(async () =>
            sse(
                delta({ reasoning_content: "A box" }),
                delta({ reasoning_content: " at the origin." }),
                delta({ content: "On it." }),
                delta({ tool_calls: [{ index: 0, id: "t1", function: { name: "add", arguments: '{"primi' } }] }),
                delta({ tool_calls: [{ index: 0, function: { arguments: 'tive":"box"}' } }] }, "tool_calls"),
            ),
        );
        const res = await agentStep(post({ messages: [{ role: "user", content: "add a box", scene: "The scene is empty." }] }), e);
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        expect(res.headers.get("x-agent-stream")).toBe("workers-ai");
        expect(res.headers.get("x-agent-model")).toBe("@cf/zai-org/glm-4.7-flash");
        // Read the way the browser reads it.
        const seen: string[] = [];
        const step = await aiStepResult(res.body!, { onThinking: (t) => seen.push(`thinking:${t}`), onText: (t) => seen.push(`text:${t}`), onToolStart: (n) => seen.push(`tool:${n}`) }, "m");
        expect(seen).toEqual(["thinking:A box", "thinking: at the origin.", "text:On it.", "tool:add"]);
        expect(step).toMatchObject({ stop: "tool_use", message: { content: "On it.", tool_calls: [{ id: "t1", name: "add", arguments: '{"primitive":"box"}' }] } });
        const sent = (e.AI.run as ReturnType<typeof vi.fn>).mock.calls[0][1] as { messages: { role: string; content: string }[] };
        expect(sent.messages[0].role).toBe("system");
        expect(sent.messages[1].content).toContain("<scene>\nThe scene is empty.\n</scene>");
    });

    it("turns a model's thinking off with #nothink", async () => {
        const e = env(async () => sse(delta({ content: "Hi." }, "stop")));
        await (await workersAiStep(e, "@cf/zai-org/glm-4.7-flash#nothink")).text();
        await (await workersAiStep(e, "@cf/zai-org/glm-4.7-flash")).text();
        const calls = (e.AI.run as ReturnType<typeof vi.fn>).mock.calls as [string, { chat_template_kwargs: { enable_thinking: boolean } }][];
        expect(calls.map(([model, args]) => [model, args.chat_template_kwargs.enable_thinking])).toEqual([
            ["@cf/zai-org/glm-4.7-flash", false],
            ["@cf/zai-org/glm-4.7-flash", true],
        ]);
    });

    it("reads the older streamed shape too, and stops on a cut-off reply", async () => {
        const read = async (body: ReadableStream<Uint8Array>) => aiStepResult(body, { onText: () => {}, onToolStart: () => {} }, "m");
        const old = await agentStep(post({ messages: [{ role: "user", content: "hi" }] }), env(async () => sse({ response: "Hel" }, { response: "lo" })));
        expect(await read(old.body!)).toMatchObject({ stop: "end", message: { content: "Hello" } });

        const cut = await agentStep(post({ messages: [{ role: "user", content: "hi" }] }), env(async () => sse(delta({ content: "Partial" }, "length"))));
        expect(await read(cut.body!)).toMatchObject({ stop: "max_tokens" });
    });

    it("runs the model picked, Fast by default, and counts costlier ones as more prompts", async () => {
        const e = env(async () => sse(delta({ content: "Done." }, "stop")));
        const ask = async (model?: string) => (await agentStep(post({ messages: [{ role: "user", content: "a box" }], ...(model ? { model } : {}) }), e)).text();
        await ask();
        await ask("careful");
        await ask("gpt-oss");
        const runs = (e.AI.run as ReturnType<typeof vi.fn>).mock.calls as [string, { chat_template_kwargs: { enable_thinking: boolean } }][];
        expect(runs.map(([model, args]) => [model, args.chat_template_kwargs.enable_thinking])).toEqual([
            ["@cf/zai-org/glm-4.7-flash", false],
            ["@cf/zai-org/glm-4.7-flash", true],
            ["@cf/openai/gpt-oss-120b", true],
        ]);
        // 1 + 2 + 3.
        const usage = await (await handleUsage(new Request("https://x/api/usage"), e))!.json();
        expect(usage).toMatchObject({ prompts: { used: 6 } });
        // Claude isn't on offer without its key; asking for it gets the default.
        await ask("claude");
        expect(runs.at(-1)![0]).toBe("@cf/zai-org/glm-4.7-flash");
        expect((await agentStep(post({ messages: [{ role: "user", content: "x" }], model: "gpt-9" }), e)).status).toBe(400);
    });

    it("says which models can be picked", async () => {
        const info = (await (await agentInfo(new Request("https://x/api/agent"), env(async () => ({})))).json()) as { choices: { id: string; cost: number }[] };
        expect(info).toMatchObject({ provider: "workers-ai", default: "fast" });
        expect(info.choices.map((c) => `${c.id}:${c.cost}`)).toEqual(["fast:1", "careful:2", "gpt-oss:3"]);
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

    it("counts prompts and stops visitors at their monthly limit", async () => {
        const e = env(async () => sse(delta({ content: "Done." }, "stop")));
        const prompt = { messages: [{ role: "user", content: "add a box" }] };
        for (let i = 0; i < 10; i++) await (await agentStep(post(prompt), e)).text();
        const over = await agentStep(post(prompt), e);
        expect(over.status).toBe(402);
        expect(await over.json()).toMatchObject({ code: "quota", error: expect.stringContaining("Sign in") });

        // A turn already under way can still finish its tool steps.
        const followUp = {
            messages: [
                { role: "user", content: "add a box" },
                { role: "assistant", content: null, tool_calls: [{ id: "t1", name: "add", arguments: "{}" }] },
                { role: "tool", tool_call_id: "t1", content: "ok" },
            ],
        };
        expect((await agentStep(post(followUp), e)).status).toBe(200);
        const usage = await (await handleUsage(new Request("https://x/api/usage"), e))!.json();
        expect(usage).toMatchObject({ plan: "guest", prompts: { used: 10, limit: 10 } });
    });

    it("doesn't count prompts the model failed to answer", async () => {
        const e = env(async () => Promise.reject(new Error("down")));
        await events(await agentStep(post({ messages: [{ role: "user", content: "hi" }] }), e));
        const usage = await (await handleUsage(new Request("https://x/api/usage"), e))!.json();
        expect(usage).toMatchObject({ prompts: { used: 0 } });
    });

    it("reports a model that can't start as an error response", async () => {
        const res = await agentStep(post({ messages: [{ role: "user", content: "hi" }] }), env(async () => Promise.reject(new Error("down"))));
        expect(res.status).toBe(503);
        const out = [await res.json()];
        expect(out).toEqual([{ code: "overloaded", error: expect.any(String) }]);
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

describe("model choice", () => {
    it("gives Pro the most capable model and everyone else the cheaper one", async () => {
        const { modelFor } = await import("./agent");
        const e = { AGENT_MODEL: "claude-sonnet-5-5", AGENT_MODEL_PRO: "claude-opus-5-5" } as Env;
        expect(modelFor(e, "pro")).toBe("claude-opus-5-5");
        expect(modelFor(e, "free")).toBe("claude-sonnet-5-5");
        expect(modelFor(e, "guest")).toBe("claude-sonnet-5-5");
        // Without a Pro model set, Pro uses the same one as everyone.
        expect(modelFor({ AGENT_MODEL: "claude-sonnet-5-5", AGENT_MODEL_PRO: "" } as Env, "pro")).toBe("claude-sonnet-5-5");
    });
});

describe("Workers AI errors", () => {
    it("says when the free allowance is used up or the model needs the paid plan", async () => {
        const { aiError } = await import("./workersAi");
        expect(aiError(new Error("4006: you have used up your daily free allocation of 10,000 neurons")).message).toContain("today's capacity");
        expect(aiError(new Error("5035: Model @cf/x is not available on the Workers Free plan")).message).toContain("paid Workers plan");
        expect(aiError(new Error("boom")).message).toContain("busy");
    });
});
