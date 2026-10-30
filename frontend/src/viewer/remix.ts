import { SceneDoc } from "@shapeshift/shared/scene/schema";
import { useScene } from "../scene/store";

export const REMIX_KEY = "shapeshift-remix";

// A scene picked with "Remix" on a share page opens in the editor as a normal
// edit, so undo brings back whatever was there before.
export function openPendingRemix() {
    try {
        const raw = localStorage.getItem(REMIX_KEY);
        if (!raw) return;
        localStorage.removeItem(REMIX_KEY);
        const doc = SceneDoc.safeParse(JSON.parse(raw));
        if (!doc.success) return;
        // A remix is a new scene, so it mustn't autosave over a linked cloud scene.
        localStorage.removeItem("shapeshift-cloud-scene");
        useScene.getState().replaceDoc(doc.data);
    } catch {
        // Nothing to open.
    }
}
