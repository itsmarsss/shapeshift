import { describe, expect, it } from "vitest";
import { SceneDoc } from "@shapeshift/shared/scene/schema";
import { buildTemplate } from "../scene/templates";
import { SAMPLES } from "./samples";

describe("sample projects", () => {
    it.each(SAMPLES.map((s) => [s.id, s] as const))("%s builds into a valid scene with every shape in it", (_, sample) => {
        const doc = buildTemplate(sample);
        expect(SceneDoc.safeParse(doc).success).toBe(true);
        const adds = sample.commands.filter((c) => c.type === "add").length;
        expect(doc.objects).toHaveLength(adds);
        expect(adds).toBeGreaterThan(15);
    });

    it("animates the windmill and the station", () => {
        for (const id of ["windmill", "station"]) expect(buildTemplate(SAMPLES.find((s) => s.id === id)!).animation.tracks.length).toBeGreaterThan(0);
    });

    it("has unique ids", () => {
        expect(new Set(SAMPLES.map((s) => s.id)).size).toBe(SAMPLES.length);
    });
});
