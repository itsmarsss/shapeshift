import { lazy, Suspense, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
    DotsThree,
    ArrowUUpLeft,
    ArrowUUpRight,
    ChatCircle,
    ClockCounterClockwise,
    Camera,
    Export,
    FilmStrip,
    FilePlus,
    FloppyDisk,
    FolderOpen,
    GearSix,
    Hand,
    Printer,
    Shapes,
    SquaresFour,
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
import { useAccount } from "../account/store";
import { AccountButton } from "../account/AccountButton";
import { useTimeline } from "../scene/timeline";
import { COMPACT, useCompact } from "../ui/compact";

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

    @media ${COMPACT} {
        padding: 0 4px;
        padding-top: env(safe-area-inset-top, 0px);
        height: calc(var(--topbar) + env(safe-area-inset-top, 0px));
    }
`;

const Group = styled.div<{ $end?: boolean }>`
    display: flex;
    align-items: center;
    gap: 2px;
    justify-self: ${(p) => (p.$end ? "end" : "start")};
`;

const Brand = styled.a`
    font-weight: 600;
    margin-right: 12px;
    color: var(--text);
    text-decoration: none;

    &[href]:hover {
        color: var(--accent);
    }

    @media ${COMPACT} {
        display: none;
    }
`;

const Sep = styled.div`
    width: 1px;
    height: 18px;
    margin: 0 6px;
    background: var(--border);
`;

// Buttons that move into the "more" menu on small screens.
const Wide = styled.span`
    display: contents;

    @media ${COMPACT} {
        display: none;
    }
`;

const Menu = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 220px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    z-index: 200;

    button {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 40px;
        padding: 0 10px;
        border: 0;
        border-radius: var(--radius);
        background: transparent;
        color: var(--text);
        text-align: left;
    }
    button:hover,
    button[aria-pressed="true"] {
        background: var(--surface-raised);
    }
`;

type MenuItem = { label: string; icon: React.ReactNode; onClick: () => void; active?: boolean };

function MoreMenu({ items }: { items: MenuItem[] }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: PointerEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [open]);
    return (
        <div ref={ref} style={{ position: "relative" }}>
            <IconButton title="More" $active={open} onClick={() => setOpen((v) => !v)}>
                <DotsThree size={20} weight="bold" />
            </IconButton>
            {open && (
                <Menu role="menu">
                    {items.map((item) => (
                        <button
                            key={item.label}
                            role="menuitem"
                            aria-pressed={item.active}
                            onClick={() => {
                                setOpen(false);
                                item.onClick();
                            }}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </Menu>
            )}
        </div>
    );
}

const PrintDialog = lazy(() => import("./PrintDialog"));

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
    const setShowTemplates = useUI((s) => s.setShowTemplates);
    const showHistory = useUI((s) => s.showHistory);
    const setShowHistory = useUI((s) => s.setShowHistory);
    const handStatus = useHands((s) => s.status);
    const setHands = useHands((s) => s.setEnabled);
    const [printing, setPrinting] = useState(false);
    const signedIn = useAccount((s) => s.user !== null);
    const openRef = useRef<HTMLInputElement>(null);
    const importRef = useRef<HTMLInputElement>(null);

    async function onOpen(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const doc = parseSceneFile(await file.text());
        if (doc) {
            // An opened file is its own scene, not the one saved in the cloud.
            useAccount.getState().unlink();
            load(doc);
        } else alert("That file isn't a ShapeShift scene.");
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

    const compact = useCompact();
    const menuItems: MenuItem[] = [
        ...(signedIn ? [{ label: "All scenes", icon: <SquaresFour size={18} />, onClick: () => location.assign("/") }] : []),
        {
            label: "New scene",
            icon: <FilePlus size={18} />,
            onClick: () => {
                const empty = useScene.getState().doc.objects.length === 0;
                if (empty || !useSettings.getState().confirmNew || confirm("Start a new scene? You can undo this.")) run({ type: "clear" });
            },
        },
        { label: "Start from a template", icon: <Shapes size={18} />, onClick: () => setShowTemplates(true) },
        { label: "Open scene", icon: <FolderOpen size={18} />, onClick: () => openRef.current?.click() },
        { label: "Save scene", icon: <FloppyDisk size={18} />, onClick: () => saveSceneFile(useScene.getState().doc) },
        { label: "Import model", icon: <TrayArrowDown size={18} />, onClick: () => importRef.current?.click() },
        { label: "Save image", icon: <Camera size={18} />, onClick: saveImage },
        { label: "Export as GLB", icon: <Export size={18} />, onClick: () => exportGLB(useScene.getState().doc) },
        { label: "Export for 3D printing", icon: <Printer size={18} />, onClick: () => setPrinting(true) },
        { label: "Redo", icon: <ArrowUUpRight size={18} />, onClick: redo },
        { label: "History", icon: <ClockCounterClockwise size={18} />, onClick: () => setShowHistory(!showHistory), active: showHistory },
        { label: "Animation timeline", icon: <FilmStrip size={18} />, onClick: () => setTimelineOpen(!timelineOpen), active: timelineOpen },
        { label: handStatus === "off" ? "Hand control" : "Turn off hand control", icon: <Hand size={18} />, onClick: () => setHands(handStatus === "off"), active: handStatus !== "off" },
        { label: "Settings", icon: <GearSix size={18} />, onClick: () => setShowSettings(true) },
    ];

    return (
        <Bar>
            <Group>
                <Brand href={signedIn ? "/" : undefined} title={signedIn ? "All your scenes" : undefined}>
                    ShapeShift
                </Brand>
                {compact && <MoreMenu items={menuItems} />}
                <Wide>
                    <IconButton
                        title="New scene"
                        onClick={() => {
                            const empty = useScene.getState().doc.objects.length === 0;
                            if (empty || !useSettings.getState().confirmNew || confirm("Start a new scene? You can undo this.")) run({ type: "clear" });
                        }}
                    >
                        <FilePlus size={18} />
                    </IconButton>
                    <IconButton title="Start from a template" onClick={() => setShowTemplates(true)}>
                        <Shapes size={18} />
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
                    <IconButton title="Export for 3D printing" onClick={() => setPrinting(true)}>
                        <Printer size={18} />
                    </IconButton>
                </Wide>
                <input ref={openRef} type="file" accept=".json" hidden onChange={onOpen} />
                {printing && (
                    <Suspense fallback={null}>
                        <PrintDialog onClose={() => setPrinting(false)} />
                    </Suspense>
                )}
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
                <AccountButton />
                <CollabBar />
                <IconButton title="Undo" disabled={!canUndo} onClick={undo}>
                    <ArrowUUpLeft size={18} />
                </IconButton>
                <Wide>
                    <IconButton title="Redo" disabled={!canRedo} onClick={redo}>
                        <ArrowUUpRight size={18} />
                    </IconButton>
                    <IconButton title="History" $active={showHistory} onClick={() => setShowHistory(!showHistory)}>
                        <ClockCounterClockwise size={18} />
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
                </Wide>
                <IconButton title="Inspector" $active={showInspector} onClick={() => setShowInspector(!showInspector)}>
                    <SlidersHorizontal size={18} />
                </IconButton>
                <IconButton title="Assistant" $active={showChat} onClick={() => setShowChat(!showChat)}>
                    <ChatCircle size={18} />
                </IconButton>
                <Wide>
                    <IconButton title="Settings (⌘,)" onClick={() => setShowSettings(true)}>
                        <GearSix size={18} />
                    </IconButton>
                </Wide>
            </Group>
        </Bar>
    );
}

export default Topbar;
