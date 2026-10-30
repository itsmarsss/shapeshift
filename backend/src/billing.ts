import type { BillingInterval } from "@shapeshift/shared/billing/plans";
import { currentUser, fail, json, type User } from "./auth";
import { stripe, StripeError, verifySignature } from "./stripe";

// Pro subscriptions through Stripe Checkout and the Stripe customer portal.
// Nothing about cards ever touches this server; Stripe hosts those pages and
// tells us what changed through signed webhooks.

type Subscription = {
    id: string;
    customer: string;
    status: string;
    cancel_at_period_end?: boolean;
    current_period_end?: number;
    items?: { data?: { current_period_end?: number }[] };
};

// Past-due keeps Pro while Stripe retries the card, so a failed payment
// doesn't cut someone off mid-project.
const PAID = ["active", "trialing", "past_due"];

export function billingAvailable(env: Env) {
    return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_MONTHLY && env.STRIPE_PRICE_YEARLY);
}

async function customerFor(env: Env, user: User): Promise<string> {
    const row = await env.DB.prepare("SELECT stripe_customer_id FROM users WHERE id = ?1").bind(user.id).first<{ stripe_customer_id: string | null }>();
    if (row?.stripe_customer_id) return row.stripe_customer_id;
    const customer = await stripe<{ id: string }>(env, "POST", "/customers", { email: user.email, name: user.name ?? undefined, "metadata[user_id]": user.id });
    await env.DB.prepare("UPDATE users SET stripe_customer_id = ?1 WHERE id = ?2 AND stripe_customer_id IS NULL").bind(customer.id, user.id).run();
    // Two checkouts at once could both create one; keep whichever was saved.
    const saved = await env.DB.prepare("SELECT stripe_customer_id FROM users WHERE id = ?1").bind(user.id).first<{ stripe_customer_id: string }>();
    return saved?.stripe_customer_id ?? customer.id;
}

async function checkout(env: Env, request: Request, user: User): Promise<Response> {
    if (user.plan === "pro") return fail(409, "You're already on Pro. Manage it from the billing page.", "already_pro");
    const body = (await request.json().catch(() => ({}))) as { interval?: BillingInterval };
    const price = body.interval === "year" ? env.STRIPE_PRICE_YEARLY : env.STRIPE_PRICE_MONTHLY;
    const origin = new URL(request.url).origin;
    const session = await stripe<{ url: string }>(env, "POST", "/checkout/sessions", {
        mode: "subscription",
        customer: await customerFor(env, user),
        client_reference_id: user.id,
        "line_items[0][price]": price,
        "line_items[0][quantity]": 1,
        "subscription_data[metadata][user_id]": user.id,
        allow_promotion_codes: true,
        success_url: `${origin}/pricing?upgraded=1`,
        cancel_url: `${origin}/pricing`,
    });
    return json({ url: session.url });
}

async function portal(env: Env, request: Request, user: User): Promise<Response> {
    const row = await env.DB.prepare("SELECT stripe_customer_id FROM users WHERE id = ?1").bind(user.id).first<{ stripe_customer_id: string | null }>();
    if (!row?.stripe_customer_id) return fail(400, "There's no billing account yet. Upgrade first.", "no_customer");
    const session = await stripe<{ url: string }>(env, "POST", "/billing_portal/sessions", {
        customer: row.stripe_customer_id,
        return_url: `${new URL(request.url).origin}/pricing`,
    });
    return json({ url: session.url });
}

// Sets a person's plan from all of their Stripe subscriptions. Reading the
// current state, rather than trusting each event, keeps it right when events
// arrive out of order or someone ends up with two subscriptions.
export async function syncCustomer(env: Env, customer: string) {
    const { data } = await stripe<{ data: Subscription[] }>(env, "GET", "/subscriptions", { customer, status: "all", limit: 10 });
    const best = data.find((s) => PAID.includes(s.status)) ?? data[0];
    const pro = Boolean(best && PAID.includes(best.status));
    const status = best ? (best.cancel_at_period_end && pro ? "canceling" : best.status) : null;
    const end = best?.current_period_end ?? best?.items?.data?.[0]?.current_period_end;
    await env.DB.prepare("UPDATE users SET plan = ?1, plan_status = ?2, plan_renews_at = ?3 WHERE stripe_customer_id = ?4")
        .bind(pro ? "pro" : "free", status, end ? end * 1000 : null, customer)
        .run();
}

type StripeEvent = { type: string; data: { object: { customer?: string; client_reference_id?: string } } };

async function webhook(env: Env, request: Request): Promise<Response> {
    if (!env.STRIPE_WEBHOOK_SECRET) return fail(503, "Billing isn't set up on this server.", "not_configured");
    const payload = await request.text();
    if (!(await verifySignature(payload, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET))) return fail(400, "Bad signature.");
    const event = JSON.parse(payload) as StripeEvent;
    const { customer, client_reference_id: userId } = event.data.object;

    if (event.type === "checkout.session.completed" && customer && userId) {
        // Links the customer in case the checkout started before it was saved.
        await env.DB.prepare("UPDATE users SET stripe_customer_id = ?1 WHERE id = ?2 AND stripe_customer_id IS NULL").bind(customer, userId).run();
    }
    if (customer && (event.type === "checkout.session.completed" || event.type.startsWith("customer.subscription."))) {
        await syncCustomer(env, customer);
    }
    return json({ received: true });
}

// /api/billing (what's on offer), /api/billing/checkout, /api/billing/portal
// and /api/billing/webhook. Returns null for other paths.
export async function handleBilling(request: Request, env: Env): Promise<Response | null> {
    const { pathname } = new URL(request.url);
    if (pathname !== "/api/billing" && !pathname.startsWith("/api/billing/")) return null;
    if (pathname === "/api/billing") return json({ available: billingAvailable(env) });

    try {
        if (pathname === "/api/billing/webhook") return request.method === "POST" ? await webhook(env, request) : fail(405, "Method not allowed.");
        if (request.method !== "POST") return fail(405, "Method not allowed.");
        if (!billingAvailable(env)) return fail(503, "Pro isn't available yet.", "not_configured");

        const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
        const { success } = await env.CHAT_LIMITER.limit({ key: `billing:${ip}` });
        if (!success) return fail(429, "Too many requests. Wait a moment and try again.", "rate_limited");

        const user = await currentUser(env, request);
        if (!user) return fail(401, "Sign in first.", "unauthorized");
        if (pathname === "/api/billing/checkout") return await checkout(env, request, user);
        if (pathname === "/api/billing/portal") return await portal(env, request, user);
        return fail(404, "Not found.", "not_found");
    } catch (err) {
        if (!(err instanceof StripeError)) throw err;
        console.error("Stripe request failed", err.message);
        // Webhooks answer with an error so Stripe tries again later.
        return fail(502, "Billing is having trouble right now. Try again in a moment.", "upstream");
    }
}
