import { create } from "zustand";
import { useScene } from "../scene/store";
import { useCollab } from "../collab/session";
import { takeSnapshot } from "../viewport/snapshot";
import type { Usage } from "@shapeshift/shared/billing/plans";
import { api, ApiError, type CloudScene, type User } from "./api";
import { track } from "../telemetry";

type SaveState = "idle" | "saving" | "saved" | "error";

type AccountState = {
    user: User | null;
    loaded: boolean;
    showSignIn: boolean;
    showScenes: boolean;
    // The cloud scene the editor is linked to; changes save to it on their own.
    cloudId: string | null;
    cloudTitle: string;
    save: SaveState;
    saveError: string | null;
    scenes: CloudScene[];
    // This month's assistant allowance, for signed-in people and visitors alike.
    usage: Usage | null;
    load: () => Promise<void>;
    refreshUsage: () => Promise<void>;
    setShowSignIn: (v: boolean) => void;
    setShowScenes: (v: boolean) => void;
    signedIn: (user: User) => void;
    signOut: () => Promise<void>;
    saveToCloud: (title?: string) => Promise<void>;
    refreshScenes: () => Promise<void>;
    openScene: (id: string) => Promise<void>;
    renameScene: (id: string, title: string) => Promise<void>;
    deleteScene: (id: string) => Promise<void>;
    setShared: (id: string, shared: boolean) => Promise<string | null>;
    setListed: (id: string, listed: boolean) => Promise<void>;
    unlink: () => void;
};

const LINK_KEY = "shapeshift-cloud-scene";
// Remembers that this browser was signed in, so opening the app can show the
// scene gallery straight away instead of waiting on the server to say so.
const SIGNED_IN_KEY = "shapeshift-signed-in";
const AUTOSAVE_MS = 2500;

function thumbnail() {
    return takeSnapshot({ view: "iso", maxSize: 360, clean: true })?.dataUrl;
}

function remember(id: string | null, title = "") {
    try {
        if (id) localStorage.setItem(LINK_KEY, JSON.stringify({ id, title }));
        else localStorage.removeItem(LINK_KEY);
    } catch {
        // Optional.
    }
}

function rememberSignedIn(on: boolean) {
    try {
        if (on) localStorage.setItem(SIGNED_IN_KEY, "1");
        else localStorage.removeItem(SIGNED_IN_KEY);
    } catch {
        // Optional.
    }
}

export function seemsSignedIn() {
    try {
        return localStorage.getItem(SIGNED_IN_KEY) === "1";
    } catch {
        return false;
    }
}

