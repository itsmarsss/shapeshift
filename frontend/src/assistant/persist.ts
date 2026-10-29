import { z } from "zod";
import { WireMessage } from "./protocol";
import type { Turn } from "./store";

const KEY = "shapeshift-assistant";
// localStorage is shared with the scene autosave, so keep the chat well under it.
const BUDGET = 1_500_000;

const SavedActivity = z.object({
    id: z.string(),
    label: z.string(),
    ok: z.boolean(),
    error: z.string().optional(),
    color: z.string().optional(),
    image: z.string().optional(),
    changed: z.boolean().optional(),
});

const SavedTurn = z.object({
    id: z.string(),
    prompt: z.string(),
    items: z.array(
        z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("text"), text: z.string() }),
            z.object({ kind: z.literal("activity"), activities: z.array(SavedActivity) }),
        ])
    ),
    status: z.enum(["running", "done", "error", "stopped"]),
    error: z.object({ message: z.string(), retryable: z.boolean() }).optional(),
    note: z.string().optional(),
    startedAt: z.number(),
    finishedAt: z.number().optional(),
});

const Saved = z.object({
    version: z.literal(1),
    conversation: z.array(WireMessage),
    turns: z.array(SavedTurn),
});

function omit<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
    const copy = { ...value };
    for (const k of keys) delete copy[k];
    return copy;
}

export type SavedChat = { conversation: WireMessage[]; turns: Turn[] };

export function loadChat(): SavedChat | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = Saved.safeParse(JSON.parse(raw));
        if (!parsed.success) {
            localStorage.removeItem(KEY);
            return null;
        }
        return {
            conversation: parsed.data.conversation,
            // A turn that was running when the page closed can't continue.
            turns: parsed.data.turns.map((t) => ({ ...t, writing: null, status: t.status === "running" ? "stopped" : t.status })),
        };
    } catch {
        return null;
    }
}

export function saveChat({ conversation, turns }: SavedChat) {
    try {
        if (!turns.length) {
            localStorage.removeItem(KEY);
            return;
        }
        // Snapshots are the heavy part. The model doesn't need old ones, and
        // thumbnails go first if the chat is still too big.
        const lean = conversation.map((m) => (m.role === "tool" && m.images ? { ...m, images: undefined } : m));
        const plainTurns = turns.map((t) => omit(t, "entry", "writing"));
        let json = JSON.stringify({ version: 1, conversation: lean, turns: plainTurns });
        if (json.length > BUDGET) {
            const noImages = plainTurns.map((t) => ({
                ...t,
                items: t.items.map((i) => (i.kind === "activity" ? { ...i, activities: i.activities.map((a) => omit(a, "image")) } : i)),
            }));
            json = JSON.stringify({ version: 1, conversation: lean, turns: noImages });
        }
        if (json.length > BUDGET) {
            localStorage.removeItem(KEY);
            return;
        }
        localStorage.setItem(KEY, json);
    } catch (error) {
        console.warn("Couldn't save the chat", error);
    }
}
