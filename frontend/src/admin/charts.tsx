import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { animate } from "motion/react";
import * as m from "motion/react-m";
import { item, list } from "../ui/motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Charts for the admin page, on recharts, styled to match the app.

import { COLORS, PALETTE, compact, shortDay, type Point, type Series } from "./chartData";

export const Card = styled(m.section).attrs({ variants: item })<{ $span?: number }>`
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    &:hover {
        border-color: var(--border-strong);
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.06);
    }
    grid-column: span ${(p) => p.$span ?? 1};
    padding: 18px 18px 14px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    min-width: 0;

    header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
    }
    h3 {
        margin: 0;
        font-size: 14px;
        letter-spacing: -0.01em;
    }
    header p,
    > p {
        margin: 2px 0 0;
        color: var(--text-muted);
        font-size: 12px;
    }
    @media (max-width: 900px) {
        grid-column: span 1;
    }
`;

export const Grid = styled(m.div).attrs({ variants: list, initial: "hidden", animate: "shown" })<{ $cols?: number }>`
    display: grid;
    grid-template-columns: repeat(${(p) => p.$cols ?? 2}, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 12px;

    @media (max-width: 900px) {
        grid-template-columns: minmax(0, 1fr);
    }
`;

export const Kpis = styled(m.div).attrs({ variants: list, initial: "hidden", animate: "shown" })`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
`;

const TipBox = styled.div`
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
    font-size: 12px;

    b {
        display: block;
        margin-bottom: 4px;
    }
    div {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--text-muted);
    }
    i {
        width: 8px;
        height: 8px;
        border-radius: 2px;
    }
    span {
        margin-left: auto;
        padding-left: 12px;
        color: var(--text);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
    }
`;

type TipProps = { active?: boolean; label?: string | number; payload?: { name?: string | number; value?: number | string; color?: string; fill?: string }[]; dayLabels?: boolean };
function Tip({ active, label, payload, dayLabels = true }: TipProps) {
    if (!active || !payload?.length) return null;
    return (
        <TipBox>
            <b>{dayLabels && typeof label === "string" && /^\d{4}-\d\d-\d\d$/.test(label) ? shortDay(label) : label}</b>
            {payload.map((p) => (
                <div key={String(p.name)}>
                    <i style={{ background: p.color ?? p.fill }} />
                    {p.name}
                    <span>{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
                </div>
            ))}
        </TipBox>
    );
}

const axis = { stroke: "var(--text-faint)", fontSize: 11, tickLine: false, axisLine: false } as const;

// Joins several day series into rows recharts can draw.
function rows(series: Series[]) {
    const days = series[0]?.data ?? [];
    return days.map((d, i) => Object.fromEntries([["day", d.day], ...series.map((s) => [s.key, s.data[i]?.n ?? 0])]));
}

export function AreaLines({ series, height = 220, stacked = false }: { series: Series[]; height?: number; stacked?: boolean }) {
    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={rows(series)} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <defs>
                    {series.map((s) => (
                        <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
                            <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                        </linearGradient>
                    ))}
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={28} {...axis} />
                <YAxis allowDecimals={false} tickFormatter={compact} width={48} {...axis} />
                <Tooltip content={<Tip />} cursor={{ stroke: "var(--border-strong)" }} />
                {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }} />}
                {series.map((s) => (
                    <Area
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={s.color}
                        strokeWidth={2}
                        fill={`url(#fill-${s.key})`}
                        stackId={stacked ? "all" : undefined}
                        dot={false}
                        activeDot={{ r: 4 }}
                    />
                ))}
            </AreaChart>
        </ResponsiveContainer>
    );
}

