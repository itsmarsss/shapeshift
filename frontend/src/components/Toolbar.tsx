import styled from "styled-components";
import { Cube, Cylinder, Disc, Sphere, Square, Triangle } from "@phosphor-icons/react";
import { useEditor } from "../store/editor";
import type { GeometryKind } from "../types";
import { IconButton } from "./ui";

const Rail = styled.div`
    position: absolute;
    top: calc(var(--topbar) + var(--gap));
    left: var(--gap);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    z-index: 20;
`;

const SHAPES: { kind: GeometryKind; label: string; Icon: typeof Cube }[] = [
    { kind: "box", label: "Add box", Icon: Cube },
    { kind: "sphere", label: "Add sphere", Icon: Sphere },
    { kind: "cylinder", label: "Add cylinder", Icon: Cylinder },
    { kind: "cone", label: "Add cone", Icon: Triangle },
    { kind: "torus", label: "Add torus", Icon: Disc },
    { kind: "plane", label: "Add plane", Icon: Square },
];

export function Toolbar() {
    const add = useEditor((s) => s.addObject);
    const editorMode = useEditor((s) => s.editorMode);

    if (editorMode === "render") return null;

    return (
        <Rail>
            {SHAPES.map(({ kind, label, Icon }) => (
                <IconButton
                    key={kind}
                    $size={36}
                    title={label}
                    onClick={() => add(kind)}
                >
                    <Icon size={20} />
                </IconButton>
            ))}
        </Rail>
    );
}

export default Toolbar;
