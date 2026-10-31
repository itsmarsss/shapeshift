import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import {
    ArrowCounterClockwise,
    ArrowsClockwise,
    ArrowsOut,
    ArrowsOutCardinal,
    Magnet,
    Cube,
    Cylinder,
    DotsNine,
    Flashlight,
    GridFour,
    Hexagon,
    Lightbulb,
    Ruler,
    Sphere,
    Square,
    Star,
    Sun,
    TextT,
} from "@phosphor-icons/react";
import { ConeIcon, HalfSphereIcon, ParaboloidIcon, PyramidIcon, RoofIcon, TorusIcon, TubeIcon, WedgeIcon } from "./icons";
import { useScene, type TransformMode } from "../scene/store";
import { SHAPE_LABELS } from "../scene/commands";
import { addShape } from "../scene/selection";
import { PRIMITIVES, type LightType, type Primitive } from "@shapeshift/shared/scene/schema";
import { IconButton } from "./ui";
import { COMPACT } from "../ui/compact";
import { useTools, type Tool } from "../viewport/tools";

const Rail = styled.div`
    position: absolute;
    top: calc(var(--topbar) + var(--gap));
    left: var(--gap);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 20;

    @media ${COMPACT} {
        top: auto;
        left: var(--gap);
        right: var(--gap);
        bottom: calc(var(--gap) + env(safe-area-inset-bottom, 0px) + var(--bottom-offset, 0px));
        flex-direction: row;
        justify-content: flex-start;
        overflow-x: auto;
        scrollbar-width: none;

        > div {
            flex-direction: row;
            flex-shrink: 0;
        }
    }
`;

const Group = styled.div`
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
`;

const Picker = styled.div`
    position: fixed;
    display: grid;
    grid-template-columns: repeat(3, 84px);
    gap: 2px;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    z-index: 70;
`;

const Tile = styled.button`
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 4px 8px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;

    &:hover {
        background: var(--surface-hover);
        color: var(--text);
    }

    kbd {
        position: absolute;
        top: 4px;
        right: 6px;
        font: inherit;
        font-size: 10px;
        color: var(--text-faint);
    }
`;

type Icon = React.ComponentType<{ size?: number }>;

const SHAPE_ICONS: Record<Primitive, Icon> = {
    box: Cube,
    sphere: Sphere,
    cylinder: Cylinder,
    cone: ConeIcon,
    torus: TorusIcon,
    plane: Square,
    wedge: WedgeIcon,
    roof: RoofIcon,
    pyramid: PyramidIcon,
    halfSphere: HalfSphereIcon,
    tube: TubeIcon,
    polygon: Hexagon,
    star: Star,
    text: TextT,
    paraboloid: ParaboloidIcon,
};

const PINNED: Primitive[] = ["box", "sphere", "cylinder"];

const LIGHTS: { light: LightType; label: string; Icon: typeof Cube }[] = [
    { light: "point", label: "Add point light", Icon: Lightbulb },
    { light: "spot", label: "Add spot light", Icon: Flashlight },
    { light: "directional", label: "Add sunlight", Icon: Sun },
];

const TOOLS: { mode: TransformMode; label: string; Icon: typeof Cube }[] = [
    { mode: "translate", label: "Move (W)", Icon: ArrowsOutCardinal },
    { mode: "rotate", label: "Rotate (E)", Icon: ArrowsClockwise },
    { mode: "scale", label: "Scale (R)", Icon: ArrowsOut },
];

const VIEW_TOOLS: { tool: Tool; label: string; Icon: typeof Cube }[] = [
    { tool: "workplane", label: "Workplane", Icon: GridFour },
    { tool: "ruler", label: "Ruler", Icon: Ruler },
];

