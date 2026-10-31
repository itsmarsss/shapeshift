import { describe, expect, it, vi } from "vitest";
import { handleTelemetry } from "./telemetry";

function env() {
    return {
        CHAT_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
        EVENTS: { writeDataPoint: vi.fn() },
    } as unknown as Env & { EVENTS: { writeDataPoint: ReturnType<typeof vi.fn> } };
}

const post = (path: string, body: unknown) => new Request(`https://x${path}`, { method: "POST", body: JSON.stringify(body) });

describe("telemetry", () => {
    it("records known events with only a name, a short label, a number and the anonymous id", async () => {
        const e = env();
        const res = (await handleTelemetry(post("/api/events", { event: "template_used", label: "snowman", value: 0, id: "abc", email: "a@b.co" }), e))!;
        expect(res.status).toBe(204);
        expect(e.EVENTS.writeDataPoint).toHaveBeenCalledWith({ indexes: ["template_used"], blobs: ["template_used", "snowman", "abc"], doubles: [0] });
    });

    it("refuses unknown events and oversized bodies", async () => {
        const e = env();
        expect((await handleTelemetry(post("/api/events", { event: "anything" }), e))!.status).toBe(400);
        expect((await handleTelemetry(post("/api/events", { event: "app_open", label: "x".repeat(5000) }), e))!.status).toBe(400);
        expect(e.EVENTS.writeDataPoint).not.toHaveBeenCalled();
    });

    it("logs crash reports on one line", async () => {
        const e = env();
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        await handleTelemetry(post("/api/errors", { where: "render", message: "boom", stack: "at x", page: "/edit" }), e);
        expect(log).toHaveBeenCalledWith("client error", expect.stringContaining('"message":"boom"'));
        log.mockRestore();
    });
});
