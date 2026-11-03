import { afterEach, describe, expect, it, vi } from "vitest";
import { sendErrorDigest } from "./digest";

const env = (extra: Partial<Env> = {}) => ({ ANALYTICS_TOKEN: "t", SUPERUSER_EMAILS: "owner@x.co, other@x.co", ...extra }) as unknown as Env;

// The Analytics Engine SQL API: the grouped query, then the recent samples.
function analytics(groups: unknown[], samples: unknown[]) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
        const query = String(init?.body ?? "");
        return Response.json({ data: query.includes("GROUP BY") ? groups : samples });
    });
}

afterEach(() => vi.restoreAllMocks());

describe("error digest", () => {
    it("emails each superuser the day's errors with a link to the details", async () => {
        analytics(
            [{ place: "render", message: "boom", n: "3", visitors: "2", first: "2026-11-02 01:00:00", last: "2026-11-02 09:00:00" }],
            [{ place: "render", message: "boom", page: "/edit", stack: "at x", browser: "Chrome", at: "2026-11-02 09:00:00" }],
        );
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        expect(await sendErrorDigest(env())).toEqual({ sent: 2 });
        const mail = log.mock.calls.map((c) => String(c[0]));
        expect(mail.filter((m) => m.startsWith("[email to owner@x.co] ShapeShift: 3 errors in the last day"))).toHaveLength(1);
        expect(mail[0]).toContain("3× boom  [render, /edit, 2 browsers]");
        expect(mail[0]).toContain("/admin?s=health");
    });

    it("stays quiet on a day without errors, or without a token or superusers", async () => {
        const fetch = analytics([], []);
        expect(await sendErrorDigest(env())).toEqual({ sent: 0 });
        expect(await sendErrorDigest(env({ ANALYTICS_TOKEN: undefined }))).toEqual({ sent: 0 });
        expect(await sendErrorDigest(env({ SUPERUSER_EMAILS: "" }))).toEqual({ sent: 0 });
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
