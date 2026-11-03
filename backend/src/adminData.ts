import { PLANS, PRO_PRICES } from "@shapeshift/shared/billing/plans";
import type { Role } from "@shapeshift/shared/admin/roles";
import { fileKey, thumbKey } from "./scenes";

// What the admin page reads and changes about people and scenes. admin.ts
// checks who's asking; everything here assumes they're allowed.

const DAY = 86_400_000;
export const PAGE = 50;
const period = () => new Date().toISOString().slice(0, 7);

// Someone's last sign-in or last saved scene, whichever is later.
const ACTIVE = `MAX(COALESCE((SELECT MAX(created_at) FROM sessions WHERE user_id = u.id), 0), COALESCE((SELECT MAX(updated_at) FROM scenes WHERE owner_id = u.id), 0))`;

const USER_SORTS: Record<string, string> = {
    joined: "u.created_at",
    active: "active",
    scenes: "scenes",
    prompts: "prompts",
    email: "u.email",
};

export type UserQuery = { q: string; plan: string; role: string; scenes: string; sort: string; dir: string; page: number };

export async function listUsers(env: Env, query: UserQuery, superusers: Set<string>) {
    const where: string[] = ["(u.email LIKE ?1 OR COALESCE(u.name, '') LIKE ?1)"];
    if (query.plan === "free") where.push("u.plan = 'free'");
    if (query.plan === "pro") where.push("u.plan = 'pro' AND COALESCE(u.plan_status, '') != 'manual'");
    if (query.plan === "given") where.push("u.plan = 'pro' AND u.plan_status = 'manual'");
    if (query.plan === "trouble") where.push("u.plan_status IN ('past_due', 'canceling')");
    if (query.role === "admin") where.push(`(EXISTS (SELECT 1 FROM admins a WHERE a.user_id = u.id) OR u.email IN (${[...superusers].map(() => "?").join(", ") || "''"}))`);
    if (query.scenes === "yes") where.push("EXISTS (SELECT 1 FROM scenes s WHERE s.owner_id = u.id)");
    const order = USER_SORTS[query.sort] ?? "u.created_at";
    const dir = query.dir === "asc" ? "ASC" : "DESC";
    const like = `%${query.q.replace(/[%_]/g, "").slice(0, 100)}%`;
    const params: unknown[] = [like, ...(query.role === "admin" ? [...superusers] : [])];
    const sql = `FROM users u WHERE ${where.join(" AND ")}`;
    // Numbered placeholders after ?1 for the superuser list.
    const numbered = (text: string) => {
        let n = 1;
        return text.replace(/\?(?!\d)/g, () => `?${++n}`);
    };
    const total = await env.DB.prepare(numbered(`SELECT COUNT(*) AS n ${sql}`))
        .bind(...params)
        .first<{ n: number }>();
    const { results } = await env.DB.prepare(
        numbered(`SELECT u.id, u.email, u.name, u.plan, u.plan_status, u.created_at AS joined,
            (SELECT COUNT(*) FROM scenes s WHERE s.owner_id = u.id) AS scenes,
            COALESCE((SELECT prompts FROM usage WHERE subject = 'user:' || u.id AND period = '${period()}'), 0) AS prompts,
            ${ACTIVE} AS active,
            (SELECT role FROM admins a WHERE a.user_id = u.id) AS role
            ${sql} ORDER BY ${order} ${dir}, u.created_at DESC LIMIT ${PAGE} OFFSET ${Math.max(0, query.page) * PAGE}`),
    )
        .bind(...params)
        .all<{ id: string; email: string; name: string | null; plan: string; plan_status: string | null; joined: number; scenes: number; prompts: number; active: number; role: Role | null }>();
    return {
        total: total?.n ?? 0,
        page: query.page,
        pageSize: PAGE,
        users: results.map((u) => ({ ...u, role: superusers.has(u.email) ? ("superuser" as Role) : u.role, active: u.active || null })),
    };
}

