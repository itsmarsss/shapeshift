import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAccounts } from "./accounts";
import { handleBilling } from "./billing";
import { handleUsage } from "./usage";
import { signPayload, verifySignature } from "./stripe";
import { testDatabase } from "./test/d1";

const SECRET = "whsec_test";

function env(configured = true) {
    return {
        DB: testDatabase(),
        CHAT_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
        ...(configured
            ? { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PRICE_MONTHLY: "price_month", STRIPE_PRICE_YEARLY: "price_year" }
            : {}),
    } as unknown as Env;
}

const req = (path: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) =>
    new Request(`http://localhost:5173${path}`, {
        method: init.method ?? "GET",
        body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
        headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
    });

async function signIn(e: Env, email: string) {
    const start = (await (await handleAccounts(req("/api/auth/start", { method: "POST", body: { email } }), e))!.json()) as { devCode: string };
    const res = (await handleAccounts(req("/api/auth/verify", { method: "POST", body: { email, code: start.devCode } }), e))!;
    return res.headers.get("set-cookie")!.split(";")[0];
}

// A pretend Stripe API that records what was asked of it.
let calls: { method: string; path: string; params: URLSearchParams }[] = [];
let subscriptions: Record<string, unknown>[] = [];
beforeEach(() => {
    calls = [];
    subscriptions = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string, init: RequestInit) => {
            const url = new URL(input);
            const params = init.method === "POST" ? new URLSearchParams(init.body as URLSearchParams) : url.searchParams;
            const path = url.pathname.replace("/v1", "");
            calls.push({ method: init.method ?? "GET", path, params });
            if (path === "/customers") return Response.json({ id: "cus_1" });
            if (path === "/checkout/sessions") return Response.json({ url: "https://checkout.stripe.com/c/pay/cs_1" });
            if (path === "/billing_portal/sessions") return Response.json({ url: "https://billing.stripe.com/p/session/1" });
            if (path === "/subscriptions") return Response.json({ data: subscriptions });
            return Response.json({ error: { message: "nope" } }, { status: 404 });
        })
    );
});
afterEach(() => vi.unstubAllGlobals());

async function deliver(e: Env, event: unknown, signature?: string) {
    const body = JSON.stringify(event);
    return (await handleBilling(req("/api/billing/webhook", { method: "POST", body, headers: { "stripe-signature": signature ?? (await signPayload(body, SECRET)) } }), e))!;
}

const plan = async (e: Env, cookie: string) => (await (await handleUsage(req("/api/usage", { cookie }), e))!.json()) as { plan: string; status: string | null; renewsAt: number | null };

describe("billing", () => {
    it("says whether Pro can be bought", async () => {
        expect(await (await handleBilling(req("/api/billing"), env()))!.json()).toEqual({ available: true });
        const off = env(false);
        expect(await (await handleBilling(req("/api/billing"), off))!.json()).toEqual({ available: false });
        expect((await handleBilling(req("/api/billing/checkout", { method: "POST", body: {} }), off))!.status).toBe(503);
    });

    it("starts a checkout for the signed-in person, reusing their customer", async () => {
        const e = env();
        expect((await handleBilling(req("/api/billing/checkout", { method: "POST", body: {} }), e))!.status).toBe(401);
        const cookie = await signIn(e, "pay@example.com");
        const res = (await handleBilling(req("/api/billing/checkout", { method: "POST", body: { interval: "year" }, cookie }), e))!;
        expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_1" });
        const session = calls.find((c) => c.path === "/checkout/sessions")!.params;
        expect(session.get("mode")).toBe("subscription");
        expect(session.get("customer")).toBe("cus_1");
        expect(session.get("line_items[0][price]")).toBe("price_year");
        expect(session.get("success_url")).toBe("http://localhost:5173/pricing?upgraded=1");

        await handleBilling(req("/api/billing/checkout", { method: "POST", body: { interval: "month" }, cookie }), e);
        expect(calls.filter((c) => c.path === "/customers")).toHaveLength(1);
        expect(calls.filter((c) => c.path === "/checkout/sessions")[1].params.get("line_items[0][price]")).toBe("price_month");
    });

    it("upgrades and downgrades from signed webhooks", async () => {
        const e = env();
        const cookie = await signIn(e, "sub@example.com");
        await handleBilling(req("/api/billing/checkout", { method: "POST", body: {}, cookie }), e);

        subscriptions = [{ id: "sub_1", customer: "cus_1", status: "active", items: { data: [{ current_period_end: 1_900_000_000 }] } }];
        const user = (await e.DB.prepare("SELECT id FROM users WHERE email = 'sub@example.com'").first<{ id: string }>())!;
        const done = await deliver(e, { type: "checkout.session.completed", data: { object: { customer: "cus_1", client_reference_id: user.id } } });
        expect(done.status).toBe(200);
        expect(await plan(e, cookie)).toMatchObject({ plan: "pro", status: "active", renewsAt: 1_900_000_000_000 });

        subscriptions = [{ ...subscriptions[0], cancel_at_period_end: true }];
        await deliver(e, { type: "customer.subscription.updated", data: { object: { customer: "cus_1" } } });
        expect(await plan(e, cookie)).toMatchObject({ plan: "pro", status: "canceling" });

        subscriptions = [{ ...subscriptions[0], status: "canceled" }];
        await deliver(e, { type: "customer.subscription.deleted", data: { object: { customer: "cus_1" } } });
        expect(await plan(e, cookie)).toMatchObject({ plan: "free", status: "canceled" });
    });

    it("ignores webhooks that aren't signed by Stripe", async () => {
        const e = env();
        const res = await deliver(e, { type: "customer.subscription.updated", data: { object: { customer: "cus_1" } } }, "t=1,v1=deadbeef");
        expect(res.status).toBe(400);
        expect(calls).toHaveLength(0);
    });

    it("refuses old signatures so they can't be replayed", async () => {
        const body = "{}";
        const old = await signPayload(body, SECRET, Date.now() - 600_000);
        expect(await verifySignature(body, old, SECRET)).toBe(false);
        expect(await verifySignature(body, await signPayload(body, SECRET), SECRET)).toBe(true);
        expect(await verifySignature(body, await signPayload(body, "whsec_other"), SECRET)).toBe(false);
    });

    it("opens the billing portal only for people with a billing account", async () => {
        const e = env();
        const cookie = await signIn(e, "portal@example.com");
        expect((await handleBilling(req("/api/billing/portal", { method: "POST", cookie }), e))!.status).toBe(400);
        await handleBilling(req("/api/billing/checkout", { method: "POST", body: {}, cookie }), e);
        const res = (await handleBilling(req("/api/billing/portal", { method: "POST", cookie }), e))!;
        expect(await res.json()).toEqual({ url: "https://billing.stripe.com/p/session/1" });
    });
});
