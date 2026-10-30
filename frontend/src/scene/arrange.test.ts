import { beforeEach, describe, expect, it } from "vitest";
import { boundsIn } from "./geometry";
import { emptyDoc, useScene } from "./store";

const s = () => useScene.getState();
const get = (name: string) => s().doc.objects.find((o) => o.name === name)!;

beforeEach(() => s().load(emptyDoc()));

describe("hole", () => {
    it("marks objects and whole groups as holes, and back", () => {
        s().run([
            { type: "add", primitive: "box", name: "A", group: "G" },
            { type: "add", primitive: "box", name: "B", group: "G" },
            { type: "add", primitive: "sphere", name: "C" },
        ]);
        s().run({ type: "hole", target: "C", hole: true });
        expect(get("C").hole).toBe(true);
        s().run({ type: "hole", target: "G", hole: true });
        expect(get("A").hole && get("B").hole).toBe(true);
        s().run({ type: "hole", target: "C", hole: false });
        expect("hole" in get("C")).toBe(false);
        s().undo();
        expect(get("C").hole).toBe(true);
        expect(s().run({ type: "hole", target: "nope", hole: true })[0].ok).toBe(false);
    });
});

describe("align", () => {
    it("lines up objects by their bounds on one axis", () => {
        s().run([
            { type: "add", primitive: "box", name: "Small", position: [0, 0.5, 0] },
            { type: "add", primitive: "box", name: "Big", geometry: { type: "box", width: 3, height: 3, depth: 3 }, position: [5, 1.5, 2] },
        ]);
        s().run({ type: "align", targets: ["Small", "Big"], axis: "x", to: "min" });
        expect(boundsIn([get("Small")]).min.x).toBeCloseTo(boundsIn([get("Big")]).min.x);
        s().run({ type: "align", targets: ["Small", "Big"], axis: "y", to: "max" });
        expect(get("Small").position[1]).toBeCloseTo(2.5);
        s().run({ type: "align", targets: ["Small", "Big"], axis: "z", to: "center" });
        expect(get("Small").position[2]).toBeCloseTo(1.5);
        expect(get("Big").position[2]).toBeCloseTo(1.5);
    });

    it("moves a group as one piece", () => {
        s().run([
            { type: "add", primitive: "box", name: "A", position: [0, 0.5, 0], group: "G" },
            { type: "add", primitive: "box", name: "B", position: [2, 0.5, 0], group: "G" },
            { type: "add", primitive: "box", name: "C", position: [10, 0.5, 0] },
        ]);
        s().run({ type: "align", targets: ["G", "C"], axis: "x", to: "max" });
        expect(get("A").position[0]).toBeCloseTo(8);
        expect(get("B").position[0]).toBeCloseTo(10);
        expect(get("C").position[0]).toBeCloseTo(10);
        s().run({ type: "align", targets: ["G", "C"], axis: "x", to: "min" });
        expect(get("A").position[0]).toBeCloseTo(8);
        expect(get("C").position[0]).toBeCloseTo(8);
        expect(s().run({ type: "align", targets: ["G"], axis: "x", to: "min" })[0].ok).toBe(false);
    });
});

describe("mirror", () => {
    it("flips a shape across its own center", () => {
        s().run({ type: "add", primitive: "wedge", name: "W", position: [1, 0.5, 0] });
        const before = boundsIn([get("W")]);
        s().run({ type: "mirror", targets: ["W"], axis: "x" });
        const o = get("W");
        expect(o.position[0]).toBeCloseTo(1);
        expect(o.scale[0] * o.scale[1] * o.scale[2]).toBeCloseTo(-1);
        const after = boundsIn([o]);
        expect(after.min.x).toBeCloseTo(before.min.x);
        expect(after.max.x).toBeCloseTo(before.max.x);
    });

    it("swaps the sides of several objects", () => {
        s().run([
            { type: "add", primitive: "box", name: "L", position: [-2, 0.5, 0] },
            { type: "add", primitive: "sphere", name: "R", position: [3, 0.5, 0] },
        ]);
        s().run({ type: "mirror", targets: ["L", "R"], axis: "x" });
        expect(get("L").position[0]).toBeCloseTo(3);
        expect(get("R").position[0]).toBeCloseTo(-2);
    });
});

describe("drop", () => {
    it("rests objects on the ground", () => {
        s().run([
            { type: "add", primitive: "sphere", name: "Ball", position: [0, 4, 0] },
            { type: "add", primitive: "box", name: "Sunk", position: [2, -3, 0], rotation: [0.3, 0.2, 0.1] },
        ]);
        s().run({ type: "drop", targets: ["Ball", "Sunk"] });
        expect(boundsIn([get("Ball")]).min.y).toBeCloseTo(0);
        expect(boundsIn([get("Sunk")]).min.y).toBeCloseTo(0);
    });

    it("drops onto any plane and keeps a group together", () => {
        s().run([
            { type: "add", primitive: "box", name: "A", position: [0, 3, 0], group: "G" },
            { type: "add", primitive: "box", name: "B", position: [0, 5, 0], group: "G" },
        ]);
        s().run({ type: "drop", targets: ["G"], origin: [0, 1, 0], normal: [0, 2, 0] });
        expect(get("A").position[1]).toBeCloseTo(1.5);
        expect(get("B").position[1]).toBeCloseTo(3.5);
        s().run({ type: "drop", targets: ["A"], origin: [4, 0, 0], normal: [-1, 0, 0] });
        expect(get("A").position[0]).toBeCloseTo(3.5);
    });
});
