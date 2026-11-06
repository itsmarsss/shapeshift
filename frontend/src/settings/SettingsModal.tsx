import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styled from "styled-components";
import { Modal } from "../components/Modal";
import { Cube, Database, Hand, HandPointing, Keyboard, Monitor, PencilSimple, Sparkle, X } from "@phosphor-icons/react";
import { ModelPicker } from "../components/assistant/ModelPicker";
import { useModelChoice } from "../assistant/modelChoice";
import { useUI } from "../ui/store";
import { useHands } from "../hands/tracker";
import { useSettings, type Settings } from "./store";
import { Button, fadeEdges, IconButton, Segment, Segmented, Select } from "../components/ui";
import { useScrollEdges } from "../ui/hooks";


const Dialog = styled(Modal)`
    width: min(760px, 100%);
    height: min(560px, 100%);
    max-height: 100%;
    display: grid;
    grid-template-columns: 190px 1fr;

    @media (max-width: 560px) {
        grid-template-columns: 1fr;
        grid-template-rows: auto 1fr;
    }
`;

const Nav = styled.nav`
    padding: 12px 8px;
    border-right: 1px solid var(--border);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 2px;

    @media (max-width: 560px) {
        flex-direction: row;
        overflow-x: auto;
        scrollbar-width: none;
        ${fadeEdges}
        border-right: none;
        border-bottom: 1px solid var(--border);
    }
`;

const NavTitle = styled.div`
    font-weight: 600;
    padding: 4px 10px 12px;

    @media (max-width: 560px) {
        display: none;
    }
`;

const NavItem = styled.button<{ $active: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 10px;
    border: none;
    border-radius: var(--radius);
    text-align: left;
    white-space: nowrap;
    color: ${(p) => (p.$active ? "var(--text)" : "var(--text-muted)")};
    background: ${(p) => (p.$active ? "var(--surface-raised)" : "transparent")};

    &:hover {
        color: var(--text);
    }
`;

const Main = styled.div`
    display: flex;
    flex-direction: column;
    min-height: 0;
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 10px 0 20px;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    flex-shrink: 0;
`;

const Body = styled.div`
    overflow: auto;
    padding: 4px 20px 20px;
`;

const Group = styled.div`
    padding: 16px 0 4px;

    & + & {
        border-top: 1px solid var(--border);
    }
`;

const GroupTitle = styled.div`
    color: var(--text-muted);
    font-size: 12px;
    margin-bottom: 4px;
`;

const RowEl = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 44px;
`;

const RowText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const Hint = styled.span`
    color: var(--text-muted);
    font-size: 12px;
`;

const Control = styled.div`
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
`;

const SwitchEl = styled.button<{ $on: boolean }>`
    position: relative;
    width: 36px;
    height: 20px;
    border: none;
    border-radius: 999px;
    padding: 0;
    background: ${(p) => (p.$on ? "var(--accent)" : "var(--surface-hover)")};
    transition: background 0.15s ease;

    &::after {
        content: "";
        position: absolute;
        top: 2px;
        left: ${(p) => (p.$on ? "18px" : "2px")};
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fff;
        transition: left 0.15s ease;
    }
`;

const Range = styled.input`
    width: 150px;
    accent-color: var(--accent);
`;

const Value = styled.span`
    width: 44px;
    text-align: right;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
`;

const Narrow = styled(Select)`
    width: 190px;
`;

// What a gesture does, in the gesture guide.
const Does = styled.span`
    color: var(--text-muted);
    text-align: right;
    max-width: 260px;
`;

// Every hand gesture and spoken shortcut, so they're all in one place.
const GESTURES: [string, [string, string][]][] = [
    [
        "One hand",
        [
            ["Point", "Moves the cursor; buttons and shapes near it light up"],
            ["Pinch a shape", "Picks it up to move it"],
            ["Reach toward the screen while holding", "Pushes it away; pull back to bring it closer"],
            ["Pinch empty space", "Turns the view"],
            ["Pinch a button, let go", "Presses it"],
            ["Pinch a panel and move", "Scrolls it"],
            ["Pinch a slider and move", "Sets it"],
            ["Open palm, held still", "Hand menu: shapes, undo, redo, fit view, talk"],
        ],
    ],
    [
        "Both hands",
        [
            ["Pinch both, spread apart", "Zooms in and out"],
            ["Pinch both, move together", "Pans the view"],
            ["Pinch both, twist like a wheel", "Turns the view"],
            ["Hold a shape, pinch with the other and spread or twist", "Resizes and turns it"],
        ],
    ],
    [
        "While one hand holds a shape",
        [
            ["Tap the other hand on empty space", "Leaves a copy behind"],
            ["Tap the other hand on another shape", "Selects that too (tap again to deselect)"],
            ["Open the other palm", "Menu for the shape: colour, duplicate, hole, delete"],
        ],
    ],
    [
        "Thumb to a fingertip",
        [
            ["Thumb to middle finger", "Talk to the assistant"],
            ["Thumb to ring finger", "Preview, and back to editing"],
            ["Thumb to pinky", "Undo"],
        ],
    ],
    [
        "Saying it",
        [
            ["“Undo”, “redo”, “delete it”, “duplicate”", "Done straight away"],
            ["“Add a sphere”, “fit view”, “select all”, “preview mode”", "Done straight away"],
            ["Anything else", "Goes to the assistant"],
        ],
    ],
];

const Keys = styled.span`
    display: inline-flex;
    gap: 4px;
`;

const Key = styled.kbd`
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    font: inherit;
    font-size: 12px;
    color: var(--text-muted);
`;

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <RowEl>
            <RowText>
                {label}
                {hint && <Hint>{hint}</Hint>}
            </RowText>
            <Control>{children}</Control>
        </RowEl>
    );
}

