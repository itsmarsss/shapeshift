import { useState } from "react";
import styled from "styled-components";
import { CaretRight, Copy, SelectionPlus, SelectionSlash, Trash, X } from "@phosphor-icons/react";
import { useShallow } from "zustand/react/shallow";
import { COMPACT } from "../ui/compact";
import { useTimeline } from "../scene/timeline";
import { transformCommand } from "../scene/autokey";
import { selectSelected, selectSelectedLight, selectSelectedObjects, useScene } from "../scene/store";
import { duplicateSelection, groupSelection, removeSelection, ungroupSelection } from "../scene/selection";
import { ENVIRONMENTS, type Command, type Environment, type Light, type Material, type Vec3 } from "@shapeshift/shared/scene/schema";
import { useUI } from "../ui/store";
import { UNIT_SCALE, useSettings } from "../settings/store";
import { ColorPicker } from "./ColorPicker";
import { Button, Divider, FieldLabel, IconButton, Input, Panel, PanelHeader, PanelTitle, Select } from "./ui";

const Root = styled(Panel)`
    top: calc(var(--topbar) + var(--gap));
    left: calc(var(--gap) * 2 + 46px);
    width: 272px;
    max-height: calc(100% - var(--topbar) - var(--gap) * 2 - var(--bottom-offset, 0px));
    z-index: 30;

    @media ${COMPACT} {
        top: auto;
        left: 0;
        right: 0;
        bottom: 0;
        width: auto;
        border-radius: 16px 16px 0 0;
        border-bottom: 0;
        padding-bottom: env(safe-area-inset-bottom, 0px);
        box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.4);
        z-index: 60;
        max-height: 55vh;
    }
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

const LIGHT_KIND: Record<Light["type"], string> = { point: "Point light", spot: "Spot light", directional: "Directional light" };

const MoreToggle = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 30px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;

    svg {
        transition: transform 0.15s ease;
    }
    &[aria-expanded="true"] svg {
        transform: rotate(90deg);
    }
    &:hover {
        color: var(--text);
    }
`;

const MORE_KEY = "shapeshift-inspector-more";

function readMore() {
    try {
        return localStorage.getItem(MORE_KEY) === "1";
    } catch {
        return false;
    }
}

