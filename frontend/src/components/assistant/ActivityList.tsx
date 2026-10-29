import { useState } from "react";
import styled from "styled-components";
import { CaretDown, Check, WarningCircle } from "@phosphor-icons/react";
import type { Activity } from "../../assistant/executor";

const COLLAPSED = 5;

const List = styled.ul`
    list-style: none;
    margin: 0;
    padding: 4px 0;
    border-left: 1px solid var(--border-strong);
    display: flex;
    flex-direction: column;
`;

const Row = styled.li<{ $ok: boolean }>`
    display: grid;
    grid-template-columns: 16px 1fr auto;
    align-items: start;
    gap: 6px;
    padding: 2px 0 2px 10px;
    color: ${(p) => (p.$ok ? "var(--text-muted)" : "var(--text)")};
    font-size: 12px;
    line-height: 18px;

    svg {
        margin-top: 2px;
        color: ${(p) => (p.$ok ? "var(--success)" : "var(--danger)")};
    }
`;

const Label = styled.span`
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const ErrorText = styled.div`
    grid-column: 2 / 4;
    color: var(--text-faint);
    white-space: normal;
`;

const Swatch = styled.span<{ $color: string }>`
    width: 10px;
    height: 10px;
    margin-top: 4px;
    border-radius: 3px;
    background: ${(p) => p.$color};
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
`;

const Shot = styled.button<{ $open: boolean }>`
    grid-column: 2 / 4;
    margin: 4px 0 2px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg);
    width: ${(p) => (p.$open ? "100%" : "120px")};
    transition: width 0.15s ease;
    cursor: zoom-${(p) => (p.$open ? "out" : "in")};

    img {
        display: block;
        width: 100%;
    }
`;

function Snapshot({ src, label }: { src: string; label: string }) {
    const [open, setOpen] = useState(false);
    return (
        <Shot type="button" $open={open} onClick={() => setOpen((v) => !v)} title={open ? "Shrink" : "Enlarge"}>
            <img src={src} alt={label} />
        </Shot>
    );
}

const More = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 2px 0 0 10px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-faint);
    font-size: 12px;

    &:hover {
        color: var(--text);
    }
`;

export function ActivityList({ activities }: { activities: Activity[] }) {
    const [open, setOpen] = useState(false);
    const failed = activities.filter((a) => !a.ok);
    // Failures stay visible when the list is collapsed.
    const shown = open || activities.length <= COLLAPSED + 1 ? activities : [...activities.filter((a) => a.ok).slice(0, COLLAPSED), ...failed];
    const hidden = activities.length - shown.length;

    return (
        <List>
            {shown.map((a) => (
                <Row key={a.id} $ok={a.ok}>
                    {a.ok ? <Check size={12} weight="bold" /> : <WarningCircle size={13} weight="fill" />}
                    <Label title={a.label}>{a.label}</Label>
                    {a.color ? <Swatch $color={a.color} title={a.color} /> : <span />}
                    {a.error && <ErrorText>{a.error}</ErrorText>}
                    {a.image && <Snapshot src={a.image} label={a.label} />}
                </Row>
            ))}
            {hidden > 0 && (
                <li>
                    <More onClick={() => setOpen(true)}>
                        <CaretDown size={11} weight="bold" />
                        {hidden} more
                    </More>
                </li>
            )}
        </List>
    );
}
