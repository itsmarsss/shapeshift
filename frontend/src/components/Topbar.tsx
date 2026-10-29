import { useRef } from "react";
import styled from "styled-components";
import {
    ArrowUUpLeft,
    ArrowUUpRight,
    ChatCircle,
    Camera,
    Export,
    FilmStrip,
    FilePlus,
    FloppyDisk,
    FolderOpen,
    GearSix,
    Hand,
    SlidersHorizontal,
    TrayArrowDown,
} from "@phosphor-icons/react";
import { useScene, type EditorMode } from "../scene/store";
import { download, exportGLB, importModel, parseSceneFile, saveSceneFile } from "../scene/io";
import { takeSnapshot } from "../viewport/snapshot";
import { useUI } from "../ui/store";
import { useHands } from "../hands/tracker";
import { useSettings } from "../settings/store";
import { IconButton, Segment, Segmented } from "./ui";
import { CollabBar } from "../collab/CollabBar";
import { useTimeline } from "../scene/timeline";

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

const MODES: { mode: EditorMode; label: string }[] = [
    { mode: "object", label: "Object" },
    { mode: "edit", label: "Edit" },
    { mode: "render", label: "Render" },
];

// Renders the current view at twice the screen's resolution, without editor
// overlays, and downloads it as a PNG.
async function saveImage() {
    const shot = takeSnapshot({ view: "current", format: "png", supersample: 2, maxSize: 4096, clean: true });
    if (!shot) return;
    const blob = await (await fetch(shot.dataUrl)).blob();
    download(blob, "shapeshift.png", "image/png");
}

export function Topbar() {
    const timelineOpen = useTimeline((s) => s.open);
    const setTimelineOpen = useTimeline((s) => s.setOpen);
    const run = useScene((s) => s.run);
    const load = useScene((s) => s.load);
    const undo = useScene((s) => s.undo);
    const redo = useScene((s) => s.redo);
    const canUndo = useScene((s) => s.past.length > 0);
    const canRedo = useScene((s) => s.future.length > 0);
    const mode = useScene((s) => s.mode);
    const setMode = useScene((s) => s.setMode);
    const showInspector = useUI((s) => s.showInspector);
    const showChat = useUI((s) => s.showChat);
    const setShowInspector = useUI((s) => s.setShowInspector);
    const setShowChat = useUI((s) => s.setShowChat);
    const setShowSettings = useUI((s) => s.setShowSettings);
    const handStatus = useHands((s) => s.status);
    const setHands = useHands((s) => s.setEnabled);
    const openRef = useRef<HTMLInputElement>(null);
    const importRef = useRef<HTMLInputElement>(null);

    async function onOpen(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const doc = parseSceneFile(await file.text());
        if (doc) load(doc);
        else alert("That file isn't a ShapeShift scene.");
    }

    async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        try {
            const objects = await importModel(file);
            if (objects.length) run({ type: "insert", objects });
        } catch {
            alert("Couldn't read that model. Use a .glb or .gltf file.");
        }
    }

    return (
        <Bar>
            <Group>
                <Brand>ShapeShift</Brand>
                <IconButton
                    title="New scene"
                    onClick={() => {
                        const empty = useScene.getState().doc.objects.length === 0;
                        if (empty || !useSettings.getState().confirmNew || confirm("Start a new scene? You can undo this.")) run({ type: "clear" });
                    }}
                >
                    <FilePlus size={18} />
                </IconButton>
                <IconButton title="Open scene" onClick={() => openRef.current?.click()}>
                    <FolderOpen size={18} />
                </IconButton>
                <IconButton title="Save scene" onClick={() => saveSceneFile(useScene.getState().doc)}>
                    <FloppyDisk size={18} />
                </IconButton>
                <Sep />
                <IconButton title="Import model" onClick={() => importRef.current?.click()}>
                    <TrayArrowDown size={18} />
                </IconButton>
                <IconButton title="Save an image of the view" onClick={saveImage}>
                    <Camera size={18} />
                </IconButton>
                <IconButton title="Export as GLB" onClick={() => exportGLB(useScene.getState().doc)}>
                    <Export size={18} />
                </IconButton>
                <input ref={openRef} type="file" accept=".json" hidden onChange={onOpen} />
                <input ref={importRef} type="file" accept=".glb,.gltf" hidden onChange={onImport} />
            </Group>
            <Segmented>
                {MODES.map(({ mode: m, label }) => (
                    <Segment key={m} $active={mode === m} onClick={() => setMode(m)}>
                        {label}
                    </Segment>
                ))}
            </Segmented>
            <Group $end>
                <CollabBar />
                <IconButton title="Undo" disabled={!canUndo} onClick={undo}>
                    <ArrowUUpLeft size={18} />
                </IconButton>
                <IconButton title="Redo" disabled={!canRedo} onClick={redo}>
                    <ArrowUUpRight size={18} />
                </IconButton>
                <Sep />
                <IconButton title="Animation timeline" $active={timelineOpen} onClick={() => setTimelineOpen(!timelineOpen)}>
                    <FilmStrip size={18} />
                </IconButton>
                <IconButton
                    title={handStatus === "off" ? "Turn on hand control" : "Turn off hand control"}
                    $active={handStatus !== "off"}
                    onClick={() => setHands(handStatus === "off")}
                >
                    <Hand size={18} />
                </IconButton>
                <IconButton title="Inspector" $active={showInspector} onClick={() => setShowInspector(!showInspector)}>
                    <SlidersHorizontal size={18} />
                </IconButton>
                <IconButton title="Assistant" $active={showChat} onClick={() => setShowChat(!showChat)}>
                    <ChatCircle size={18} />
                </IconButton>
                <IconButton title="Settings (⌘,)" onClick={() => setShowSettings(true)}>
                    <GearSix size={18} />
                </IconButton>
            </Group>
        </Bar>
    );
}

export default Topbar;
