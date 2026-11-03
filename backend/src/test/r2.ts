// An in-memory stand-in for an R2 bucket, enough for the scene routes.
export function testBucket() {
    const files = new Map<string, { data: Uint8Array; type?: string; meta?: Record<string, string> }>();
    const bucket = {
        files,
        async put(key: string, value: string | Uint8Array, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
            files.set(key, { data: typeof value === "string" ? new TextEncoder().encode(value) : value, type: options?.httpMetadata?.contentType, meta: options?.customMetadata });
            return {};
        },
        async list(options?: { prefix?: string }) {
            const objects = [...files.entries()].filter(([k]) => k.startsWith(options?.prefix ?? "")).map(([key, f]) => ({ key, customMetadata: f.meta ?? {} }));
            return { objects, truncated: false };
        },
        async get(key: string) {
            const f = files.get(key);
            if (!f) return null;
            return { body: f.data, text: async () => new TextDecoder().decode(f.data), httpMetadata: { contentType: f.type } };
        },
        async delete(keys: string | string[]) {
            for (const k of [keys].flat()) files.delete(k);
        },
    };
    return bucket as typeof bucket & R2Bucket;
}
