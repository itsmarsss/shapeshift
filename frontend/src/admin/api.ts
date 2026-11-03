// Requests to /api/admin/*, which answer only admins with the right role.
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const res = await fetch(`/api/admin${path}`, {
        method: init?.method ?? "GET",
        headers: init?.body ? { "content-type": "application/json" } : undefined,
        body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong.");
    return data as T;
}
