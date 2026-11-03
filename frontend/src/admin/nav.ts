import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { api } from "./api";

// Where the admin page is, kept in the address (/admin?s=people&id=…) so a
// link opens the same view and Back works.

export type Route = { s: string; id: string | null };

const read = (): Route => {
    const params = new URLSearchParams(location.search);
    return { s: params.get("s") || "dashboard", id: params.get("id") };
};

export const useRoute = create<Route>()(() => read());
window.addEventListener("popstate", () => useRoute.setState(read()));

export function go(s: string, id: string | null = null) {
    const url = new URL(location.href);
    url.searchParams.set("s", s);
    if (id) url.searchParams.set("id", id);
    else url.searchParams.delete("id");
    history.pushState(null, "", url.pathname + url.search);
    useRoute.setState({ s, id });
    document.querySelector("[data-scroller]")?.scrollTo({ top: 0 });
}

export const linkTo = (s: string, id?: string | null) => `/admin?s=${s}${id ? `&id=${encodeURIComponent(id)}` : ""}`;

// Loads something for a section, and reloads it after a change. The last
// result stays up while the next one loads, so lists dim instead of blinking.
export function useLoad<T>(path: string | null) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(!!path);
    const latest = useRef(path);
    const reload = useCallback(() => {
        latest.current = path;
        if (!path) return;
        setLoading(true);
        api<T>(path)
            .then((d) => {
                if (latest.current !== path) return;
                setData(d);
                setError(null);
            })
            .catch((e: unknown) => latest.current === path && setError(e instanceof Error ? e.message : "Couldn't load this."))
            .finally(() => latest.current === path && setLoading(false));
    }, [path]);
    useEffect(reload, [reload]);
    return { data, error, loading, reload };
}

// State that outlives the section, so filters are still set after opening
// someone and coming back.
const kept = new Map<string, unknown>();
export function useKept<T>(key: string, initial: T) {
    const [value, setValue] = useState<T>(() => (kept.has(key) ? (kept.get(key) as T) : initial));
    const set = useCallback(
        (next: T) => {
            kept.set(key, next);
            setValue(next);
        },
        [key],
    );
    return [value, set] as const;
}

export function useDebounced<T>(value: T, ms = 250) {
    const [settled, setSettled] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setSettled(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return settled;
}

// Short notes after an action, like "Signed out on 2 devices".
export type Toast = { id: number; text: string; tone: "good" | "bad" };
export const useToasts = create<{ toasts: Toast[] }>()(() => ({ toasts: [] }));
let nextToast = 1;
export function toast(text: string, tone: Toast["tone"] = "good") {
    const id = nextToast++;
    useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }));
    setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
}

// Runs an admin action and says how it went.
export async function run(path: string, done: string, init: { method?: string; body?: unknown } = {}) {
    try {
        await api(path, { method: init.method ?? "POST", body: init.body });
        toast(done);
        return true;
    } catch (e) {
        toast(e instanceof Error ? e.message : "That didn't work.", "bad");
        return false;
    }
}

export { ago, bytes, day, hue, initials, when } from "../ui/format";
