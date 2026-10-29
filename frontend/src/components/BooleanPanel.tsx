import { useMemo, useState } from "react";
import styled from "styled-components";
import { Intersect, Subtract, Unite } from "@phosphor-icons/react";
import { useEditor } from "../store/editor";
import { IconButton, Select } from "./ui";

const Bar = styled.div`
    position: absolute;
    bottom: var(--gap);
    left: calc(var(--gap) * 2 + 220px);
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    z-index: 20;
`;

const Picker = styled(Select)`
    width: 130px;
`;

export function BooleanPanel() {
    const objects = useEditor((s) => s.objects);
    const booleanOp = useEditor((s) => s.booleanOp);
    const editorMode = useEditor((s) => s.editorMode);
    const [aId, setA] = useState<string>("");
    const [bId, setB] = useState<string>("");

    const options = useMemo(
        () => objects.map((o) => ({ id: o.id, name: o.name })),
        [objects]
    );

    if (editorMode === "render" || objects.length < 2) return null;

    const ready = Boolean(aId && bId && aId !== bId);

    return (
        <Bar>
            <Picker value={aId} onChange={(e) => setA(e.target.value)}>
                <option value="">First object</option>
                {options.map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.name}
                    </option>
                ))}
            </Picker>
            <Picker value={bId} onChange={(e) => setB(e.target.value)}>
                <option value="">Second object</option>
                {options.map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.name}
                    </option>
                ))}
            </Picker>
            <IconButton
                title="Union"
                disabled={!ready}
                onClick={() => booleanOp("union", aId, bId)}
            >
                <Unite size={18} />
            </IconButton>
            <IconButton
                title="Subtract second from first"
                disabled={!ready}
                onClick={() => booleanOp("subtract", aId, bId)}
            >
                <Subtract size={18} />
            </IconButton>
            <IconButton
                title="Intersect"
                disabled={!ready}
                onClick={() => booleanOp("intersect", aId, bId)}
            >
                <Intersect size={18} />
            </IconButton>
        </Bar>
    );
}

export default BooleanPanel;
