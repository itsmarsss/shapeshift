import { describe, expect, it, vi } from "vitest";
import { handleWaitlist } from "./waitlist";
import { testDatabase } from "./test/d1";

const env = () => ({ DB: testDatabase(), CHAT_LIMITER: { limit: vi.fn(async () => ({ success: true })) } }) as unknown as Env;
const join = (e: Env, body: unknown) =>
    handleWaitlist(new Request("http://localhost/api/waitlist", { method: "POST", body: JSON.stringify(body) }), e) as Promise<Response>;

describe("waitlist", () => {
    it("adds an email once and says so the second time", async () => {
        const e = env();
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        expect(await (await join(e, { email: "Ann@Example.com", source: "readme" })).json()).toEqual({ ok: true, already: false });
        expect(await (await join(e, { email: "ann@example.com" })).json()).toEqual({ ok: true, already: true });
        expect(log).toHaveBeenCalledTimes(1);
        log.mockRestore();
        const row = await e.DB.prepare("SELECT email, source FROM waitlist").first();
        expect(row).toEqual({ email: "ann@example.com", source: "readme" });
    });

    it("rejects bad emails and other methods", async () => {
        const e = env();
        expect((await join(e, { email: "nope" })).status).toBe(400);
        expect((await handleWaitlist(new Request("http://localhost/api/waitlist"), e))!.status).toBe(405);
        expect(await handleWaitlist(new Request("http://localhost/api/other"), e)).toBeNull();
    });
});
