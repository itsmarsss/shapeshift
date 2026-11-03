import { useSettings } from "./settings/store";

// Anonymous product numbers (how long until a first creation, how often
// shares get remixed) and crash reports. No cookies and nothing that says who
// someone is: just a random id kept in this browser, the event's name and a
// number or short label. Settings → Data turns it off.

export type EventName =
    | "app_open"
    | "first_shape"
    | "template_used"
    | "assistant_prompt"
    | "share_created"
    | "remix_opened"
    | "explore_listed"
    | "hands_on"
    | "export"
    | "upgrade_clicked";

const ID_KEY = "shapeshift-anon-id";
const FIRST_OPEN_KEY = "shapeshift-first-open";

function anonId() {
    try {
        let id = localStorage.getItem(ID_KEY);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(ID_KEY, id);
        }
        return id;
    } catch {
        return "unknown";
    }
}

function enabled() {
    return useSettings.getState().shareUsage && !import.meta.env.DEV;
}

function send(path: string, body: object) {
    const data = JSON.stringify(body);
    try {
        if (navigator.sendBeacon?.(path, new Blob([data], { type: "application/json" }))) return;
    } catch {
        // Fall through to fetch.
    }
    void fetch(path, { method: "POST", body: data, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
}

// `label` is a short word like a template's name or an export format;
// `value` a number like seconds.
// Things in the app that want to know an event happened (like the first-steps
// checklist), whether or not usage sharing is on. Nothing here leaves the browser.
export const eventListeners = new Set<(event: EventName) => void>();

export function track(event: EventName, label = "", value = 0) {
    for (const listener of eventListeners) listener(event);
    if (!enabled()) return;
    send("/api/events", { event, label: label.slice(0, 40), value, id: anonId() });
}

// Seconds since this browser first opened ShapeShift, for "time to first creation".
export function secondsSinceFirstOpen() {
    try {
        const first = Number(localStorage.getItem(FIRST_OPEN_KEY));
        return first ? Math.round((Date.now() - first) / 1000) : 0;
    } catch {
        return 0;
    }
}

export function trackOpen() {
    let returning = false;
    try {
        returning = Boolean(localStorage.getItem(FIRST_OPEN_KEY));
        if (!returning) localStorage.setItem(FIRST_OPEN_KEY, String(Date.now()));
    } catch {
        // Optional.
    }
    track("app_open", returning ? "returning" : "new");
}

// "Chrome 140 · macOS": enough to tell a browser-specific bug, nothing more.
export function browserLabel(ua = navigator.userAgent) {
    // Order matters: Edge and Opera also say Chrome, and Chrome also says Safari.
    const found: [string, RegExp][] = [
        ["Edge", /Edg\/(\d+)/],
        ["Opera", /OPR\/(\d+)/],
        ["Samsung Internet", /SamsungBrowser\/(\d+)/],
        ["Firefox", /Firefox\/(\d+)/],
        ["Chrome", /Chrome\/(\d+)/],
        ["Safari", /Version\/(\d+).*Safari/],
    ];
    const hit = found.map(([name, re]) => [name, ua.match(re)?.[1]] as const).find(([, version]) => version);
    const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "";
    const browser = hit ? `${hit[0]} ${hit[1]}` : "Other browser";
    return os ? `${browser} · ${os}` : browser;
}

// Crashes go to the server's logs and the admin page's Health section, with
// the same anonymous id as the usage numbers (to count browsers, not people).
export function reportError(error: unknown, where: string) {
    if (!enabled()) return;
    const e = error instanceof Error ? error : new Error(String(error));
    send("/api/errors", {
        where,
        message: e.message.slice(0, 300),
        stack: (e.stack ?? "").split("\n").slice(0, 6).join("\n").slice(0, 1200),
        page: location.pathname,
        browser: browserLabel(),
        id: anonId(),
    });
}

export function watchErrors() {
    window.addEventListener("error", (e) => reportError(e.error ?? e.message, "window"));
    window.addEventListener("unhandledrejection", (e) => reportError(e.reason, "promise"));
}
