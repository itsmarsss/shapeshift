import { beforeEach, describe, expect, it } from "vitest";
import { emptyDoc, useScene } from "./store";
import { evaluate, evaluateTrack, keyTimes } from "./animation";
import { SceneDoc } from "./schema";

const s = () => useScene.getState();
beforeEach(() => s().load(emptyDoc()));

describe("animation", () => {
    it("records keyframes from current values and eases between them", () => {
        s().run({ type: "add", primitive: "box", name: "Box", position: [0, 0.5, 0] });
        s().run({ type: "keyframe", target: "Box", time: 0 });
        s().run({ type: "transform", target: "Box", position: [4, 0.5, 0] });
        s().run({ type: "keyframe", target: "Box", time: 2 });
        const id = s().doc.objects[0].id;
        const track = s().doc.animation.tracks.find((t) => t.target === id && t.property === "position")!;
        expect(evaluateTrack(track, 1)).toEqual([2, 0.5, 0]);
        expect((evaluateTrack(track, 0.5) as number[])[0]).toBeCloseTo(0.625);
        expect(evaluateTrack(track, 5)).toEqual([4, 0.5, 0]);
        expect(keyTimes(s().doc.animation, id)).toEqual([0, 2]);
    });

    it("animates colors and light intensity, and checks value types", () => {
        s().run({ type: "addLight", light: "point", name: "Bulb" });
        s().run({ type: "animate", target: "Bulb", property: "intensity", keys: [{ time: 0, value: 0, easing: "linear" }, { time: 1, value: 40 }] });
        s().run({ type: "animate", target: "Bulb", property: "color", keys: [{ time: 0, value: "#000000", easing: "linear" }, { time: 1, value: "#ffffff" }] });
        const pose = evaluate(s().doc.animation, 0.5).get(s().doc.lights[0].id)!;
        expect(pose.intensity).toBe(20);
        expect(pose.color).toBe("#808080");
        expect(s().run({ type: "animate", target: "Bulb", property: "intensity", keys: [{ time: 0, value: [1, 2, 3] }] })[0].ok).toBe(false);
    });

    it("animates every part of a group, stretches the timeline and steps", () => {
        s().run([
            { type: "add", primitive: "box", name: "A", group: "Car" },
            { type: "add", primitive: "box", name: "B", group: "Car" },
        ]);
        s().run({ type: "animate", target: "Car", property: "rotation", keys: [{ time: 0, value: [0, 0, 0], easing: "step" }, { time: 9.5, value: [0, 6.283, 0] }] });
        expect(s().doc.animation.tracks).toHaveLength(2);
        expect(s().doc.animation.duration).toBe(10);
        expect(evaluateTrack(s().doc.animation.tracks[0], 5)).toEqual([0, 0, 0]);
    });

    it("drops tracks with their object, and undo brings both back", () => {
        s().run({ type: "add", primitive: "box", name: "Box" });
        s().run({ type: "keyframe", target: "Box", time: 1 });
        s().run({ type: "remove", target: "Box" });
        expect(s().doc.animation.tracks).toHaveLength(0);
        s().undo();
        expect(s().doc.animation.tracks).toHaveLength(3);
        s().run({ type: "removeKeyframe", target: "Box", time: 1, property: "scale" });
        expect(s().doc.animation.tracks.map((t) => t.property)).toEqual(["position", "rotation"]);
        s().run({ type: "clearAnimation" });
        expect(s().doc.animation.tracks).toHaveLength(0);
        s().run({ type: "timeline", duration: 8, loop: false });
        expect(s().doc.animation).toMatchObject({ duration: 8, loop: false });
    });

    it("loads scenes saved before animation existed", () => {
        expect(SceneDoc.parse({ version: 2, objects: [] }).animation).toEqual({ duration: 4, loop: true, tracks: [] });
    });
});

describe("auto-key", () => {
    it("turns edits of animated objects into keyframes at the current time", async () => {
        const { transformCommand } = await import("./autokey");
        const { useTimeline } = await import("./timeline");
        s().run([
            { type: "add", primitive: "box", name: "Still", position: [5, 0.5, 0] },
            { type: "add", primitive: "box", name: "Moving", position: [0, 0.5, 0] },
        ]);
        const [still, moving] = s().doc.objects.map((o) => o.id);
        s().run({ type: "keyframe", target: moving, time: 0 });
        useTimeline.getState().seek(2);
        expect(transformCommand(still, { position: [1, 0, 0] })).toEqual({ type: "transform", target: still, position: [1, 0, 0] });
        s().run(transformCommand(moving, { position: [3, 0.5, 0] }));
        const track = s().doc.animation.tracks.find((t) => t.target === moving && t.property === "position")!;
        expect(track.keys.map((k) => [k.time, k.value])).toEqual([
            [0, [0, 0.5, 0]],
            [2, [3, 0.5, 0]],
        ]);
        expect(useTimeline.getState().poses.get(moving)?.position).toEqual([3, 0.5, 0]);
    });
});
