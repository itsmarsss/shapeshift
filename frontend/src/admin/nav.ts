import { useCallback, useEffect, useState } from "react";
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

// Loads something for a section, and reloads it after a change.
export function useLoad<T>(path: string | null) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const reload = useCallback(() => {
        if (!path) return;
        api<T>(path)
            .then((d) => {
                setData(d);
                setError(null);
            })
            .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load this."));
    }, [path]);
    useEffect(reload, [reload]);
    return { data, error, reload };
}

export const when = (at: number | null | undefined) => (at ? new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
export const day = (at: number | null | undefined) => (at ? new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—");

export function ago(at: number | null | undefined) {
    if (!at) return "never";
    const s = Math.max(0, (Date.now() - at) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
    return day(at);
}

export const bytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);

export function initials(label: string) {
    const parts = label.split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// A steady colour per person, from their email.
export function hue(text: string) {
    let h = 0;
    for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 65% 55%)`;
}
