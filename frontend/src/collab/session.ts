import { create } from "zustand";
import { nanoid } from "nanoid";
import { diffDocs, isEmptyDiff } from "../scene/diff";
import { useScene } from "../scene/store";
import { meshHashes, uploadMeshes } from "../scene/meshStore";
import { parseSceneFile } from "../scene/io";
import { emptyAnimation } from "@shapeshift/shared/scene/schema";
import { diffToOps, opsToDiff, syncDiff } from "./ops";
import { ROOM_ID, ROOM_LIMITS, emptyOps, type ClientMessage, type Ops, type Peer, type ServerMessage, type SharedTurn, type VersionMeta } from "@shapeshift/shared/collab/protocol";

export type CollabStatus = "off" | "connecting" | "live" | "reconnecting" | "error";

type CollabState = {
    status: CollabStatus;
    roomId: string | null;
    you: Peer | null;
    peers: Record<string, Peer>;
    error: string | null;
    name: string;
    versions: VersionMeta[];
    restoring: string | null;
    saveVersion: (label?: string) => void;
    listVersions: () => void;
    restoreVersion: (id: string) => void;
    join: (roomId: string, options?: { seed?: boolean }) => void;
    share: () => string;
    // `restore` brings back the scene the user had before joining someone else's room.
    leave: (options?: { restore?: boolean }) => void;
    rename: (name: string) => void;
    moveCursor: (cursor: [number, number, number] | null) => void;
};

const NAME_KEY = "shapeshift-name";
const BACKUP_KEY = "shapeshift-scene-solo";
const PING_MS = 25_000;
const RETRY_MS = [500, 1_000, 2_000, 4_000, 8_000];

const ADJECTIVES = ["Amber", "Brisk", "Coral", "Dusky", "Golden", "Jade", "Lunar", "Misty", "Ruby", "Teal", "Velvet", "Witty"];
const ANIMALS = ["Badger", "Crane", "Falcon", "Fox", "Gecko", "Heron", "Lynx", "Otter", "Panda", "Raven", "Seal", "Wren"];

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