export async function getUser(env: Env, id: string, superusers: Set<string>) {
    const user = await env.DB.prepare(
        `SELECT u.id, u.email, u.name, u.plan, u.plan_status, u.plan_renews_at, u.stripe_customer_id, u.created_at AS joined, ${ACTIVE} AS active,
            (SELECT role FROM admins a WHERE a.user_id = u.id) AS role
         FROM users u WHERE u.id = ?1`,
    )
        .bind(id)
        .first<{
            id: string;
            email: string;
            name: string | null;
            plan: string;
            plan_status: string | null;
            plan_renews_at: number | null;
            stripe_customer_id: string | null;
            joined: number;
            active: number;
            role: Role | null;
        }>();
    if (!user) return null;
    const [scenes, sessions, usage, feedback, log] = await Promise.all([
        env.DB.prepare("SELECT id, title, size, created_at, updated_at, public_slug, listed FROM scenes WHERE owner_id = ?1 ORDER BY updated_at DESC").bind(id).all(),
        env.DB.prepare("SELECT created_at, expires_at FROM sessions WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 20").bind(id).all<{ created_at: number; expires_at: number }>(),
        env.DB.prepare("SELECT period, prompts, steps FROM usage WHERE subject = ?1 ORDER BY period DESC LIMIT 6").bind(`user:${id}`).all<{ period: string; prompts: number; steps: number }>(),
        env.DB.prepare("SELECT id, created_at AS at, page, message, has_picture, read_at FROM feedback WHERE user_id = ?1 OR email = ?2 ORDER BY created_at DESC LIMIT 20")
            .bind(id, user.email)
            .all(),
        env.DB.prepare("SELECT at, actor, action, detail FROM admin_log WHERE detail LIKE ?1 ORDER BY at DESC LIMIT 20").bind(`%${user.email}%`).all(),
    ]);
    const now = Date.now();
    const plan = user.plan === "pro" ? "pro" : "free";
    return {
        ...user,
        active: user.active || null,
        role: superusers.has(user.email) ? ("superuser" as Role) : user.role,
        promptLimit: PLANS[plan].prompts,
        promptsThisMonth: usage.results.find((u) => u.period === period())?.prompts ?? 0,
        signinsLast30: sessions.results.filter((s) => s.created_at > now - 30 * DAY).length,
        activeSessions: sessions.results.filter((s) => s.expires_at > now).length,
        scenes: scenes.results,
        sessions: sessions.results,
        usage: usage.results,
        feedback: feedback.results,
        log: log.results,
    };
}

export async function signOutEverywhere(env: Env, id: string) {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(id).run();
}

export async function resetPrompts(env: Env, id: string) {
    await env.DB.prepare("UPDATE usage SET prompts = 0, steps = 0 WHERE subject = ?1 AND period = ?2").bind(`user:${id}`, period()).run();
}

// Everything they made goes too; feedback stays, without the link to them.
export async function deleteUser(env: Env, id: string) {
    const { results } = await env.DB.prepare("SELECT id FROM scenes WHERE owner_id = ?1").bind(id).all<{ id: string }>();
    if (results.length) await env.SCENES.delete(results.flatMap((s) => [fileKey(id, s.id), thumbKey(id, s.id)]));
    for (const sql of [
        "DELETE FROM scenes WHERE owner_id = ?1",
        "DELETE FROM sessions WHERE user_id = ?1",
        "DELETE FROM admins WHERE user_id = ?1",
        "UPDATE feedback SET user_id = NULL WHERE user_id = ?1",
        "DELETE FROM users WHERE id = ?1",
    ])
        await env.DB.prepare(sql).bind(id).run();
    await env.DB.prepare("DELETE FROM usage WHERE subject = ?1").bind(`user:${id}`).run();
}

const SCENE_SORTS: Record<string, string> = { updated: "s.updated_at", created: "s.created_at", size: "s.size", title: "s.title" };

