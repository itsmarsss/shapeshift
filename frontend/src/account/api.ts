import type { SceneDoc } from "../scene/schema";

export type User = { id: string; email: string; name: string | null };
export type CloudScene = { id: string; title: string; size: number; createdAt: number; updatedAt: number; publicSlug: string | null };

export class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    let res: Response;
    try {
        res = await fetch(path, {
            method: init.method ?? "GET",
            credentials: "same-origin",
            headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
    } catch {
        throw new ApiError(0, "network", "Couldn't reach the server. Check your connection.");
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (!res.ok) throw new ApiError(res.status, data.code ?? "error", data.error ?? "Something went wrong.");
    return data as T;
}

export const api = {
    me: () => call<{ user: User | null }>("/api/me"),
    start: (email: string) => call<{ ok: true; devCode?: string }>("/api/auth/start", { method: "POST", body: { email } }),
    verify: (email: string, code: string) => call<{ user: User }>("/api/auth/verify", { method: "POST", body: { email, code } }),
    signOut: () => call<{ ok: true }>("/api/auth/signout", { method: "POST" }),
    rename: (name: string) => call<{ user: User }>("/api/me", { method: "PATCH", body: { name } }),
    scenes: () => call<{ scenes: CloudScene[] }>("/api/scenes"),
    open: (id: string) => call<{ scene: CloudScene; doc: SceneDoc }>(`/api/scenes/${id}`),
    create: (title: string, doc: SceneDoc, thumbnail?: string) => call<{ scene: CloudScene }>("/api/scenes", { method: "POST", body: { title, doc, thumbnail } }),
    update: (id: string, patch: { title?: string; doc?: SceneDoc; thumbnail?: string }) => call<{ scene: CloudScene }>(`/api/scenes/${id}`, { method: "PUT", body: patch }),
    publish: (id: string) => call<{ scene: CloudScene }>(`/api/scenes/${id}/publish`, { method: "POST" }),
    unpublish: (id: string) => call<{ scene: CloudScene }>(`/api/scenes/${id}/publish`, { method: "DELETE" }),
    remove: (id: string) => call<{ ok: true }>(`/api/scenes/${id}`, { method: "DELETE" }),
    thumbnailUrl: (id: string, version: number) => `/api/scenes/${id}/thumbnail?v=${version}`,
};
