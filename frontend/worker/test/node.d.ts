// Just the parts of Node the test database uses; the Worker build has no Node types.
declare module "node:sqlite" {
    export class DatabaseSync {
        constructor(path: string);
        exec(sql: string): void;
        prepare(sql: string): {
            run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
            get(...params: unknown[]): Record<string, unknown> | undefined;
            all(...params: unknown[]): Record<string, unknown>[];
        };
    }
}

declare module "node:fs" {
    export function readFileSync(path: URL, encoding: "utf8"): string;
    export function readdirSync(path: URL): string[];
}

interface ImportMeta {
    url: string;
}
