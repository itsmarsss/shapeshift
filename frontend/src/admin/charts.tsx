import { useState } from "react";
import styled from "styled-components";

// Small charts for the admin page, drawn as SVG so nothing extra loads.

export type Point = { day: string; n: number };
export type Line = { label: string; color: string; data: Point[] };

const short = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

export const Card = styled.section`
    padding: 18px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    min-width: 0;

    h3 {
        margin: 0 0 4px;
        font-size: 14px;
    }
    > p {
        margin: 0 0 12px;
        color: var(--text-muted);
        font-size: 12px;
    }
`;

export const Grid = styled.div<{ $min?: number }>`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(${(p) => p.$min ?? 320}px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
`;

const Box = styled.div`
    position: relative;

    svg {
        display: block;
        width: 100%;
        overflow: visible;
    }
    .axis {
        position: absolute;
        color: var(--text-faint);
        font-size: 11px;
        line-height: 1;
        pointer-events: none;
    }
    .tip {
        position: absolute;
        top: 0;
        padding: 6px 8px;
        border-radius: 8px;
        background: var(--text);
        color: var(--bg);
        font-size: 11px;
        pointer-events: none;
        white-space: nowrap;
        translate: -50% -110%;
    }
    .tip i {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 2px;
        margin-right: 4px;
    }
`;

const Legend = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 8px;
    color: var(--text-muted);
    font-size: 12px;

    i {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 3px;
        margin-right: 5px;
        vertical-align: -1px;
    }
