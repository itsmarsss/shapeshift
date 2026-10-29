import { useState } from "react";
import styled from "styled-components";
import { Copy, Trash, X } from "@phosphor-icons/react";
import { selectSelected, useScene } from "../scene/store";
import type { Command, Vec3 } from "../scene/schema";
import { useUI } from "../ui/store";
import { Button, Divider, FieldLabel, IconButton, Input, Panel, PanelHeader, PanelTitle, Select } from "./ui";

const Root = styled(Panel)`
    top: calc(var(--topbar) + var(--gap));
    left: calc(var(--gap) * 2 + 46px);
    width: 272px;
    max-height: calc(100% - var(--topbar) - var(--gap) * 2);
    z-index: 30;
`;

const Body = styled.div`
    overflow: auto;
    padding: 12px 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    scrollbar-width: thin;
`;

const Grid = styled.div<{ $cols?: number }>`
    display: grid;
    grid-template-columns: repeat(${(p) => p.$cols ?? 3}, 1fr);
    gap: 6px;
`;

const Axis = styled.label<{ $axis: "x" | "y" | "z" }>`
    position: relative;
    display: block;

    &::before {
        content: "${(p) => p.$axis.toUpperCase()}";
        position: absolute;
        left: 8px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 11px;
        font-weight: 600;
        color: var(--axis-${(p) => p.$axis});
        pointer-events: none;
    }

    input {
        padding-left: 22px;
    }
`;

const Sub = styled.label`
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--text-muted);
    font-size: 11px;
`;

const Check = styled.label`
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;

    input {
        width: 14px;
        height: 14px;
        margin: 0;
        accent-color: var(--accent);
    }
`;

const Muted = styled.div`
    color: var(--text-muted);
`;

const Actions = styled.div`
    display: flex;
    gap: 4px;
`;

const DEG = 180 / Math.PI;
const AXES = ["x", "y", "z"] as const;

const round = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, n));

function NumberInput({
    value,
    step,
    min,
    max,
    onChange,
    onCommit,
}: {
    value: number;
    step: number;
    min?: number;
    max?: number;
    onChange: (v: number) => void;
    onCommit?: () => void;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <Input
            type="number"
            step={step}
            min={min}
            max={max}
            value={draft ?? String(round(value))}
            onFocus={() => setDraft(String(round(value)))}
            onChange={(e) => {
                setDraft(e.target.value);
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) onChange(clamp(n, min, max));
            }}
            onBlur={() => {
                setDraft(null);
                onCommit?.();
            }}
        />
    );
}

function VectorField({
    value,
    step,
    scale = 1,
    onChange,
    onCommit,
}: {
    value: Vec3;
    step: number;
    scale?: number;
    onChange: (v: Vec3) => void;
    onCommit: () => void;
}) {
    return (
        <Grid>
            {AXES.map((axis, i) => (
                <Axis key={axis} $axis={axis}>
                    <NumberInput
                        value={value[i] * scale}
                        step={step}
                        onCommit={onCommit}
                        onChange={(n) => {
                            const next: Vec3 = [...value];
                            next[i] = n / scale;
                            onChange(next);
                        }}
                    />
                </Axis>
            ))}
        </Grid>
    );
}

