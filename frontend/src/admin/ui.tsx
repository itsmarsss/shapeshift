import { useEffect, useRef, useState, type ReactNode } from "react";
import styled, { keyframes } from "styled-components";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { CaretLeft, CaretRight, CheckCircle, MagnifyingGlass, WarningCircle, X } from "@phosphor-icons/react";
import { Button, Segment, Segmented } from "../components/ui";
import { drop, EASE_OUT, rise } from "../ui/motion";
import { hue, initials, useToasts } from "./nav";

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
        width: auto;
        height: 38px;
    }
    button {
        height: 38px;
        padding: 0 16px;
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
    tbody tr:hover td,
    tbody tr:focus-visible td {
        background: var(--surface-hover);
    }
    tbody tr:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
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
    // Asking again goes away by itself if they look elsewhere.
    useEffect(() => {
        if (!asking) return;
        const t = setTimeout(() => setAsking(false), 5000);
        return () => clearTimeout(t);
    }, [asking]);
    return (
        <AnimatePresence mode="wait" initial={false}>
            {asking ? (
        <m.span key="ask" {...drop} style={{ display: "inline-flex", gap: 6 }}>
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
        </m.span>
            ) : (
                <m.span key="ask-not" {...drop} style={{ display: "inline-flex" }}>
                    <Button
                        $variant={variant === "danger" ? "danger" : undefined}
                        disabled={disabled}
                        onClick={(e) => {
                            e.stopPropagation();
                            setAsking(true);
                        }}
                    >
                        {label}
                    </Button>
                </m.span>
            )}
        </AnimatePresence>
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

export const Panel = styled(m.section).attrs({ ...rise, exit: undefined })`
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

const SearchField = styled.label`
    flex: 1;
    min-width: 220px;
    position: relative;
    display: flex;
    align-items: center;

    svg {
        position: absolute;
        left: 11px;
        color: var(--text-faint);
        pointer-events: none;
    }
    input {
        width: 100%;
        height: 38px;
        padding: 0 34px 0 34px;
        border-radius: var(--radius);
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    input:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
    }
    input::-webkit-search-cancel-button {
        display: none;
    }
    kbd {
        position: absolute;
        right: 10px;
        padding: 1px 6px;
        border-radius: 5px;
        border: 1px solid var(--border);
        color: var(--text-faint);
        font: 11px/16px inherit;
        pointer-events: none;
    }
    .clear {
        position: absolute;
        right: 6px;
        width: 26px;
        height: 26px;
        border: 0;
        border-radius: 6px;
        background: none;
        display: grid;
        place-items: center;
        color: var(--text-muted);
    }
    .clear:hover {
        background: var(--surface-hover);
    }
    .clear svg {
        position: static;
    }
`;

// Search that applies as you type. Press / anywhere to jump to it.
export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (e.key !== "/" || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
            e.preventDefault();
            ref.current?.focus();
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, []);
    return (
        <SearchField>
            <MagnifyingGlass size={16} />
            <input
                ref={ref}
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && onChange("")}
                placeholder={placeholder}
                aria-label={label}
            />
            {value ? (
                <button type="button" className="clear" aria-label="Clear search" onClick={() => (onChange(""), ref.current?.focus())}>
                    <X size={14} />
                </button>
            ) : (
                <kbd>/</kbd>
            )}
        </SearchField>
    );
}

const shimmer = keyframes`
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
`;

export const Bone = styled.div<{ $h?: number; $w?: string }>`
    height: ${(p) => p.$h ?? 14}px;
    width: ${(p) => p.$w ?? "100%"};
    border-radius: 8px;
    background: linear-gradient(90deg, var(--surface-raised) 25%, var(--surface-hover) 50%, var(--surface-raised) 75%);
    background-size: 200% 100%;
    animation: ${shimmer} 1.4s linear infinite;
`;

const BoneCard = styled.div`
    padding: 18px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const BoneGrid = styled.div<{ $cols: number }>`
    display: grid;
    grid-template-columns: repeat(${(p) => p.$cols}, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 12px;

    @media (max-width: 900px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
`;

// Stand-ins for a section while it loads: numbers, then charts or a list.
export function Loading({ kind = "charts" }: { kind?: "charts" | "list" | "cards" }) {
    return (
        <div aria-busy="true" aria-label="Loading">
            {kind === "charts" && (
                <>
                    <BoneGrid $cols={4}>
                        {[0, 1, 2, 3].map((i) => (
                            <BoneCard key={i}>
                                <Bone $h={26} $w="40%" />
                                <Bone $h={10} $w="70%" />
                            </BoneCard>
                        ))}
                    </BoneGrid>
                    <BoneGrid $cols={2}>
                        {[0, 1].map((i) => (
                            <BoneCard key={i}>
                                <Bone $h={12} $w="35%" />
                                <Bone $h={200} />
                            </BoneCard>
                        ))}
                    </BoneGrid>
                </>
            )}
            {kind === "list" && (
                <BoneCard>
                    {Array.from({ length: 8 }, (_, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <Bone $h={28} $w="28px" style={{ borderRadius: "50%" }} />
                            <Bone $h={12} $w={`${30 + ((i * 17) % 40)}%`} />
                        </div>
                    ))}
                </BoneCard>
            )}
            {kind === "cards" && (
                <BoneGrid $cols={4}>
                    {Array.from({ length: 8 }, (_, i) => (
                        <BoneCard key={i}>
                            <Bone $h={120} />
                            <Bone $h={12} $w="60%" />
                        </BoneCard>
                    ))}
                </BoneGrid>
            )}
        </div>
    );
}

// A list that dims while its next page or filter loads.
export const Dim = styled.div<{ $busy: boolean }>`
    opacity: ${(p) => (p.$busy ? 0.55 : 1)};
    transition: opacity 0.2s ease;
    pointer-events: ${(p) => (p.$busy ? "none" : "auto")};
`;

const ToastStack = styled.div`
    position: fixed;
    right: 20px;
    bottom: calc(20px + env(safe-area-inset-bottom, 0px));
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;

    > div {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 12px;
        background: var(--surface);
        border: 1px solid var(--border-strong);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
        font-weight: 500;
        max-width: min(360px, calc(100vw - 40px));
    }
`;

export function Toasts() {
    const toasts = useToasts((s) => s.toasts);
    return (
        <ToastStack role="status" aria-live="polite">
            <AnimatePresence initial={false}>
                {toasts.map((t) => (
                    <m.div key={t.id} initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.22, ease: EASE_OUT }}>
                        {t.tone === "good" ? <CheckCircle size={18} weight="fill" color="#22c55e" /> : <WarningCircle size={18} weight="fill" color="#e5484d" />}
                        {t.text}
                    </m.div>
                ))}
            </AnimatePresence>
        </ToastStack>
    );
}
