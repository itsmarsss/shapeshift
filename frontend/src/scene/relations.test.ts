import { beforeEach, describe, expect, it } from "vitest";
import type { Command } from "@shapeshift/shared/scene/schema";
import { worldBounds } from "../assistant/assistant";
import { emptyDoc, useScene } from "./store";

const s = () => useScene.getState();
const get = (name: string) => s().doc.objects.find((o) => o.name === name)!;
const bounds = (name: string) => worldBounds(get(name));
const box = (name: string, position: [number, number, number], size: [number, number, number], group?: string): Command => ({
    type: "add",
    primitive: "box",
    name,
    position,
    geometry: { type: "box", width: size[0], height: size[1], depth: size[2] },
    ...(group ? { group } : {}),
});
const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 5));

beforeEach(() => s().load(emptyDoc()));

describe("place", () => {
    beforeEach(() => s().run([box("Top", [2, 0.75, 1], [1.2, 0.05, 0.8], "Table"), box("Mug", [0, 0.05, 0], [0.1, 0.1, 0.1]), box("Lamp", [0, 0.2, 0], [0.2, 0.4, 0.2])]));

    it("puts one thing on another, centered or at a spot that stays on the top", () => {
        expect(s().run({ type: "place", target: "Mug", relation: "on", of: "Table" })[0].ok).toBe(true);
        near(bounds("Mug").min, [1.95, 0.775, 0.95]);
        s().run({ type: "place", target: "Lamp", relation: "on", of: "Top", spot: "back-right" });
        near(bounds("Lamp").max, [2.6, 1.175, 0.8]);
        expect(bounds("Lamp").min[2]).toBeCloseTo(0.6);
        // Resting right on the top.
        expect(bounds("Mug").min[1]).toBeCloseTo(bounds("Top").max[1]);
    });

    it("puts things beside each other, touching or with a gap, bottoms level", () => {
        s().run({ type: "place", target: "Lamp", relation: "right_of", of: "Mug", gap: 0.1 });
        expect(bounds("Lamp").min[0]).toBeCloseTo(bounds("Mug").max[0] + 0.1);
        expect(bounds("Lamp").min[1]).toBeCloseTo(bounds("Mug").min[1]);
        s().run({ type: "place", target: "Mug", relation: "in_front_of", of: "Top", offset: [0, 0.5, 0] });
        expect(bounds("Mug").min[2]).toBeCloseTo(bounds("Top").max[2]);
        expect(bounds("Mug").min[1]).toBeCloseTo(bounds("Top").min[1] + 0.5);
    });

    it("moves a group as one piece", () => {
        s().run({ type: "place", target: "Table", relation: "left_of", of: "Lamp" });
        expect(bounds("Top").max[0]).toBeCloseTo(bounds("Lamp").min[0]);
    });

    it("won't place something against itself", () => {
        const [r] = s().run({ type: "place", target: "Table", relation: "on", of: "Top" });
        expect(r.ok).toBe(false);
    });
});

describe("array", () => {
    it("makes a row of a part inside its own build", () => {
        s().run(box("Post", [0, 0.5, 0], [0.1, 1, 0.1], "Fence"));
        const [r] = s().run({ type: "array", target: "Post", count: 4, layout: "row", step: 0.5 });
        expect(r.ok && r.created).toHaveLength(3);
        const posts = s().doc.objects.map((o) => o.position[0]);
        posts.forEach((x, i) => expect(x).toBeCloseTo(i * 0.5));
        expect(new Set(s().doc.objects.map((o) => o.group))).toEqual(new Set(["Fence"]));
    });

    it("lays a grid out across X, then along Z", () => {
        s().run(box("Tile", [0, 0.05, 0], [1, 0.1, 1]));
        s().run({ type: "array", target: "Tile", count: 6, layout: "grid", columns: 3 });
        const spots = s().doc.objects.map((o) => [o.position[0], o.position[2]].map((v) => Math.round(v * 10) / 10));
        expect(spots).toEqual([[0, 0], [1.2, 0], [2.4, 0], [0, 1.2], [1.2, 1.2], [2.4, 1.2]]);
    });

    it("goes around something, each copy turned to keep facing it", () => {
        s().run([box("Table", [0, 0.4, 0], [1, 0.8, 1]), box("Seat", [0, 0.25, 1], [0.4, 0.5, 0.4], "Chair"), box("Back", [0, 0.6, 1.18], [0.4, 0.5, 0.04], "Chair")]);
        const [r] = s().run({ type: "array", target: "Chair", count: 4, layout: "circle", around: "Table" });
        expect(r.ok && r.created).toHaveLength(6);
        expect(new Set(s().doc.objects.map((o) => o.group).filter(Boolean))).toEqual(new Set(["Chair", "Chair 2", "Chair 3", "Chair 4"]));
        // A quarter turn puts the copy's seat on +X, and its back still further out.
        const seat = s().doc.objects.find((o) => o.group === "Chair 2" && o.name.startsWith("Seat"))!;
        const back = s().doc.objects.find((o) => o.group === "Chair 2" && o.name.startsWith("Back"))!;
        near(seat.position, [1, 0.25, 0]);
        expect(back.position[0]).toBeCloseTo(1.18);
    });

    it("says what's wrong with a circle it can't make", () => {
        s().run(box("Pillar", [0, 0.5, 0], [0.2, 1, 0.2]));
        expect(s().run({ type: "array", target: "Pillar", count: 6, layout: "circle" })[0].ok).toBe(false);
        expect(s().run({ type: "array", target: "Pillar", count: 6, layout: "circle", around: "Pillar" })[0].ok).toBe(false);
        expect(s().run({ type: "array", target: "Pillar", count: 6, layout: "circle", radius: 2 })[0].ok).toBe(true);
        expect(s().doc.objects).toHaveLength(6);
    });
});
