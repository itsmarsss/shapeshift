import { beforeEach, describe, expect, it } from "vitest";
import { describeScene, worldBounds } from "./assistant";
import { requestWindow, runTurn } from "./agent";
import { executeToolCalls, newTurnContext } from "./executor";
import type { WireMessage } from "@shapeshift/shared/assistant/protocol";
import { parseToolCall, TOOLS } from "@shapeshift/shared/assistant/tools";
import { AgentError, type Transport } from "./transport";
import { emptyDoc, useScene } from "../scene/store";
import type { SceneDoc } from "@shapeshift/shared/scene/schema";
import { setSnapshotTaker } from "../viewport/snapshot";

const s = () => useScene.getState();
const call = (name: string, args: unknown, id = `${name}-${Math.random().toString(36).slice(2, 7)}`) => ({
    id,
    name,
    arguments: JSON.stringify(args),
});

beforeEach(() => s().load(emptyDoc()));

describe("tools", () => {
    it("declares every command and agent tool with an object schema", () => {
        const names = TOOLS.map((t) => t.name);
        expect(names).toEqual(["add", "remove", "duplicate", "transform", "material", "rename", "hole", "align", "mirror", "drop", "boolean", "addLight", "updateLight", "group", "ungroup", "environment", "animate", "keyframe", "removeKeyframe", "clearAnimation", "timeline", "inspect", "select", "look", "plan", "undo"]);
        for (const t of TOOLS) expect(t.parameters.type).toBe("object");
        const add = TOOLS.find((t) => t.name === "add")!.parameters as { properties: Record<string, unknown> };
        expect(add.properties.geometry).toBeDefined();
        expect(JSON.stringify(add)).not.toContain('"mesh"');
        expect(JSON.stringify(add)).toContain('"paraboloid"');
        expect(parseToolCall("drop", '{"targets":["Box"]}')).toEqual({ ok: true, request: { kind: "command", command: { type: "drop", targets: ["Box"] } } });
        expect(parseToolCall("align", '{"targets":["A","B"],"axis":"w","to":"min"}').ok).toBe(false);
    });

    it("forgives the slips smaller models make in tool arguments", () => {
        // Numbers as text, and a size without its type (as Gemma sends them).
        const gemma = parseToolCall("add", '{"color": "#0000ff", "geometry": {"depth": "1", "height": "1", "width": "1"}, "name": "1", "position": [0, "0.5", 0], "primitive": "box"}');
        expect(gemma).toMatchObject({
            ok: true,
            request: { command: { type: "add", primitive: "box", name: "1", geometry: { type: "box", width: 1, height: 1, depth: 1 }, position: [0, 0.5, 0] } },
        });
        // A code fence around it, or a trailing comma.
        expect(parseToolCall("drop", '```json\n{"targets":["Box"],}\n```')).toMatchObject({ ok: true, request: { command: { targets: ["Box"] } } });
        expect(parseToolCall("drop", "not json at all")).toEqual({ ok: false, error: "The arguments were not valid JSON" });
    });

    it("validates arguments and reports why they failed", () => {
        expect(parseToolCall("material", '{"target":"Box","color":"#ff0000"}')).toEqual({
            ok: true,
            request: { kind: "command", command: { type: "material", target: "Box", color: "#ff0000" } },
        });
        const bad = parseToolCall("material", '{"target":"Box","color":"red"}');
        expect(bad.ok).toBe(false);
        expect(!bad.ok && bad.error).toContain("color");
        expect(parseToolCall("explode", "{}").ok).toBe(false);
        expect(parseToolCall("add", "{not json").ok).toBe(false);
        expect(parseToolCall("add", "[]").ok).toBe(false);
    });

    it("ignores a type field smuggled into the arguments", () => {
        expect(parseToolCall("remove", '{"type":"clear","target":"Box"}')).toEqual({
            ok: true,
            request: { kind: "command", command: { type: "remove", target: "Box" } },
        });
    });
});