export function Inspector() {
    const show = useUI((s) => s.showInspector);
    const setShow = useUI((s) => s.setShowInspector);
    const objects = useScene((s) => s.doc.objects);
    const selected = useScene(selectSelected);
    const select = useScene((s) => s.select);
    const run = useScene((s) => s.run);
    const endCoalesce = useScene((s) => s.endCoalesce);
    const snap = useScene((s) => s.snap);
    const setSnap = useScene((s) => s.setSnap);

    if (!show) return null;

    const edit = (key: string, cmd: Command) => run(cmd, { coalesce: `${key}:${selected?.id}` });

    return (
        <Root>
            <PanelHeader>
                <PanelTitle>Inspector</PanelTitle>
                <IconButton title="Close" onClick={() => setShow(false)}>
                    <X size={16} />
                </IconButton>
            </PanelHeader>
            <Body>
                <Select value={selected?.id ?? ""} onChange={(e) => select(e.target.value || null)}>
                    <option value="">{objects.length ? "No selection" : "Scene is empty"}</option>
                    {objects.map((o) => (
                        <option key={o.id} value={o.id}>
                            {o.name}
                        </option>
                    ))}
                </Select>

                {!selected && objects.length > 0 && <Muted>Select an object to edit it.</Muted>}

                {selected && (
                    <>
                        <div>
                            <FieldLabel>Name</FieldLabel>
                            <Input
                                value={selected.name}
                                onChange={(e) => {
                                    if (e.target.value.trim())
                                        edit("rename", { type: "rename", target: selected.id, name: e.target.value });
                                }}
                                onBlur={endCoalesce}
                            />
                        </div>
                        <div>
                            <FieldLabel>Position</FieldLabel>
                            <VectorField
                                value={selected.position}
                                step={snap.enabled ? snap.translate : 0.1}
                                onCommit={endCoalesce}
                                onChange={(position) => edit("position", { type: "transform", target: selected.id, position })}
                            />
                        </div>
                        <div>
                            <FieldLabel>Rotation (degrees)</FieldLabel>
                            <VectorField
                                value={selected.rotation}
                                scale={DEG}
                                step={snap.enabled ? round(snap.rotate * DEG) : 1}
                                onCommit={endCoalesce}
                                onChange={(rotation) => edit("rotation", { type: "transform", target: selected.id, rotation })}
                            />
                        </div>
                        <div>
                            <FieldLabel>Scale</FieldLabel>
                            <VectorField
                                value={selected.scale}
                                step={snap.enabled ? snap.scale : 0.1}
                                onCommit={endCoalesce}
                                onChange={(scale) => edit("scale", { type: "transform", target: selected.id, scale })}
                            />
                        </div>
                        <div>
                            <FieldLabel>Material</FieldLabel>
                            <Grid $cols={2}>
                                <Sub>
                                    Color
                                    <Input
                                        type="color"
                                        value={selected.material.color}
                                        onChange={(e) => edit("color", { type: "material", target: selected.id, color: e.target.value })}
                                        onBlur={endCoalesce}
                                    />
                                </Sub>
                                <Sub>
                                    Opacity
                                    <NumberInput
                                        value={selected.material.opacity}
                                        step={0.05}
                                        min={0}
                                        max={1}
                                        onCommit={endCoalesce}
                                        onChange={(opacity) => edit("opacity", { type: "material", target: selected.id, opacity })}
                                    />
                                </Sub>
                                <Sub>
                                    Metalness
                                    <NumberInput
                                        value={selected.material.metalness}
                                        step={0.05}
                                        min={0}
                                        max={1}
                                        onCommit={endCoalesce}
                                        onChange={(metalness) => edit("metalness", { type: "material", target: selected.id, metalness })}
                                    />
                                </Sub>
                                <Sub>
                                    Roughness
                                    <NumberInput
                                        value={selected.material.roughness}
                                        step={0.05}
                                        min={0}
                                        max={1}
                                        onCommit={endCoalesce}
                                        onChange={(roughness) => edit("roughness", { type: "material", target: selected.id, roughness })}
                                    />
                                </Sub>
                            </Grid>
                        </div>
                        <Actions>
                            <Button onClick={() => run({ type: "duplicate", target: selected.id })}>
                                <Copy size={16} />
                                Duplicate
                            </Button>
                            <Button $variant="danger" onClick={() => run({ type: "remove", target: selected.id })}>
                                <Trash size={16} />
                                Delete
                            </Button>
                        </Actions>
                    </>
                )}

                <Divider />

                <div>
                    <Check>
                        <input type="checkbox" checked={snap.enabled} onChange={(e) => setSnap({ enabled: e.target.checked })} />
                        Snapping
                    </Check>
                    {snap.enabled && (
                        <Grid style={{ marginTop: 10 }}>
                            <Sub>
                                Move
                                <NumberInput value={snap.translate} step={0.1} min={0.01} onChange={(translate) => setSnap({ translate })} />
                            </Sub>
                            <Sub>
                                Rotate (°)
                                <NumberInput value={snap.rotate * DEG} step={1} min={1} onChange={(v) => setSnap({ rotate: v / DEG })} />
                            </Sub>
                            <Sub>
                                Scale
                                <NumberInput value={snap.scale} step={0.05} min={0.01} onChange={(scale) => setSnap({ scale })} />
                            </Sub>
                        </Grid>
                    )}
                </div>
            </Body>
        </Root>
    );
}

export default Inspector;
