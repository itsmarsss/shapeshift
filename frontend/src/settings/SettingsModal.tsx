import { useEffect, useState, type ReactNode } from "react";
import styled from "styled-components";
import { Cube, Database, Hand, Keyboard, Monitor, PencilSimple, X } from "@phosphor-icons/react";
import { useUI } from "../ui/store";
import { useHands } from "../hands/tracker";
import { useSettings, type Settings } from "./store";
import { Button, IconButton, Segment, Segmented, Select } from "../components/ui";

const Backdrop = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 1000;
`;

const Dialog = styled.div`
    width: min(760px, 100%);
    height: min(560px, 100%);
    display: grid;
    grid-template-columns: 190px 1fr;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;

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
    ["Move tool", ["W"]],
    ["Rotate tool", ["E"]],
    ["Scale tool", ["R"]],
    ["Add box, sphere, cylinder, cone, torus, plane", ["1", "–", "6"]],
    ["Open assistant", [MOD, "L"]],
    ["Focus the assistant", ["/"]],
    ["Open settings", [MOD, ","]],
];

const SECTIONS = [
    { id: "appearance", label: "Appearance", Icon: Monitor },
    { id: "viewport", label: "Viewport", Icon: Cube },
    { id: "editing", label: "Editing", Icon: PencilSimple },
    { id: "hands", label: "Hand control", Icon: Hand },
    { id: "shortcuts", label: "Shortcuts", Icon: Keyboard },
    { id: "data", label: "Data", Icon: Database },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

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
                    </Group>
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

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, setOpen]);

    if (!open) return null;
    const current = SECTIONS.find((s) => s.id === section)!;

    return (
        <Backdrop onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <Dialog role="dialog" aria-modal="true" aria-label="Settings">
                <Nav>
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
        </Backdrop>
    );
}

export default SettingsModal;
