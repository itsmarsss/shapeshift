import { useState } from "react";
import styled from "styled-components";
import { Intersect, Subtract, Unite } from "@phosphor-icons/react";
import { useScene } from "../scene/store";
import { IconButton, Select } from "./ui";

const Bar = styled.div`
    position: absolute;
    bottom: var(--gap);
    left: 50%;
    transform: translateX(calc(-50% - var(--chat-width) / 2));
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

const OPS = [
    { op: "union", label: "Union", Icon: Unite },
    { op: "subtract", label: "Subtract second from first", Icon: Subtract },
    { op: "intersect", label: "Intersect", Icon: Intersect },
] as const;

export function BooleanPanel() {
    const objects = useScene((s) => s.doc.objects);
    const mode = useScene((s) => s.mode);
    const run = useScene((s) => s.run);
    const [a, setA] = useState("");
    const [b, setB] = useState("");

    if (mode !== "object" || objects.length < 2) return null;

    const ids = new Set(objects.map((o) => o.id));
    const first = ids.has(a) ? a : "";
    const second = ids.has(b) ? b : "";
    const ready = Boolean(first && second && first !== second);

    return (
        <Bar>
            <Picker value={first} onChange={(e) => setA(e.target.value)}>
                <option value="">First object</option>
                {objects.map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.name}
                    </option>
                ))}
            </Picker>
            <Picker value={second} onChange={(e) => setB(e.target.value)}>
                <option value="">Second object</option>
                {objects.map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.name}
                    </option>
                ))}
            </Picker>
            {OPS.map(({ op, label, Icon }) => (
                <IconButton
                    key={op}
                    title={label}
                    disabled={!ready}
                    onClick={() => {
                        const [result] = run({ type: "boolean", operation: op, target: first, tool: second });
                        if (result && !result.ok) alert(result.error);
                    }}
                >
                    <Icon size={18} />
                </IconButton>
            ))}
        </Bar>
    );
}

export default BooleanPanel;
