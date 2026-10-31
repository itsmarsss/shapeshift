import { useScene } from "../scene/store";
import { useUI } from "./store";

// The inspector shows what's selected, so with nothing selected it gets out of
// the way. The inspector button still opens it then, for the scene's lighting
// and snapping, until something is selected and let go again.

export function useInspectorVisible() {
    const show = useUI((s) => s.showInspector);
    const sceneOpen = useUI((s) => s.sceneOpen);
    const selected = useScene((s) => s.selectedIds.length > 0);
    return show && (selected || sceneOpen);
}

export function inspectorVisible() {
    const ui = useUI.getState();
    return ui.showInspector && (useScene.getState().selectedIds.length > 0 || ui.sceneOpen);
}

export function toggleInspector() {
    const selected = useScene.getState().selectedIds.length > 0;
    const ui = useUI.getState();
    if (inspectorVisible()) {
        if (selected) ui.setShowInspector(false);
        useUI.setState({ sceneOpen: false });
        return;
    }
    ui.setShowInspector(true);
    if (!selected) useUI.setState({ sceneOpen: true });
}

useScene.subscribe((state, prev) => {
    if (prev.selectedIds.length > 0 && state.selectedIds.length === 0 && useUI.getState().sceneOpen) useUI.setState({ sceneOpen: false });
});
