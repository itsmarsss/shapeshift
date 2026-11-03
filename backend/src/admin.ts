import { z } from "zod";
import { can, PERMISSIONS, ROLE_IDS, type Permission, type Role } from "@shapeshift/shared/admin/roles";
import { currentUser, Email, fail, isLocal, json, type User } from "./auth";
import { feedbackPictureKey } from "./feedback";
import { databaseMetrics, eventMetrics } from "./metrics";

// /api/admin/*: the team's admin page. Every request checks the signed-in
// person's role and the permission the action needs. To anyone who isn't an
// admin, these addresses don't exist (404), so nothing hints at them.
//
// Superusers come from the SUPERUSER_EMAILS secret (comma-separated), so the
// owner can always get in. Everyone else is in the admins table.

// For local development and the browser tests, which run on localhost only.
export const LOCAL_SUPERUSER = "admin@shapeshift.test";

type Admin = { user: User; role: Role; fixed: boolean };

function superuserEmails(env: Env, request: Request): Set<string> {
    const listed = (env.SUPERUSER_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    return new Set(isLocal(request) ? [...listed, LOCAL_SUPERUSER] : listed);
}

export async function adminFor(env: Env, request: Request): Promise<Admin | null> {
    const user = await currentUser(env, request);
    if (!user) return null;
    if (superuserEmails(env, request).has(user.email)) return { user, role: "superuser", fixed: true };
    const row = await env.DB.prepare("SELECT role FROM admins WHERE user_id = ?1").bind(user.id).first<{ role: Role }>();
    return row && ROLE_IDS.includes(row.role) ? { user, role: row.role, fixed: false } : null;
}

const notFound = () => fail(404, "Not found");
const forbidden = () => fail(403, "Your role can't do that.", "forbidden");

async function log(env: Env, actor: Admin, action: string, detail: string) {
    await env.DB.prepare("INSERT INTO admin_log (id, at, actor, action, detail) VALUES (?1, ?2, ?3, ?4, ?5)")
        .bind(crypto.randomUUID(), Date.now(), actor.user.email, action, detail)
        .run();
}

async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T | null> {
    try {
        const parsed = schema.safeParse(await request.json());
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

const period = () => new Date().toISOString().slice(0, 7);
const count = async (env: Env, sql: string, ...params: unknown[]) =>
    (await env.DB.prepare(sql).bind(...params).first<{ n: number }>())?.n ?? 0;

export async function handleAdmin(request: Request, env: Env): Promise<Response | null> {
    const { pathname, searchParams } = new URL(request.url);
    if (!pathname.startsWith("/api/admin")) return null;
    const admin = await adminFor(env, request);
    if (!admin) return notFound();
    const allowed = (permission: Permission) => can(admin.role, permission);
    const method = request.method;
    const path = pathname.slice("/api/admin".length) || "/";

    if (path === "/me" && method === "GET") {
        return json({ email: admin.user.email, role: admin.role, permissions: (Object.keys(PERMISSIONS) as Permission[]).filter(allowed) });
    }

    if (path === "/overview" && method === "GET") {
        if (!allowed("overview")) return forbidden();
        const weekAgo = Date.now() - 7 * 86_400_000;
        return json({
            people: await count(env, "SELECT COUNT(*) AS n FROM users"),
            newThisWeek: await count(env, "SELECT COUNT(*) AS n FROM users WHERE created_at > ?1", weekAgo),
            pro: await count(env, "SELECT COUNT(*) AS n FROM users WHERE plan = 'pro'"),
            scenes: await count(env, "SELECT COUNT(*) AS n FROM scenes"),
            shared: await count(env, "SELECT COUNT(*) AS n FROM scenes WHERE public_slug IS NOT NULL"),
            listed: await count(env, "SELECT COUNT(*) AS n FROM scenes WHERE listed = 1 AND public_slug IS NOT NULL"),
            unreadFeedback: await count(env, "SELECT COUNT(*) AS n FROM feedback WHERE read_at IS NULL"),
            promptsThisMonth: await count(env, "SELECT COALESCE(SUM(prompts), 0) AS n FROM usage WHERE period = ?1", period()),
        });
    }

    if ((path === "/metrics" || path === "/metrics/events") && method === "GET") {
        if (!allowed("metrics")) return forbidden();
        const days = [7, 30, 90].includes(Number(searchParams.get("days"))) ? Number(searchParams.get("days")) : 30;
        if (path === "/metrics") return json(await databaseMetrics(env, days));
        try {
            return json(await eventMetrics(env, days));
        } catch (err) {
            console.error("Admin metrics failed", err);
            return fail(502, "Couldn't read the usage numbers from Cloudflare. Check the analytics token.", "upstream");
        }
    }

    if (path === "/feedback" && method === "GET") {
        if (!allowed("feedback.read")) return forbidden();
        const before = Number(searchParams.get("before")) || Date.now() + 1;
        const { results } = await env.DB.prepare(
            "SELECT id, created_at, email, page, message, has_picture, read_at FROM feedback WHERE created_at < ?1 ORDER BY created_at DESC LIMIT 30",
        )
            .bind(before)
            .all<{ id: string; created_at: number; email: string | null; page: string | null; message: string; has_picture: number; read_at: number | null }>();
        return json({
            items: results.map((r) => ({ id: r.id, at: r.created_at, email: r.email, page: r.page, message: r.message, picture: Boolean(r.has_picture), read: r.read_at !== null })),
            next: results.length === 30 ? results[results.length - 1].created_at : null,
        });
    }
    const picture = path.match(/^\/feedback\/([\w-]+)\/picture$/);
    if (picture && method === "GET") {
        if (!allowed("feedback.read")) return forbidden();
        const object = await env.SCENES.get(feedbackPictureKey(picture[1]));
        if (!object) return notFound();
        return new Response(object.body, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
    }
    const read = path.match(/^\/feedback\/([\w-]+)\/read$/);
    if (read && method === "POST") {
        if (!allowed("feedback.manage")) return forbidden();
        const b = await body(request, z.object({ read: z.boolean() }));
        if (!b) return fail(400, "Invalid request.");
        await env.DB.prepare("UPDATE feedback SET read_at = ?1 WHERE id = ?2").bind(b.read ? Date.now() : null, read[1]).run();
        return json({ ok: true });
    }

    if (path === "/users" && method === "GET") {
        if (!allowed("users.read")) return forbidden();
        const q = (searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
        const { results } = await env.DB.prepare(
            `SELECT u.id, u.email, u.name, u.plan, u.plan_status, u.created_at,
                (SELECT COUNT(*) FROM scenes s WHERE s.owner_id = u.id) AS scenes,
                (SELECT role FROM admins a WHERE a.user_id = u.id) AS role
             FROM users u WHERE u.email LIKE ?1 ORDER BY u.created_at DESC LIMIT 50`,
        )
            .bind(`%${q.replace(/[%_]/g, "")}%`)
            .all<{ id: string; email: string; name: string | null; plan: string; plan_status: string | null; created_at: number; scenes: number; role: Role | null }>();
        const fixed = superuserEmails(env, request);
        return json({
            users: results.map((u) => ({ ...u, role: fixed.has(u.email) ? "superuser" : u.role, joined: u.created_at })),
        });
    }
    const plan = path.match(/^\/users\/([\w-]+)\/plan$/);
    if (plan && method === "POST") {
        if (!allowed("users.plans")) return forbidden();
        const b = await body(request, z.object({ plan: z.enum(["free", "pro"]) }));
        if (!b) return fail(400, "Invalid request.");
        const target = await env.DB.prepare("SELECT email, stripe_customer_id FROM users WHERE id = ?1").bind(plan[1]).first<{ email: string; stripe_customer_id: string | null }>();
        if (!target) return notFound();
        // Given by hand, so billing can tell it apart from a subscription.
        await env.DB.prepare("UPDATE users SET plan = ?1, plan_status = ?2, plan_renews_at = NULL WHERE id = ?3")
            .bind(b.plan, b.plan === "pro" ? "manual" : null, plan[1])
            .run();
        await log(env, admin, "plan", `${target.email} → ${b.plan}`);
        return json({ ok: true });
    }

    if (path === "/explore" && method === "GET") {
        if (!allowed("explore.moderate")) return forbidden();
        const { results } = await env.DB.prepare(
            `SELECT s.public_slug AS slug, s.title, s.published_at, u.email AS owner
             FROM scenes s JOIN users u ON u.id = s.owner_id
             WHERE s.listed = 1 AND s.public_slug IS NOT NULL ORDER BY s.published_at DESC LIMIT 100`,
        ).all<{ slug: string; title: string; published_at: number | null; owner: string }>();
        return json({ scenes: results });
    }
    const unlist = path.match(/^\/explore\/([A-Za-z0-9]{10})\/unlist$/);
    if (unlist && method === "POST") {
        if (!allowed("explore.moderate")) return forbidden();
        const scene = await env.DB.prepare("SELECT title FROM scenes WHERE public_slug = ?1").bind(unlist[1]).first<{ title: string }>();
        if (!scene) return notFound();
        await env.DB.prepare("UPDATE scenes SET listed = 0 WHERE public_slug = ?1").bind(unlist[1]).run();
        await log(env, admin, "unlist", `“${scene.title}” (${unlist[1]})`);
        return json({ ok: true });
    }

    if (path === "/admins" && method === "GET") {
        if (!allowed("admins.manage")) return forbidden();
        const { results } = await env.DB.prepare(
            "SELECT a.user_id AS id, u.email, a.role, a.added_by, a.added_at FROM admins a JOIN users u ON u.id = a.user_id ORDER BY a.added_at",
        ).all<{ id: string; email: string; role: Role; added_by: string | null; added_at: number }>();
        const fixed = [...superuserEmails(env, request)].map((email) => ({ id: null, email, role: "superuser" as Role, added_by: null, added_at: null, fixed: true }));
        return json({ admins: [...fixed, ...results.filter((a) => !superuserEmails(env, request).has(a.email)).map((a) => ({ ...a, fixed: false }))] });
    }
    if (path === "/admins" && method === "POST") {
        if (!allowed("admins.manage")) return forbidden();
        const b = await body(request, z.object({ email: Email, role: z.enum(ROLE_IDS as [Role, ...Role[]]) }));
        if (!b) return fail(400, "Enter an email and a role.");
        const target = await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(b.email).first<{ id: string }>();
        if (!target) return fail(404, "Nobody has signed in with that email yet. Ask them to sign in once first.", "no_user");
        await env.DB.prepare(
            "INSERT INTO admins (user_id, role, added_by, added_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id) DO UPDATE SET role = excluded.role",
        )
            .bind(target.id, b.role, admin.user.email, Date.now())
            .run();
        await log(env, admin, "admin", `${b.email} → ${b.role}`);
        return json({ ok: true });
    }
    const removeAdmin = path.match(/^\/admins\/([\w-]+)$/);
    if (removeAdmin && method === "DELETE") {
        if (!allowed("admins.manage")) return forbidden();
        if (removeAdmin[1] === admin.user.id) return fail(400, "You can't remove yourself.");
        const target = await env.DB.prepare("SELECT u.email FROM admins a JOIN users u ON u.id = a.user_id WHERE a.user_id = ?1").bind(removeAdmin[1]).first<{ email: string }>();
        if (!target) return notFound();
        await env.DB.prepare("DELETE FROM admins WHERE user_id = ?1").bind(removeAdmin[1]).run();
        await log(env, admin, "remove admin", target.email);
        return json({ ok: true });
    }

    if (path === "/log" && method === "GET") {
        if (!allowed("admins.manage")) return forbidden();
        const { results } = await env.DB.prepare("SELECT at, actor, action, detail FROM admin_log ORDER BY at DESC LIMIT 100").all();
        return json({ entries: results });
    }

    return notFound();
}