// A friendly name until the user picks one, kept so it stays the same.
function storedName() {
    try {
        const saved = localStorage.getItem(NAME_KEY);
        if (saved) return saved;
        const name = `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
        localStorage.setItem(NAME_KEY, name);
        return name;
    } catch {
        return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
    }
}

export function roomLink(roomId: string) {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("room", roomId);
    return url.toString();
}

function setRoomInUrl(roomId: string | null) {
    const url = new URL(location.href);
    if (roomId) url.searchParams.set("room", roomId);
    else url.searchParams.delete("room");
    history.replaceState(null, "", url);
}

// The live connection. Kept outside React state because it changes on every
// message.
let socket: WebSocket | null = null;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let seedOnWelcome = false;
let applyingRemote = false;
// Sent but not yet confirmed. Resent after a reconnect; the server applies
// them in order and the last write wins, so resending is safe.
const pending = new Map<string, Ops>();
let unsubscribers: (() => void)[] = [];

// The room's assistant transcript. Buffered here because the chat panel loads
// lazily and may subscribe after the room has already sent it.
type ChatListener = (turns: SharedTurn[], replace: boolean) => void;
let roomChat: SharedTurn[] = [];
const chatListeners = new Set<ChatListener>();

function publishChat(turns: SharedTurn[], replace: boolean) {
    if (replace) roomChat = turns.slice();
    else
        for (const t of turns) {
            const at = roomChat.findIndex((x) => x.id === t.id);
            if (at >= 0) roomChat[at] = t;
            else roomChat.push(t);
        }
    for (const fn of chatListeners) fn(turns, replace);
}

export function onRoomChat(fn: ChatListener) {
    chatListeners.add(fn);
    if (roomChat.length) fn(roomChat.slice(), true);
    return () => {
        chatListeners.delete(fn);
    };
}

export function sendChatTurn(turn: SharedTurn) {
    if (useCollab.getState().status === "live") send({ type: "chat", turn });
}
let cursor: [number, number, number] | null = null;
let cursorTimer: ReturnType<typeof setTimeout> | undefined;
let lastCursorSent = 0;
const CURSOR_MS = 66;

function sendPresence() {
    send({ type: "presence", presence: { selection: useScene.getState().selectedIds.slice(0, 200), cursor } });
}

function send(msg: ClientMessage) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

// Parts per message, so a big imported assembly stays under the room's message size.
const UPSERTS_PER_MESSAGE = 800;

function sendOps(ops: Ops) {
    const { upsert } = ops.objects;
    for (let i = 0; i === 0 || i < upsert.length; i += UPSERTS_PER_MESSAGE) {
        const part: Ops = i === 0 ? { ...ops, objects: { ...ops.objects, upsert: upsert.slice(0, UPSERTS_PER_MESSAGE) } } : { ...emptyOps(), objects: { upsert: upsert.slice(i, i + UPSERTS_PER_MESSAGE), remove: [] } };
        const id = nanoid(10);
        pending.set(id, part);
        send({ type: "ops", id, ops: part });
    }
}

function applyRemote(fn: () => void) {
    applyingRemote = true;
    try {
        fn();
    } finally {
        applyingRemote = false;
    }
}

function watchScene() {
    unsubscribers.forEach((u) => u());
    let presenceTimer: ReturnType<typeof setTimeout> | undefined;
    unsubscribers = [
        useScene.subscribe((state, prev) => {
            if (state.doc !== prev.doc && !applyingRemote) {
                const diff = diffDocs(prev.doc, state.doc);
                if (!isEmptyDiff(diff)) sendOps(diffToOps(diff));
            }
            if (state.selectedIds !== prev.selectedIds) {
                clearTimeout(presenceTimer);
                presenceTimer = setTimeout(sendPresence, 60);
            }
        }),
        () => clearTimeout(presenceTimer),
    ];
}

export const useCollab = create<CollabState>()((set, get) => {
    function handle(msg: ServerMessage) {
        switch (msg.type) {
            case "welcome": {
                attempt = 0;
                const scene = useScene.getState();
                const roomEmpty = msg.objects.length === 0 && msg.lights.length === 0 && (msg.environment ?? "none") === "none" && !msg.animation?.tracks.length;
                if (seedOnWelcome && roomEmpty) {
                    // A new room starts with the sharer's scene.
                    const diff = diffDocs({ ...scene.doc, objects: [], lights: [], environment: "none", animation: emptyAnimation() }, scene.doc);
                    // Imported meshes go up first, so people joining can load them.
                    const hashes = meshHashes(scene.doc);
                    if (!isEmptyDiff(diff)) {
                        if (hashes.length) void uploadMeshes(hashes).catch(() => {}).finally(() => sendOps(diffToOps(diff)));
                        else sendOps(diffToOps(diff));
                    }
                } else {
                    applyRemote(() => {
                        scene.applyRemote(syncDiff(scene.doc, msg.objects, msg.lights, msg.environment ?? "none", msg.animation ?? emptyAnimation()));
                        // Edits made while offline aren't in the room's copy yet; keep them.
                        for (const ops of pending.values()) useScene.getState().applyRemote(opsToDiff(ops));
                    });
                }
                seedOnWelcome = false;
                for (const [id, ops] of pending) send({ type: "ops", id, ops });
                sendPresence();
                set({ status: "live", you: msg.you, peers: Object.fromEntries(msg.peers.map((p) => [p.id, p])), error: null });
                send({ type: "listVersions" });
                publishChat(msg.chat ?? [], true);
                return;
            }
            case "chat":
                publishChat([msg.turn], false);
                return;
            case "versions":
                set({ versions: msg.versions });
                return;
            case "version": {
                if (get().restoring !== msg.id) return;
                const scene = useScene.getState();
                // A normal, undoable local edit, so it syncs to everyone.
                scene.replaceDoc({ ...scene.doc, objects: msg.objects, lights: msg.lights });
                set({ restoring: null });
                return;
            }
            case "ops":
                applyRemote(() => useScene.getState().applyRemote(opsToDiff(msg.ops)));
                return;
            case "ack":
                pending.delete(msg.id);
                return;
            case "peer":
                set((s) => ({ peers: { ...s.peers, [msg.peer.id]: msg.peer } }));
                return;
            case "leave":
                set((s) => {
                    const peers = { ...s.peers };
                    delete peers[msg.id];
                    return { peers };
                });
                return;
            case "error":
                console.warn("Room:", msg.error);
                set({ error: msg.error });
                return;
            case "pong":
                return;
        }
    }

    function connect() {
        const { roomId, name } = get();
        if (!roomId) return;
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${proto}//${location.host}/api/rooms/${roomId}?name=${encodeURIComponent(name || "Guest")}`);
        socket = ws;
        ws.onmessage = (e) => {
            if (socket !== ws) return;
            try {
                handle(JSON.parse(e.data) as ServerMessage);
            } catch (err) {
                console.warn("Bad room message", err);
            }
        };
        ws.onclose = (e) => {
            if (socket !== ws) return;
            socket = null;
            clearInterval(pingTimer);
            if (!get().roomId) return;
            if (e.code === 1008 || attempt >= RETRY_MS.length * 3) {
                set({ status: "error", error: "Lost the connection to the room." });
                return;
            }
            set({ status: "reconnecting" });
            retryTimer = setTimeout(connect, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
        };
        clearInterval(pingTimer);
        pingTimer = setInterval(() => send({ type: "ping" }), PING_MS);
    }

    return {
        status: "off",
        roomId: null,
        you: null,
        peers: {},
        error: null,
        name: storedName(),
        versions: [],
        restoring: null,

        saveVersion: (label) => send({ type: "saveVersion", ...(label?.trim() ? { label: label.trim().slice(0, 60) } : {}) }),
        listVersions: () => send({ type: "listVersions" }),
        restoreVersion: (id) => {
            set({ restoring: id });
            send({ type: "getVersion", id });
        },

        join: (roomId, options = {}) => {
            if (!ROOM_ID.test(roomId)) {
                set({ status: "error", error: "That room link isn't valid." });
                return;
            }
            get().leave();
            try {
                // Keep the solo scene so joining a room never loses it.
                const solo = localStorage.getItem("shapeshift-scene");
                if (solo && !options.seed) localStorage.setItem(BACKUP_KEY, solo);
            } catch {
                // Storage is optional.
            }
            seedOnWelcome = !!options.seed;
            attempt = 0;
            set({ status: "connecting", roomId, error: null, peers: {}, you: null });
            setRoomInUrl(roomId);
            watchScene();
            connect();
        },

        share: () => {
            const current = get().roomId;
            if (current && get().status !== "error") return roomLink(current);
            const roomId = nanoid(12).replace(/[^A-Za-z0-9_-]/g, "x");
            get().join(roomId, { seed: true });
            return roomLink(roomId);
        },

        leave: (options = {}) => {
            clearTimeout(retryTimer);
            clearInterval(pingTimer);
            unsubscribers.forEach((u) => u());
            unsubscribers = [];
            pending.clear();
            const ws = socket;
            socket = null;
            ws?.close(1000, "Left");
            if (get().roomId) setRoomInUrl(null);
            set({ status: "off", roomId: null, you: null, peers: {}, error: null, versions: [], restoring: null });
            publishChat([], true);
            if (options.restore) {
                try {
                    const solo = localStorage.getItem(BACKUP_KEY);
                    const doc = solo ? parseSceneFile(solo) : null;
                    if (doc) useScene.getState().load(doc);
                    localStorage.removeItem(BACKUP_KEY);
                } catch {
                    // Nothing to restore.
                }
            }
        },

        // Throttled to about 15 updates a second, always ending on the latest spot.
        moveCursor: (next) => {
            if (get().status !== "live") return;
            cursor = next ? (next.map((v) => Math.round(v * 1000) / 1000) as [number, number, number]) : null;
            clearTimeout(cursorTimer);
            const wait = CURSOR_MS - (Date.now() - lastCursorSent);
            const flush = () => {
                lastCursorSent = Date.now();
                sendPresence();
            };
            if (wait <= 0) flush();
            else cursorTimer = setTimeout(flush, wait);
        },

        rename: (raw) => {
            const name = raw.trim().slice(0, ROOM_LIMITS.nameChars);
            if (!name) return;
            try {
                localStorage.setItem(NAME_KEY, name);
            } catch {
                // Storage is optional.
            }
            set((s) => ({ name, you: s.you ? { ...s.you, name } : s.you }));
            send({ type: "rename", name });
        },
    };
});

// Joins the room in the page URL, if there is one.
export function joinRoomFromUrl() {
    const room = new URL(location.href).searchParams.get("room");
    if (room) useCollab.getState().join(room);
}
