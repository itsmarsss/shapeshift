import { describe, expect, it, vi } from "vitest";
import { feedbackPictureKey, handleFeedback } from "./feedback";
import { testDatabase } from "./test/d1";
import { testBucket } from "./test/r2";

const env = () => ({ DB: testDatabase(), SCENES: testBucket(), CHAT_LIMITER: { limit: vi.fn(async () => ({ success: true })) } }) as unknown as Env & { SCENES: ReturnType<typeof testBucket> };
const post = (body: unknown) => new Request("https://x/api/feedback", { method: "POST", body: JSON.stringify(body) });

describe("feedback", () => {
    it("keeps the message, a reply address and the scene picture", async () => {
        const e = env();
        const res = (await handleFeedback(post({ message: "The gizmo is hard to grab", email: "kid@school.edu", page: "/edit", picture: "data:image/jpeg;base64,/9j/4AAQ" }), e))!;
        expect(res.status).toBe(200);
        const row = await e.DB.prepare("SELECT id, message, email, page, has_picture FROM feedback").first<{ id: string; message: string; email: string; page: string; has_picture: number }>();
        expect(row).toMatchObject({ message: "The gizmo is hard to grab", email: "kid@school.edu", page: "/edit", has_picture: 1 });
        expect(await e.SCENES.get(feedbackPictureKey(row!.id))).not.toBeNull();
    });

    it("refuses an empty message or a bad email", async () => {
        const e = env();
        expect((await handleFeedback(post({ message: "  " }), e))!.status).toBe(400);
        expect((await handleFeedback(post({ message: "hi", email: "nope" }), e))!.status).toBe(400);
        expect(await e.DB.prepare("SELECT COUNT(*) AS n FROM feedback").first<{ n: number }>()).toEqual({ n: 0 });
    });
});
