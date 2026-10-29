// Messages between the editor and a shared room (worker/room.ts). Shared by
// both sides so they can't drift apart.
import { z } from "zod";
import { Light, SceneObject } from "../scene/schema";

export const ROOM_ID = /^[A-Za-z0-9_-]{8,40}$/;

export const ROOM_LIMITS = {
    objects: 2000,
    lights: 64,
    peers: 16,
    messageBytes: 1_000_000,
    nameChars: 32,
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
});
export type Presence = z.infer<typeof Presence>;

export const ClientMessage = z.discriminatedUnion("type", [
    z.object({ type: z.literal("ops"), id: z.string().min(1).max(64), ops: Ops }),
    z.object({ type: z.literal("presence"), presence: Presence }),
    z.object({ type: z.literal("rename"), name: z.string().trim().min(1).max(ROOM_LIMITS.nameChars) }),
    z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export type Peer = { id: string; name: string; color: string; presence: Presence };

export type ServerMessage =
    | { type: "welcome"; you: Peer; peers: Peer[]; objects: SceneObject[]; lights: Light[]; version: number }
    | { type: "ops"; from: string; ops: Ops; version: number }
    | { type: "ack"; id: string; version: number }
    | { type: "peer"; peer: Peer }
    | { type: "leave"; id: string }
    | { type: "pong" }
    | { type: "error"; error: string };

export const PEER_COLORS = ["#f76b15", "#30a46c", "#e54666", "#8e4ec6", "#0090ff", "#ffc53d", "#12a594", "#d6409f"];
