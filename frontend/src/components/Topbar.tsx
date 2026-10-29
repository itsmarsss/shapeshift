import styled from "styled-components";
import { useEditor } from "../store/editor";
import {
    buildSceneFromObjects,
    exportSceneToGLB,
    exportSceneToGLTF,
    importObjectsFromGLTF,
} from "../utils/io";
import { saveScene, loadScene } from "../utils/local";
import { sceneToJSON, jsonToScene } from "../utils/scene";
import { saveAs } from "file-saver";
import type { EditorState } from "../types";
import {
    ArrowUUpLeft,
    ArrowUUpRight,
    ChatCircle,
    Export,
    FilePlus,
    FloppyDisk,
    FolderOpen,
    ListChecks,
    SlidersHorizontal,
    TrayArrowDown,
} from "@phosphor-icons/react";
import { IconButton, Segment, Segmented } from "./ui";
import { useAgentTimeline } from "../store/agentTimeline";

const Bar = styled.div`
    height: var(--topbar);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0 8px 0 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    position: relative;
    z-index: 100;
`;

const Group = styled.div<{ $end?: boolean }>`
    display: flex;
    align-items: center;
    gap: 2px;
    justify-self: ${(p) => (p.$end ? "end" : "start")};
`;

const Brand = styled.div`
    font-weight: 600;
    margin-right: 12px;
`;

const Sep = styled.div`
    width: 1px;
    height: 18px;
    margin: 0 6px;
    background: var(--border);
`;

const HiddenInput = styled.input`
    display: none;
`;

export function Topbar() {
    const undo = useEditor((s) => s.undo);
    const redo = useEditor((s) => s.redo);
    const toggleInspector = useEditor((s) => s.toggleInspector);
    const showInspector = useEditor((s) => s.showInspector);
    const showChatPanel = useEditor((s) => s.showChatPanel);
    const toggleChatPanel = useEditor((s) => s.toggleChatPanel);
    const showTimeline = useAgentTimeline((s) => s.showTimeline);
    const toggleTimeline = useAgentTimeline((s) => s.toggleTimeline);
    const setEditorMode = useEditor((s) => s.setEditorMode);
    const editorMode = useEditor((s) => s.editorMode);
    const clear = useEditor((s) => s.clear);
    const objects = useEditor((s) => s.objects);
    const mode = useEditor((s) => s.mode);
    const snap = useEditor((s) => s.snap);

    async function onExport() {
        const scene = buildSceneFromObjects(objects);
        await exportSceneToGLB(scene);
        await exportSceneToGLTF(scene);
    }

    function onSave() {
        const state = {
            objects,
            selectedId: useEditor.getState().selectedId,
            lights: useEditor.getState().lights,
            mode,
            editorMode,
            snap,
            past: [],
            future: [],
            checkpoints: [],
        } as EditorState;
        saveScene(state);
        const json = sceneToJSON(state);
        const blob = new Blob([json], { type: "application/json" });
        saveAs(blob, "scene.json");
    }

    function applyLoaded(loaded: ReturnType<typeof loadScene>) {
        if (!loaded) return;
        useEditor.setState((s) => ({
            ...s,
            objects: loaded.editor.objects,
            selectedId: loaded.editor.selectedId,
            mode: loaded.editor.mode,
            editorMode: loaded.editor.editorMode,
            snap: loaded.editor.snap,
            past: [],
            future: [],
        }));
    }

    function onLoad() {
        const input = document.getElementById(
            "load-file"
        ) as HTMLInputElement | null;
        if (input) input.click();
        else applyLoaded(loadScene());
    }

    function onLoadFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || "");
            const decoded = jsonToScene(text) || loadScene();
            applyLoaded(decoded);
            e.target.value = "";
        };
        reader.readAsText(file);
    }

    return (
        <Bar>
            <Group>
                <Brand>ShapeShift</Brand>
                <IconButton title="New scene" onClick={() => clear()}>
                    <FilePlus size={18} />
                </IconButton>
                <IconButton title="Open scene" onClick={onLoad}>
                    <FolderOpen size={18} />
                </IconButton>
                <IconButton title="Save scene" onClick={onSave}>
                    <FloppyDisk size={18} />
                </IconButton>
                <Sep />
                <IconButton
                    title="Import model"
                    onClick={() =>
                        document.getElementById("import-file")?.click()
                    }
                >
                    <TrayArrowDown size={18} />
                </IconButton>
                <IconButton title="Export as GLB and glTF" onClick={onExport}>
                    <Export size={18} />
                </IconButton>
                <HiddenInput
                    id="import-file"
                    type="file"
                    accept=".gltf,.glb,.json"
                    onChange={async (
                        e: React.ChangeEvent<HTMLInputElement>
                    ) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const ext =
                            file.name.toLowerCase().split(".").pop() || "";
                        try {
                            if (ext === "gltf" || ext === "glb") {
                                const imported = await importObjectsFromGLTF(
                                    file
                                );
                                if (imported.length > 0) {
                                    useEditor.setState((s) => ({
                                        ...s,
                                        objects: [...s.objects, ...imported],
                                        selectedId:
                                            imported[imported.length - 1]?.id ??
                                            s.selectedId,
                                        past: [],
                                        future: [],
                                    }));
                                }
                            } else if (ext === "json") {
                                const text = await file.text();
                                const decoded = jsonToScene(text);
                                applyLoaded(decoded);
                            }
                        } finally {
                            e.target.value = "";
                        }
                    }}
                />
                <HiddenInput
                    id="load-file"
                    type="file"
                    accept=".json"
                    onChange={onLoadFileChange}
                />
            </Group>
            <Segmented>
                <Segment
                    $active={editorMode === "object"}
                    onClick={() => setEditorMode("object")}
                >
                    Object
                </Segment>
                <Segment
                    $active={editorMode === "edit"}
                    onClick={() => setEditorMode("edit")}
                >
                    Edit
                </Segment>
                <Segment
                    $active={editorMode === "render"}
                    onClick={() => setEditorMode("render")}
                >
                    Render
                </Segment>
            </Segmented>
            <Group $end>
                <IconButton title="Undo" onClick={undo}>
                    <ArrowUUpLeft size={18} />
                </IconButton>
                <IconButton title="Redo" onClick={redo}>
                    <ArrowUUpRight size={18} />
                </IconButton>
                <Sep />
                <IconButton
                    title="Inspector"
                    $active={showInspector}
                    onClick={toggleInspector}
                >
                    <SlidersHorizontal size={18} />
                </IconButton>
                <IconButton
                    title="Agent steps"
                    $active={showTimeline}
                    onClick={toggleTimeline}
                >
                    <ListChecks size={18} />
                </IconButton>
                <IconButton
                    title="Assistant"
                    $active={showChatPanel}
                    onClick={toggleChatPanel}
                >
                    <ChatCircle size={18} />
                </IconButton>
            </Group>
        </Bar>
    );
}

export default Topbar;
