// Messages between the editor and a shared room (worker/room.ts). Shared by
// both sides so they can't drift apart.
import { z } from "zod";
import { Light, SceneObject, Vec3 } from "../scene/schema";

export const ROOM_ID = /^[A-Za-z0-9_-]{8,40}$/;

export const ROOM_LIMITS = {
    objects: 2000,
    lights: 64,
    peers: 16,
    messageBytes: 1_000_000,
    nameChars: 32,
    chatTurns: 40,
    chatTurnChars: 48_000,
} as const;

const Upsert = <T extends z.ZodType>(entity: T) => z.object({ entity, index: z.number().int().nonnegative().optional() });

// Changes to the scene, by entity id. Upserts replace the whole entity; the
// last write to an entity wins.
export const Ops = z.object({
    objects: z.object({ upsert: z.array(Upsert(SceneObject)).max(ROOM_LIMITS.objects), remove: z.array(z.string()).max(ROOM_LIMITS.objects) }),
    lights: z.object({ upsert: z.array(Upsert(Light)).max(ROOM_LIMITS.lights), remove: z.array(z.string()).max(ROOM_LIMITS.lights) }),
});
export type Ops = z.infer<typeof Ops>;

export const emptyOps = (): Ops => ({ objects: { upsert: [], remove: [] }, lights: { upsert: [], remove: [] } });

export const Presence = z.object({
    selection: z.array(z.string()).max(200),
    // Where the pointer is in the scene, or null when it's off the viewport.
    cursor: Vec3.nullable().optional(),
});
export type Presence = z.infer<typeof Presence>;

const SharedActivity = z.object({
    id: z.string().max(128),
    label: z.string().max(300),
    ok: z.boolean(),
    error: z.string().max(1000).optional(),
    color: z.string().max(16).optional(),
    changed: z.boolean().optional(),
    target: z.string().max(64).optional(),
});

// An assistant conversation turn, as everyone in the room sees it. Snapshots
// of the viewport stay with the person who asked, to keep messages small.
export const SharedTurn = z.object({
    id: z.string().min(1).max(32),
    author: z.object({ id: z.string().max(32), name: z.string().max(ROOM_LIMITS.nameChars), color: z.string().max(16) }),
    prompt: z.string().max(4000),
    items: z
        .array(
            z.discriminatedUnion("kind", [
                z.object({ kind: z.literal("text"), text: z.string().max(20_000) }),
                z.object({ kind: z.literal("activity"), activities: z.array(SharedActivity).max(200) }),
            ])
        )
        .max(60),
    status: z.enum(["running", "done", "error", "stopped"]),
    note: z.string().max(500).optional(),
    error: z.string().max(500).optional(),
    writing: z.string().max(40).nullable().optional(),
    startedAt: z.number(),
    finishedAt: z.number().optional(),
});
export type SharedTurn = z.infer<typeof SharedTurn>;

export const ClientMessage = z.discriminatedUnion("type", [
    z.object({ type: z.literal("chat"), turn: SharedTurn }),
    z.object({ type: z.literal("ops"), id: z.string().min(1).max(64), ops: Ops }),
    z.object({ type: z.literal("presence"), presence: Presence }),
    z.object({ type: z.literal("rename"), name: z.string().trim().min(1).max(ROOM_LIMITS.nameChars) }),
    z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export type Peer = { id: string; name: string; color: string; presence: Presence };

export type ServerMessage =
    | { type: "welcome"; you: Peer; peers: Peer[]; objects: SceneObject[]; lights: Light[]; version: number; chat: SharedTurn[] }
    | { type: "chat"; turn: SharedTurn }
    | { type: "ops"; from: string; ops: Ops; version: number }
    | { type: "ack"; id: string; version: number }
    | { type: "peer"; peer: Peer }
    | { type: "leave"; id: string }
    | { type: "pong" }
    | { type: "error"; error: string };

export const PEER_COLORS = ["#f76b15", "#30a46c", "#e54666", "#8e4ec6", "#0090ff", "#ffc53d", "#12a594", "#d6409f"];
