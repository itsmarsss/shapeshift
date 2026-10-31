import { create } from "zustand";
import { nanoid } from "nanoid";
import { useScene, type SceneState } from "../scene/store";
import { useAccount } from "../account/store";
import { runTurn } from "./agent";
import { newTurnContext, type Activity, type TurnContext } from "./executor";
import type { AgentInfo, WireMessage } from "@shapeshift/shared/assistant/protocol";
import { AgentError, fetchAgentInfo, httpTransport, type Transport } from "./transport";
import { loadChat, saveChat } from "./persist";
import { onRoomChat, sendChatTurn, useCollab } from "../collab/session";
import type { SharedTurn } from "@shapeshift/shared/collab/protocol";
import { track } from "../telemetry";
import { loadCsg } from "../scene/csg";

type HistoryEntry = SceneState["past"][number];

export type Attachment = { data: string; thumbnail: string };

export type TurnItem = { kind: "text"; text: string } | { kind: "activity"; activities: Activity[] };

export type TurnStatus = "running" | "done" | "error" | "stopped";

export type Turn = {
    id: string;
    // Who asked, when the turn happened in a shared room.
    author?: SharedTurn["author"];
    // Asked by someone else in the room; shown read-only.
    remote?: boolean;
    prompt: string;
    // Thumbnails of the pictures attached to the prompt.
    attachments?: string[];
    items: TurnItem[];
    status: TurnStatus;
    // `quota` is set when the monthly allowance ran out, to offer a way to get more.
    error?: { message: string; retryable: boolean; quota?: boolean };
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
    send: (prompt: string, attachments?: Attachment[]) => void;
    retry: () => void;
    stop: () => void;
    reset: () => void;
    undoTurn: (id: string) => void;
    redoTurn: (id: string) => void;
    loadInfo: () => void;
};

const saved = typeof localStorage === "undefined" ? null : loadChat();

// The model-facing transcript. Not reactive: the UI renders `turns` instead.
let conversation: WireMessage[] = saved?.conversation ?? [];
let controller: AbortController | null = null;
const lastSaved = saved?.turns[saved.turns.length - 1];
// Lets Retry pick up a turn that failed before the page was reloaded.
let context: TurnContext | null = lastSaved?.status === "error" ? newTurnContext(`assistant:${lastSaved.id}`) : null;
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

    async function drive(turnId: string, prompt?: string, images?: string[]) {
        controller = new AbortController();
        const ctx = context!;
        set({ running: true });
        try {
            const { stop } = await runTurn({
                conversation,
                prompt,
                images,
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
            else
                patchTurn(turnId, () => ({
                    status: "error",
                    error: {
                        message: error.message,
                        retryable: error.code !== "bad_request" && error.code !== "not_configured" && error.code !== "quota",
                        ...(error.code === "quota" ? { quota: true } : {}),
                    },
                }));
            if (error.code !== "aborted" && !(err instanceof AgentError)) console.error(err);
        } finally {
            void useAccount.getState().refreshUsage();
            const scene = useScene.getState();
            scene.endCoalesce();
            // Select what the turn made when it made one thing, so "it" means that next.
            const made = ctx.created.filter((id) => scene.doc.objects.some((o) => o.id === id));
            if (made.length === 1) scene.select(made[0]);
            const entry = ctx.changed ? scene.past[scene.past.length - 1] : undefined;
            patchTurn(turnId, (t) => ({ writing: null, finishedAt: Date.now(), entry: entry ?? t.entry }));
            controller = null;
            set({ running: false });
            saveChat({ conversation, turns: get().turns.filter((t) => !t.remote) });
        }
    }

    return {
        turns: saved?.turns ?? [],
        running: false,
        info: null,

        send: (raw, attachments = []) => {
            track("assistant_prompt");
            // The assistant may combine shapes; have the cutting library ready.
            void loadCsg();
            const prompt = raw.trim() || (attachments.length ? "Build this." : "");
            if (!prompt || get().running) return;
            const id = nanoid(8);
            context = newTurnContext(`assistant:${id}`);
            const collab = useCollab.getState();
            const author = collab.status === "live" && collab.you ? { id: collab.you.id, name: collab.name || collab.you.name, color: collab.you.color } : undefined;
            set((s) => ({
                turns: [
                    ...s.turns,
                    {
                        id,
                        ...(author ? { author } : {}),
                        prompt,
                        ...(attachments.length ? { attachments: attachments.map((a) => a.thumbnail) } : {}),
                        items: [],
                        status: "running",
                        writing: null,
                        startedAt: Date.now(),
                    },
                ],
            }));
            void drive(id, prompt, attachments.map((a) => a.data));
        },

        retry: () => {
            const local = get().turns.filter((t) => !t.remote);
            const last = local[local.length - 1];
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
            saveChat({ conversation, turns: [] });
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

// Shared rooms: send this user's turns as they change, and show everyone
// else's.

function toShared(t: Turn): SharedTurn | null {
    if (!t.author) return null;
    return {
        id: t.id,
        author: t.author,
        prompt: t.prompt,
        items: t.items.map((item) =>
            item.kind === "text"
                ? item
                : { kind: "activity", activities: item.activities.map((a) => ({ id: a.id, label: a.label, ok: a.ok, error: a.error, color: a.color, changed: a.changed, target: a.target })) }
        ),
        status: t.status,
        note: t.note,
        error: t.error?.message,
        writing: t.writing,
        startedAt: t.startedAt,
        finishedAt: t.finishedAt,
    };
}

function fromShared(t: SharedTurn): Turn {
    return {
        id: t.id,
        author: t.author,
        remote: true,
        prompt: t.prompt,
        items: t.items,
        status: t.status,
        note: t.note,
        error: t.error ? { message: t.error, retryable: false } : undefined,
        writing: t.writing ?? null,
        startedAt: t.startedAt,
        finishedAt: t.finishedAt,
    };
}

const SHARE_MS = 150;
const shareTimers = new Map<string, ReturnType<typeof setTimeout>>();

useAssistant.subscribe((state, prev) => {
    if (state.turns === prev.turns) return;
    const before = new Map(prev.turns.map((t) => [t.id, t]));
    for (const turn of state.turns) {
        if (turn.remote || !turn.author || before.get(turn.id) === turn) continue;
        // Throttle streaming updates, but always send the final state.
        const done = turn.status !== "running";
        clearTimeout(shareTimers.get(turn.id));
        const flush = () => {
            shareTimers.delete(turn.id);
            const latest = useAssistant.getState().turns.find((t) => t.id === turn.id);
            const shared = latest && toShared(latest);
            if (shared) sendChatTurn(shared);
        };
        if (done) flush();
        else shareTimers.set(turn.id, setTimeout(flush, SHARE_MS));
    }
});

onRoomChat((incoming, replace) => {
    const you = useCollab.getState().you?.id;
    useAssistant.setState((s) => {
        let turns = replace ? s.turns.filter((t) => !t.remote) : s.turns.slice();
        for (const shared of incoming) {
            if (shared.author.id === you) continue;
            const at = turns.findIndex((t) => t.id === shared.id);
            if (at >= 0) {
                if (turns[at].remote) turns[at] = fromShared(shared);
            } else turns.push(fromShared(shared));
        }
        turns = turns.sort((a, b) => a.startedAt - b.startedAt);
        return { turns };
    });
});