describe("scene description", () => {
    const doc: SceneDoc = {
        version: 2,
        objects: [
            {
                id: "a1",
                name: "Box",
                geometry: { type: "box", width: 2, height: 1, depth: 1 },
                position: [0, 0.5, 0],
                rotation: [0, Math.PI / 2, 0],
                scale: [1, 1, 1],
                material: { color: "#c8ccd4", metalness: 0, roughness: 0.6, opacity: 1 },
            },
        ],
        lights: [],
        environment: "none",
        animation: { duration: 4, loop: true, tracks: [] },
    };

    it("lists ids, sizes, transforms and world bounds", () => {
        expect(describeScene(doc, "a1")).toBe(
            '"Box" id=a1, box 2x1x1, at [0, 0.5, 0], rotation [0, 1.571, 0], #c8ccd4, bounds [-0.5, 0, -1] to [0.5, 1, 1], (selected)\n' +
                "No lights yet, so the editor's default studio lighting is on."
        );
        expect(describeScene(emptyDoc(), null)).toContain("The scene has no objects.");
    });

    it("accounts for scale and rotation in bounds", () => {
        const b = worldBounds({ ...doc.objects[0], rotation: [0, 0, 0], scale: [1, 3, 1] });
        expect(b.min[1]).toBeCloseTo(-1);
        expect(b.max[1]).toBeCloseTo(2);
    });
});

describe("executor", () => {
    it("runs every call as one undo step and returns the result of each", () => {
        const ctx = newTurnContext("t1");
        const { messages, activities } = executeToolCalls(
            [
                call("add", { primitive: "box", name: "Table Top", geometry: { type: "box", width: 2, height: 0.1, depth: 1 }, position: [0, 1, 0] }),
                call("add", { primitive: "cylinder", name: "Table Leg" }),
                call("material", { target: "Table Top", color: "#8b5a2b" }),
                call("material", { target: "Nope", color: "#000000" }),
                call("material", { target: "Table Top", color: "brown" }),
            ],
            ctx
        );
        expect(s().doc.objects.map((o) => o.name)).toEqual(["Table Top", "Table Leg"]);
        expect(s().doc.objects[0].geometry).toEqual({ type: "box", width: 2, height: 0.1, depth: 1 });
        expect(s().doc.objects[0].material.color).toBe("#8b5a2b");
        expect(activities.map((a) => a.ok)).toEqual([true, true, true, false, false]);
        expect(messages.map((m) => !!m.is_error)).toEqual([false, false, false, true, true]);
        expect(JSON.parse(messages[0].content).objects[0]).toContain('"Table Top" id=');
        expect(ctx.changed).toBe(true);

        s().endCoalesce();
        expect(s().past).toHaveLength(1);
        s().undo();
        expect(s().doc.objects).toHaveLength(0);
    });

    it("rests sized primitives on the ground", () => {
        executeToolCalls([call("add", { primitive: "cylinder", geometry: { type: "cylinder", radiusTop: 0.2, radiusBottom: 0.2, height: 3 } })], newTurnContext("t"));
        expect(s().doc.objects[0].position[1]).toBeCloseTo(1.5);
    });

    it("keeps a requested name pointing at the new object when it had to be renamed", () => {
        s().run({ type: "add", primitive: "box", name: "Leg" });
        const ctx = newTurnContext("t2");
        executeToolCalls([call("add", { primitive: "cylinder", name: "Leg" }), call("material", { target: "Leg", color: "#ff0000" })], ctx);
        const [oldLeg, newLeg] = s().doc.objects;
        expect(newLeg.name).toBe("Leg 2");
        expect(newLeg.material.color).toBe("#ff0000");
        expect(oldLeg.material.color).not.toBe("#ff0000");
    });

    it("inspects, selects and undoes", () => {
        s().run({ type: "add", primitive: "sphere", name: "Moon" });
        s().run({ type: "add", primitive: "box", name: "Crate" });
        const ctx = newTurnContext("t3");
        const { messages } = executeToolCalls(
            [call("inspect", { targets: ["Moon", "Ghost"] }), call("select", { target: "Moon" }), call("undo", { steps: 1 })],
            ctx
        );
        const inspected = JSON.parse(messages[0].content);
        expect(inspected.objects[0].geometry).toEqual({ type: "sphere", radius: 0.5 });
        expect(inspected.missing).toEqual(["Ghost"]);
        expect(JSON.parse(messages[2].content).undone).toBe(1);
        expect(s().doc.objects.map((o) => o.name)).toEqual(["Moon"]);
        expect(s().selectedId).toBe(s().doc.objects[0].id);
    });
});

function scripted(steps: Array<(req: WireMessage[]) => Awaited<ReturnType<Transport>>>): Transport {
    return async (request) => {
        const next = steps.shift();
        if (!next) throw new Error("unexpected request");
        return next(request.messages);
    };
}

