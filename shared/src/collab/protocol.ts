// Messages between the editor and a shared room (worker/room.ts). Shared by
// both sides so they can't drift apart.
import { z } from "zod";
import { Animation, Environment, Light, SceneObject, Vec3 } from "../scene/schema";

export const ROOM_ID = /^[A-Za-z0-9_-]{8,40}$/;

export const ROOM_LIMITS = {
    objects: 2000,
    lights: 64,
    peers: 16,
    messageBytes: 1_000_000,
    nameChars: 32,
    chatTurns: 40,
    versions: 30,
    versionChars: 1_800_000,
    autoVersionMs: 10 * 60_000,
    chatTurnChars: 48_000,
} as const;

const Upsert = <T extends z.ZodType>(entity: T) => z.object({ entity, index: z.number().int().nonnegative().optional() });

// Changes to the scene, by entity id. Upserts replace the whole entity; the
// last write to an entity wins.
export const Ops = z.object({
    objects: z.object({ upsert: z.array(Upsert(SceneObject)).max(ROOM_LIMITS.objects), remove: z.array(z.string()).max(ROOM_LIMITS.objects) }),
    lights: z.object({ upsert: z.array(Upsert(Light)).max(ROOM_LIMITS.lights), remove: z.array(z.string()).max(ROOM_LIMITS.lights) }),
    environment: Environment.optional(),
    // The whole animation, replaced at once; the last write wins.
    animation: Animation.optional(),
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

export type VersionMeta = { id: string; label: string; at: number; by: string; objects: number; lights: number; auto: boolean };

export const ClientMessage = z.discriminatedUnion("type", [
    z.object({ type: z.literal("saveVersion"), label: z.string().trim().max(60).optional() }),
    z.object({ type: z.literal("listVersions") }),
    z.object({ type: z.literal("getVersion"), id: z.string().min(1).max(32) }),
    z.object({ type: z.literal("chat"), turn: SharedTurn }),
    z.object({ type: z.literal("ops"), id: z.string().min(1).max(64), ops: Ops }),
    z.object({ type: z.literal("presence"), presence: Presence }),
    z.object({ type: z.literal("rename"), name: z.string().trim().min(1).max(ROOM_LIMITS.nameChars) }),
    z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export type Peer = { id: string; name: string; color: string; presence: Presence };

export type ServerMessage =
    | { type: "welcome"; you: Peer; peers: Peer[]; objects: SceneObject[]; lights: Light[]; environment?: Environment; animation?: Animation; version: number; chat: SharedTurn[] }
    | { type: "chat"; turn: SharedTurn }
    | { type: "versions"; versions: VersionMeta[] }
    | { type: "version"; id: string; objects: SceneObject[]; lights: Light[] }
    | { type: "ops"; from: string; ops: Ops; version: number }
    | { type: "ack"; id: string; version: number }
    | { type: "peer"; peer: Peer }
    | { type: "leave"; id: string }
    | { type: "pong" }
    | { type: "error"; error: string };

// Colors for people in a room: the same brightness and saturation, so none of
// them stands out or disappears.
export const PEER_COLORS = ["#ff8b3e", "#4cc38a", "#ff6b8a", "#a78bfa", "#4cb3ff", "#f5c33b", "#2ec4b6", "#f472b6"];
