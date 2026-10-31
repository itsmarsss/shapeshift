import { describe, expect, it } from "vitest";
import { stretched } from "./stretch";

const start = { scale: [1, 2, 1] as [number, number, number], rotation: [0, 0.5, 0] as [number, number, number] };

describe("stretched", () => {
    it("ignores small wobbles of the hands", () => {
        expect(stretched(start, 1.03, 0.05, null)).toEqual(start);
    });

    it("scales evenly as the hands spread and shrinks as they close", () => {
        const big = stretched(start, 2, 0, null);
        expect(big.scale[0]).toBeGreaterThan(1.8);
        expect(big.scale[1] / big.scale[0]).toBeCloseTo(2);
        expect(stretched(start, 0.5, 0, null).scale[0]).toBeLessThan(0.55);
        expect(stretched(start, 1000, 0, null).scale[0]).toBeLessThanOrEqual(20);
    });

    it("turns clockwise from above for a clockwise twist, snapping when asked", () => {
        expect(stretched(start, 1, 1, null).rotation[1]).toBeLessThan(0.5);
        expect(stretched(start, 1, -1, null).rotation[1]).toBeGreaterThan(0.5);
        const snapped = stretched(start, 1, 0.5, Math.PI / 12).rotation[1];
        expect(Math.abs(((0.5 - snapped) / (Math.PI / 12)) % 1)).toBeCloseTo(0);
    });
});