function remembered(): { id: string; title: string } | null {
    try {
        const raw = localStorage.getItem(LINK_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

const message = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong.");

export const useAccount = create<AccountState>()((set, get) => ({
    user: null,
    loaded: false,
    showSignIn: false,
    showScenes: false,
    cloudId: null,
    cloudTitle: "",
    save: "idle",
    saveError: null,
    scenes: [],
    usage: null,

    load: async () => {
        void get().refreshUsage();
        try {
            const { user } = await api.me();
            const link = user ? remembered() : null;
            rememberSignedIn(Boolean(user));
            set({ user, loaded: true, cloudId: link?.id ?? null, cloudTitle: link?.title ?? "" });
        } catch {
            set({ loaded: true });
        }
    },
    refreshUsage: async () => {
        try {
            set({ usage: await api.usage() });
        } catch {
            // Shown when it's known; nothing depends on it.
        }
    },
    setShowSignIn: (showSignIn) => set({ showSignIn }),
    setShowScenes: (showScenes) => {
        set({ showScenes });
        if (showScenes) void get().refreshScenes();
    },
    signedIn: (user) => {
        rememberSignedIn(true);
        set({ user, showSignIn: false });
        void get().refreshUsage();
    },
    signOut: async () => {
        await api.signOut().catch(() => {});
        remember(null);
        rememberSignedIn(false);
        set({ user: null, cloudId: null, cloudTitle: "", scenes: [], save: "idle", showScenes: false });
        void get().refreshUsage();
    },

    saveToCloud: async (title) => {
        const { cloudId, user } = get();
        if (!user) return set({ showSignIn: true });
        const doc = useScene.getState().doc;
        set({ save: "saving", saveError: null });
        try {
            if (cloudId) {
                const { scene } = await api.update(cloudId, { doc, thumbnail: thumbnail(), ...(title ? { title } : {}) });
                set({ save: "saved", cloudTitle: scene.title });
                remember(scene.id, scene.title);
            } else {
                const { scene } = await api.create(title || "Untitled scene", doc, thumbnail());
                set({ save: "saved", cloudId: scene.id, cloudTitle: scene.title });
                remember(scene.id, scene.title);
            }
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
                // It was deleted elsewhere; save it as a new scene instead.
                set({ cloudId: null });
                return get().saveToCloud(title);
            }
            set({ save: "error", saveError: message(err) });
        }
    },

    refreshScenes: async () => {
        try {
            const { scenes } = await api.scenes();
            set({ scenes });
        } catch (err) {
            set({ saveError: message(err) });
        }
    },

    openScene: async (id) => {
        const { scene, doc } = await api.open(id);
        // Opening is a normal edit, so it can be undone.
        useScene.getState().replaceDoc(doc);
        remember(scene.id, scene.title);
        set({ cloudId: scene.id, cloudTitle: scene.title, save: "saved", showScenes: false });
    },

    renameScene: async (id, title) => {
        const { scene } = await api.update(id, { title });
        set((s) => ({ scenes: s.scenes.map((x) => (x.id === id ? scene : x)), ...(s.cloudId === id ? { cloudTitle: scene.title } : {}) }));
        if (get().cloudId === id) remember(id, scene.title);
    },

    deleteScene: async (id) => {
        await api.remove(id);
        set((s) => ({ scenes: s.scenes.filter((x) => x.id !== id), ...(s.cloudId === id ? { cloudId: null, cloudTitle: "", save: "idle" } : {}) }));
        if (get().cloudId === null) remember(null);
    },

    setShared: async (id, shared) => {
        if (shared) track("share_created");
        const { scene } = shared ? await api.publish(id) : await api.unpublish(id);
        set((s) => ({ scenes: s.scenes.map((x) => (x.id === id ? scene : x)) }));
        return scene.publicSlug ? `${location.origin}/s/${scene.publicSlug}` : null;
    },

    // Ticks right away; goes back if the server says no.
    setListed: async (id, listed) => {
        const mark = (value: boolean) => set((s) => ({ scenes: s.scenes.map((x) => (x.id === id ? { ...x, listed: value } : x)) }));
        mark(listed);
        try {
            const { scene } = await api.setListed(id, listed);
            set((s) => ({ scenes: s.scenes.map((x) => (x.id === id ? scene : x)) }));
        } catch (err) {
            mark(!listed);
            set({ saveError: message(err) });
        }
    },

    unlink: () => {
        remember(null);
        set({ cloudId: null, cloudTitle: "", save: "idle" });
    },
}));

// Once a scene is linked to the cloud, save it a moment after each change.
let timer: ReturnType<typeof setTimeout> | undefined;
useScene.subscribe((state, prev) => {
    if (state.doc === prev.doc) return;
    const { cloudId, user, unlink } = useAccount.getState();
    if (!cloudId || !user) return;
    // A shared room's scene isn't yours to overwrite your cloud copy with.
    if (useCollab.getState().status !== "off") return;
    // Starting a new, empty scene leaves the saved one alone.
    const empty = (d: typeof state.doc) => d.objects.length === 0 && d.lights.length === 0;
    if (empty(state.doc) && !empty(prev.doc)) {
        clearTimeout(timer);
        unlink();
        return;
    }
    clearTimeout(timer);
    useAccount.setState({ save: "idle" });
    timer = setTimeout(() => void useAccount.getState().saveToCloud(), AUTOSAVE_MS);
});
