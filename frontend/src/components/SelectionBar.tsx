import styled from "styled-components";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Check, Copy, Eye, Polygon, SlidersHorizontal, Trash } from "@phosphor-icons/react";
import { startEditPoints, stopEditPoints } from "../scene/editPoints";
import { stopLook } from "../scene/look";
import { touchOnly } from "../ui/touch";
import { useScene } from "../scene/store";
import { COMPACT, useCompact } from "../ui/compact";
import { useInspectorVisible } from "../ui/inspector";
import { drop } from "../ui/motion";
import { useUI } from "../ui/store";
import { ColorPicker } from "./ColorPicker";
import { Button, IconButton } from "./ui";

// A small bar over the view for the selected shape, like Canva's: its color,
// a copy, delete, editing its points, and a way into the inspector for
// everything else. It shows while the inspector is closed, so the big panel
// can stay out of the way. While a shape's points are being edited it says so,
// whether or not the inspector is open, with Done to finish; in Preview, the
// way back to editing.

const Bar = styled(m.div)`
    position: absolute;
    top: calc(var(--topbar) + var(--gap));
    left: 50%;
    translate: -50% 0;
    z-index: 26;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);

    // Phones keep the view cube in the top corner, so the bar sits above
    // the toolbar at the bottom instead.
    @media ${COMPACT} {
        top: auto;
        bottom: calc(var(--gap) * 2 + 48px + env(safe-area-inset-bottom, 0px) + var(--bottom-offset, 0px));
        max-width: calc(100% - 24px);
    }

    .name {
        max-width: 160px;
        padding: 0 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
    }
    .color {
        width: 132px;
    }
    .hint {
        padding: 0 8px;
        color: var(--text-muted);
        font-size: 12px;
        white-space: nowrap;
    }
    .sep {
        width: 1px;
        height: 18px;
        margin: 0 2px;
        background: var(--border);
    }
`;

export function SelectionBar() {
    const compact = useCompact();
    const inspector = useInspectorVisible();
    const mode = useScene((s) => s.mode);
    const selected = useScene((s) => (s.selectedIds.length === 1 ? s.doc.objects.find((o) => o.id === s.selectedIds[0]) : undefined));
    const run = useScene((s) => s.run);
    const endCoalesce = useScene((s) => s.endCoalesce);
    const show = !compact && !inspector && mode === "object" && !!selected;
    const editing = mode === "edit" && !!selected;
    return (
        <AnimatePresence mode="wait">
            {mode === "render" && (
                <Bar key="previewing" {...drop} role="toolbar" aria-label="Previewing">
                    <Eye size={16} weight="fill" style={{ marginLeft: 8, color: "var(--accent)" }} />
                    <span className="name">Previewing</span>
                    <Button $size="sm" $variant="primary" onClick={stopLook}>
                        Back to editing
                    </Button>
                </Bar>
            )}
            {editing && selected && (
                <Bar key="editing-points" {...drop} role="toolbar" aria-label="Editing points">
                    <span className="name" title={selected.name}>
                        Editing points of {selected.name}
                    </span>
                    {!compact && <span className="hint">{touchOnly() ? "Tap a point, then drag its arrows" : "Click a point and drag its arrows. Shift-click for more"}</span>}
                    <Button $size="sm" $variant="primary" onClick={stopEditPoints}>
                        <Check size={14} weight="bold" />
                        Done
                    </Button>
                </Bar>
            )}
            {show && selected && (
                <Bar key="selection-bar" {...drop} role="toolbar" aria-label="Selected shape">
                    <span className="name" title={selected.name}>
                        {selected.name}
                    </span>
                    <div className="color">
                        <ColorPicker
                            value={selected.material.color}
                            onChange={(color) => run({ type: "material", target: selected.id, color }, { coalesce: `color:${selected.id}` })}
                            onCommit={endCoalesce}
                        />
                    </div>
                    <span className="sep" />
                    <IconButton title="Duplicate" onClick={() => run({ type: "duplicate", target: selected.id })}>
                        <Copy size={16} />
                    </IconButton>
                    <IconButton title="Delete" onClick={() => run({ type: "remove", target: selected.id })} style={{ color: "var(--danger)" }}>
                        <Trash size={16} />
                    </IconButton>
                    <IconButton title="Edit points (Enter, or double-click the shape)" onClick={() => startEditPoints(selected.id)}>
                        <Polygon size={16} />
                    </IconButton>
                    <span className="sep" />
                    <IconButton title="More settings (inspector)" onClick={() => useUI.getState().setShowInspector(true)}>
                        <SlidersHorizontal size={16} />
                    </IconButton>
                </Bar>
            )}
        </AnimatePresence>
    );
}
