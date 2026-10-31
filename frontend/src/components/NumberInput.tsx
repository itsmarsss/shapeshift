import { useState } from "react";
import { Input } from "./ui";

const round = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, n));

export function NumberInput({
    value,
    step,
    min,
    max,
    label,
    onChange,
    onCommit,
}: {
    value: number;
    step: number;
    min?: number;
    max?: number;
    label?: string;
    onChange: (v: number) => void;
    onCommit?: () => void;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <Input
            type="number"
            aria-label={label}
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
