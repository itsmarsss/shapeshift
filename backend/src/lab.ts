import { z } from "zod";
import { fail, json } from "./auth";

// Model lab runs, kept in R2 so they can be looked at again: under
// lab/<run>/<model>, a JSON record (the numbers, the final scene and the
// step log) and a picture of the result. The numbers also ride along as the
// record's metadata, so listing runs doesn't open every record.

const MAX_RECORD = 1_500_000;
const MAX_PICTURE = 400_000;

const Record = z.object({
    run: z.string().regex(/^[a-z0-9]{4,20}$/),
    model: z.string().min(1).max(120),
    prompt: z.string().min(1).max(4000),
    ms: z.number().nonnegative(),
    steps: z.number().int().nonnegative(),
    changes: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    error: z.string().max(400).optional(),
    doc: z.unknown(),
    log: z.array(z.unknown()).max(5000),
    picture: z.string().regex(/^[A-Za-z0-9+/=]+$/).max(MAX_PICTURE).optional(),
});

// Model ids have slashes and #; keys get a safe version.
const slug = (model: string) => model.replace(/[^\w.-]+/g, "_");
const key = (run: string, model: string, ext: "json" | "jpg") => `lab/${run}/${slug(model)}.${ext}`;

export type LabSummary = { model: string; ms: number; steps: number; changes: number; failed: number; error?: string; at: number; picture: boolean };
export type LabRunSummary = { run: string; prompt: string; at: number; results: LabSummary[] };

export async function handleLab(request: Request, env: Env, path: string): Promise<Response | null> {
    const { method } = request;
    const { searchParams } = new URL(request.url);

    if (path === "/lab/runs" && method === "POST") {
        const text = await request.text();
        if (text.length > MAX_RECORD + MAX_PICTURE) return fail(413, "That run is too big to keep.", "bad_request");
        let body: unknown;
        try {
            body = JSON.parse(text);
        } catch {
            return fail(400, "Invalid JSON.", "bad_request");
        }
        const parsed = Record.safeParse(body);
        if (!parsed.success) return fail(400, "That isn't a lab run.", "bad_request");
        const { picture, ...record } = parsed.data;
        const at = Date.now();
        const meta: Record<string, string> = {
            model: record.model,
            prompt: record.prompt.slice(0, 600),
            ms: String(Math.round(record.ms)),
            steps: String(record.steps),
            changes: String(record.changes),
            failed: String(record.failed),
            at: String(at),
            picture: picture ? "1" : "0",
            ...(record.error ? { error: record.error.slice(0, 200) } : {}),
        };
        await env.SCENES.put(key(record.run, record.model, "json"), JSON.stringify({ ...record, at }), { httpMetadata: { contentType: "application/json" }, customMetadata: meta });
        if (picture) {
            const bytes = Uint8Array.from(atob(picture), (c) => c.charCodeAt(0));
            await env.SCENES.put(key(record.run, record.model, "jpg"), bytes, { httpMetadata: { contentType: "image/jpeg" } });
        }
        return json({ ok: true });
    }

    // Past runs, newest first, each with every model's numbers.
    if (path === "/lab/runs" && method === "GET") {
        const runs = new Map<string, LabRunSummary>();
        let cursor: string | undefined;
        do {
            const page = await env.SCENES.list({ prefix: "lab/", cursor, include: ["customMetadata"] } as R2ListOptions);
            for (const o of page.objects) {
                if (!o.key.endsWith(".json")) continue;
                const m = o.customMetadata ?? {};
                const run = o.key.split("/")[1]!;
                const at = Number(m.at) || 0;
                const entry = runs.get(run) ?? { run, prompt: m.prompt ?? "", at, results: [] };
                entry.at = Math.min(entry.at || at, at);
                entry.results.push({
                    model: m.model ?? "",
                    ms: Number(m.ms) || 0,
                    steps: Number(m.steps) || 0,
                    changes: Number(m.changes) || 0,
                    failed: Number(m.failed) || 0,
                    ...(m.error ? { error: m.error } : {}),
                    at,
                    picture: m.picture === "1",
                });
                runs.set(run, entry);
            }
            cursor = page.truncated ? (page as { cursor?: string }).cursor : undefined;
        } while (cursor);
        const list = [...runs.values()].sort((a, b) => b.at - a.at).slice(0, Number(searchParams.get("limit")) || 40);
        for (const r of list) r.results.sort((a, b) => a.model.localeCompare(b.model));
        return json({ runs: list });
    }

    const one = path.match(/^\/lab\/runs\/([a-z0-9]{4,20})(?:\/(record|picture))?$/);
    if (one && method === "GET") {
        const model = searchParams.get("model") ?? "";
        const object = await env.SCENES.get(key(one[1]!, model, one[2] === "picture" ? "jpg" : "json"));
        if (!object) return fail(404, "That run isn't kept.", "not_found");
        return new Response(object.body, { headers: { "content-type": one[2] === "picture" ? "image/jpeg" : "application/json", "cache-control": "private, max-age=3600" } });
    }
    if (one && !one[2] && method === "DELETE") {
        const page = await env.SCENES.list({ prefix: `lab/${one[1]}/` });
        await env.SCENES.delete(page.objects.map((o) => o.key));
        return json({ ok: true });
    }
    return null;
}
