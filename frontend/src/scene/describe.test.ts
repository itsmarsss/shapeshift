import { beforeEach, describe, expect, it } from "vitest";
import { emptyDoc, useScene } from "./store";
import { describeDiff, diffKind } from "./describe";

const s = () => useScene.getState();
const last = () => describeDiff(s().past[s().past.length - 1]);

beforeEach(() => s().load(emptyDoc()));

describe("describeDiff", () => {
    it("names single changes by what changed", () => {
        s().run({ type: "add", primitive: "box" });
        expect(last()).toBe("Added Box");
        expect(diffKind(s().past[0])).toBe("add");
        s().run({ type: "transform", target: "Box", position: [2, 0, 0] });
        expect(last()).toBe("Moved Box");
        s().run({ type: "transform", target: "Box", scale: [2, 2, 2] });
        expect(last()).toBe("Resized Box");
        s().run({ type: "material", target: "Box", color: "#ff0000" });
        expect(last()).toBe("Recolored Box");
        s().run({ type: "material", target: "Box", roughness: 0.1, metalness: 1 });
        expect(last()).toBe("Restyled Box");
        s().run({ type: "rename", target: "Box", name: "Crate" });
        expect(last()).toBe("Renamed Crate");
        s().run({ type: "remove", target: "Crate" });
        expect(last()).toBe("Deleted Crate");
        expect(diffKind(s().past[s().past.length - 1])).toBe("remove");
    });

    it("counts changes to several things", () => {
        s().run([
            { type: "add", primitive: "box" },
            { type: "add", primitive: "sphere" },
            { type: "add", primitive: "cone" },
        ]);
        expect(last()).toBe("Added 3 objects");
        s().run({ type: "addLight", light: "point" });
        expect(last()).toBe("Added Point Light");
    });

    it("describes the lighting preset", () => {
        s().run({ type: "environment", preset: "sunset" });
        expect(last()).toBe("Lighting set to sunset");
    });
});
