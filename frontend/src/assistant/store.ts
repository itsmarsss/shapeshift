import { create } from "zustand";
import { nanoid } from "nanoid";
import { useScene, type SceneState } from "../scene/store";
import { runTurn } from "./agent";
import { newTurnContext, type Activity, type TurnContext } from "./executor";
import type { AgentInfo, WireMessage } from "./protocol";
import { AgentError, fetchAgentInfo, httpTransport, type Transport } from "./transport";

type HistoryEntry = SceneState["past"][number];

export type TurnItem = { kind: "text"; text: string } | { kind: "activity"; activities: Activity[] };

export type TurnStatus = "running" | "done" | "error" | "stopped";

export type Turn = {
    id: string;
    prompt: string;
    items: TurnItem[];
    status: TurnStatus;
    error?: { message: string; retryable: boolean };
    note?: string;
    writing: string | null;
    entry?: HistoryEntry;
    startedAt: number;
    finishedAt?: number;
};

type AssistantState = {
    turns: Turn[];
    running: boolean;
    info: AgentInfo | null;
    send: (prompt: string) => void;
    retry: () => void;
    stop: () => void;
    reset: () => void;
    undoTurn: (id: string) => void;
    redoTurn: (id: string) => void;
    loadInfo: () => void;
};

// The model-facing transcript. Not reactive: the UI renders `turns` instead.
let conversation: WireMessage[] = [];
let controller: AbortController | null = null;
let context: TurnContext | null = null;
let transport: Transport = httpTransport;

export function setTransportForTests(t: Transport) {
    transport = t;
}

const TOOL_LABELS: Record<string, string> = {
    add: "Adding",
    remove: "Removing",
    duplicate: "Duplicating",
    transform: "Positioning",
    material: "Styling",
    rename: "Renaming",
    boolean: "Combining",
    inspect: "Inspecting",
    select: "Selecting",
    undo: "Undoing",
};

export const useAssistant = create<AssistantState>()((set, get) => {
    const patchTurn = (id: string, fn: (t: Turn) => Partial<Turn>) =>
        set((s) => ({ turns: s.turns.map((t) => (t.id === id ? { ...t, ...fn(t) } : t)) }));

    async function drive(turnId: string, prompt?: string) {
        controller = new AbortController();
        const ctx = context!;
        set({ running: true });
        try {
            const { stop } = await runTurn({
                conversation,
                prompt,
                transport,
                signal: controller.signal,
                ctx,
                handlers: {
                    onText: (text) =>
                        patchTurn(turnId, (t) => {
                            const last = t.items[t.items.length - 1];
                            const items =
                                last?.kind === "text"
                                    ? [...t.items.slice(0, -1), { kind: "text" as const, text: last.text + text }]
                                    : [...t.items, { kind: "text" as const, text }];
                            return { items };
                        }),
                    onToolStart: (name) => patchTurn(turnId, () => ({ writing: TOOL_LABELS[name] ?? "Working" })),
                    onActivities: (activities) =>
                        patchTurn(turnId, (t) => {
                            const last = t.items[t.items.length - 1];
                            const items =
                                last?.kind === "activity"
                                    ? [...t.items.slice(0, -1), { kind: "activity" as const, activities: [...last.activities, ...activities] }]
                                    : [...t.items, { kind: "activity" as const, activities }];
                            return { items, writing: null };
                        }),
                },
            });
            const note =
                stop === "max_steps"
                    ? "Stopped after the step limit. Send another message to keep going."
                    : stop === "max_tokens"
                      ? "The reply was cut off. Try asking for less at once."
                      : stop === "refusal"
                        ? "The model declined this request."
                        : undefined;
            patchTurn(turnId, () => ({ status: "done", note, error: undefined }));
        } catch (err) {
            const error = err instanceof AgentError ? err : new AgentError("internal", "Something went wrong.");
            if (error.code === "aborted") patchTurn(turnId, () => ({ status: "stopped", error: undefined }));
            else patchTurn(turnId, () => ({ status: "error", error: { message: error.message, retryable: error.code !== "bad_request" && error.code !== "not_configured" } }));
            if (error.code !== "aborted" && !(err instanceof AgentError)) console.error(err);
        } finally {
            const scene = useScene.getState();
            scene.endCoalesce();
            const entry = ctx.changed ? scene.past[scene.past.length - 1] : undefined;
            patchTurn(turnId, (t) => ({ writing: null, finishedAt: Date.now(), entry: entry ?? t.entry }));
            controller = null;
            set({ running: false });
        }
    }

    return {
        turns: [],
        running: false,
        info: null,

        send: (raw) => {
            const prompt = raw.trim();
            if (!prompt || get().running) return;
            const id = nanoid(8);
            context = newTurnContext(`assistant:${id}`);
            set((s) => ({
                turns: [...s.turns, { id, prompt, items: [], status: "running", writing: null, startedAt: Date.now() }],
            }));
            void drive(id, prompt);
        },

        retry: () => {
            const last = get().turns[get().turns.length - 1];
            if (!last || last.status !== "error" || get().running || !context) return;
            patchTurn(last.id, () => ({ status: "running", error: undefined }));
            void drive(last.id);
        },

        stop: () => controller?.abort(),

        reset: () => {
            controller?.abort();
            conversation = [];
            context = null;
            set({ turns: [], running: false });
        },

        undoTurn: (id) => {
            const turn = get().turns.find((t) => t.id === id);
            const scene = useScene.getState();
            if (!turn?.entry || scene.past[scene.past.length - 1] !== turn.entry) return;
            scene.undo();
            // Re-render so the button can flip to redo.
            patchTurn(id, () => ({}));
        },

        redoTurn: (id) => {
            const turn = get().turns.find((t) => t.id === id);
            const scene = useScene.getState();
            if (!turn?.entry || scene.future[0] !== turn.entry) return;
            scene.redo();
            patchTurn(id, () => ({}));
        },

        loadInfo: () => {
            if (get().info) return;
            void fetchAgentInfo().then((info) => info && set({ info }));
        },
    };
});

export function resetConversationForTests() {
    useAssistant.getState().reset();
}
