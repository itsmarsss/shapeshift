import { PLANS, STEPS_PER_PROMPT, type PlanId, type Usage } from "@shapeshift/shared/billing/plans";
import { currentUser, fail, json, sha256, type User } from "./auth";

// Monthly allowances for the assistant. Signed-in people are counted by
// account; everyone else by a hash of their network address, so the raw
// address is never stored.

export type Subject = { key: string; plan: PlanId; user: User | null };

export function period(at = Date.now()) {
    const d = new Date(at);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function nextReset(at = Date.now()) {
    const d = new Date(at);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

export async function subjectFor(env: Env, request: Request): Promise<Subject> {
    const user = await currentUser(env, request);
    if (user) return { key: `user:${user.id}`, plan: user.plan === "pro" ? "pro" : "free", user };
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    return { key: `ip:${await sha256(`shapeshift:${ip}`)}`, plan: "guest", user: null };
}

// Counts one model call. A fresh prompt also counts toward the prompt limit;
// the steps after it only toward a looser cap on model calls. Returns false,
// without counting anything, when the allowance is used up.
export async function spend(env: Env, subject: Subject, fresh: boolean): Promise<boolean> {
    const plan = PLANS[subject.plan];
    const add = fresh ? 1 : 0;
    const row = await env.DB.prepare(
        `INSERT INTO usage (subject, period, prompts, steps) VALUES (?1, ?2, ?3, 1)
         ON CONFLICT (subject, period) DO UPDATE SET prompts = prompts + ?3, steps = steps + 1
         WHERE usage.prompts + ?3 <= ?4 AND usage.steps + 1 <= ?5
         RETURNING prompts`
    )
        .bind(subject.key, period(), add, plan.prompts, plan.prompts * STEPS_PER_PROMPT)
        .first<{ prompts: number }>();
    return row !== null;
}

// Gives back a call that failed on our side, so outages don't eat allowances.
export async function refund(env: Env, subject: Subject, fresh: boolean) {
    await env.DB.prepare("UPDATE usage SET prompts = MAX(0, prompts - ?3), steps = MAX(0, steps - 1) WHERE subject = ?1 AND period = ?2")
        .bind(subject.key, period(), fresh ? 1 : 0)
        .run();
}

export async function usageFor(env: Env, subject: Subject): Promise<Usage> {
    const row = await env.DB.prepare("SELECT prompts FROM usage WHERE subject = ?1 AND period = ?2").bind(subject.key, period()).first<{ prompts: number }>();
    const billing = subject.user
        ? await env.DB.prepare("SELECT plan_status, plan_renews_at FROM users WHERE id = ?1")
              .bind(subject.user.id)
              .first<{ plan_status: string | null; plan_renews_at: number | null }>()
        : null;
    return {
        plan: subject.plan,
        prompts: { used: row?.prompts ?? 0, limit: PLANS[subject.plan].prompts },
        resetsAt: nextReset(),
        status: billing?.plan_status ?? null,
        renewsAt: billing?.plan_renews_at ?? null,
    };
}

const resetDate = () => new Date(nextReset()).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

// What to tell someone who has used up their prompts.
export function quotaMessage(plan: PlanId) {
    const { prompts } = PLANS[plan];
    if (plan === "guest") return `You've used the ${prompts} assistant prompts for visitors this month. Sign in to get ${PLANS.free.prompts} a month, free.`;
    if (plan === "free") return `You've used your ${prompts} free assistant prompts this month. Upgrade to Pro for ${PLANS.pro.prompts} a month, or wait until ${resetDate()}.`;
    return `You've used all ${prompts} assistant prompts this month. They start over on ${resetDate()}.`;
}

// GET /api/usage.
export async function handleUsage(request: Request, env: Env): Promise<Response | null> {
    if (new URL(request.url).pathname !== "/api/usage") return null;
    if (request.method !== "GET") return fail(405, "Method not allowed.");
    return json(await usageFor(env, await subjectFor(env, request)));
}