export async function listScenes(env: Env, query: { q: string; shared: string; listed: string; sort: string; dir: string; page: number; owner: string }) {
    const where = ["(s.title LIKE ?1 OR u.email LIKE ?1)"];
    if (query.shared === "yes") where.push("s.public_slug IS NOT NULL");
    if (query.listed === "yes") where.push("s.listed = 1 AND s.public_slug IS NOT NULL");
    if (query.owner) where.push("s.owner_id = ?2");
    const like = `%${query.q.replace(/[%_]/g, "").slice(0, 100)}%`;
    const params = query.owner ? [like, query.owner] : [like];
    const sql = `FROM scenes s JOIN users u ON u.id = s.owner_id WHERE ${where.join(" AND ")}`;
    const total = await env.DB.prepare(`SELECT COUNT(*) AS n ${sql}`)
        .bind(...params)
        .first<{ n: number }>();
    const { results } = await env.DB.prepare(
        `SELECT s.id, s.title, s.size, s.created_at, s.updated_at, s.public_slug, s.listed, s.owner_id, u.email AS owner ${sql}
         ORDER BY ${SCENE_SORTS[query.sort] ?? "s.updated_at"} ${query.dir === "asc" ? "ASC" : "DESC"} LIMIT ${PAGE} OFFSET ${Math.max(0, query.page) * PAGE}`,
    )
        .bind(...params)
        .all();
    return { total: total?.n ?? 0, page: query.page, pageSize: PAGE, scenes: results };
}

export const sceneOwner = (env: Env, id: string) =>
    env.DB.prepare("SELECT s.owner_id, s.title, u.email FROM scenes s JOIN users u ON u.id = s.owner_id WHERE s.id = ?1").bind(id).first<{ owner_id: string; title: string; email: string }>();

export async function sceneThumbnail(env: Env, id: string) {
    const scene = await sceneOwner(env, id);
    return scene ? env.SCENES.get(thumbKey(scene.owner_id, id)) : null;
}

export async function deleteScene(env: Env, id: string, owner: string) {
    await env.SCENES.delete([fileKey(owner, id), thumbKey(owner, id)]);
    await env.DB.prepare("DELETE FROM scenes WHERE id = ?1").bind(id).run();
}

type FeedItem = { kind: "signup" | "share" | "feedback" | "admin"; at: number; text: string; id?: string };

