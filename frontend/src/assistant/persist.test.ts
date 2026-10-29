import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadChat, saveChat } from "./persist";
import type { Turn } from "./store";

function memoryStorage() {
    const data = new Map<string, string>();
    return {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
        data,
    };
}

const turn = (over: Partial<Turn> = {}): Turn => ({
    id: "t1",
    prompt: "add a box",
    items: [{ kind: "activity", activities: [{ id: "a", label: "Looked from an angle", ok: true, image: "data:image/jpeg;base64,QUJD" }] }],
    status: "done",
    writing: null,
    startedAt: 1,
    finishedAt: 2,
    ...over,
});

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
});
afterEach(() => vi.unstubAllGlobals());

describe("chat persistence", () => {
    it("round-trips the chat without the model's copies of snapshots", () => {
        saveChat({
            conversation: [
                { role: "user", content: "look" },
                { role: "assistant", content: null, tool_calls: [{ id: "l1", name: "look", arguments: "{}" }] },
                { role: "tool", tool_call_id: "l1", content: "{}", images: ["QUJD"] },
            ],
            turns: [turn({ entry: { patches: [], inverse: [] } })],
        });
        const loaded = loadChat()!;
        expect(loaded.conversation[2]).toEqual({ role: "tool", tool_call_id: "l1", content: "{}" });
        expect(loaded.turns[0]).not.toHaveProperty("entry");
        expect(loaded.turns[0].items[0]).toMatchObject({ activities: [{ image: "data:image/jpeg;base64,QUJD" }] });
    });

    it("marks a turn that was running as stopped", () => {
        saveChat({ conversation: [{ role: "user", content: "hi" }], turns: [turn({ status: "running", writing: "Adding" })] });
        expect(loadChat()!.turns[0]).toMatchObject({ status: "stopped", writing: null });
    });

    it("drops thumbnails before giving up on a big chat", () => {
        const big = "data:image/jpeg;base64," + "A".repeat(400_000);
        const turns = Array.from({ length: 5 }, (_, i) =>
            turn({ id: `t${i}`, items: [{ kind: "activity", activities: [{ id: "a", label: "Looked", ok: true, image: big }] }] })
        );
        saveChat({ conversation: [{ role: "user", content: "hi" }], turns });
        const loaded = loadChat()!;
        expect(loaded.turns).toHaveLength(5);
        expect(JSON.stringify(loaded)).not.toContain("AAAA");
    });

    it("ignores and clears a corrupt save", () => {
        storage.setItem("shapeshift-assistant", '{"version":1,"turns":"nope"}');
        expect(loadChat()).toBeNull();
        expect(storage.data.has("shapeshift-assistant")).toBe(false);
    });

    it("clears the save when the chat is reset", () => {
        saveChat({ conversation: [{ role: "user", content: "hi" }], turns: [turn()] });
        saveChat({ conversation: [], turns: [] });
        expect(storage.data.size).toBe(0);
    });
});
