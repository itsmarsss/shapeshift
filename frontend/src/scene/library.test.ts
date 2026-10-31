import { beforeEach, describe, expect, it } from "vitest";
import { SceneDoc } from "@shapeshift/shared/scene/schema";
import { emptyDoc, useScene } from "./store";
import { insertLibraryItem, LIBRARY } from "./library";
import { worldBounds } from "../assistant/assistant";

const s = () => useScene.getState();
beforeEach(() => s().load(emptyDoc()));

describe("ready-made objects", () => {
    it.each(LIBRARY.map((item) => [item.name, item] as const))("%s goes in as one group, resting on the floor, in one undo step", (_, item) => {
        insertLibraryItem(item);
        const { doc } = s();
        expect(SceneDoc.safeParse(doc).success).toBe(true);
        expect(doc.objects).toHaveLength(item.parts.length);
        expect(new Set(doc.objects.map((o) => o.group))).toEqual(new Set([item.name]));
        expect(s().selectedIds).toHaveLength(item.parts.length);
        const lowest = Math.min(...doc.objects.map((o) => worldBounds(o).min[1]));
        expect(lowest).toBeGreaterThanOrEqual(-0.001);
        expect(lowest).toBeLessThan(0.05);
        expect(s().past).toHaveLength(1);
        s().undo();
        expect(s().doc.objects).toHaveLength(0);
    });

    it("names a second copy's group apart from the first and puts it elsewhere", () => {
        insertLibraryItem(LIBRARY[0]);
        insertLibraryItem(LIBRARY[0]);
        const groups = new Set(s().doc.objects.map((o) => o.group));
        expect(groups).toEqual(new Set(["Chair", "Chair 2"]));
        const [a, b] = ["Chair", "Chair 2"].map((g) => s().doc.objects.find((o) => o.group === g && o.name.startsWith("Seat"))!.position);
        expect(a).not.toEqual(b);
    });
});
