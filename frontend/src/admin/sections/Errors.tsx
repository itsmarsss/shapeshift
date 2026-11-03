import { useState } from "react";
import styled from "styled-components";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { CaretRight, Check, Copy } from "@phosphor-icons/react";
import { Button } from "../../components/ui";
import { EASE_OUT, rowIn } from "../../ui/motion";
import { useCopy } from "../../ui/hooks";
import { ago, useLoad } from "../nav";
import { Badge, Bone, Problem } from "../ui";
import { NoData } from "../charts";
import { COLORS } from "../chartData";

// Each different error browsers reported, most frequent first. Opening one
// shows its latest stack trace and where it happened.

type Group = {
    place: string;
    message: string;
    n: number;
    visitors: number;
    first: string;
    last: string;
    stack: string;
    pages: { label: string; n: number }[];
    browsers: { label: string; n: number }[];
    recent: string[];
};

// Analytics Engine answers in UTC, as "2026-11-02 09:00:00".
const at = (t: string) => Date.parse(`${t.replace(" ", "T")}Z`);

const List = styled.ol`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const Item = styled(m.li)<{ $open: boolean }>`
    border-radius: 12px;
    border: 1px solid ${(p) => (p.$open ? "var(--border-strong)" : "var(--border)")};
    background: var(--bg);
    overflow: hidden;
    transition: border-color 0.15s ease;

    > button {
        width: 100%;
        display: grid;
        grid-template-columns: 16px 1fr auto;
        gap: 10px;
        align-items: center;
        padding: 10px 12px;
        border: 0;
        background: none;
        color: var(--text);
        text-align: left;
    }
    > button:hover {
        background: var(--surface-hover);
    }
    .caret {
        color: var(--text-faint);
        transition: transform 0.2s ease;
        transform: rotate(${(p) => (p.$open ? 90 : 0)}deg);
    }
    code {
        display: block;
        overflow-wrap: anywhere;
        font-size: 12px;
    }
    .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 10px;
        margin-top: 4px;
        color: var(--text-muted);
        font-size: 12px;
    }
    .count {
        color: ${COLORS.red};
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }
`;

const Detail = styled.div`
    padding: 0 12px 12px 38px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 12px;

    pre {
        margin: 0;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--surface);
        border: 1px solid var(--border);
        overflow-x: auto;
        font: 11.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
        color: var(--text-muted);
    }
    .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
    }
    .row > span:first-child {
        min-width: 70px;
        color: var(--text-muted);
    }
    .stackHead {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
`;

function ErrorItem({ e, i }: { e: Group; i: number }) {
    const [open, setOpen] = useState(i === 0);
    const { copied, copy } = useCopy();
    return (
        <Item $open={open} {...rowIn(i)}>
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
                <CaretRight className="caret" size={14} weight="bold" />
                <span style={{ minWidth: 0 }}>
                    <code>{e.message || "(no message)"}</code>
                    <span className="meta">
                        <span>{e.place || "app"}</span>
                        <span>
                            {e.visitors.toLocaleString()} {e.visitors === 1 ? "browser" : "browsers"}
                        </span>
                        <span>last {ago(at(e.last))}</span>
                    </span>
                </span>
                <span className="count">{e.n.toLocaleString()}×</span>
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: EASE_OUT }}>
                        <Detail>
                            <div className="row">
                                <span>Pages</span>
                                {e.pages.length ? e.pages.map((p) => <Badge key={p.label}>{`${p.label} · ${p.n}`}</Badge>) : <span>—</span>}
                            </div>
                            <div className="row">
                                <span>Browsers</span>
                                {e.browsers.length ? e.browsers.map((b) => <Badge key={b.label}>{`${b.label} · ${b.n}`}</Badge>) : <span>—</span>}
                            </div>
                            <div className="row">
                                <span>Seen</span>
                                <span>
                                    first {ago(at(e.first))}, last {ago(at(e.last))}
                                </span>
                            </div>
                            {e.stack ? (
                                <>
                                    <div className="stackHead">
                                        <span style={{ color: "var(--text-muted)" }}>Latest stack trace</span>
                                        <Button $size="sm" $variant="outline" onClick={() => void copy(`${e.message}\n${e.stack}`)}>
                                            {copied ? <Check size={12} /> : <Copy size={12} />}
                                            {copied ? "Copied" : "Copy"}
                                        </Button>
                                    </div>
                                    <pre>{e.stack}</pre>
                                </>
                            ) : (
                                <span style={{ color: "var(--text-faint)" }}>No stack trace (reported before they were kept).</span>
                            )}
                        </Detail>
                    </m.div>
                )}
            </AnimatePresence>
        </Item>
    );
}

export function ErrorGroups({ days }: { days: number }) {
    const { data, error } = useLoad<{ configured: boolean; errors: Group[] }>(`/metrics/errors?days=${days}`);
    if (error) return <Problem>{error}</Problem>;
    if (!data)
        return (
            <List>
                {[0, 1, 2].map((i) => (
                    <Bone key={i} $h={52} />
                ))}
            </List>
        );
    if (!data.errors.length) return <NoData>No errors in this period. Nice.</NoData>;
    return (
        <List>
            {data.errors.map((e, i) => (
                <ErrorItem key={`${e.place}:${e.message}`} e={e} i={i} />
            ))}
        </List>
    );
}
