import { useScene } from "../scene/store";
import { TEMPLATES } from "../scene/templates";
import { useAccount } from "../account/store";
import { frameScene } from "../viewport/frame";

// Acts on a link from the scene gallery: a saved scene, a template or a blank
// scene. Each is a normal edit, so undo brings back what was open before.
export function openFromUrl() {
    const url = new URL(location.href);
    const scene = url.searchParams.get("scene");
    const template = TEMPLATES.find((t) => t.id === url.searchParams.get("template"));
    const blank = url.searchParams.has("new");
    if (!scene && !template && !blank) return;

    for (const key of ["scene", "template", "new"]) url.searchParams.delete(key);
    history.replaceState(null, "", url.pathname + url.search + url.hash);

    const { run } = useScene.getState();
    if (scene) {
        void useAccount
            .getState()
            .openScene(scene)
            .then(frameScene)
            .catch(() => {});
        return;
    }
    // Not the saved scene any more, so changes mustn't autosave over it.
    useAccount.getState().unlink();
    if (template) {
        run([{ type: "clear" }, ...template.commands], { select: false });
        frameScene();
    } else if (useScene.getState().doc.objects.length || useScene.getState().doc.lights.length) {
        run({ type: "clear" });
    }
}
