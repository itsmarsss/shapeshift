import styled from "styled-components";
import { AlignCenterHorizontal, AlignLeft, AlignRight, ArrowLineDown } from "@phosphor-icons/react";
import { AXES, type Axis, type Geometry, type SceneObject } from "@shapeshift/shared/scene/schema";
import { useScene } from "../scene/store";
import { alignSelection, dropSelection, mirrorSelection, setSelectionHole } from "../scene/selection";
import { UNIT_SCALE, useSettings } from "../settings/store";
import { Button, FieldLabel, IconButton, Input, Segment, Segmented } from "./ui";
import { NumberInput } from "./NumberInput";

type Field = { key: string; label: string; kind: "length" | "count" | "text"; min?: number; max?: number };

const L = (key: string, label: string): Field => ({ key, label, kind: "length" });
const BOX = [L("width", "Width"), L("depth", "Depth"), L("height", "Height")];

const SHAPE_FIELDS: Record<Exclude<Geometry["type"], "mesh">, Field[]> = {
    box: BOX,
    sphere: [L("radius", "Radius")],
    cylinder: [L("radiusTop", "Top radius"), L("radiusBottom", "Bottom radius"), L("height", "Height")],
    cone: [L("radius", "Radius"), L("height", "Height")],
    torus: [L("radius", "Radius"), L("tube", "Tube")],
    plane: [L("width", "Width"), L("height", "Length")],
    wedge: BOX,
    roof: BOX,
    pyramid: BOX,
    halfSphere: [L("radius", "Radius")],
    tube: [L("radius", "Radius"), L("thickness", "Wall"), L("height", "Height")],
    polygon: [{ key: "sides", label: "Sides", kind: "count", min: 3, max: 64 }, L("radius", "Radius"), L("height", "Height")],
    star: [{ key: "points", label: "Points", kind: "count", min: 3, max: 32 }, L("radius", "Radius"), L("innerRadius", "Inner radius"), L("height", "Height")],
    text: [{ key: "text", label: "Text", kind: "text" }, L("size", "Size"), L("height", "Height")],
    paraboloid: [L("radius", "Radius"), L("height", "Height")],
};

const Fields = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
`;

const Sub = styled.label<{ $wide?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--text-muted);
    font-size: 11px;
    grid-column: ${(p) => (p.$wide ? "1 / -1" : "auto")};
`;

export function ShapeSection({ object }: { object: SceneObject }) {
    const run = useScene((s) => s.run);
    const endCoalesce = useScene((s) => s.endCoalesce);
    const units = useSettings((s) => s.units);
    const unit = UNIT_SCALE[units];
    const g = object.geometry;
    if (g.type === "mesh") return null;
    const values = g as unknown as Record<string, number | string>;
    const set = (key: string, value: number | string) =>
        run({ type: "geometry", target: object.id, geometry: { ...g, [key]: value } as Geometry }, { coalesce: `shape:${object.id}` });

    return (
        <div>
            <FieldLabel>Shape ({units})</FieldLabel>
            <Fields>
                {SHAPE_FIELDS[g.type].map((f) => (
                    <Sub key={f.key} $wide={f.kind === "text"}>
                        {f.label}
                        {f.kind === "text" ? (
                            <Input
                                aria-label={f.label}
                                value={String(values[f.key])}
                                maxLength={100}
                                onChange={(e) => e.target.value && set(f.key, e.target.value)}
                                onBlur={endCoalesce}
                            />
                        ) : f.kind === "count" ? (
                            <NumberInput
                                label={f.label}
                                value={values[f.key] as number}
                                step={1}
                                min={f.min}
                                max={f.max}
                                onCommit={endCoalesce}
                                onChange={(v) => set(f.key, Math.round(v))}
                            />
                        ) : (
                            <NumberInput
                                label={f.label}
                                value={(values[f.key] as number) * unit}
                                step={units === "m" ? 0.05 : units === "cm" ? 1 : 5}
                                min={0.0001 * unit}
                                onCommit={endCoalesce}
                                onChange={(v) => set(f.key, v / unit)}
                            />
                        )}
                    </Sub>
                ))}
            </Fields>
        </div>
    );
}

export function HoleToggle({ objects }: { objects: SceneObject[] }) {
    const holes = objects.filter((o) => o.hole).length;
    return (
        <Segmented role="radiogroup" aria-label="Solid or hole">
            <Segment role="radio" aria-checked={holes === 0} $active={holes === 0} onClick={() => setSelectionHole(false)}>
                Solid
            </Segment>
            <Segment role="radio" aria-checked={holes === objects.length} $active={holes === objects.length} onClick={() => setSelectionHole(true)}>
                Hole
            </Segment>
        </Segmented>
    );
}

const Rows = styled.div`
    display: grid;
    grid-template-columns: 18px repeat(3, 1fr);
    gap: 4px 6px;
    align-items: center;
`;

const AxisName = styled.span<{ $axis: Axis }>`
    font-size: 11px;
    font-weight: 600;
    color: var(--axis-${(p) => p.$axis});
`;

const Line = styled.div`
    display: flex;
    gap: 4px;
    align-items: center;
`;

const ALIGN = [
    { to: "min", Icon: AlignLeft },
    { to: "center", Icon: AlignCenterHorizontal },
    { to: "max", Icon: AlignRight },
] as const;

export function ArrangeSection({ canAlign }: { canAlign: boolean }) {
    return (
        <div>
            <FieldLabel>Arrange</FieldLabel>
            {canAlign && (
                <Rows style={{ marginBottom: 8 }}>
                    {AXES.map((axis) => (
                        <Line key={axis} style={{ display: "contents" }}>
                            <AxisName $axis={axis}>{axis.toUpperCase()}</AxisName>
                            {ALIGN.map(({ to, Icon }) => (
                                <IconButton key={to} style={{ width: "100%" }} title={`Align ${axis.toUpperCase()} ${to}`} onClick={() => alignSelection(axis, to)}>
                                    <Icon size={16} />
                                </IconButton>
                            ))}
                        </Line>
                    ))}
                </Rows>
            )}
            <Line>
                {AXES.map((axis) => (
                    <Button key={axis} title={`Mirror across ${axis.toUpperCase()}`} onClick={() => mirrorSelection(axis)}>
                        Mirror <AxisName $axis={axis}>{axis.toUpperCase()}</AxisName>
                    </Button>
                ))}
                <IconButton title="Drop to workplane (D)" onClick={dropSelection} style={{ marginLeft: "auto" }}>
                    <ArrowLineDown size={16} />
                </IconButton>
            </Line>
        </div>
    );
}
