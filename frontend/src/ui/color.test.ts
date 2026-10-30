import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, normalizeHex } from "./color";

describe("color", () => {
    it("reads hex in the forms people type", () => {
        expect(normalizeHex("#FF8800")).toBe("#ff8800");
        expect(normalizeHex("f80")).toBe("#ff8800");
        expect(normalizeHex(" #abc ")).toBe("#aabbcc");
        expect(normalizeHex("orange")).toBeNull();
        expect(normalizeHex("#12345")).toBeNull();
    });

    it("converts between hex and HSV without drifting", () => {
        for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000", "#c8ccd4", "#8e4ec6", "#f28c28"]) {
            expect(hsvToHex(hexToHsv(hex))).toBe(hex);
        }
        expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
        expect(hexToHsv("#0000ff").h).toBeCloseTo(240);
    });
});
