import { beforeEach, describe, expect, it } from "vitest";
import type { Command } from "@shapeshift/shared/scene/schema";
import { checkScene, issueCounts } from "./checks";
import { insertLibraryItem, LIBRARY } from "./library";
import { emptyDoc, useScene } from "./store";

const s = () => useScene.getState();
const build = (...commands: Command[]) => {
    s().run(commands);
    return s().doc;
};
const id = (name: string) => s().doc.objects.find((o) => o.name === name)!.id;
const box = (name: string, position: [number, number, number], size: [number, number, number] = [1, 1, 1], group?: string): Command => ({
    type: "add",
    primitive: "box",
    name,
    position,
    geometry: { type: "box", width: size[0], height: size[1], depth: size[2] },
    ...(group ? { group } : {}),
});

beforeEach(() => s().load(emptyDoc()));

describe("scene checks", () => {
    it("finds nothing wrong with a stack resting on the ground", () => {
        expect(checkScene(build(box("Base", [0, 0.5, 0]), box("Top", [0, 1.25, 0], [0.5, 0.5, 0.5])))).toEqual([]);
    });

    it("says how far a floating part is above what's under it", () => {
        const issues = checkScene(build(box("Base", [0, 0.5, 0]), box("Lid", [0, 1.45, 0], [1, 0.1, 1])));
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ kind: "floating", ids: [id("Lid")] });
        expect(issues[0].message).toContain("0.4 m above Base");
    });

    it("calls a part stopping just short of its own build a gap, not floating", () => {
        const issues = checkScene(build(box("Body", [0, 0.5, 0], [1, 1, 1], "Robot"), box("Arm", [0.64, 0.7, 0], [0.2, 0.1, 0.1], "Robot")));
        expect(issues).toHaveLength(1);
        expect(issues[0].kind).toBe("gap");
        expect(issues[0].message).toContain("0.04 m short of Body");
    });

    it("reports a whole floating group once, by its name", () => {
        const issues = checkScene(build(box("A", [0, 2.5, 0], [1, 1, 1], "Cloud"), box("B", [1, 2.5, 0], [1, 1, 1], "Cloud")));
        expect(issues).toHaveLength(1);
        expect(issues[0].message).toMatch(/^Group "Cloud" floats 2 m above the ground/);
    });

    it("finds parts placed by their center into the ground, but not terrain or a settled rock", () => {
        const issues = checkScene(build(box("Post", [0, 0, 0])));
        expect(issues.map((i) => i.kind)).toEqual(["sunken"]);
        expect(issues[0].message).toContain("0.5 m below");
        s().load(emptyDoc());
        expect(checkScene(build(box("Hill", [0, 0, 0], [6, 1, 6]), box("Rock", [3, 0.4, 3], [0.5, 1, 0.5])))).toEqual([]);
    });

    it("finds separate things running into each other, but not parts of one build", () => {
        expect(checkScene(build(box("Seat", [0, 0.5, 0], [1, 0.2, 1], "Chair"), box("Leg", [0.4, 0.3, 0.4], [0.1, 0.6, 0.1], "Chair"))).filter((i) => i.kind === "overlap")).toEqual([]);
        s().load(emptyDoc());
        const issues = checkScene(build(box("Crate", [0, 0.5, 0], [1, 1, 1], "Crate"), box("Barrel", [0.4, 0.5, 0], [1, 1, 1], "Barrel")));
        expect(issues.map((i) => i.kind)).toEqual(["overlap"]);
    });

    it("finds a part hidden inside another of its build", () => {
        const issues = checkScene(build(box("Head", [0, 0.5, 0], [1, 1, 1], "Bot"), box("Eye", [0, 0.6, 0], [0.2, 0.2, 0.2], "Bot")));
        expect(issues).toHaveLength(1);
        expect(issues[0].message).toBe("Eye is hidden inside Head. Move it to where it should show, or remove it.");
    });

    it("leaves holes out", () => {
        const doc = build(box("Wall", [0, 0.5, 0], [2, 1, 0.2], "W"), box("Window", [0, 0.6, 0], [0.5, 0.5, 0.5], "W"));
        s().run({ type: "hole", target: "Window", hole: true });
        expect(checkScene(s().doc)).toEqual([]);
        expect(doc).toBeTruthy();
    });

    it("only reports what involves the given objects", () => {
        build(box("Old", [5, 3, 0]), box("New", [0, 3, 0]));
        expect(checkScene(s().doc, { only: [id("New")] }).map((i) => i.ids)).toEqual([[id("New")]]);
    });

    it("counts by kind", () => {
        build(box("A", [0, 3, 0]), box("B", [3, 0, 0]));
        expect(issueCounts(checkScene(s().doc))).toEqual({ floating: 1, gap: 0, sunken: 1, overlap: 0 });
    });

    it.each(LIBRARY.map((item) => [item.name, item] as const))("finds nothing wrong with the ready-made %s", (_, item) => {
        insertLibraryItem(item);
        expect(checkScene(s().doc).map((i) => i.message)).toEqual([]);
    });
});