function Toggle({ k }: { k: { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings] }) {
    const on = useSettings((s) => s[k]);
    const set = useSettings((s) => s.set);
    return <SwitchEl type="button" role="switch" aria-checked={on} $on={on} onClick={() => set({ [k]: !on })} />;
}

function Slider({
    k,
    min,
    max,
    step,
    format = (v) => `${v.toFixed(1)}×`,
}: {
    k: { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
    min: number;
    max: number;
    step: number;
    format?: (v: number) => string;
}) {
    const value = useSettings((s) => s[k]);
    const set = useSettings((s) => s.set);
    return (
        <>
            <Range type="range" min={min} max={max} step={step} value={value} onChange={(e) => set({ [k]: Number(e.target.value) })} />
            <Value>{format(value)}</Value>
        </>
    );
}

function Choice<K extends keyof Settings>({ k, options }: { k: K; options: { value: Settings[K]; label: string }[] }) {
    const value = useSettings((s) => s[k]);
    const set = useSettings((s) => s.set);
    return (
        <Segmented>
            {options.map((o) => (
                <Segment key={String(o.value)} type="button" $active={value === o.value} onClick={() => set({ [k]: o.value } as Partial<Settings>)}>
                    {o.label}
                </Segment>
            ))}
        </Segmented>
    );
}

function TutorialButton() {
    const done = useSettings((s) => s.handsTutorialDone);
    const set = useSettings((s) => s.set);
    return (
        <Button disabled={!done} onClick={() => set({ handsTutorialDone: false })}>
            {done ? "Show it again" : "Comes up next time"}
        </Button>
    );
}

function CameraPicker() {
    const cameraId = useSettings((s) => s.cameraId);
    const set = useSettings((s) => s.set);
    const status = useHands((s) => s.status);
    const setEnabled = useHands((s) => s.setEnabled);
    const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

    useEffect(() => {
        const load = () =>
            navigator.mediaDevices
                ?.enumerateDevices()
                .then((d) => setCameras(d.filter((x) => x.kind === "videoinput")))
                .catch(() => setCameras([]));
        load();
        navigator.mediaDevices?.addEventListener("devicechange", load);
        return () => navigator.mediaDevices?.removeEventListener("devicechange", load);
    }, [status]);

    return (
        <Narrow
            value={cameraId}
            onChange={async (e) => {
                set({ cameraId: e.target.value });
                if (status === "running") {
                    await setEnabled(false);
                    await setEnabled(true);
                }
            }}
        >
            <option value="">Default camera</option>
            {cameras.map((c, i) => (
                <option key={c.deviceId || i} value={c.deviceId}>
                    {c.label || `Camera ${i + 1}`}
                </option>
            ))}
        </Narrow>
    );
}

const mac = navigator.platform.toLowerCase().includes("mac");
const MOD = mac ? "⌘" : "Ctrl";

const SHORTCUTS: [string, string[]][] = [
    ["Undo", [MOD, "Z"]],
    ["Redo", [MOD, "Shift", "Z"]],
    ["Duplicate", [MOD, "D"]],
    ["Select all", [MOD, "A"]],
    ["Group", [MOD, "G"]],
    ["Ungroup", [MOD, "Shift", "G"]],
    ["Delete", ["Delete"]],
    ["Deselect", ["Esc"]],
    ["Precise arrows: move, turn, stretch (again to hide)", ["W", "E", "R"]],
    ["Edit points of the selected shape", ["Enter"]],
    ["Preview (hold Space to peek)", ["P"]],
    ["Add box, sphere, cylinder, cone, torus, plane", ["1", "–", "6"]],
    ["Open assistant", [MOD, "L"]],
    ["Focus the assistant", ["/"]],
    ["Open settings", [MOD, ","]],
];

const SECTIONS = [
    { id: "appearance", label: "Appearance", Icon: Monitor },
    { id: "viewport", label: "Viewport", Icon: Cube },
    { id: "editing", label: "Editing", Icon: PencilSimple },
    { id: "assistant", label: "Assistant", Icon: Sparkle },
    { id: "hands", label: "Hand control", Icon: Hand },
    { id: "gestures", label: "Gesture guide", Icon: HandPointing },
    { id: "shortcuts", label: "Shortcuts", Icon: Keyboard },
    { id: "data", label: "Data", Icon: Database },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

// The assistant's model, with what each one is like.
function AssistantSection() {
    const choice = useModelChoice();
    return (
        <Group>
            <Row label="Model" hint={choice ? `${choice.current.detail}${choice.current.cost > 1 ? ` Each message uses ${choice.current.cost} of your prompts.` : ""}` : "Only one model is available on this server."}>
                <ModelPicker full />
            </Row>
        </Group>
    );
}

function Section({ id }: { id: SectionId }) {
    const reset = useSettings((s) => s.reset);

    switch (id) {
        case "appearance":
            return (
                <Group>
                    <Row label="Theme">
                        <Choice
                            k="theme"
                            options={[
                                { value: "system", label: "System" },
                                { value: "dark", label: "Dark" },
                                { value: "light", label: "Light" },
                            ]}
                        />
                    </Row>
                    <Row label="Render quality" hint="Lower it if the editor feels slow">
                        <Choice
                            k="quality"
                            options={[
                                { value: "performance", label: "Fast" },
                                { value: "balanced", label: "Balanced" },
                                { value: "sharp", label: "Sharp" },
                            ]}
                        />
                    </Row>
                </Group>
            );
        case "viewport":
            return (
                <>
                    <Group>
                        <GroupTitle>Display</GroupTitle>
                        <Row label="Grid">
                            <Toggle k="showGrid" />
                        </Row>
                        <Row label="Axis lines">
                            <Toggle k="showAxes" />
                        </Row>
                        <Row label="Shadows in Preview">
                            <Toggle k="shadows" />
                        </Row>
                    </Group>
                    <Group>
                        <GroupTitle>Camera</GroupTitle>
                        <Row label="Field of view">
                            <Slider k="fov" min={25} max={90} step={1} format={(v) => `${v}°`} />
                        </Row>
                        <Row label="Orbit speed">
                            <Slider k="orbitSpeed" min={0.25} max={3} step={0.05} />
                        </Row>
                        <Row label="Zoom speed">
                            <Slider k="zoomSpeed" min={0.25} max={3} step={0.05} />
                        </Row>
                        <Row label="Zoom toward the cursor">
                            <Toggle k="zoomToCursor" />
                        </Row>
                    </Group>
                </>
            );
        case "editing":
            return (
                <>
                    <Group>
                        <GroupTitle>Units</GroupTitle>
                        <Row label="Length">
                            <Choice
                                k="units"
                                options={[
                                    { value: "m", label: "m" },
                                    { value: "cm", label: "cm" },
                                    { value: "mm", label: "mm" },
                                ]}
                            />
                        </Row>
                        <Row label="Angles">
                            <Choice
                                k="angleUnit"
                                options={[
                                    { value: "deg", label: "Degrees" },
                                    { value: "rad", label: "Radians" },
                                ]}
                            />
                        </Row>
                    </Group>
                    <Group>
                        <GroupTitle>Safety</GroupTitle>
                        <Row label="Confirm before starting a new scene">
                            <Toggle k="confirmNew" />
                        </Row>
                        <Row label="Autosave" hint="Keeps your scene in this browser between visits">
                            <Toggle k="autosave" />
                        </Row>
                    </Group>
                </>
            );
        case "assistant":
            return <AssistantSection />;
        case "hands":
            return (
                <>
                    <Group>
                        <GroupTitle>Camera</GroupTitle>
                        <Row label="Camera">
                            <CameraPicker />
                        </Row>
                        <Row label="Camera preview">
                            <Toggle k="showHandPreview" />
                        </Row>
                        <Row label="Hand skeleton in preview">
                            <Toggle k="showSkeleton" />
                        </Row>
                        <Row label="Turn on when the editor opens" hint="Starts the camera right away if you had hand control on last time">
                            <Toggle k="handsAutoStart" />
                        </Row>
                        <Row label="Gesture tutorial" hint="Walks through each gesture the next time hand control is on">
                            <TutorialButton />
                        </Row>
                    </Group>
                    <Group>
                        <GroupTitle>Gestures</GroupTitle>
                        <Row label="Hand that grabs objects" hint="The other hand orbits the camera">
                            <Choice
                                k="handObject"
                                options={[
                                    { value: "Right", label: "Right" },
                                    { value: "Left", label: "Left" },
                                ]}
                            />
                        </Row>
                        <Row label="Pinch sensitivity" hint="Higher catches looser pinches">
                            <Slider k="pinchSensitivity" min={0.6} max={1.6} step={0.05} />
                        </Row>
                        <Row label="Smoothing" hint="Higher is steadier but lags more">
                            <Slider k="handSmoothing" min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} />
                        </Row>
                        <Row label="Orbit speed">
                            <Slider k="handOrbitSpeed" min={0.25} max={3} step={0.05} />
                        </Row>
                        <Row label="Zoom speed">
                            <Slider k="handZoomSpeed" min={0.25} max={3} step={0.05} />
                        </Row>
                        <Row label="Magnetic targeting" hint="How strongly nearby buttons and shapes pull the hand cursor onto them">
                            <Slider k="handMagnet" min={0} max={2} step={0.1} format={(v) => (v === 0 ? "Off" : `${Math.round(v * 100)}%`)} />
                        </Row>
                    </Group>
                </>
            );
        case "gestures":
            return (
                <>
                    {GESTURES.map(([title, rows]) => (
                        <Group key={title}>
                            <GroupTitle>{title}</GroupTitle>
                            {rows.map(([gesture, does]) => (
                                <Row key={gesture} label={gesture}>
                                    <Does>{does}</Does>
                                </Row>
                            ))}
                        </Group>
                    ))}
                </>
            );
        case "shortcuts":
            return (
                <Group>
                    {SHORTCUTS.map(([label, keys]) => (
                        <Row key={label} label={label}>
                            <Keys>
                                {keys.map((k) => (k === "–" ? <span key={k}>–</span> : <Key key={k}>{k}</Key>))}
                            </Keys>
                        </Row>
                    ))}
                </Group>
            );
        case "data":
            return (
                <Group>
                    <Row label="Share anonymous usage" hint="Counts like how long a first creation takes and crash reports, with nothing that says who you are. Helps us make ShapeShift easier">
                        <Toggle k="shareUsage" />
                    </Row>
                    <Row label="Show the intro again">
                        <Button
                            type="button"
                            onClick={() => {
                                useUI.getState().setShowSettings(false);
                                useUI.getState().setShowOnboarding(true);
                            }}
                        >
                            Show
                        </Button>
                    </Row>
                    <Row label="Reset settings" hint="Puts every setting back to its default">
                        <Button
                            type="button"
                            onClick={() => {
                                if (confirm("Reset all settings?")) reset();
                            }}
                        >
                            Reset
                        </Button>
                    </Row>
                    <Row label="Forget the saved scene" hint="Removes the autosaved copy from this browser">
                        <Button
                            type="button"
                            $variant="danger"
                            onClick={() => {
                                if (!confirm("Remove the autosaved scene from this browser?")) return;
                                try {
                                    localStorage.removeItem("shapeshift-scene");
                                } catch (error) {
                                    console.warn("Couldn't remove the saved scene", error);
                                }
                            }}
                        >
                            Forget
                        </Button>
                    </Row>
                </Group>
            );
    }
}

export function SettingsModal() {
    const open = useUI((s) => s.showSettings);
    const setOpen = useUI((s) => s.setShowSettings);
    const [section, setSection] = useState<SectionId>("appearance");
    const close = useCallback(() => setOpen(false), [setOpen]);
    const nav = useRef<HTMLElement>(null);
    useScrollEdges(nav, open);

    if (!open) return null;
    const current = SECTIONS.find((s) => s.id === section)!;

    return (
        <Dialog label="Settings" onClose={close}>
            <Nav ref={nav}>
                <NavTitle>Settings</NavTitle>
                {SECTIONS.map(({ id, label, Icon }) => (
                    <NavItem key={id} type="button" $active={id === section} onClick={() => setSection(id)}>
                        <Icon size={16} />
                        {label}
                    </NavItem>
                ))}
            </Nav>
            <Main>
                <Header>
                    {current.label}
                    <IconButton title="Close" onClick={() => setOpen(false)}>
                        <X size={16} />
                    </IconButton>
                </Header>
                <Body>
                    <Section id={section} />
                </Body>
            </Main>
        </Dialog>
    );
}

export default SettingsModal;
