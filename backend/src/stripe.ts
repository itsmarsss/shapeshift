// A small Stripe client over fetch: the few calls billing needs, plus webhook
// signature checks with Web Crypto, so it runs in a Worker without the SDK.

const API = "https://api.stripe.com/v1";

export class StripeError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

type Params = Record<string, string | number | boolean | undefined>;

export async function stripe<T>(env: Env, method: "GET" | "POST", path: string, params: Params = {}): Promise<T> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined) body.set(key, String(value));
    const url = method === "GET" && [...body].length ? `${API}${path}?${body}` : `${API}${path}`;
    const res = await fetch(url, {
        method,
        headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
        body: method === "POST" ? body : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new StripeError(res.status, data.error?.message ?? `Stripe request failed (${res.status})`);
    return data;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(secret: string, text: string) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

function sameText(a: string, b: string) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

// Checks a Stripe-Signature header: "t=<unix seconds>,v1=<hex hmac>,...".
// Old signatures are refused so a captured request can't be replayed later.
export async function verifySignature(payload: string, header: string | null, secret: string, toleranceSeconds = 300, now = Date.now()) {
    if (!header) return false;
    const parts = header.split(",").map((p) => p.split("=") as [string, string]);
    const t = Number(parts.find(([k]) => k === "t")?.[1]);
    const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
    if (!Number.isFinite(t) || !signatures.length) return false;
    if (Math.abs(now / 1000 - t) > toleranceSeconds) return false;
    const expected = await hmac(secret, `${t}.${payload}`);
    return signatures.some((s) => sameText(s, expected));
}

// For tests: signs a payload the way Stripe does.
export async function signPayload(payload: string, secret: string, now = Date.now()) {
    const t = Math.floor(now / 1000);
    return `t=${t},v1=${await hmac(secret, `${t}.${payload}`)}`;
}
