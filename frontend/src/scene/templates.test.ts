import { beforeEach, describe, expect, it } from "vitest";
import { SceneDoc } from "@shapeshift/shared/scene/schema";
import { emptyDoc, useScene } from "./store";
import { TEMPLATES } from "./templates";

const s = () => useScene.getState();

beforeEach(() => s().load(emptyDoc()));

describe("templates", () => {
    it.each(TEMPLATES.map((t) => [t.name, t] as const))("%s builds a valid scene", (_, template) => {
        const results = s().run([{ type: "clear" }, ...template.commands]);
        expect(results.filter((r) => !r.ok)).toEqual([]);
        expect(SceneDoc.safeParse(s().doc).success).toBe(true);
        expect(s().doc.objects.length).toBeGreaterThan(0);
    });
});
