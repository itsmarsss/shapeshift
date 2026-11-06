import styled from "styled-components";
import { useModelChoice } from "../../assistant/modelChoice";
import { Select } from "../ui";

// Which model the assistant uses: a small select in the line under the
// message box, and the same choice in Settings (`full`).

const Inline = styled.select`
    appearance: none;
    padding: 0 14px 0 4px;
    border: 0;
    border-radius: 4px;
    background: transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23888'/%3E%3C/svg%3E") no-repeat right 3px center;
    color: var(--text-muted);
    font: inherit;
    cursor: pointer;
    // As wide as the picked name, not the longest one.
    field-sizing: content;

    &:hover {
        color: var(--text);
        background-color: var(--surface-hover);
    }
`;

export function ModelPicker({ full = false }: { full?: boolean }) {
    const choice = useModelChoice();
    if (!choice) return null;
    const { choices, current, pick } = choice;
    const options = choices.map((c) => (
        <option key={c.id} value={c.id}>
            {c.label}
            {full && c.cost > 1 ? ` (${c.cost} prompts a message)` : ""}
        </option>
    ));
    if (full)
        return (
            <Select aria-label="Assistant model" value={current.id} onChange={(e) => pick(e.target.value)}>
                {options}
            </Select>
        );
    return (
        <>
            <Inline aria-label="Assistant model" title={current.detail} value={current.id} onChange={(e) => pick(e.target.value)}>
                {options}
            </Inline>
            {" · "}
        </>
    );
}
