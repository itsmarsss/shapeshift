import { z } from "zod";
import { can, PERMISSIONS, ROLE_IDS, type Permission, type Role } from "@shapeshift/shared/admin/roles";
import { currentUser, Email, fail, isLocal, json, type User } from "./auth";
import { agentStep, labProvider } from "./agent";
import { feedbackPictureKey } from "./feedback";
import { databaseMetrics, errorGroups, eventMetrics } from "./metrics";
import { assistantMetrics, dashboard, deleteScene, deleteUser, getUser, listScenes, listUsers, resetPrompts, sceneOwner, sceneThumbnail, signOutEverywhere } from "./adminData";

// /api/admin/*: the team's admin page. Every request checks the signed-in
// person's role and the permission the action needs. To anyone who isn't an
// admin, these addresses don't exist (404), so nothing hints at them.
//
// Superusers come from the SUPERUSER_EMAILS secret (comma-separated), so the
// owner can always get in. Everyone else is in the admins table.

// For local development and the browser tests, which run on localhost only.
export const LOCAL_SUPERUSER = "admin@shapeshift.test";

type Admin = { user: User; role: Role; fixed: boolean };

export const listedSuperusers = (env: Env) =>
    (env.SUPERUSER_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

function superuserEmails(env: Env, request: Request): Set<string> {
    const listed = listedSuperusers(env);
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

    // The Model lab: one assistant step on the model it names.
    if (path === "/agent" && method === "POST") {
        if (!allowed("models.lab")) return forbidden();
        const provider = labProvider(env, searchParams.get("model") ?? "");
        if (!provider) return fail(400, "That model isn't available. Workers AI models start with @cf/, and Claude ones need the key set.", "bad_request");
        return agentStep(request, env, provider);
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

    if (path === "/metrics/errors" && method === "GET") {
        if (!allowed("metrics")) return forbidden();
        if (!env.ANALYTICS_TOKEN) return json({ configured: false, errors: [] });
        const days = [1, 7, 30, 90].includes(Number(searchParams.get("days"))) ? Number(searchParams.get("days")) : 7;
        try {
            return json({ configured: true, days, errors: await errorGroups(env, days) });
        } catch (err) {
            console.error("Admin errors failed", err);
            return fail(502, "Couldn't read the error reports from Cloudflare. Check the analytics token.", "upstream");
        }
    }

    if (path === "/feedback" && method === "GET") {
        if (!allowed("feedback.read")) return forbidden();
        const before = Number(searchParams.get("before")) || Date.now() + 1;
        const { results } = await env.DB.prepare(
            "SELECT id, created_at, email, user_id, page, message, has_picture, read_at FROM feedback WHERE created_at < ?1 AND (?2 = 0 OR read_at IS NULL) AND message LIKE ?3 ORDER BY created_at DESC LIMIT 30",
        )
            .bind(before, searchParams.get("unread") === "1" ? 1 : 0, `%${(searchParams.get("q") ?? "").replace(/[%_]/g, "").slice(0, 100)}%`)
            .all<{ id: string; created_at: number; email: string | null; user_id: string | null; page: string | null; message: string; has_picture: number; read_at: number | null }>();
        return json({
            items: results.map((r) => ({ id: r.id, at: r.created_at, email: r.email, userId: r.user_id, page: r.page, message: r.message, picture: Boolean(r.has_picture), read: r.read_at !== null })),
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

    const page = Math.max(0, Number(searchParams.get("page")) || 0);
    const param = (name: string) => (searchParams.get(name) ?? "").trim();

    if (path === "/dashboard" && method === "GET") {
        if (!allowed("overview")) return forbidden();
        return json(await dashboard(env));
    }
    if (path === "/metrics/assistant" && method === "GET") {
        if (!allowed("metrics")) return forbidden();
        return json(await assistantMetrics(env));
    }

    if (path === "/users" && method === "GET") {
        if (!allowed("users.read")) return forbidden();
        return json(await listUsers(env, { q: param("q"), plan: param("plan"), role: param("role"), scenes: param("scenes"), sort: param("sort"), dir: param("dir"), page }, superuserEmails(env, request)));
    }
    const person = path.match(/^\/users\/([\w-]+)$/);
    if (person && method === "GET") {
        if (!allowed("users.read")) return forbidden();
        const found = await getUser(env, person[1], superuserEmails(env, request));
        return found ? json(found) : notFound();
    }
    const personAction = path.match(/^\/users\/([\w-]+)\/(signout|usage\/reset)$/);
    if (personAction && method === "POST") {
        if (!allowed("users.manage")) return forbidden();
        const target = await env.DB.prepare("SELECT email FROM users WHERE id = ?1").bind(personAction[1]).first<{ email: string }>();
        if (!target) return notFound();
        if (personAction[2] === "signout") await signOutEverywhere(env, personAction[1]);
        else await resetPrompts(env, personAction[1]);
        await log(env, admin, personAction[2] === "signout" ? "sign out" : "reset prompts", target.email);
        return json({ ok: true });
    }
    if (person && method === "DELETE") {
        if (!allowed("users.delete")) return forbidden();
        const target = await env.DB.prepare("SELECT email, plan, plan_status, stripe_customer_id FROM users WHERE id = ?1")
            .bind(person[1])
            .first<{ email: string; plan: string; plan_status: string | null; stripe_customer_id: string | null }>();
        if (!target) return notFound();
        if (person[1] === admin.user.id || superuserEmails(env, request).has(target.email)) return fail(400, "Superusers can't be deleted here.");
        if (target.plan === "pro" && target.plan_status !== "manual" && target.stripe_customer_id)
            return fail(409, "They're paying for Pro. Cancel their subscription in Stripe first.", "subscribed");
        await deleteUser(env, person[1]);
        await log(env, admin, "delete account", target.email);
        return json({ ok: true });
    }

    if (path === "/scenes" && method === "GET") {
        if (!allowed("scenes.moderate") && !allowed("users.read")) return forbidden();
        return json(await listScenes(env, { q: param("q"), shared: param("shared"), listed: param("listed"), sort: param("sort"), dir: param("dir"), owner: param("owner"), page }));
    }
    const sceneThumb = path.match(/^\/scenes\/([\w-]+)\/thumbnail$/);
    if (sceneThumb && method === "GET") {
        if (!allowed("scenes.moderate") && !allowed("users.read")) return forbidden();
        const file = await sceneThumbnail(env, sceneThumb[1]);
        if (!file) return notFound();
        return new Response(file.body, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=600" } });
    }
    const sceneAction = path.match(/^\/scenes\/([\w-]+)\/(unlist|unshare)$/);
    const sceneOne = path.match(/^\/scenes\/([\w-]+)$/);
    if ((sceneAction && method === "POST") || (sceneOne && method === "DELETE")) {
        if (!allowed("scenes.moderate") && !allowed("users.manage")) return forbidden();
        const id = (sceneAction ?? sceneOne)![1];
        const scene = await sceneOwner(env, id);
        if (!scene) return notFound();
        if (sceneOne) await deleteScene(env, id, scene.owner_id);
        else if (sceneAction![2] === "unlist") await env.DB.prepare("UPDATE scenes SET listed = 0 WHERE id = ?1").bind(id).run();
        else await env.DB.prepare("UPDATE scenes SET public_slug = NULL, listed = 0 WHERE id = ?1").bind(id).run();
        await log(env, admin, sceneOne ? "delete scene" : sceneAction![2], `“${scene.title}” of ${scene.email}`);
        return json({ ok: true });
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