export async function dashboard(env: Env) {
    const now = Date.now();
    const week = now - 7 * DAY;
    const twoWeeks = now - 14 * DAY;
    const n = async (sql: string, ...params: unknown[]) => (await env.DB.prepare(sql).bind(...params).first<{ n: number }>())?.n ?? 0;
    const [people, peopleWeekAgo, signins, signinsBefore, creators, creatorsBefore, paying, unread, overdue, newOnExplore] = await Promise.all([
        n("SELECT COUNT(*) AS n FROM users"),
        n("SELECT COUNT(*) AS n FROM users WHERE created_at <= ?1", week),
        n("SELECT COUNT(*) AS n FROM sessions WHERE created_at > ?1", week),
        n("SELECT COUNT(*) AS n FROM sessions WHERE created_at > ?1 AND created_at <= ?2", twoWeeks, week),
        n("SELECT COUNT(DISTINCT owner_id) AS n FROM scenes WHERE updated_at > ?1", week),
        n("SELECT COUNT(DISTINCT owner_id) AS n FROM scenes WHERE updated_at > ?1 AND updated_at <= ?2", twoWeeks, week),
        n("SELECT COUNT(*) AS n FROM users WHERE plan = 'pro' AND COALESCE(plan_status, '') != 'manual'"),
        n("SELECT COUNT(*) AS n FROM feedback WHERE read_at IS NULL"),
        n("SELECT COUNT(*) AS n FROM users WHERE plan_status = 'past_due'"),
        n("SELECT COUNT(*) AS n FROM scenes WHERE listed = 1 AND public_slug IS NOT NULL AND published_at > ?1", week),
    ]);

    const [signups, shares, feedback, actions] = await Promise.all([
        env.DB.prepare("SELECT id, email, created_at AS at FROM users ORDER BY created_at DESC LIMIT 8").all<{ id: string; email: string; at: number }>(),
        env.DB.prepare(
            "SELECT s.title, s.published_at AS at, u.email, s.owner_id AS id FROM scenes s JOIN users u ON u.id = s.owner_id WHERE s.public_slug IS NOT NULL AND s.published_at IS NOT NULL ORDER BY s.published_at DESC LIMIT 8",
        ).all<{ title: string; at: number; email: string; id: string }>(),
        env.DB.prepare("SELECT email, message, created_at AS at, user_id AS id FROM feedback ORDER BY created_at DESC LIMIT 8").all<{ email: string | null; message: string; at: number; id: string | null }>(),
        env.DB.prepare("SELECT actor, action, detail, at FROM admin_log ORDER BY at DESC LIMIT 8").all<{ actor: string; action: string; detail: string; at: number }>(),
    ]);
    const feed: FeedItem[] = [
        ...signups.results.map((u): FeedItem => ({ kind: "signup", at: u.at, text: `${u.email} signed up`, id: u.id })),
        ...shares.results.map((s): FeedItem => ({ kind: "share", at: s.at, text: `${s.email} shared “${s.title}”`, id: s.id })),
        ...feedback.results.map((f): FeedItem => ({ kind: "feedback", at: f.at, text: `${f.email ?? "Someone"}: ${f.message.slice(0, 120)}`, id: f.id ?? undefined })),
        ...actions.results.map((a): FeedItem => ({ kind: "admin", at: a.at, text: `${a.actor} · ${a.action} · ${a.detail}` })),
    ]
        .sort((a, b) => b.at - a.at)
        .slice(0, 20);

    return {
        kpis: {
            people: { now: people, before: peopleWeekAgo },
            signins: { now: signins, before: signinsBefore },
            creators: { now: creators, before: creatorsBefore },
            paying,
            revenue: { low: Math.round(paying * (PRO_PRICES.year.amount / 12)), high: paying * PRO_PRICES.month.amount },
            unread,
        },
        attention: { unread, overdue, newOnExplore },
        feed,
    };
}

export async function assistantMetrics(env: Env) {
    const p = period();
    const { results: top } = await env.DB.prepare(
        `SELECT u.id, u.email, u.plan, us.prompts, us.steps FROM usage us JOIN users u ON us.subject = 'user:' || u.id
         WHERE us.period = ?1 ORDER BY us.prompts DESC LIMIT 15`,
    )
        .bind(p)
        .all<{ id: string; email: string; plan: string; prompts: number; steps: number }>();
    const visitors = await env.DB.prepare("SELECT COUNT(*) AS people, COALESCE(SUM(prompts), 0) AS prompts FROM usage WHERE period = ?1 AND subject NOT LIKE 'user:%'")
        .bind(p)
        .first<{ people: number; prompts: number }>();
    const atLimit = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM usage us JOIN users u ON us.subject = 'user:' || u.id
         WHERE us.period = ?1 AND us.prompts >= CASE WHEN u.plan = 'pro' THEN ?2 ELSE ?3 END`,
    )
        .bind(p, PLANS.pro.prompts, PLANS.free.prompts)
        .first<{ n: number }>();
    const { results: months } = await env.DB.prepare(
        `SELECT period, SUM(CASE WHEN subject LIKE 'user:%' THEN prompts ELSE 0 END) AS people, SUM(CASE WHEN subject LIKE 'user:%' THEN 0 ELSE prompts END) AS visitors,
            SUM(steps) AS steps FROM usage GROUP BY period ORDER BY period DESC LIMIT 12`,
    ).all<{ period: string; people: number; visitors: number; steps: number }>();
    return {
        period: p,
        top: top.map((t) => ({ ...t, limit: PLANS[t.plan === "pro" ? "pro" : "free"].prompts })),
        visitors: visitors ?? { people: 0, prompts: 0 },
        atLimit: atLimit?.n ?? 0,
        months: months.reverse(),
        limits: { guest: PLANS.guest.prompts, free: PLANS.free.prompts, pro: PLANS.pro.prompts },
    };
}
