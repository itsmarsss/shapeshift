import styled from "styled-components";
import { useScene } from "../scene/store";
import { useSettings } from "../settings/store";
import { COMPACT } from "../ui/compact";
import { formatLength } from "../ui/units";
import { useTools } from "../viewport/tools";

const Note = styled.div`
    position: absolute;
    left: var(--gap);
    bottom: calc(var(--gap) + var(--bottom-offset, 0px));
    color: var(--text-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    z-index: 10;

    @media ${COMPACT} {
        display: none;
    }
`;

export function GridScale() {
    const step = useTools((s) => s.gridStep);
    const custom = useTools((s) => s.workplane !== null);
    const units = useSettings((s) => s.units);
    const show = useSettings((s) => s.showGrid);
    const mode = useScene((s) => s.mode);
    if (!show || mode === "render") return null;
    return (
        <Note data-grid-scale>
            Grid {formatLength(step, units)}
            {custom ? " · on face" : ""}
        </Note>
    );
}
