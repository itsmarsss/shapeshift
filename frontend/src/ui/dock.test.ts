import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDock } from "./dock";

beforeEach(() => {
    vi.stubGlobal("window", { innerHeight: 860 });
    useDock.getState().reset();
});

describe("dock layout", () => {
    it("leaves a panel where it was when it's dropped on its own stack", () => {
        const dock = useDock.getState();
        dock.move("history", { kind: "split", side: "bottom", index: 0 });
        dock.move("assistant", { kind: "split", side: "bottom", index: 1 });
        const before = useDock.getState().columns.bottom.map((s) => s.tabs);
        useDock.getState().move("history", { kind: "tab", side: "bottom", stack: 0 });
        expect(useDock.getState().columns.bottom.map((s) => s.tabs)).toEqual(before);
    });

    it("keeps room for the view between the top and bottom rows", () => {
        const dock = useDock.getState();
        dock.move("history", { kind: "split", side: "bottom", index: 0 });
        dock.move("inspector", { kind: "split", side: "top", index: 0 });
        useDock.getState().setSize("top", 600);
        useDock.getState().setSize("bottom", 600);
        const { top, bottom } = useDock.getState().height;
        expect(top + bottom).toBeLessThanOrEqual(860 - 48 - 160);
    });
});