export function DayBars({ series, height = 220, stacked = true }: { series: Series[]; height?: number; stacked?: boolean }) {
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={rows(series)} margin={{ top: 6, right: 6, left: -18, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={28} {...axis} />
                <YAxis allowDecimals={false} tickFormatter={compact} width={48} {...axis} />
                <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-hover)" }} />
                {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }} />}
                {series.map((s, i) => (
                    <Bar
                        key={s.key}
                        dataKey={s.key}
                        name={s.label}
                        fill={s.color}
                        stackId={stacked ? "all" : undefined}
                        radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
                        maxBarSize={28}
                    />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}

// Bars for named groups (months, plans) rather than days.
export function GroupBars({ data, keys, height = 220 }: { data: Record<string, string | number>[]; keys: { key: string; label: string; color: string }[]; height?: number }) {
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }} barCategoryGap="24%">
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" {...axis} />
                <YAxis allowDecimals={false} tickFormatter={compact} width={48} {...axis} />
                <Tooltip content={<Tip dayLabels={false} />} cursor={{ fill: "var(--surface-hover)" }} />
                {keys.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }} />}
                {keys.map((k, i) => (
                    <Bar key={k.key} dataKey={k.key} name={k.label} fill={k.color} stackId="all" radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={44} />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}

const DonutBox = styled.div`
    display: grid;
    grid-template-columns: 160px 1fr;
    align-items: center;
    gap: 16px;

    ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 13px;
        min-width: 0;
    }
    li {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    li i {
        width: 10px;
        height: 10px;
        border-radius: 3px;
        flex-shrink: 0;
    }
    li span {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--text-muted);
    }
    li b {
        font-variant-numeric: tabular-nums;
    }
    li small {
        color: var(--text-faint);
        width: 38px;
        text-align: right;
    }
    .middle {
        position: relative;
    }
    .middle strong {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        font-size: 20px;
        pointer-events: none;
    }
    @media (max-width: 480px) {
        grid-template-columns: 1fr;
    }
`;

export function Donut({ slices, center }: { slices: { label: string; n: number; color?: string }[]; center?: string }) {
    const sum = Math.max(1, slices.reduce((n, s) => n + s.n, 0));
    if (!slices.some((s) => s.n > 0)) return <Empty>Nothing yet.</Empty>;
    return (
        <DonutBox>
            <div className="middle">
                <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                        <Pie data={slices} dataKey="n" nameKey="label" innerRadius={50} outerRadius={74} paddingAngle={2} stroke="none">
                            {slices.map((s, i) => (
                                <Cell key={s.label} fill={s.color ?? PALETTE[i % PALETTE.length]} />
                            ))}
                        </Pie>
                        <Tooltip content={<Tip dayLabels={false} />} />
                    </PieChart>
                </ResponsiveContainer>
                {center && <strong>{center}</strong>}
            </div>
            <ul>
                {slices.map((s, i) => (
                    <li key={s.label}>
                        <i style={{ background: s.color ?? PALETTE[i % PALETTE.length] }} />
                        <span title={s.label}>{s.label}</span>
                        <b>{s.n.toLocaleString()}</b>
                        <small>{Math.round((s.n / sum) * 100)}%</small>
                    </li>
                ))}
            </ul>
        </DonutBox>
    );
}

const Rows = styled.div`
    display: flex;
    flex-direction: column;
    gap: 9px;

    .row {
        display: grid;
        grid-template-columns: minmax(100px, 36%) 1fr auto;
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
        height: 8px;
        border-radius: 4px;
        background: var(--surface-raised);
        overflow: hidden;
    }
    .bar i {
        display: block;
        height: 100%;
        border-radius: 4px;
        transition: width 0.4s ease;
    }
    b {
        font-variant-numeric: tabular-nums;
        text-align: right;
        white-space: nowrap;
    }
    b small {
        color: var(--text-faint);
        font-weight: 400;
        margin-left: 4px;
    }
`;

// A ranked list with bars, for things like features or top users.
export function Ranked({ rows: items, color = COLORS.blue, note }: { rows: { label: string; n: number; href?: string; note?: string }[]; color?: string; note?: (n: number) => string }) {
    const max = Math.max(1, ...items.map((r) => r.n));
    if (!items.length) return <Empty>Nothing yet.</Empty>;
    return (
        <Rows>
            {items.map((r) => (
                <div className="row" key={r.label}>
                    {r.href ? (
                        <a className="label" href={r.href} title={r.label}>
                            {r.label}
                        </a>
                    ) : (
                        <span className="label" title={r.label}>
                            {r.label}
                        </span>
                    )}
                    <span className="bar">
                        <i style={{ width: `${(r.n / max) * 100}%`, background: color }} />
                    </span>
                    <b>
                        {r.n.toLocaleString()}
                        {(r.note ?? note?.(r.n)) && <small>{r.note ?? note?.(r.n)}</small>}
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
    gap: 4px;

    li {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 4px 12px;
        font-size: 13px;
    }
    .track {
        grid-column: 1 / -1;
        height: 26px;
        border-radius: 8px;
        background: var(--surface-raised);
        overflow: hidden;
    }
    .track i {
        display: block;
        height: 100%;
        border-radius: 8px;
        background: linear-gradient(90deg, ${COLORS.blue}, ${COLORS.purple});
        transition: width 0.4s ease;
    }
    .drop {
        grid-column: 1 / -1;
        margin: 2px 0 6px 8px;
        color: var(--text-faint);
        font-size: 11px;
    }
    b small {
        color: var(--text-muted);
        font-weight: 400;
        margin-left: 6px;
    }
`;

// Each step as a share of the first, with how many dropped off in between.
export function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
    const first = Math.max(1, steps[0]?.n ?? 1);
    return (
        <Steps>
            {steps.map((s, i) => {
                const next = steps[i + 1];
                return (
                    <li key={s.label}>
                        <span>{s.label}</span>
                        <b>
                            {s.n.toLocaleString()}
                            <small>{Math.round((s.n / first) * 100)}%</small>
                        </b>
                        <span className="track">
                            <i style={{ width: `${Math.max(1.5, Math.min(100, (s.n / first) * 100))}%` }} />
                        </span>
                        {next && <span className="drop">↓ {s.n ? Math.round(((s.n - next.n) / s.n) * 100) : 0}% stop here</span>}
                    </li>
                );
            })}
        </Steps>
    );
}

const StatBox = styled(m.div).attrs({ variants: item })`
    padding: 16px 18px 10px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--surface);
    min-width: 0;

    .top {
        display: flex;
        align-items: baseline;
        gap: 8px;
        flex-wrap: wrap;
    }
    b {
        font-size: 26px;
        letter-spacing: -0.02em;
    }
    small {
        display: block;
        color: var(--text-muted);
        margin-top: 2px;
    }
    .delta {
        font-size: 12px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 999px;
    }
`;

// A headline number, how it changed since the period before, and a small trend.
// A number that counts up to its value, and glides when it changes.
function CountUp({ to }: { to: number }) {
    const [shown, setShown] = useState(0);
    const from = useRef(0);
    useEffect(() => {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver) {
            setShown(to);
            return;
        }
        const c = animate(from.current, to, { duration: 0.7, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => ((from.current = v), setShown(v)) });
        return () => c.stop();
    }, [to]);
    return <>{Math.round(shown).toLocaleString()}</>;
}

export function Stat({
    label,
    value,
    before,
    trend,
    color = COLORS.blue,
    goodWhenDown = false,
}: {
    label: string;
    value: number | string;
    before?: number;
    trend?: Point[];
    color?: string;
    goodWhenDown?: boolean;
}) {
    const n = typeof value === "number" ? value : null;
    const change = n !== null && before !== undefined ? (before === 0 ? (n === 0 ? 0 : null) : ((n - before) / before) * 100) : undefined;
    const up = change !== undefined && change !== null && change > 0;
    const good = change === undefined || change === null || change === 0 ? null : up !== goodWhenDown;
    return (
        <StatBox>
            <div className="top">
                <b>{typeof value === "number" ? <CountUp to={value} /> : value}</b>
                {change !== undefined && (
                    <span
                        className="delta"
                        title="Compared with the period before"
                        style={{
                            color: good === null ? "var(--text-muted)" : good ? COLORS.green : COLORS.red,
                            background: good === null ? "var(--surface-raised)" : good ? "rgba(34, 197, 94, 0.12)" : "rgba(229, 72, 77, 0.12)",
                        }}
                    >
                        {change === null ? "new" : `${change > 0 ? "▲" : change < 0 ? "▼" : ""} ${Math.abs(Math.round(change))}%`}
                    </span>
                )}
            </div>
            <small>{label}</small>
            {trend && trend.length > 1 && (
                <ResponsiveContainer width="100%" height={34}>
                    <AreaChart data={trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id={`spark-${label.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="n" stroke={color} strokeWidth={1.5} fill={`url(#spark-${label.replace(/\W/g, "")})`} dot={false} isAnimationActive={false} />
                    </AreaChart>
                </ResponsiveContainer>
            )}
        </StatBox>
    );
}

export const Empty = styled.p`
    margin: 0;
    padding: 20px 0;
    color: var(--text-faint);
    font-size: 13px;
    text-align: center;
`;