// Exact numbers stay out of the way until someone asks for them, and the
// choice sticks between objects and visits.
function More({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(readMore);
    return (
        <>
            <MoreToggle
                type="button"
                aria-expanded={open}
                onClick={() => {
                    setOpen(!open);
                    try {
                        localStorage.setItem(MORE_KEY, open ? "0" : "1");
                    } catch {
                        // Optional.
                    }
                }}
            >
                <CaretRight size={12} weight="bold" />
                {open ? "Fewer options" : "More options"}
            </MoreToggle>
            {open && children}
        </>
    );
}

function LightSection({ light }: { light: Light }) {
    const run = useScene((s) => s.run);
    const endCoalesce = useScene((s) => s.endCoalesce);
    const snap = useScene((s) => s.snap);
    const edit = (key: string, cmd: Command) => run(cmd, { coalesce: `${key}:${light.id}` });
    const update = (key: string, fields: Omit<Extract<Command, { type: "updateLight" }>, "type" | "target">) =>
        edit(key, { type: "updateLight", target: light.id, ...fields });

    return (
        <>
            <div>
                <FieldLabel>Name</FieldLabel>
                <Input
                    value={light.name}
                    onChange={(e) => {
                        if (e.target.value.trim()) edit("rename", { type: "rename", target: light.id, name: e.target.value });
                    }}
                    onBlur={endCoalesce}
                />
                <Muted style={{ marginTop: 6 }}>{LIGHT_KIND[light.type]}</Muted>
            </div>
            <Grid $cols={2}>
                <Sub>
                    Color
                    <ColorPicker label="Light color" value={light.color} onChange={(color) => update("color", { color })} onCommit={endCoalesce} />
                </Sub>
                <Sub>
                    Brightness
                    <NumberInput
                        value={light.intensity}
                        step={light.type === "directional" ? 0.1 : 1}
                        min={0}
                        max={1000}
                        onCommit={endCoalesce}
                        onChange={(intensity) => update("intensity", { intensity })}
                    />
                </Sub>
            </Grid>
            <More>
                <div>
                    <FieldLabel>Position</FieldLabel>
                    <VectorField
                        value={light.position}
                        step={snap.enabled ? snap.translate : 0.1}
                        onCommit={endCoalesce}
                        onChange={(position) => update("position", { position })}
                    />
                </div>
                {light.type !== "point" && (
                    <div>
                        <FieldLabel>Aim at</FieldLabel>
                        <VectorField value={light.aim} step={0.1} onCommit={endCoalesce} onChange={(aim) => update("aim", { aim })} />
                    </div>
                )}
                {light.type !== "directional" && (
                    <Grid $cols={2}>
                        <Sub>
                            Range (0 = ∞)
                            <NumberInput value={light.distance} step={0.5} min={0} onCommit={endCoalesce} onChange={(distance) => update("distance", { distance })} />
                        </Sub>
                        {light.type === "spot" && (
                            <Sub>
                                Cone (°)
                                <NumberInput
                                    value={light.angle * DEG}
                                    step={1}
                                    min={1}
                                    max={90}
                                    onCommit={endCoalesce}
                                    onChange={(deg) => update("angle", { angle: deg / DEG })}
                                />
                            </Sub>
                        )}
                    </Grid>
                )}
            </More>
            <Actions>
                <Button onClick={() => run({ type: "duplicate", target: light.id })}>
                    <Copy size={16} />
                    Duplicate
                </Button>
                <Button $variant="danger" onClick={() => run({ type: "remove", target: light.id })}>
                    <Trash size={16} />
                    Delete
                </Button>
            </Actions>
        </>
    );
}

function SelectionSection({ count, groups }: { count: number; groups: string[] }) {
    const [name, setName] = useState("");
    const run = useScene((s) => s.run);
    const endCoalesce = useScene((s) => s.endCoalesce);
    const ids = useScene(useShallow((s) => s.selectedIds));
    const color = useScene((s) => s.doc.objects.find((o) => o.id === s.selectedId)?.material.color ?? "#ffffff");
    const shared = groups.length === 1 ? groups[0] : null;

    return (
        <>
            <Muted>
                {count} objects selected{shared ? ` · group “${shared}”` : ""}. Shift-click to add or remove one.
            </Muted>
            <div>
                <FieldLabel>Group</FieldLabel>
                <Grid $cols={2}>
                    <Input placeholder={shared ?? "Group name"} value={name} onChange={(e) => setName(e.target.value)} />
                    <Button onClick={() => (groupSelection(name), setName(""))} title="Group (⌘G)">
                        <SelectionPlus size={16} />
                        {shared ? "Regroup" : "Group"}
                    </Button>
                </Grid>
                {groups.length > 0 && (
                    <Button style={{ marginTop: 6 }} onClick={ungroupSelection} title="Ungroup (⇧⌘G)">
                        <SelectionSlash size={16} />
                        Ungroup
                    </Button>
                )}
            </div>
            <div>
                <FieldLabel>Color for all</FieldLabel>
                <ColorPicker
                    label="Color for all"
                    value={color}
                    onChange={(c) => run(ids.map((id): Command => ({ type: "material", target: id, color: c })), { coalesce: "color:selection" })}
                    onCommit={endCoalesce}
                />
            </div>
            <Actions>
                <Button onClick={duplicateSelection}>
                    <Copy size={16} />
                    Duplicate
                </Button>
                <Button $variant="danger" onClick={removeSelection}>
                    <Trash size={16} />
                    Delete
                </Button>
            </Actions>
        </>
    );
}

const Tiles = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
`;

// A little shaded ball per material, so it reads as a material and not a color.
const Tile = styled.button<{ $swatch: string; $glow?: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 8px 4px 6px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;

    span {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: radial-gradient(circle at 32% 30%, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0) 42%), ${(p) => p.$swatch};
        box-shadow: ${(p) => (p.$glow ? "0 0 10px 2px #ff4fd8aa" : "inset -3px -4px 8px rgba(0, 0, 0, 0.25)")};
    }
    &:hover {
        color: var(--text);
        border-color: var(--border-strong);
    }
    &[aria-pressed="true"] {
        color: var(--text);
        border-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 8%, transparent);
    }
`;

type MaterialFields = Omit<Extract<Command, { type: "material" }>, "type" | "target">;

const MATERIAL_PRESETS: { name: string; swatch: string; material: MaterialFields }[] = [
    { name: "Plastic", swatch: "#e5484d", material: { metalness: 0, roughness: 0.45, transmission: 0, emissiveIntensity: 0, opacity: 1 } },
    { name: "Matte", swatch: "#8e9099", material: { metalness: 0, roughness: 0.95, transmission: 0, emissiveIntensity: 0, opacity: 1 } },
    { name: "Gold", swatch: "linear-gradient(135deg,#fff1b0,#d4a017)", material: { color: "#d4a017", metalness: 1, roughness: 0.25, transmission: 0, emissiveIntensity: 0, opacity: 1 } },
    { name: "Chrome", swatch: "linear-gradient(135deg,#ffffff,#6b6f78)", material: { color: "#d9dce1", metalness: 1, roughness: 0.05, transmission: 0, emissiveIntensity: 0, opacity: 1 } },
    { name: "Glass", swatch: "linear-gradient(135deg,#e8f4ff,#9cc9ff)", material: { color: "#ffffff", metalness: 0, roughness: 0.05, transmission: 1, emissiveIntensity: 0, opacity: 1 } },
    { name: "Neon", swatch: "#ff4fd8", material: { color: "#ff4fd8", emissive: "#ff4fd8", emissiveIntensity: 3, metalness: 0, roughness: 0.4, transmission: 0, opacity: 1 } },
];

// Whether a material is close enough to a preset to count as it. Color only
// matters for presets that set one.
function looksLike(material: Material, preset: MaterialFields) {
    const near = (a = 0, b = 0) => Math.abs(a - b) < 0.02;
    return (
        near(material.metalness, preset.metalness) &&
        near(material.roughness, preset.roughness) &&
        near(material.transmission, preset.transmission) &&
        near(material.emissiveIntensity, preset.emissiveIntensity) &&
        (preset.color === undefined || material.color.toLowerCase() === preset.color)
    );
}

const ENVIRONMENT_LABELS: Record<Environment, string> = {
    none: "None (plain lights)",
    studio: "Studio",
    sunset: "Sunset",
    city: "City",
    night: "Night",
};

export function Inspector() {
    const show = useUI((s) => s.showInspector);
    const setShow = useUI((s) => s.setShowInspector);
    const objects = useScene((s) => s.doc.objects);
    const selected = useScene(selectSelected);
    const pose = useTimeline((s) => (selected ? s.poses.get(selected.id) : undefined));
    const time = useTimeline((s) => s.time);
    const selectedLight = useScene(selectSelectedLight);
    const selectedObjects = useScene(useShallow(selectSelectedObjects));
    const multi = selectedObjects.length > 1;
    const groups = [...new Set(selectedObjects.flatMap((o) => (o.group ? [o.group] : [])))];
    const lights = useScene((s) => s.doc.lights);
    const select = useScene((s) => s.select);
    const environment = useScene((s) => s.doc.environment);
    const run = useScene((s) => s.run);
    const endCoalesce = useScene((s) => s.endCoalesce);
    const snap = useScene((s) => s.snap);
    const setSnap = useScene((s) => s.setSnap);
    const mode = useScene((s) => s.mode);
    const units = useSettings((s) => s.units);
    const angleUnit = useSettings((s) => s.angleUnit);
    const unit = UNIT_SCALE[units];
    const angle = angleUnit === "deg" ? DEG : 1;

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
                <Select value={selected?.id ?? selectedLight?.id ?? ""} onChange={(e) => select(e.target.value || null)}>
                    <option value="">{objects.length || lights.length ? "No selection" : "Scene is empty"}</option>
                    {objects.map((o) => (
                        <option key={o.id} value={o.id}>
                            {o.name}
                        </option>
                    ))}
                    {lights.length > 0 && (
                        <optgroup label="Lights">
                            {lights.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name}
                                </option>
                            ))}
                        </optgroup>
                    )}
                </Select>

                {!selected && !selectedLight && objects.length + lights.length > 0 && <Muted>Select an object to edit it.</Muted>}

                {selectedLight && <LightSection light={selectedLight} />}

                {multi && <SelectionSection count={selectedObjects.length} groups={groups} />}

                {selected && !multi && mode === "edit" && <Muted>Click a vertex to move it. Shift-click to select more.</Muted>}

                {selected && !multi && (
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
                            {selected.group && <Muted style={{ marginTop: 6 }}>In group “{selected.group}”. Alt-click picks one part.</Muted>}
                            {pose && <Muted style={{ marginTop: 6 }}>Animated. Moving it adds a keyframe at {time.toFixed(1)}s.</Muted>}
                        </div>
                        <div>
                            <FieldLabel>Color</FieldLabel>
                            <ColorPicker
                                value={selected.material.color}
                                onChange={(color) => edit("color", { type: "material", target: selected.id, color })}
                                onCommit={endCoalesce}
                            />
                        </div>
                        <div>
                            <FieldLabel>Material</FieldLabel>
                            <Tiles>
                                {MATERIAL_PRESETS.map((p) => (
                                    <Tile
                                        key={p.name}
                                        type="button"
                                        aria-pressed={looksLike(selected.material, p.material)}
                                        $swatch={p.swatch}
                                        $glow={p.name === "Neon"}
                                        onClick={() =>
                                            run([
                                                { type: "material", target: selected.id, ...p.material },
                                                // Metal mirrors its surroundings, and plain lights leave
                                                // nothing to mirror, so it would render black.
                                                ...(p.material.metalness && environment === "none" ? [{ type: "environment", preset: "studio" } as const] : []),
                                            ])
                                        }
                                    >
                                        <span />
                                        {p.name}
                                    </Tile>
                                ))}
                            </Tiles>
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
                        <More>
                            <div>
                                <FieldLabel>Position ({units})</FieldLabel>
                                <VectorField
                                    value={pose?.position ?? selected.position}
                                    scale={unit}
                                    step={(snap.enabled ? snap.translate : 0.1) * unit}
                                    onCommit={endCoalesce}
                                    onChange={(position) => edit("position", transformCommand(selected.id, { position }))}
                                />
                            </div>
                            <div>
                                <FieldLabel>Rotation ({angleUnit === "deg" ? "degrees" : "radians"})</FieldLabel>
                                <VectorField
                                    value={pose?.rotation ?? selected.rotation}
                                    scale={angle}
                                    step={snap.enabled ? round(snap.rotate * angle) : angleUnit === "deg" ? 1 : 0.05}
                                    onCommit={endCoalesce}
                                    onChange={(rotation) => edit("rotation", transformCommand(selected.id, { rotation }))}
                                />
                            </div>
                            <div>
                                <FieldLabel>Scale</FieldLabel>
                                <VectorField
                                    value={pose?.scale ?? selected.scale}
                                    step={snap.enabled ? snap.scale : 0.1}
                                    onCommit={endCoalesce}
                                    onChange={(scale) => edit("scale", transformCommand(selected.id, { scale }))}
                                />
                            </div>
                            <div>
                                <FieldLabel>Fine-tune the material</FieldLabel>
                                <Grid $cols={2}>
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
                                        <Sub>
                                            Glow color
                                            <ColorPicker
                                                label="Glow color"
                                                value={selected.material.emissive ?? selected.material.color}
                                                onChange={(emissive) => edit("emissive", { type: "material", target: selected.id, emissive })}
                                                onCommit={endCoalesce}
                                            />
                                        </Sub>
                                        <Sub>
                                            Glow
                                            <NumberInput
                                                value={selected.material.emissiveIntensity ?? 0}
                                                step={0.25}
                                                min={0}
                                                max={20}
                                                onCommit={endCoalesce}
                                                onChange={(emissiveIntensity) => edit("glow", { type: "material", target: selected.id, emissiveIntensity })}
                                            />
                                        </Sub>
                                        <Sub>
                                            Glass
                                            <NumberInput
                                                value={selected.material.transmission ?? 0}
                                                step={0.05}
                                                min={0}
                                                max={1}
                                                onCommit={endCoalesce}
                                                onChange={(transmission) => edit("glass", { type: "material", target: selected.id, transmission })}
                                            />
                                        </Sub>
                                </Grid>
                            </div>
                        </More>
                    </>
                )}

                <Divider />

                <div>
                    <FieldLabel>Environment</FieldLabel>
                    <Select
                        value={environment}
                        onChange={(e) => run({ type: "environment", preset: e.target.value as Environment })}
                        title="Lighting that shiny surfaces and glass reflect"
                    >
                        {ENVIRONMENTS.map((env) => (
                            <option key={env} value={env}>
                                {ENVIRONMENT_LABELS[env]}
                            </option>
                        ))}
                    </Select>
                </div>

                <div>
                    <Check>
                        <input type="checkbox" checked={snap.enabled} onChange={(e) => setSnap({ enabled: e.target.checked })} />
                        Snapping
                    </Check>
                    {snap.enabled && (
                        <Grid style={{ marginTop: 10 }}>
                            <Sub>
                                Move ({units})
                                <NumberInput
                                    value={snap.translate * unit}
                                    step={0.1 * unit}
                                    min={0.001 * unit}
                                    onChange={(v) => setSnap({ translate: v / unit })}
                                />
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
