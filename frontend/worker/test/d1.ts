import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

// A stand-in for Cloudflare D1 backed by Node's built-in SQLite, loaded with
// the real migrations, so tests run the same SQL production does.
export function testDatabase(): D1Database {
    const db = new DatabaseSync(":memory:");
    const dir = new URL("../../migrations/", import.meta.url);
    for (const file of readdirSync(dir).sort()) db.exec(readFileSync(new URL(file, dir), "utf8"));

    // D1 uses ?1-style placeholders, which node:sqlite reads as positional too.
    const statement = (sql: string, params: unknown[] = []) => ({
        bind: (...values: unknown[]) => statement(sql, values),
        first: async <T>() => (db.prepare(sql).get(...params) as T | undefined) ?? null,
        all: async <T>() => ({ results: db.prepare(sql).all(...params) as T[], success: true, meta: {} }),
        run: async () => {
            const r = db.prepare(sql).run(...params);
            return { success: true, meta: { changes: Number(r.changes) }, results: [] };
        },
    });
    return { prepare: (sql: string) => statement(sql), batch: async () => [], exec: async () => ({ count: 0, duration: 0 }) } as unknown as D1Database;
}