function ShapePicker({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    const rect = anchor.getBoundingClientRect();
    useEffect(() => {
        const away = (e: PointerEvent) => {
            if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
        };
        const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("pointerdown", away);
        window.addEventListener("keydown", key);
        return () => {
            window.removeEventListener("pointerdown", away);
            window.removeEventListener("keydown", key);
        };
    }, [anchor, onClose]);
    const compact = window.matchMedia(COMPACT).matches;
    const style = compact ? { left: 12, bottom: window.innerHeight - rect.top + 8 } : { left: rect.right + 8, top: Math.max(56, Math.min(rect.top - 4, window.innerHeight - 360)) };
    return createPortal(
        <Picker ref={ref} role="dialog" aria-label="Shapes" style={style}>
            {PRIMITIVES.map((primitive, i) => {
                const Icon = SHAPE_ICONS[primitive];
                return (
                    <Tile
                        key={primitive}
                        title={`Add ${SHAPE_LABELS[primitive].toLowerCase()}`}
                        onClick={() => {
                            addShape(primitive);
                            onClose();
                        }}
                    >
                        <Icon size={22} />
                        {SHAPE_LABELS[primitive]}
                        {i < 6 && <kbd>{i + 1}</kbd>}
                    </Tile>
                );
            })}
        </Picker>,
        document.body
    );
}

export function Toolbar() {
    const snapOn = useScene((s) => s.snap.enabled);
    const run = useScene((s) => s.run);
    const mode = useScene((s) => s.mode);
    const transformMode = useScene((s) => s.transformMode);
    const setTransformMode = useScene((s) => s.setTransformMode);
    const tool = useTools((s) => s.tool);
    const setTool = useTools((s) => s.setTool);
    const workplane = useTools((s) => s.workplane);
    const setWorkplane = useTools((s) => s.setWorkplane);
    const [picker, setPicker] = useState<HTMLElement | null>(null);

    if (mode === "render") return null;

    return (
        <Rail>
            <Group>
                {PINNED.map((primitive) => {
                    const Icon = SHAPE_ICONS[primitive];
                    return (
                        <IconButton key={primitive} $size={36} title={`Add ${primitive}`} onClick={() => addShape(primitive)}>
                            <Icon size={20} />
                        </IconButton>
                    );
                })}
                <IconButton
                    $size={36}
                    $active={!!picker}
                    title="All shapes"
                    aria-expanded={!!picker}
                    onClick={(e) => setPicker(picker ? null : e.currentTarget)}
                >
                    <DotsNine size={20} />
                </IconButton>
                {picker && <ShapePicker anchor={picker} onClose={() => setPicker(null)} />}
            </Group>
            <Group>
                {LIGHTS.map(({ light, label, Icon }) => (
                    <IconButton key={light} $size={36} title={label} onClick={() => run({ type: "addLight", light })}>
                        <Icon size={20} />
                    </IconButton>
                ))}
            </Group>
            {mode === "object" && (
                <Group>
                    {TOOLS.map(({ mode: m, label, Icon }) => (
                        <IconButton
                            key={m}
                            $size={36}
                            $active={tool === "select" && transformMode === m}
                            title={label}
                            onClick={() => {
                                setTool("select");
                                setTransformMode(m);
                            }}
                        >
                            <Icon size={20} />
                        </IconButton>
                    ))}
                    <IconButton
                        $size={36}
                        $active={snapOn}
                        aria-pressed={snapOn}
                        title={snapOn ? "Snapping on: moves in steps. Click to turn off" : "Snap to steps while moving"}
                        onClick={() => useScene.getState().setSnap({ enabled: !snapOn })}
                    >
                        <Magnet size={20} />
                    </IconButton>
                </Group>
            )}
            <Group>
                {VIEW_TOOLS.map(({ tool: t, label, Icon }) => (
                    <IconButton key={t} $size={36} $active={tool === t} title={label} aria-pressed={tool === t} onClick={() => setTool(tool === t ? "select" : t)}>
                        <Icon size={20} />
                    </IconButton>
                ))}
                {workplane && (
                    <IconButton $size={36} title="Reset workplane" onClick={() => setWorkplane(null)}>
                        <ArrowCounterClockwise size={20} />
                    </IconButton>
                )}
            </Group>
        </Rail>
    );
}

export default Toolbar;
