import { describe, expect, it } from "vitest";
import { embedCode } from "./embed";

describe("embedCode", () => {
    it("points an iframe at the embed view and escapes the title", () => {
        const code = embedCode("https://shapeshift.app", "AbCdEfGhIj", 'My "cool" <scene>');
        expect(code).toContain('src="https://shapeshift.app/s/AbCdEfGhIj?embed=1"');
        expect(code).toContain('title="My &quot;cool&quot; &lt;scene&gt; · ShapeShift"');
    });
});
