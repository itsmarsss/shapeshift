import { PLANS, PRO_PRICES } from "@shapeshift/shared/billing/plans";

// Numbers for the admin page's charts. Some come from the database (people,
// scenes, plans, prompts); the rest from the anonymous usage events in
// Analytics Engine, read back through Cloudflare's SQL API when a token is set.

const DAY = 86_400_000;
// The account the Worker runs in (also in wrangler.jsonc).
const ACCOUNT_ID = "5bc3b9b0633d9e07fc0908e600147b08";
const DATASET = "shapeshift_events";

export type Series = { day: string; n: number }[];

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Every day in the window, so a chart has no gaps on quiet days.
function fill(rows: { day: string; n: number }[], days: number): Series {
    const byDay = new Map(rows.map((r) => [r.day, Number(r.n)]));
    const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    return Array.from({ length: days }, (_, i) => {
        const day = dayKey(today - (days - 1 - i) * DAY);
        return { day, n: byDay.get(day) ?? 0 };
    });
}

async function perDay(env: Env, table: string, column: string, days: number, where = "1 = 1") {
    const since = Date.now() - days * DAY;
    const { results } = await env.DB.prepare(
        `SELECT strftime('%Y-%m-%d', ${column} / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM ${table} WHERE ${column} > ?1 AND ${where} GROUP BY day`,
    )
        .bind(since)
        .all<{ day: string; n: number }>();
    return fill(results, days);
}

const one = async (env: Env, sql: string, ...params: unknown[]) => (await env.DB.prepare(sql).bind(...params).first<{ n: number }>())?.n ?? 0;

export async function databaseMetrics(env: Env, days: number) {
    const since = Date.now() - days * DAY;
    const [signups, signins, scenes, feedback] = await Promise.all([
        perDay(env, "users", "created_at", days),
        perDay(env, "sessions", "created_at", days),
        perDay(env, "scenes", "created_at", days),
        perDay(env, "feedback", "created_at", days),
    ]);
    const before = await one(env, "SELECT COUNT(*) AS n FROM users WHERE created_at <= ?1", since);

    const { results: plans } = await env.DB.prepare("SELECT plan, COALESCE(plan_status, '') AS status, COUNT(*) AS n FROM users GROUP BY plan, status").all<{
        plan: string;
        status: string;
        n: number;
    }>();
    const paying = plans.filter((p) => p.plan === "pro" && p.status !== "manual").reduce((n, p) => n + p.n, 0);

    const { results: prompts } = await env.DB.prepare(
        `SELECT period, SUM(CASE WHEN subject LIKE 'user:%' THEN prompts ELSE 0 END) AS people, SUM(CASE WHEN subject LIKE 'user:%' THEN 0 ELSE prompts END) AS visitors
         FROM usage GROUP BY period ORDER BY period DESC LIMIT 6`,
    ).all<{ period: string; people: number; visitors: number }>();

    const storage = await env.DB.prepare("SELECT COUNT(*) AS scenes, COALESCE(SUM(size), 0) AS bytes FROM scenes").first<{ scenes: number; bytes: number }>();
    const { results: creators } = await env.DB.prepare(
        `SELECT u.email, COUNT(s.id) AS scenes, SUM(CASE WHEN s.public_slug IS NOT NULL THEN 1 ELSE 0 END) AS shared
         FROM scenes s JOIN users u ON u.id = s.owner_id GROUP BY u.id ORDER BY scenes DESC LIMIT 10`,
    ).all<{ email: string; scenes: number; shared: number }>();

    return {
        days,
        signups,
        // People signed up by the end of each day.
        people: signups.reduce<Series>((acc, d) => [...acc, { day: d.day, n: (acc.at(-1)?.n ?? before) + d.n }], []),
        signins,
        scenes,
        feedback,
        plans,
        revenue: {
            paying,
            // Each subscriber is on one of two prices; this is the range.
            monthlyLow: Math.round(paying * (PRO_PRICES.year.amount / 12)),
            monthlyHigh: paying * PRO_PRICES.month.amount,
        },
        prompts: prompts.reverse(),
        limits: { free: PLANS.free.prompts, pro: PLANS.pro.prompts },
        storage: storage ?? { scenes: 0, bytes: 0 },
        creators,
    };
}

async function sql<T>(env: Env, query: string): Promise<T[]> {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.ANALYTICS_ACCOUNT_ID || ACCOUNT_ID}/analytics_engine/sql`, {
        method: "POST",
        headers: { authorization: `Bearer ${env.ANALYTICS_TOKEN}` },
        body: query,
    });
    if (!res.ok) throw new Error(`Analytics query failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { data: T[] }).data;
}

export async function eventMetrics(env: Env, days: number) {
    if (!env.ANALYTICS_TOKEN) return { configured: false as const };
    const window = `timestamp > NOW() - INTERVAL '${days}' DAY`;
    const [daily, visitors, reach, labels, firstShape, errors] = await Promise.all([
        sql<{ day: string; event: string; n: number }>(
            env,
            `SELECT formatDateTime(timestamp, '%Y-%m-%d') AS day, blob1 AS event, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window} AND blob1 != 'error' GROUP BY day, event`,
        ),
        sql<{ day: string; n: number }>(
            env,
            `SELECT formatDateTime(timestamp, '%Y-%m-%d') AS day, COUNT(DISTINCT blob3) AS n FROM ${DATASET} WHERE ${window} AND blob1 = 'app_open' GROUP BY day`,
        ),
        // How many different browsers did each thing at least once.
        sql<{ event: string; n: number }>(env, `SELECT blob1 AS event, COUNT(DISTINCT blob3) AS n FROM ${DATASET} WHERE ${window} AND blob1 != 'error' GROUP BY event`),
        sql<{ event: string; label: string; n: number }>(
            env,
            `SELECT blob1 AS event, blob2 AS label, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window} AND blob1 IN ('export', 'template_used') GROUP BY event, label ORDER BY n DESC LIMIT 30`,
        ),
        sql<{ median: number; n: number }>(
            env,
            `SELECT quantileExactWeighted(0.5)(double1, _sample_interval) AS median, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window} AND blob1 = 'first_shape'`,
        ),
        sql<{ day: string; n: number }>(
            env,
            `SELECT formatDateTime(timestamp, '%Y-%m-%d') AS day, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window} AND blob1 = 'error' GROUP BY day`,
        ),
    ]);
    const topErrors = await sql<{ place: string; message: string; n: number }>(
        env,
        `SELECT blob2 AS place, blob3 AS message, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window} AND blob1 = 'error' GROUP BY place, message ORDER BY n DESC LIMIT 15`,
    );

    const byEvent = new Map<string, { day: string; n: number }[]>();
    for (const row of daily) byEvent.set(row.event, [...(byEvent.get(row.event) ?? []), { day: row.day, n: Number(row.n) }]);
    return {
        configured: true as const,
        days,
        visitors: fill(visitors.map((v) => ({ day: v.day, n: Number(v.n) })), days),
        events: Object.fromEntries([...byEvent].map(([event, rows]) => [event, fill(rows, days)])),
        reach: Object.fromEntries(reach.map((r) => [r.event, Number(r.n)])),
        labels: labels.map((l) => ({ ...l, n: Number(l.n) })),
        firstShape: { medianSeconds: Math.round(Number(firstShape[0]?.median ?? 0)), count: Number(firstShape[0]?.n ?? 0) },
        errors: fill(errors.map((e) => ({ day: e.day, n: Number(e.n) })), days),
        topErrors: topErrors.map((e) => ({ ...e, n: Number(e.n) })),
    };
}
