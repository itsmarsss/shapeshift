import { lazy, Suspense, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
    CaretDown,
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
    SignOut,
    Sparkle,
    UserCircle,
    SlidersHorizontal,
    TrayArrowDown,
} from "@phosphor-icons/react";
import { useScene, type EditorMode } from "../scene/store";
import { download, exportGLB, importModel, parseSceneFile, saveSceneFile } from "../scene/io";
import { takeSnapshot } from "../viewport/snapshot";
import { useUI } from "../ui/store";
import { toggleInspector, useInspectorVisible } from "../ui/inspector";
import { useHands } from "../hands/tracker";
import { useSettings } from "../settings/store";
import { IconButton, Segment, Segmented } from "./ui";
import { CollabBar } from "../collab/CollabBar";
import { useAccount } from "../account/store";
import { AccountButton } from "../account/AccountButton";
import { useTimeline } from "../scene/timeline";
import { COMPACT, MEDIUM, useCompact } from "../ui/compact";

const Bar = styled.div`
    height: var(--topbar);
    display: grid;
    // The sides take what their buttons need and the mode switch centers in
    // what's left, so nothing wraps on a laptop screen.
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    align-items: center;

    @media ${MEDIUM} {
        padding-left: 8px;
    }
    padding: 0 8px 0 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    position: relative;
    z-index: 100;

    @media ${COMPACT} {
        // Sides size to their buttons so the mode switch can sit between them.
        grid-template-columns: auto 1fr auto;
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

    @media ${MEDIUM} {
        display: none;
    }

    &[href]:hover {
        color: var(--accent);
    }

    @media ${COMPACT} {
        display: none;
    }
`;

// The mode switch, tightened on phones so the bar fits a 360px screen.
const Modes = styled(Segmented)`
    justify-self: center;

    @media ${MEDIUM} {
        button {
            padding: 0 8px;
        }
    }
`;

// Hand control is what ShapeShift is about, so it gets a named button.
const HandsButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    margin: 0 2px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: transparent;
    color: var(--text);
    font-weight: 500;

    &:hover {
        background: var(--surface-hover);
    }
    &[aria-pressed="true"] {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--accent-text);
    }
    @media ${MEDIUM} {
        padding: 0 8px;

        span {
            display: none;
        }
    }
`;

const Sep = styled.div`
    width: 1px;
    height: 18px;
    margin: 0 6px;
    background: var(--border);

    @media ${MEDIUM} {
        margin: 0 2px;
    }
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
    max-height: calc(100vh - var(--topbar) - 24px);
    overflow-y: auto;
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

const MenuButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 8px 0 10px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text);
    font-weight: 500;

    &:hover,
    &[aria-expanded="true"] {
        background: var(--surface-hover);
    }
`;

// Opens a list of actions. With a label it's a named menu like File; without
// one it's the ⋯ button that holds everything on phones.
function MoreMenu({ items, label }: { items: MenuItem[]; label?: string }) {
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
            {label ? (
                <MenuButton type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                    {label}
                    <CaretDown size={12} weight="bold" />
                </MenuButton>
            ) : (
                <IconButton title="More" $active={open} onClick={() => setOpen((v) => !v)}>
                    <DotsThree size={20} weight="bold" />
                </IconButton>
            )}
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

// Named for what you do in each, not after 3D-software terms.
const MODES: { mode: EditorMode; label: string; hint: string }[] = [
    { mode: "object", label: "Arrange", hint: "Add, move and style shapes" },
    { mode: "edit", label: "Reshape", hint: "Drag the points of a shape to change its form" },
    { mode: "render", label: "Preview", hint: "See it lit and shaded, without the editing helpers" },
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
    const showInspector = useInspectorVisible();
    const showChat = useUI((s) => s.showChat);
    const setShowChat = useUI((s) => s.setShowChat);
    const setShowSettings = useUI((s) => s.setShowSettings);
    const setShowTemplates = useUI((s) => s.setShowTemplates);
    const showHistory = useUI((s) => s.showHistory);
    const setShowHistory = useUI((s) => s.setShowHistory);
    const handStatus = useHands((s) => s.status);
    const setHands = useHands((s) => s.setEnabled);
    const [printing, setPrinting] = useState(false);
    const signedIn = useAccount((s) => s.user !== null);
    const plan = useAccount((s) => s.user?.plan);
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
    const fileItems: MenuItem[] = [
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
    ];
    const menuItems: MenuItem[] = [
        ...(signedIn
            ? [
                  { label: "All scenes", icon: <SquaresFour size={18} />, onClick: () => location.assign("/") },
                  { label: "My scenes", icon: <FolderOpen size={18} />, onClick: () => useAccount.getState().setShowScenes(true) },
              ]
            : [{ label: "Sign in", icon: <UserCircle size={18} />, onClick: () => useAccount.getState().setShowSignIn(true) }]),
        ...fileItems,
        { label: "Redo", icon: <ArrowUUpRight size={18} />, onClick: redo },
        { label: "History", icon: <ClockCounterClockwise size={18} />, onClick: () => setShowHistory(!showHistory), active: showHistory },
        { label: "Animation timeline", icon: <FilmStrip size={18} />, onClick: () => setTimelineOpen(!timelineOpen), active: timelineOpen },
        { label: handStatus === "off" ? "Hand control" : "Turn off hand control", icon: <Hand size={18} />, onClick: () => setHands(handStatus === "off"), active: handStatus !== "off" },
        { label: "Settings", icon: <GearSix size={18} />, onClick: () => setShowSettings(true) },
        ...(signedIn
            ? [
                  { label: plan === "pro" ? "Manage your plan" : "Upgrade to Pro", icon: <Sparkle size={18} />, onClick: () => location.assign("/pricing") },
                  { label: "Sign out", icon: <SignOut size={18} />, onClick: () => void useAccount.getState().signOut() },
              ]
            : []),
    ];

    return (
        <Bar>
            <Group>
                <Brand href={signedIn ? "/" : undefined} title={signedIn ? "All your scenes" : undefined}>
                    ShapeShift
                </Brand>
                {compact && <MoreMenu items={menuItems} />}
                <Wide>
                    <MoreMenu items={fileItems} label="File" />
                </Wide>
                <input ref={openRef} type="file" accept=".json" hidden onChange={onOpen} />
                {printing && (
                    <Suspense fallback={null}>
                        <PrintDialog onClose={() => setPrinting(false)} />
                    </Suspense>
                )}
                <input ref={importRef} type="file" accept=".glb,.gltf" hidden onChange={onImport} />
            </Group>
            <Modes>
                {MODES.map(({ mode: m, label, hint }) => (
                    <Segment key={m} $active={mode === m} title={hint} onClick={() => setMode(m)}>
                        {label}
                    </Segment>
                ))}
            </Modes>
            <Group $end>
                {/* On phones the account lives in the ⋯ menu. */}
                <Wide>
                    <AccountButton />
                </Wide>
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
                    <HandsButton
                        type="button"
                        title={handStatus === "off" ? "Turn on hand control" : "Turn off hand control"}
                        aria-pressed={handStatus !== "off"}
                        onClick={() => setHands(handStatus === "off")}
                    >
                        <Hand size={16} weight={handStatus === "off" ? "regular" : "fill"} />
                        <span>Hands</span>
                    </HandsButton>
                </Wide>
                <IconButton title="Inspector" $active={showInspector} onClick={toggleInspector}>
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
