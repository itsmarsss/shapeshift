import { useScene, type EditorMode } from "./store";

// Preview: the scene lit and shaded, without the editing helpers. It's a way
// of looking rather than a mode to work in, so it remembers what you were
// doing and goes back to it. Holding Space peeks for as long as it's held.

let before: EditorMode = "object";

export function startLook() {
    const s = useScene.getState();
    if (s.mode === "render") return;
    before = s.mode;
    s.endCoalesce();
    s.setMode("render");
}

export function stopLook() {
    const s = useScene.getState();
    if (s.mode === "render") s.setMode(before);
}

export function toggleLook() {
    if (useScene.getState().mode === "render") stopLook();
    else startLook();
}
