import { useState, type ReactNode } from "react";
import styled from "styled-components";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Button, Segment, Segmented } from "../components/ui";
import { hue, initials } from "./nav";

// Pieces the admin sections share.

export const Problem = styled.p`
    color: var(--danger);
`;

export const Note = styled.p`
    margin: 0 0 14px;
    color: var(--text-muted);
`;

export const SectionHead = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 14px;

    h2 {
        margin: 0;
        font-size: 20px;
        letter-spacing: -0.02em;
    }
    p {
        margin: 2px 0 0;
        color: var(--text-muted);
    }
`;

export const Toolbar = styled.form`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
    align-items: center;

    input[type="search"],
    input[type="email"],
    input[type="text"] {
        flex: 1;
        min-width: 220px;
        height: 38px;
    }
    select {
        height: 38px;
    }
`;

export const TableBox = styled.div`
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);

    table {
        width: 100%;
        border-collapse: collapse;
        min-width: 720px;
    }
    th,
    td {
        padding: 10px 14px;
        text-align: left;
        border-bottom: 1px solid var(--border);
        white-space: nowrap;
        font-size: 13px;
    }
    th {
        color: var(--text-muted);
        font-weight: 600;
        font-size: 12px;
        background: var(--surface-raised);
        position: sticky;
        top: 0;
    }
    th button {
        border: 0;
        background: none;
        padding: 0;
        color: inherit;
        font: inherit;
        display: inline-flex;
        gap: 4px;
    }
    th button[aria-pressed="true"] {
        color: var(--text);
    }
    tbody tr {
        cursor: pointer;
    }
    tbody tr:hover td {
        background: var(--surface-hover);
    }
    tr:last-child td {
        border-bottom: 0;
    }
    .muted {
        color: var(--text-muted);
    }
`;

export const Badge = styled.span<{ $tone?: "accent" | "green" | "amber" | "red" | "plain" }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    ${(p) => {
        const tones = {
            accent: ["var(--accent-soft)", "var(--accent)"],
            green: ["rgba(34, 197, 94, 0.14)", "#16a34a"],
            amber: ["rgba(245, 165, 36, 0.16)", "#d18a0b"],
            red: ["rgba(229, 72, 77, 0.14)", "#e5484d"],
            plain: ["var(--surface-raised)", "var(--text-muted)"],
        } as const;
        const [bg, fg] = tones[p.$tone ?? "plain"];
        return `background: ${bg}; color: ${fg};`;
    }}
`;

export function PlanBadge({ plan, status }: { plan: string; status: string | null }) {
    if (plan !== "pro") return <Badge>Free</Badge>;
    if (status === "manual") return <Badge $tone="accent">Pro · given</Badge>;
    if (status === "past_due") return <Badge $tone="red">Pro · overdue</Badge>;
    if (status === "canceling") return <Badge $tone="amber">Pro · cancelling</Badge>;
    return <Badge $tone="green">Pro</Badge>;
}

const AvatarBox = styled.span<{ $size: number }>`
    width: ${(p) => p.$size}px;
    height: ${(p) => p.$size}px;
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    color: #fff;
    font-weight: 700;
    font-size: ${(p) => Math.round(p.$size * 0.38)}px;
    flex-shrink: 0;
`;

export function Avatar({ email, size = 28 }: { email: string; size?: number }) {
    return (
        <AvatarBox $size={size} style={{ background: hue(email) }} aria-hidden>
            {initials(email)}
        </AvatarBox>
    );
}

// A button that asks once more before it acts.
export function Confirm({ label, sure, onConfirm, variant = "primary", disabled }: { label: string; sure: string; onConfirm: () => void; variant?: "primary" | "danger"; disabled?: boolean }) {
    const [asking, setAsking] = useState(false);
    return asking ? (
        <span style={{ display: "inline-flex", gap: 6 }}>
            <Button
                $variant={variant}
                onClick={(e) => {
                    e.stopPropagation();
                    setAsking(false);
                    onConfirm();
                }}
            >
                {sure}
            </Button>
            <Button
                onClick={(e) => {
                    e.stopPropagation();
                    setAsking(false);
                }}
            >
                Cancel
            </Button>
        </span>
    ) : (
        <Button
            disabled={disabled}
            onClick={(e) => {
                e.stopPropagation();
                setAsking(true);
            }}
        >
            {label}
        </Button>
    );
}

const PagerBox = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
    color: var(--text-muted);
    font-size: 13px;

    div {
        display: flex;
        gap: 6px;
    }
`;

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const from = total ? page * pageSize + 1 : 0;
    const to = Math.min(total, (page + 1) * pageSize);
    return (
        <PagerBox>
            <span>
                {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
            </span>
            <div>
                <Button disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
                    <CaretLeft size={14} />
                </Button>
                <Button disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">
                    <CaretRight size={14} />
                </Button>
            </div>
        </PagerBox>
    );
}

export type Days = 7 | 30 | 90;

export function RangePicker({ days, setDays }: { days: Days; setDays: (d: Days) => void }) {
    return (
        <Segmented>
            {([7, 30, 90] as Days[]).map((d) => (
                <Segment key={d} $active={days === d} onClick={() => setDays(d)}>
                    {d} days
                </Segment>
            ))}
        </Segmented>
    );
}

export const Panel = styled.section`
    padding: 18px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    margin-bottom: 12px;

    > h3 {
        margin: 0 0 12px;
        font-size: 14px;
    }
`;

export function Header({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
    return (
        <SectionHead>
            <div>
                <h2>{title}</h2>
                {children && <p>{children}</p>}
            </div>
            {actions}
        </SectionHead>
    );
}
