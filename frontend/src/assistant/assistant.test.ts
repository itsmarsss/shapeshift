import { describe, expect, it } from "vitest";
import { describeScene, summarize, toCommands } from "./assistant";
import type { SceneDoc } from "../scene/schema";

const doc: SceneDoc = {
    version: 2,
    objects: [
        {
            id: "a1",
            name: "Box",
            geometry: { type: "box", width: 1, height: 1, depth: 1 },
            position: [0, 0.5, 0],
            rotation: [0, Math.PI / 2, 0],
            scale: [1, 1, 1],
            material: { color: "#c8ccd4", metalness: 0, roughness: 0.6, opacity: 1 },
        },
    ],
};

describe("toCommands", () => {
    it("parses every tool call and keeps the valid ones", () => {
        const { commands, errors } = toCommands([
            { function: { name: "add", arguments: '{"primitive":"sphere","position":[2,0.5,0]}' } },
            { function: { name: "material", arguments: '{"target":"Box","color":"#ff0000"}' } },
            { function: { name: "material", arguments: '{"target":"Box","color":"red"}' } },
            { function: { name: "explode", arguments: "{}" } },
            { function: { name: "insert", arguments: '{"objects":[]}' } },
        ]);
        expect(commands.map((c) => c.type)).toEqual(["add", "material"]);
        expect(errors).toHaveLength(3);
    });

    it("ignores a type field smuggled into the arguments", () => {
        const { commands } = toCommands([{ function: { name: "remove", arguments: '{"type":"clear","target":"Box"}' } }]);
        expect(commands).toEqual([{ type: "remove", target: "Box" }]);
    });
});

describe("descriptions", () => {
    it("describes the scene in degrees with the selection marked", () => {
        expect(describeScene(doc, "a1")).toBe('"Box", box 1x1x1, at [0, 0.5, 0], rotation [0, 90, 0] degrees, scale [1, 1, 1], #c8ccd4, (selected)');
    });

    it("summarizes what was done", () => {
        expect(summarize([{ type: "add", primitive: "cone" }, { type: "remove", target: "a1" }], doc)).toBe("Added a cone, removed Box.");
    });
});
