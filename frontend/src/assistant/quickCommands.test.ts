import { describe, expect, it } from "vitest";
import { parseQuickCommand } from "./quickCommands";

describe("parseQuickCommand", () => {
    it("reads short commands, however they're said", () => {
        expect(parseQuickCommand("Undo.")).toEqual({ type: "undo" });
        expect(parseQuickCommand("please delete that")).toEqual({ type: "delete" });
        expect(parseQuickCommand("Duplicate it please")).toEqual({ type: "duplicate" });
        expect(parseQuickCommand("add a ball")).toEqual({ type: "add", primitive: "sphere" });
        expect(parseQuickCommand("Make a donut!")).toEqual({ type: "add", primitive: "torus" });
        expect(parseQuickCommand("zoom to fit")).toEqual({ type: "fit" });
        expect(parseQuickCommand("switch to preview mode")).toEqual({ type: "mode", mode: "render" });
        expect(parseQuickCommand("Reshape")).toEqual({ type: "mode", mode: "edit" });
    });

    it("leaves anything longer or unknown to the assistant", () => {
        expect(parseQuickCommand("add a box on top of the table")).toBeNull();
        expect(parseQuickCommand("add a dragon")).toBeNull();
        expect(parseQuickCommand("make it red")).toBeNull();
        expect(parseQuickCommand("delete the red cube")).toBeNull();
        expect(parseQuickCommand("")).toBeNull();
    });
});
