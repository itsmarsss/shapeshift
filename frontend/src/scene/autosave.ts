import { parseSceneFile } from "./io";
import { useScene } from "./store";
import { useSettings } from "../settings/store";

const KEY = "shapeshift-scene";

export function startAutosave() {
    try {
        const saved = localStorage.getItem(KEY);
        const doc = saved ? parseSceneFile(saved) : null;
        if (doc) useScene.getState().load(doc);
    } catch {
        localStorage.removeItem(KEY);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    return useScene.subscribe((state, prev) => {
        if (state.doc === prev.doc || !useSettings.getState().autosave) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            try {
                localStorage.setItem(KEY, JSON.stringify(state.doc));
            } catch (error) {
                console.warn("Autosave failed", error);
            }
        }, 300);
    });
}
