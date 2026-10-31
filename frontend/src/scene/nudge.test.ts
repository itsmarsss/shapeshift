import { describe, expect, it } from "vitest";
import { nudgeDirection } from "./nudge";

describe("nudgeDirection", () => {
    it("moves away from and across the camera from the front", () => {
        expect(nudgeDirection("ArrowUp", 0)).toEqual([0, -1]);
        expect(nudgeDirection("ArrowDown", 0)).toEqual([0, 1]);
        expect(nudgeDirection("ArrowRight", 0)).toEqual([1, 0]);
        expect(nudgeDirection("ArrowLeft", 0)).toEqual([-1, 0]);
    });

    it("follows the camera around, rounded to a grid axis", () => {
        // Looking from the right side, "away" is toward -X.
        expect(nudgeDirection("ArrowUp", Math.PI / 2)).toEqual([-1, 0]);
        expect(nudgeDirection("ArrowRight", Math.PI / 2)).toEqual([0, -1]);
        // A little off the front still snaps to straight ahead.
        expect(nudgeDirection("ArrowUp", 0.3)).toEqual([0, -1]);
    });
});
