// An in-memory stand-in for an R2 bucket, enough for the scene routes.
export function testBucket() {
    const files = new Map<string, { data: Uint8Array; type?: string }>();
    const bucket = {
        files,
        async put(key: string, value: string | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
            files.set(key, { data: typeof value === "string" ? new TextEncoder().encode(value) : value, type: options?.httpMetadata?.contentType });
            return {};
        },
        async get(key: string) {
            const f = files.get(key);
            if (!f) return null;
            return { body: f.data, text: async () => new TextDecoder().decode(f.data) };
        },
        async head(key: string) {
            return files.has(key) ? {} : null;
        },
        async delete(keys: string | string[]) {
            for (const k of [keys].flat()) files.delete(k);
        },
    };
    return bucket as typeof bucket & R2Bucket;
}
