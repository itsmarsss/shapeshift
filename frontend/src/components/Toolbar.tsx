import styled from "styled-components";
import {
    ArrowsClockwise,
    ArrowsOut,
    ArrowsOutCardinal,
    Cube,
    Cylinder,
    Flashlight,
    Lightbulb,
    Sphere,
    Square,
    Sun,
} from "@phosphor-icons/react";
import { ConeIcon, TorusIcon } from "./icons";
import { useScene, type TransformMode } from "../scene/store";
import type { LightType, Primitive } from "@shapeshift/shared/scene/schema";
import { IconButton } from "./ui";
import { COMPACT } from "../ui/compact";

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
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
`;

const SHAPES: { primitive: Primitive; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
    { primitive: "box", label: "Add box", Icon: Cube },
    { primitive: "sphere", label: "Add sphere", Icon: Sphere },
    { primitive: "cylinder", label: "Add cylinder", Icon: Cylinder },
    { primitive: "cone", label: "Add cone", Icon: ConeIcon },
    { primitive: "torus", label: "Add torus", Icon: TorusIcon },
    { primitive: "plane", label: "Add plane", Icon: Square },
];

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

export function Toolbar() {
    const run = useScene((s) => s.run);
    const mode = useScene((s) => s.mode);
    const transformMode = useScene((s) => s.transformMode);
    const setTransformMode = useScene((s) => s.setTransformMode);

    if (mode === "render") return null;

    return (
        <Rail>
            <Group>
                {SHAPES.map(({ primitive, label, Icon }) => (
                    <IconButton key={primitive} $size={36} title={label} onClick={() => run({ type: "add", primitive })}>
                        <Icon size={20} />
                    </IconButton>
                ))}
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
                            $active={transformMode === m}
                            title={label}
                            onClick={() => setTransformMode(m)}
                        >
                            <Icon size={20} />
                        </IconButton>
                    ))}
                </Group>
            )}
        </Rail>
    );
}

export default Toolbar;
