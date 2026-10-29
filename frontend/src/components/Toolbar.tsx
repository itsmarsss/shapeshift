import styled from "styled-components";
import {
    ArrowsClockwise,
    ArrowsOut,
    ArrowsOutCardinal,
    Cube,
    Cylinder,
    Disc,
    Sphere,
    Square,
    Triangle,
} from "@phosphor-icons/react";
import { useScene, type TransformMode } from "../scene/store";
import type { Primitive } from "../scene/schema";
import { IconButton } from "./ui";

const Rail = styled.div`
    position: absolute;
    top: calc(var(--topbar) + var(--gap));
    left: var(--gap);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 20;
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

const SHAPES: { primitive: Primitive; label: string; Icon: typeof Cube }[] = [
    { primitive: "box", label: "Add box", Icon: Cube },
    { primitive: "sphere", label: "Add sphere", Icon: Sphere },
    { primitive: "cylinder", label: "Add cylinder", Icon: Cylinder },
    { primitive: "cone", label: "Add cone", Icon: Triangle },
    { primitive: "torus", label: "Add torus", Icon: Disc },
    { primitive: "plane", label: "Add plane", Icon: Square },
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