describe("look", () => {
    it("attaches a picture of the requested view", () => {
        s().run({ type: "add", primitive: "box", name: "Crate" });
        const seen: unknown[] = [];
        setSnapshotTaker((opts) => {
            seen.push(opts);
            return { dataUrl: "data:image/jpeg;base64,QUJD", width: 4, height: 3 };
        });
        const { messages, activities } = executeToolCalls([call("look", { view: "front", targets: ["Crate"] })], newTurnContext("l"));
        setSnapshotTaker(null);
        expect(seen).toEqual([{ view: "front", targets: [s().doc.objects[0].id] }]);
        expect(messages[0].images).toEqual(["QUJD"]);
        expect(activities[0]).toMatchObject({ ok: true, image: "data:image/jpeg;base64,QUJD" });
    });

    it("reports when there is no viewport", () => {
        const { messages } = executeToolCalls([call("look", {})], newTurnContext("l2"));
        expect(messages[0].is_error).toBe(true);
        expect(messages[0].images).toBeUndefined();
    });
});

describe("agent loop", () => {
    it("feeds tool results back until the model answers", async () => {
        const transport = scripted([
            () => ({
                message: { role: "assistant", content: null, tool_calls: [call("add", { primitive: "sphere", name: "Head" }, "c1")] },
                stop: "tool_use",
                model: "m",
            }),
            (msgs) => {
                const result = msgs[msgs.length - 1];
                expect(result).toMatchObject({ role: "tool", tool_call_id: "c1" });
                return {
                    message: { role: "assistant", content: null, tool_calls: [call("material", { target: "Head", color: "#ffffff" }, "c2")] },
                    stop: "tool_use",
                    model: "m",
                };
            },
            () => ({ message: { role: "assistant", content: "Added a white head." }, stop: "end", model: "m" }),
        ]);
        const conversation: WireMessage[] = [];
        const ctx = newTurnContext("loop");
        const outcome = await runTurn({ conversation, prompt: "make a head", transport, signal: new AbortController().signal, ctx });

        expect(outcome.stop).toBe("end");
        expect(conversation.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant", "tool", "assistant"]);
        expect(conversation[0]).toMatchObject({ role: "user", content: "make a head", scene: describeScene(emptyDoc(), null) });
        expect(s().doc.objects[0].material.color).toBe("#ffffff");
        s().endCoalesce();
        expect(s().past).toHaveLength(1);
    });

    it("tells the model what the checks find, and asks once more before it stops", async () => {
        const floating = call("add", { primitive: "box", name: "Lid", position: [0, 2, 0] }, "c1");
        const transport = scripted([
            () => ({ message: { role: "assistant", content: null, tool_calls: [floating] }, stop: "tool_use", model: "m" }),
            (msgs) => {
                expect((msgs[msgs.length - 1] as { content: string }).content).toContain("Lid floats 1.5 m above the ground");
                return { message: { role: "assistant", content: "Added a lid." }, stop: "end", model: "m" };
            },
            (msgs) => {
                const note = msgs[msgs.length - 1];
                expect(note).toMatchObject({ role: "user" });
                expect((note as { content: string }).content).toMatch(/^Automatic check, not from the user/);
                return { message: { role: "assistant", content: null, tool_calls: [call("drop", { targets: ["Lid"] }, "c2")] }, stop: "tool_use", model: "m" };
            },
            (msgs) => {
                expect((msgs[msgs.length - 1] as { content: string }).content).toContain("no problems found");
                return { message: { role: "assistant", content: "Put the lid on the ground." }, stop: "end", model: "m" };
            },
        ]);
        const activities: string[] = [];
        const conversation: WireMessage[] = [];
        await runTurn({
            conversation,
            prompt: "add a lid",
            transport,
            signal: new AbortController().signal,
            ctx: newTurnContext("checks"),
            handlers: { onActivities: (a) => activities.push(...a.map((x) => x.label)) },
        });
        expect(conversation.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant", "user", "assistant", "tool", "assistant"]);
        expect(activities).toContain("Checked the build: 1 thing to fix");
    });

    it("holds the model to its plan", async () => {
        const transport = scripted([
            () => ({ message: { role: "assistant", content: null, tool_calls: [call("plan", { parts: "Table, Mug, Lamp" }, "p1")] }, stop: "tool_use", model: "m" }),
            () => ({ message: { role: "assistant", content: null, tool_calls: [call("add", { primitive: "box", name: "Table Top" }, "c1")] }, stop: "tool_use", model: "m" }),
            (msgs) => {
                expect((msgs[msgs.length - 1] as { content: string }).content).toContain("Planned but not built yet: Mug, Lamp.");
                return { message: { role: "assistant", content: "Made a table." }, stop: "end", model: "m" };
            },
            (msgs) => {
                expect((msgs[msgs.length - 1] as { content: string }).content).toContain("Planned but not built yet: Mug, Lamp.");
                return { message: { role: "assistant", content: "Ran out of ideas." }, stop: "end", model: "m" };
            },
        ]);
        const activities: string[] = [];
        await runTurn({
            conversation: [],
            prompt: "a table with a mug and a lamp",
            transport,
            signal: new AbortController().signal,
            ctx: newTurnContext("plan"),
            handlers: { onActivities: (a) => activities.push(...a.map((x) => x.label)) },
        });
        expect(activities[0]).toBe("Planned 3 things: Table, Mug, Lamp");
    });

    it("asks only once, and leaves alone what it didn't build", async () => {
        s().run({ type: "add", primitive: "box", name: "Old", position: [5, 3, 0] });
        const transport = scripted([
            () => ({ message: { role: "assistant", content: null, tool_calls: [call("add", { primitive: "box", name: "Cloud", position: [0, 3, 0] })] }, stop: "tool_use", model: "m" }),
            () => ({ message: { role: "assistant", content: "Added a cloud." }, stop: "end", model: "m" }),
            () => ({ message: { role: "assistant", content: "It's a cloud, so it floats." }, stop: "end", model: "m" }),
        ]);
        const conversation: WireMessage[] = [];
        await runTurn({ conversation, prompt: "a cloud", transport, signal: new AbortController().signal, ctx: newTurnContext("once") });
        const note = conversation.find((m) => m.role === "user" && m.content.startsWith("Automatic check")) as { content: string };
        expect(note.content).toContain("Cloud floats");
        expect(note.content).not.toContain("Old");
        expect(conversation[conversation.length - 1]).toMatchObject({ role: "assistant", content: "It's a cloud, so it floats." });
    });

    it("sends attached pictures with the prompt", async () => {
        const transport = scripted([() => ({ message: { role: "assistant", content: "A cat." }, stop: "end", model: "m" })]);
        const conversation: WireMessage[] = [];
        await runTurn({ conversation, prompt: "what is this", images: ["QUJD"], transport, signal: new AbortController().signal, ctx: newTurnContext("img") });
        expect(conversation[0]).toMatchObject({ role: "user", images: ["QUJD"] });
    });

    it("stops at the step limit with every call answered", async () => {
        const loop = () => ({
            message: { role: "assistant" as const, content: null, tool_calls: [call("add", { primitive: "box" })] },
            stop: "tool_use" as const,
            model: "m",
        });
        const transport = scripted([loop, loop, loop]);
        const conversation: WireMessage[] = [];
        const outcome = await runTurn({ conversation, prompt: "boxes", transport, signal: new AbortController().signal, ctx: newTurnContext("x"), maxSteps: 3 });
        expect(outcome.stop).toBe("max_steps");
        expect(conversation[conversation.length - 1].role).toBe("tool");
    });

    it("keeps finished steps when a request fails, so the turn can resume", async () => {
        const transport = scripted([
            () => ({ message: { role: "assistant", content: null, tool_calls: [call("add", { primitive: "box" }, "c1")] }, stop: "tool_use", model: "m" }),
            () => {
                throw new AgentError("overloaded", "busy");
            },
            () => ({ message: { role: "assistant", content: "Done." }, stop: "end", model: "m" }),
        ]);
        const conversation: WireMessage[] = [];
        const ctx = newTurnContext("resume");
        await expect(runTurn({ conversation, prompt: "box", transport, signal: new AbortController().signal, ctx })).rejects.toThrow("busy");
        expect(conversation.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
        await runTurn({ conversation, transport, signal: new AbortController().signal, ctx });
        expect(conversation.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
        expect(s().doc.objects).toHaveLength(1);
    });

    it("trims old turns so a request always starts at a prompt", () => {
        const conversation: WireMessage[] = [];
        for (let i = 0; i < 100; i++) {
            conversation.push({ role: "user", content: `turn ${i}` });
            conversation.push({ role: "assistant", content: null, tool_calls: [call("add", { primitive: "box" }, `c${i}`)] });
            conversation.push({ role: "tool", tool_call_id: `c${i}`, content: "{}" });
        }
        const window = requestWindow(conversation);
        expect(window.length).toBeLessThanOrEqual(120);
        expect(window[0].role).toBe("user");
        expect(window[window.length - 1]).toBe(conversation[conversation.length - 1]);
    });
});
