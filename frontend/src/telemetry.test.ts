import { describe, expect, it } from "vitest";
import { browserLabel } from "./telemetry";

describe("browserLabel", () => {
    it("names the browser, its major version and the system, nothing finer", () => {
        const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)";
        expect(browserLabel(`${mac} Chrome/140.0.1.2 Safari/537.36`)).toBe("Chrome 140 · macOS");
        expect(browserLabel(`${mac} Chrome/140.0.1.2 Safari/537.36 Edg/140.0.1`)).toBe("Edge 140 · macOS");
        expect(browserLabel(`${mac} Version/18.2 Safari/605.1.15`)).toBe("Safari 18 · macOS");
        expect(browserLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0")).toBe("Firefox 133 · Windows");
        expect(browserLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1")).toBe("Safari 18 · iOS");
        expect(browserLabel("curl/8")).toBe("Other browser");
    });
});
