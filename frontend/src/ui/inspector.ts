import { useScene } from "../scene/store";
import { isCompact, useCompact } from "./compact";
import { useDock } from "./dock";
import { useUI } from "./store";

// A floating inspector shows what's selected, so with nothing selected it
// gets out of the way; the inspector button still opens it then, for the
// scene's lighting and snapping, until something is selected and let go again.
// Docked, it stays open and shows the scene when nothing is selected, like a
// sidebar, so the 3D view beside it doesn't jump with every click.

// Docked means it sits in a column, rather than floating.
const docked = (inColumn: boolean, compact: boolean) => inColumn && !compact;
const inColumn = (s: ReturnType<typeof useDock.getState>) => s.columns.left.some((x) => x.tabs.includes("inspector")) || s.columns.right.some((x) => x.tabs.includes("inspector"));

export function useInspectorVisible() {
    const show = useUI((s) => s.showInspector);
    const sceneOpen = useUI((s) => s.sceneOpen);
    const selected = useScene((s) => s.selectedIds.length > 0);
    const stays = docked(useDock(inColumn), useCompact());
    return show && (stays || selected || sceneOpen);
}

export function inspectorVisible() {
    const ui = useUI.getState();
    const stays = docked(inColumn(useDock.getState()), isCompact());
    return ui.showInspector && (stays || useScene.getState().selectedIds.length > 0 || ui.sceneOpen);
}

export function toggleInspector() {
    const selected = useScene.getState().selectedIds.length > 0;
    const ui = useUI.getState();
    if (docked(inColumn(useDock.getState()), isCompact())) return ui.setShowInspector(!ui.showInspector);
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
