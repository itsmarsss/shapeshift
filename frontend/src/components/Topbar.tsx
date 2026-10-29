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

const Bar = styled.div`
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    background: rgba(20, 22, 28, 0.9);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(10px);
    position: relative;
    z-index: 100;
`;

const Group = styled.div`
    display: flex;
    gap: 8px;
`;

const Btn = styled.button`
    background: #12141a;
    color: #e6e9ef;
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 6px 10px;
    border-radius: 8px;
`;

const HiddenInput = styled.input`
    display: none;
`;
export function Topbar() {
    const undo = useEditor((s) => s.undo);
    const redo = useEditor((s) => s.redo);
    const toggleInspector = useEditor((s) => s.toggleInspector);
    const setShowChatPanel = useEditor((s) => s.setShowChatPanel);
    const setEditorMode = useEditor((s) => s.setEditorMode);
    const editorMode = useEditor((s) => s.editorMode);
    const clear = useEditor((s) => s.clear);
    const objects = useEditor((s) => s.objects);
    const mode = useEditor((s) => s.mode);
    const snap = useEditor((s) => s.snap);

    async function onExport() {
        const scene = buildSceneFromObjects(objects);
        // Export GLB (binary) and GLTF (JSON)
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
        // Persist to localStorage
        saveScene(state);
        // Download as JSON file for explicit user feedback
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
        // Prefer file picker to visibly do something; fallback to localStorage if no file chosen
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
            // reset input so selecting the same file again triggers change
            e.target.value = "";
        };
        reader.readAsText(file);
    }

    return (
        <Bar>
            <Group>
                <Btn onClick={() => clear()}>New</Btn>
                <Btn onClick={onSave}>Save</Btn>
                <Btn onClick={onLoad}>Load</Btn>
                <Btn
                    onClick={() =>
                        document.getElementById("import-file")?.click()
                    }
                >
                    Import
                </Btn>
                <Btn onClick={onExport}>Export</Btn>
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
            <Group>
                <Btn
                    onClick={() => setEditorMode("object")}
                    style={{ opacity: editorMode === "object" ? 1 : 0.7 }}
                >
                    Object
                </Btn>
                <Btn
                    onClick={() => setEditorMode("edit")}
                    style={{ opacity: editorMode === "edit" ? 1 : 0.7 }}
                >
                    Edit
                </Btn>
                <Btn
                    onClick={() => setEditorMode("render")}
                    style={{ opacity: editorMode === "render" ? 1 : 0.7 }}
                >
                    Render
                </Btn>
            </Group>
            <Group>
                <Btn onClick={undo}>Undo</Btn>
                <Btn onClick={redo}>Redo</Btn>
                <Btn
                    onClick={toggleInspector}
                >
                    🔍
                </Btn>
                <Btn
                    onClick={() => setShowChatPanel(true)}
                >
                    💬
                </Btn>
            </Group>
        </Bar>
    );
}

export default Topbar;
