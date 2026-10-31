import type { EditorMode } from "../scene/store";
import type { Primitive } from "@shapeshift/shared/scene/schema";

// Short spoken commands the editor does by itself, straight away and without
// using an assistant prompt. Only a whole phrase counts: "add a box" is done
// here, "add a box on the table" goes to the assistant.

export type QuickCommand =
    | { type: "undo" }
    | { type: "redo" }
    | { type: "delete" }
    | { type: "duplicate" }
    | { type: "add"; primitive: Primitive }
    | { type: "fit" }
    | { type: "resetView" }
    | { type: "selectAll" }
    | { type: "deselect" }
    | { type: "mode"; mode: EditorMode }
    | { type: "closeAssistant" };

const SHAPES: Record<string, Primitive> = {
    box: "box",
    cube: "box",
    block: "box",
    sphere: "sphere",
    ball: "sphere",
    cylinder: "cylinder",
    cone: "cone",
    ring: "torus",
    torus: "torus",
    donut: "torus",
    doughnut: "torus",
    plane: "plane",
    floor: "plane",
    wedge: "wedge",
    ramp: "wedge",
    roof: "roof",
    pyramid: "pyramid",
    dome: "halfSphere",
    tube: "tube",
    star: "star",
};

const MODES: Record<string, EditorMode> = { arrange: "object", reshape: "edit", preview: "render" };

const it = "(?: (?:it|that|this|them|those|the selection))?";
const PHRASES: [RegExp, (m: RegExpMatchArray) => QuickCommand | null][] = [
    [/^(?:undo|undo that|go back|take that back)$/, () => ({ type: "undo" })],
    [/^redo(?: that)?$/, () => ({ type: "redo" })],
    [new RegExp(`^(?:delete|remove|erase|get rid of)${it}$`), () => ({ type: "delete" })],
    [new RegExp(`^(?:duplicate|copy|clone)${it}$`), () => ({ type: "duplicate" })],
    [/^(?:add|make|create|insert|new)(?: (?:a|an|another|one))? (\w+)$/, (m) => (SHAPES[m[1]] ? { type: "add", primitive: SHAPES[m[1]] } : null)],
    [/^(?:fit(?: the)? view|zoom to fit|show (?:me )?everything|frame (?:it|that|everything))$/, () => ({ type: "fit" })],
    [/^reset(?: the)? (?:view|camera)$/, () => ({ type: "resetView" })],
    [/^select (?:all|everything)$/, () => ({ type: "selectAll" })],
    [/^(?:deselect|select nothing|clear(?: the)? selection)(?: all)?$/, () => ({ type: "deselect" })],
    [/^(?:switch to |go to )?(arrange|reshape|preview)(?: mode)?$/, (m) => ({ type: "mode", mode: MODES[m[1]] })],
    [/^(?:close|hide)(?: the)? assistant$/, () => ({ type: "closeAssistant" })],
];

// What was said, as a command the editor can do itself, if it is one.
export function parseQuickCommand(said: string): QuickCommand | null {
    const text = said
        .toLowerCase()
        .replace(/[^\w\s']/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^(?:please |ok |okay |now )+/, "")
        .replace(/(?: please| now)+$/, "");
    for (const [pattern, make] of PHRASES) {
        const m = text.match(pattern);
        if (m) return make(m);
    }
    return null;
}
