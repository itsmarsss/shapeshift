import { DurableObject } from "cloudflare:workers";
import { ClientMessage, PEER_COLORS, ROOM_LIMITS, type Ops, type Peer, type ServerMessage, type SharedTurn, type VersionMeta } from "../src/collab/protocol";
import type { Animation, Environment, Light, SceneObject } from "../src/scene/schema";
import { RoomState, VersionList, type VersionData } from "./roomState";

// Per connection, refilled continuously. Generous enough for gizmo drags.
const MESSAGES_PER_SECOND = 40;
const BURST = 80;

type Bucket = { tokens: number; at: number };

// One shared scene. Every connection is a WebSocket the runtime can hibernate,
// so an idle room costs nothing. The scene is stored one entity per key.
export class Room extends DurableObject<Env> {
    private state = new RoomState();
    private versions = new VersionList();
    // The scene version the newest saved version was taken at.
    private versionedAt = 0;
    private buckets = new Map<string, Bucket>();

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            const [objects, lights, objectOrder, lightOrder, version, chat, chatOrder, versions, versionedAt, environment, animation] = await Promise.all([
                ctx.storage.list<SceneObject>({ prefix: "o:" }),
                ctx.storage.list<Light>({ prefix: "l:" }),
                ctx.storage.get<string[]>("order:o"),
                ctx.storage.get<string[]>("order:l"),
                ctx.storage.get<number>("version"),
                ctx.storage.list<SharedTurn>({ prefix: "c:" }),
                ctx.storage.get<string[]>("order:c"),
                ctx.storage.get<VersionMeta[]>("versions"),
                ctx.storage.get<number>("versionedAt"),
                ctx.storage.get<Environment>("env"),
                ctx.storage.get<Animation>("anim"),
            ]);
            this.versions = new VersionList(versions ?? []);
            this.versionedAt = versionedAt ?? 0;
            const ordered = <T>(map: Map<string, T>, prefix: string, order: string[] = []) =>
                order.flatMap((id) => (map.has(prefix + id) ? [map.get(prefix + id)!] : []));
            this.state = new RoomState(
                ordered(objects, "o:", objectOrder),
                ordered(lights, "l:", lightOrder),
                version ?? 0,
                ordered(chat, "c:", chatOrder)
            );
            this.state.environment = environment ?? "none";
            if (animation) this.state.animation = animation;
        });
    }

    async fetch(request: Request): Promise<Response> {
        if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
        const sockets = this.ctx.getWebSockets();
        if (sockets.length >= ROOM_LIMITS.peers) return Response.json({ error: "This room is full" }, { status: 429 });

        const url = new URL(request.url);
        const name = (url.searchParams.get("name") ?? "").trim().slice(0, ROOM_LIMITS.nameChars) || "Guest";
        const used = new Set(sockets.map((ws) => this.peerOf(ws)?.color));
        const color = PEER_COLORS.find((c) => !used.has(c)) ?? PEER_COLORS[sockets.length % PEER_COLORS.length];
        const peer: Peer = { id: crypto.randomUUID().slice(0, 8), name, color, presence: { selection: [] } };

        const { 0: client, 1: server } = new WebSocketPair();
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment(peer);
        this.send(server, {
            type: "welcome",
            you: peer,
            peers: sockets.flatMap((ws) => this.peerOf(ws) ?? []),
            objects: this.state.objects,
            lights: this.state.lights,
            environment: this.state.environment,
            animation: this.state.animation,
            version: this.state.version,
            chat: this.state.chat,
        });
        this.broadcast({ type: "peer", peer }, server);
        return new Response(null, { status: 101, webSocket: client });
    }

    async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
        const peer = this.peerOf(ws);
        if (!peer) return ws.close(1011, "Unknown connection");
        if (typeof raw !== "string" || raw.length > ROOM_LIMITS.messageBytes) return this.send(ws, { type: "error", error: "Message too large" });
        if (!this.take(peer.id)) return this.send(ws, { type: "error", error: "Slow down" });

        let json: unknown;
        try {
            json = JSON.parse(raw);
        } catch {
            return this.send(ws, { type: "error", error: "Invalid JSON" });
        }
        const parsed = ClientMessage.safeParse(json);
        if (!parsed.success) return this.send(ws, { type: "error", error: `Invalid message: ${parsed.error.issues[0]?.message ?? "bad shape"}` });
        const msg = parsed.data;

        switch (msg.type) {
            case "ops": {
                // Keep a copy of the scene from before a burst of edits.
                if (this.versions.autoDue(Date.now(), this.state.version, this.versionedAt)) await this.saveVersion("Automatic save", "Room", true);
                const result = this.state.apply(msg.ops);
                if (!result.ok) return this.send(ws, { type: "error", error: result.error });
                await this.persist(msg.ops);
                this.send(ws, { type: "ack", id: msg.id, version: result.version });
                this.broadcast({ type: "ops", from: peer.id, ops: msg.ops, version: result.version }, ws);
                return;
            }
            case "saveVersion": {
                const error = await this.saveVersion(msg.label || "Saved version", peer.name, false);
                if (error) this.send(ws, { type: "error", error });
                return;
            }
            case "listVersions":
                return this.send(ws, { type: "versions", versions: this.versions.versions });
            case "getVersion": {
                const data = await this.ctx.storage.get<VersionData>(`v:${msg.id}`);
                if (!data) return this.send(ws, { type: "error", error: "That version is gone" });
                return this.send(ws, { type: "version", id: msg.id, objects: data.objects, lights: data.lights });
            }
            case "chat": {
                const result = this.state.recordTurn(msg.turn, peer.id);
                if (!result.ok) return this.send(ws, { type: "error", error: result.error });
                await this.ctx.storage.put({ [`c:${msg.turn.id}`]: msg.turn, "order:c": this.state.chat.map((t) => t.id) });
                if (result.dropped.length) await this.ctx.storage.delete(result.dropped.map((id) => `c:${id}`));
                this.broadcast({ type: "chat", turn: msg.turn }, ws);
                return;
            }
            case "presence":
            case "rename": {
                const next: Peer = msg.type === "presence" ? { ...peer, presence: msg.presence } : { ...peer, name: msg.name };
                ws.serializeAttachment(next);
                this.broadcast({ type: "peer", peer: next }, ws);
                return;
            }
            case "ping":
                return this.send(ws, { type: "pong" });
        }
    }

    async webSocketClose(ws: WebSocket, code: number) {
        this.leave(ws);
        try {
            ws.close(code === 1005 || code === 1006 ? 1000 : code, "Closing");
        } catch {
            // Already closed.
        }
    }

    async webSocketError(ws: WebSocket) {
        this.leave(ws);
    }

    private leave(ws: WebSocket) {
        const peer = this.peerOf(ws);
        if (!peer) return;
        this.buckets.delete(peer.id);
        this.broadcast({ type: "leave", id: peer.id }, ws);
    }

    private async persist(ops: Ops) {
        const puts: Record<string, unknown> = {
            version: this.state.version,
            "order:o": this.state.objects.map((o) => o.id),
            "order:l": this.state.lights.map((l) => l.id),
        };
        if (ops.environment) puts.env = ops.environment;
        if (ops.animation) puts.anim = ops.animation;
        for (const { entity } of ops.objects.upsert) puts[`o:${entity.id}`] = entity;
        for (const { entity } of ops.lights.upsert) puts[`l:${entity.id}`] = entity;
        const deletes = [...ops.objects.remove.map((id) => `o:${id}`), ...ops.lights.remove.map((id) => `l:${id}`)];
        await this.ctx.storage.put(puts);
        if (deletes.length) await this.ctx.storage.delete(deletes);
    }

    // Saves the current scene as a version and tells everyone. Returns an error message on failure.
    private async saveVersion(label: string, by: string, auto: boolean): Promise<string | null> {
        const data: VersionData = { objects: this.state.objects, lights: this.state.lights };
        const id = crypto.randomUUID().slice(0, 12);
        const result = this.versions.add(data, { label, at: Date.now(), by, auto }, id);
        if (!result.ok) return result.error;
        this.versionedAt = this.state.version;
        await this.ctx.storage.put({ [`v:${id}`]: data, versions: this.versions.versions, versionedAt: this.versionedAt });
        if (result.dropped.length) await this.ctx.storage.delete(result.dropped.map((d) => `v:${d}`));
        this.broadcast({ type: "versions", versions: this.versions.versions });
        return null;
    }

    private take(id: string) {
        const now = Date.now();
        const b = this.buckets.get(id) ?? { tokens: BURST, at: now };
        b.tokens = Math.min(BURST, b.tokens + ((now - b.at) / 1000) * MESSAGES_PER_SECOND);
        b.at = now;
        this.buckets.set(id, b);
        if (b.tokens < 1) return false;
        b.tokens--;
        return true;
    }

    private peerOf(ws: WebSocket): Peer | null {
        return (ws.deserializeAttachment() as Peer | null) ?? null;
    }

    private send(ws: WebSocket, msg: ServerMessage) {
        try {
            ws.send(JSON.stringify(msg));
        } catch {
            // The socket closed under us; webSocketClose cleans up.
        }
    }

    private broadcast(msg: ServerMessage, except?: WebSocket) {
        const text = JSON.stringify(msg);
        for (const ws of this.ctx.getWebSockets()) {
            if (ws === except) continue;
            try {
                ws.send(text);
            } catch {
                // Skip sockets that are closing.
            }
        }
    }
}