`;

const W = 600;

// Lines over days. Point at it to read a day's numbers.
export function LineChart({ lines, height = 160, area = true }: { lines: Line[]; height?: number; area?: boolean }) {
    const [at, setAt] = useState<number | null>(null);
    const days = lines[0]?.data ?? [];
    const max = Math.max(1, ...lines.flatMap((l) => l.data.map((p) => p.n)));
    const x = (i: number) => (days.length <= 1 ? W / 2 : (i / (days.length - 1)) * W);
    const y = (n: number) => height - 16 - (n / max) * (height - 30);
    return (
        <Box
            onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setAt(Math.round(((e.clientX - rect.left) / rect.width) * (days.length - 1)));
            }}
            onMouseLeave={() => setAt(null)}
        >
            <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img" aria-label={lines.map((l) => l.label).join(", ")}>
                {[0.5, 1].map((f) => (
                    <line key={f} x1={0} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeDasharray="3 4" />
                ))}
                <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" />
                {lines.map((l) => {
                    const path = l.data.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.n)}`).join(" ");
                    return (
                        <g key={l.label}>
                            {area && <path d={`${path} L${x(l.data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={l.color} opacity={0.12} />}
                            <path d={path} fill="none" stroke={l.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                        </g>
                    );
                })}
                {at !== null && days[at] && <line x1={x(at)} x2={x(at)} y1={0} y2={y(0)} stroke="var(--text-faint)" vectorEffect="non-scaling-stroke" />}
            </svg>
            {/* Labels as text, so they keep their size however wide the chart is. */}
            <span className="axis" style={{ top: 0, left: 0 }}>
                {compact(max)}
            </span>
            <span className="axis" style={{ bottom: 0, left: 0 }}>
                {days[0] ? short(days[0].day) : ""}
            </span>
            <span className="axis" style={{ bottom: 0, right: 0 }}>
                {days.at(-1) ? short(days.at(-1)!.day) : ""}
            </span>
            {at !== null && days[at] && (
                <div className="tip" style={{ left: `${(x(at) / W) * 100}%` }}>
                    {short(days[at].day)}
                    {lines.map((l) => (
                        <div key={l.label}>
                            <i style={{ background: l.color }} />
                            {l.label}: {l.data[at]?.n ?? 0}
                        </div>
                    ))}
                </div>
            )}
            {lines.length > 1 && (
                <Legend>
                    {lines.map((l) => (
                        <span key={l.label}>
                            <i style={{ background: l.color }} />
                            {l.label}
                        </span>
                    ))}
                </Legend>
            )}
        </Box>
    );
}

const Rows = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;

    .row {
        display: grid;
        grid-template-columns: minmax(90px, 35%) 1fr auto;
        align-items: center;
        gap: 10px;
        font-size: 13px;
    }
    .label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--text-muted);
    }
    .bar {
        height: 10px;
        border-radius: 5px;
        background: var(--surface-raised);
        overflow: hidden;
    }
    .bar i {
        display: block;
        height: 100%;
        border-radius: 5px;
    }
    b {
        font-variant-numeric: tabular-nums;
        min-width: 36px;
        text-align: right;
    }
`;

// Labelled bars, longest first. `note` adds something after the number.
export function Bars({ rows, color = "var(--accent)", note }: { rows: { label: string; n: number }[]; color?: string; note?: (n: number) => string }) {
    const max = Math.max(1, ...rows.map((r) => r.n));
    if (!rows.length) return <Empty>Nothing yet.</Empty>;
    return (
        <Rows>
            {rows.map((r) => (
                <div className="row" key={r.label}>
                    <span className="label" title={r.label}>
                        {r.label}
                    </span>
                    <span className="bar">
                        <i style={{ width: `${(r.n / max) * 100}%`, background: color }} />
                    </span>
                    <b>
                        {compact(r.n)}
                        {note && <small style={{ color: "var(--text-faint)", fontWeight: 400 }}> {note(r.n)}</small>}
                    </b>
                </div>
            ))}
        </Rows>
    );
}

const Steps = styled.ol`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;

    li {
        position: relative;
        padding: 10px 12px;
        border-radius: 10px;
        overflow: hidden;
        background: var(--surface-raised);
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 13px;
    }
    li i {
        position: absolute;
        inset: 0 auto 0 0;
        background: var(--accent-soft);
    }
    li span,
    li b {
        position: relative;
    }
    small {
        color: var(--text-muted);
        font-weight: 400;
        margin-left: 6px;
    }
`;

// Each step as a share of the first, and how many from the step before went on.
export function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
    const first = Math.max(1, steps[0]?.n ?? 1);
    return (
        <Steps>
            {steps.map((s, i) => {
                const prev = steps[i - 1]?.n;
                return (
                    <li key={s.label}>
                        <i style={{ width: `${Math.min(100, (s.n / first) * 100)}%` }} />
                        <span>{s.label}</span>
                        <b>
                            {compact(s.n)}
                            <small>
                                {Math.round((s.n / first) * 100)}%{prev ? ` · ${Math.round((s.n / Math.max(1, prev)) * 100)}% of the step before` : ""}
                            </small>
                        </b>
                    </li>
                );
            })}
        </Steps>
    );
}

const StatBox = styled.div`
    padding: 16px 18px 12px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);

    b {
        display: block;
        font-size: 26px;
        letter-spacing: -0.02em;
    }
    small {
        color: var(--text-muted);
    }
    svg {
        display: block;
        width: 100%;
        height: 28px;
        margin-top: 8px;
    }
`;

// A number with a small line of how it went over the days.
export function Stat({ label, value, trend, color = "var(--accent)" }: { label: string; value: string | number; trend?: Point[]; color?: string }) {
    const max = Math.max(1, ...(trend ?? []).map((p) => p.n));
    const path = trend?.map((p, i) => `${i ? "L" : "M"}${(i / Math.max(1, trend.length - 1)) * 100},${28 - (p.n / max) * 26}`).join(" ");
    return (
        <StatBox>
            <b>{typeof value === "number" ? value.toLocaleString() : value}</b>
            <small>{label}</small>
            {path && (
                <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden>
                    <path d={path} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                </svg>
            )}
        </StatBox>
    );
}

export const Empty = styled.p`
    margin: 0;
    color: var(--text-faint);
    font-size: 13px;
`;
