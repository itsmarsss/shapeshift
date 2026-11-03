import styled from "styled-components";
import { ChatCircleText, Compass, CreditCard, ShieldCheck, UserPlus, Warning } from "@phosphor-icons/react";
import type { Permission } from "@shapeshift/shared/admin/roles";
import { ago, go, useKept, useLoad } from "../nav";
import { Header, Loading, Panel, Problem, RangePicker, type Days } from "../ui";
import { AreaLines, Card, DayBars, Donut, NoData, Funnel, GroupBars, Grid, Kpis, Ranked, Stat } from "../charts";
import { COLORS, split, total, type Point } from "../chartData";
import { ErrorGroups } from "./Errors";

// The dashboard and the chart sections. Series cover twice the chosen
// window, so every number can be compared with the period before.

type Db = {
    days: number;
    signups: Point[];
    people: Point[];
    signins: Point[];
    scenes: Point[];
    feedback: Point[];
    plans: { plan: string; status: string; n: number }[];
    revenue: { paying: number; monthlyLow: number; monthlyHigh: number };
    prompts: { period: string; people: number; visitors: number }[];
    storage: { scenes: number; bytes: number };
    creators: { email: string; scenes: number; shared: number }[];
};

type Events =
    | { configured: false }
    | {
          configured: true;
          days: number;
          visitors: Point[];
          events: Record<string, Point[]>;
          reach: Record<string, number>;
          labels: { event: string; label: string; n: number }[];
          firstShape: { medianSeconds: number; count: number };
          errors: Point[];
          topErrors: { place: string; message: string; n: number }[];
      };

type Dash = {
    kpis: { people: { now: number; before: number }; signins: { now: number; before: number }; creators: { now: number; before: number }; paying: number; revenue: { low: number; high: number }; unread: number };
    attention: { unread: number; overdue: number; newOnExplore: number };
    feed: { kind: "signup" | "share" | "feedback" | "admin"; at: number; text: string; id?: string }[];
};

const zeros = (like: Point[] = []) => like.map((p) => ({ ...p, n: 0 }));
const plansLabel: Record<string, string> = {
    "free:": "Free",
    "pro:active": "Pro, paying",
    "pro:trialing": "Pro, trial",
    "pro:canceling": "Pro, cancelling",
    "pro:past_due": "Pro, overdue",
    "pro:manual": "Pro, given",
    "pro:": "Pro",
};
const PLAN_COLORS: Record<string, string> = { Free: COLORS.slate, "Pro, paying": COLORS.green, "Pro, given": COLORS.blue, "Pro, cancelling": COLORS.amber, "Pro, overdue": COLORS.red, "Pro, trial": COLORS.teal, Pro: COLORS.green };

const Setup = styled(Panel)`
    ol {
        margin: 8px 0 0;
        padding-left: 20px;
        line-height: 1.8;
    }
    code {
        padding: 1px 5px;
        border-radius: 5px;
        background: var(--surface-raised);
        font-size: 12px;
    }
`;

function NotSetUp() {
    return (
        <Setup>
            <h3>Connect the usage numbers</h3>
            <p style={{ margin: 0, color: "var(--text-muted)" }}>The app records anonymous usage. To chart it, the server needs a read-only Cloudflare token:</p>
            <ol>
                <li>
                    Cloudflare → My Profile → API Tokens → Create Token → Custom token with <code>Account · Account Analytics · Read</code>
                </li>
                <li>
                    <code>cd backend && npx wrangler secret put ANALYTICS_TOKEN</code>
                </li>
            </ol>
        </Setup>
    );
}

const Attention = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;

    button {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--text);
        text-align: left;
    }
    button:hover {
        border-color: var(--border-strong);
    }
    button[data-hot] {
        border-color: rgba(245, 165, 36, 0.5);
        background: rgba(245, 165, 36, 0.08);
    }
    span {
        flex: 1;
    }
    b {
        font-variant-numeric: tabular-nums;
    }
`;

const Feed = styled.ol`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;

    li {
        display: grid;
        grid-template-columns: 28px 1fr auto;
        gap: 10px;
        align-items: start;
        padding: 9px 0;
        border-bottom: 1px solid var(--border);
        font-size: 13px;
    }
    li:last-child {
        border-bottom: 0;
    }
    .dot {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        display: grid;
        place-items: center;
    }
    .text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
    }
    a,
    button {
        color: inherit;
        text-decoration: none;
        border: 0;
        background: none;
        padding: 0;
        font: inherit;
        text-align: left;
        cursor: pointer;
    }
    time {
        color: var(--text-faint);
        white-space: nowrap;
        font-size: 12px;
    }
`;

const FEED = {
    signup: { Icon: UserPlus, color: COLORS.blue },
    share: { Icon: Compass, color: COLORS.green },
    feedback: { Icon: ChatCircleText, color: COLORS.amber },
    admin: { Icon: ShieldCheck, color: COLORS.purple },
} as const;

export function Dashboard({ can }: { can: (p: Permission) => boolean }) {
    const { data, error } = useLoad<Dash>("/dashboard");
    const metrics = useLoad<Db>(can("metrics") ? "/metrics?days=30" : null);
    const events = useLoad<Events>(can("metrics") ? "/metrics/events?days=7" : null);
    if (error) return <Problem>{error}</Problem>;
    if (!data) return <Loading />;
    const ev = events.data?.configured ? events.data : null;
    const visitors = ev ? split(ev.visitors, 7) : null;
    const errors = ev ? split(ev.errors, 7) : null;
    const db = metrics.data;
    return (
        <>
            <Header title="Dashboard">How ShapeShift is doing this week, and what needs a look.</Header>
            <Kpis>
                <Stat label="People signed up (vs a week ago)" value={data.kpis.people.now} before={data.kpis.people.before} trend={db?.people.slice(-30)} />
                <Stat label="Sign-ins this week" value={data.kpis.signins.now} before={data.kpis.signins.before} color={COLORS.purple} />
                <Stat label="Creators active this week" value={data.kpis.creators.now} before={data.kpis.creators.before} color={COLORS.green} />
                {visitors && <Stat label="Visitors this week" value={total(visitors.now)} before={total(visitors.before)} trend={visitors.now} color={COLORS.teal} />}
                <Stat label={`Paying Pro · ~$${data.kpis.revenue.low}–${data.kpis.revenue.high}/mo`} value={data.kpis.paying} color={COLORS.green} />
                {errors && <Stat label="Errors this week" value={total(errors.now)} before={total(errors.before)} trend={errors.now} color={COLORS.red} goodWhenDown />}
            </Kpis>
            <Grid $cols={3}>
                <Card $span={2}>
                    <header>
                        <div>
                            <h3>Sign-ups and sign-ins</h3>
                            <p>The last 30 days</p>
                        </div>
                    </header>
                    {db ? (
                        <AreaLines
                            series={[
                                { key: "signins", label: "Sign-ins", color: COLORS.purple, data: db.signins.slice(-30) },
                                { key: "signups", label: "Sign-ups", color: COLORS.blue, data: db.signups.slice(-30) },
                            ]}
                        />
                    ) : (
                        <NoData>Charts need the metrics permission.</NoData>
                    )}
                </Card>
                <Card>
                    <header>
                        <div>
                            <h3>Needs a look</h3>
                            <p>Things waiting on someone</p>
                        </div>
                    </header>
                    <Attention>
                        <button data-hot={data.attention.unread > 0 || undefined} onClick={() => go("feedback")}>
                            <ChatCircleText size={18} color={COLORS.amber} />
                            <span>Unread feedback</span>
                            <b>{data.attention.unread}</b>
                        </button>
                        <button data-hot={data.attention.overdue > 0 || undefined} onClick={() => go("people")}>
                            <CreditCard size={18} color={COLORS.red} />
                            <span>Payments overdue</span>
                            <b>{data.attention.overdue}</b>
                        </button>
                        <button onClick={() => go("explore")}>
                            <Compass size={18} color={COLORS.green} />
                            <span>New on Explore this week</span>
                            <b>{data.attention.newOnExplore}</b>
                        </button>
                        {errors && total(errors.now) > total(errors.before) * 1.5 && total(errors.now) > 5 && (
                            <button data-hot onClick={() => go("health")}>
                                <Warning size={18} color={COLORS.red} />
                                <span>More errors than last week</span>
                                <b>{total(errors.now)}</b>
                            </button>
                        )}
                    </Attention>
                </Card>
            </Grid>
            <Card>
                <header>
                    <div>
                        <h3>Recent activity</h3>
                        <p>Sign-ups, shares, feedback and admin actions, newest first</p>
                    </div>
                </header>
                {data.feed.length ? (
                    <Feed>
                        {data.feed.map((f, i) => {
                            const { Icon, color } = FEED[f.kind];
                            const open = f.kind === "feedback" ? () => go("feedback") : f.id ? () => go("people", f.id!) : undefined;
                            return (
                                <li key={i}>
                                    <span className="dot" style={{ background: `${color}22`, color }}>
                                        <Icon size={16} weight="bold" />
                                    </span>
                                    {open ? (
                                        <button className="text" onClick={open}>
                                            {f.text}
                                        </button>
                                    ) : (
                                        <span className="text">{f.text}</span>
                                    )}
                                    <time>{ago(f.at)}</time>
                                </li>
                            );
                        })}
                    </Feed>
                ) : (
                    <NoData>Nothing yet.</NoData>
                )}
            </Card>
        </>
    );
}

export function Growth() {
    const [days, setDays] = useKept<Days>("growth-days", 30);
    const { data, error } = useLoad<Db>(`/metrics?days=${days}`);
    if (error) return <Problem>{error}</Problem>;
    if (!data) return <Loading />;
    const signups = split(data.signups, days);
    const signins = split(data.signins, days);
    const scenes = split(data.scenes, days);
    const feedback = split(data.feedback, days);
    const people = data.people.slice(-days);
    const plans = data.plans
        .map((p) => {
            const label = plansLabel[`${p.plan}:${p.status}`] ?? `${p.plan} (${p.status || "—"})`;
            return { label, n: p.n, color: PLAN_COLORS[label] };
        })
        .sort((a, b) => b.n - a.n);
    return (
        <>
            <Header title="Growth" actions={<RangePicker days={days} setDays={setDays} />}>
                Accounts, scenes and plans, compared with the {days} days before.
            </Header>
            <Kpis>
                <Stat label="People signed up" value={people.at(-1)?.n ?? 0} before={people[0]?.n} trend={people} />
                <Stat label="New sign-ups" value={total(signups.now)} before={total(signups.before)} trend={signups.now} />
                <Stat label="Sign-ins" value={total(signins.now)} before={total(signins.before)} trend={signins.now} color={COLORS.purple} />
                <Stat label="Scenes saved" value={total(scenes.now)} before={total(scenes.before)} trend={scenes.now} color={COLORS.green} />
                <Stat label="Feedback" value={total(feedback.now)} before={total(feedback.before)} trend={feedback.now} color={COLORS.amber} />
            </Kpis>
            <Grid>
                <Card $span={2}>
                    <header>
                        <div>
                            <h3>People</h3>
                            <p>Everyone signed up, at the end of each day</p>
                        </div>
                    </header>
                    <AreaLines series={[{ key: "people", label: "People", color: COLORS.blue, data: people }]} height={240} />
                </Card>
                <Card>
                    <header>
                        <div>
                            <h3>Sign-ups and sign-ins</h3>
                            <p>Each day</p>
                        </div>
                    </header>
                    <DayBars
                        stacked={false}
                        series={[
                            { key: "signups", label: "Sign-ups", color: COLORS.blue, data: signups.now },
                            { key: "signins", label: "Sign-ins", color: COLORS.purple, data: signins.now },
                        ]}
                    />
                </Card>
                <Card>
                    <header>
                        <div>
                            <h3>Scenes saved to the cloud</h3>
                            <p>New each day</p>
                        </div>
                    </header>
                    <AreaLines series={[{ key: "scenes", label: "Scenes", color: COLORS.green, data: scenes.now }]} />
                </Card>
                <Card>
                    <header>
                        <div>
                            <h3>Plans</h3>
                            <p>
                                {data.revenue.paying} paying · ~${data.revenue.monthlyLow}–${data.revenue.monthlyHigh} a month
                            </p>
                        </div>
                    </header>
                    <Donut slices={plans} center={plans.reduce((n, p) => n + p.n, 0).toLocaleString()} />
                </Card>
                <Card>
                    <header>
                        <div>
                            <h3>Busiest creators</h3>
                            <p>
                                {data.storage.scenes.toLocaleString()} cloud scenes, {(data.storage.bytes / 1e6).toFixed(1)} MB in all
                            </p>
                        </div>
                    </header>
                    <Ranked rows={data.creators.map((c) => ({ label: c.email, n: c.scenes }))} color={COLORS.green} />
                </Card>
            </Grid>
        </>
    );
}

const NAMES: Record<string, string> = {
    first_shape: "Made a first shape",
    template_used: "Used a template",
    assistant_prompt: "Asked the assistant",
    hands_on: "Turned on hand control",
    export: "Exported",
    share_created: "Shared a link",
    remix_opened: "Remixed a scene",
    explore_listed: "Listed on Explore",
    upgrade_clicked: "Clicked upgrade",
};

export function Usage() {
    const [days, setDays] = useKept<Days>("usage-days", 30);
    const { data, error } = useLoad<Events>(`/metrics/events?days=${days}`);
    if (error) return <Problem>{error}</Problem>;
    if (!data) return <Loading />;
    if (!data.configured) return <NotSetUp />;
    const visitors = split(data.visitors, days);
    const ev = (name: string) => split(data.events[name] ?? zeros(data.visitors), days);
    const opened = data.reach.app_open ?? 0;
    const label = (event: string) => data.labels.filter((l) => l.event === event).map((l) => ({ label: l.label || "—", n: l.n }));
    return (
        <>
            <Header title="Usage" actions={<RangePicker days={days} setDays={setDays} />}>
                Anonymous use of the app; one browser counts as one visitor.
            </Header>
            <Kpis>
                <Stat label="Visitors" value={opened} trend={visitors.now} color={COLORS.teal} />
                <Stat label="Visits (opened the editor)" value={total(ev("app_open").now)} before={total(ev("app_open").before)} trend={ev("app_open").now} />
                <Stat label="First shapes made" value={total(ev("first_shape").now)} before={total(ev("first_shape").before)} trend={ev("first_shape").now} color={COLORS.green} />
                <Stat label="Median time to a first shape" value={data.firstShape.count ? `${data.firstShape.medianSeconds}s` : "—"} />
                <Stat label="Hand control turned on" value={total(ev("hands_on").now)} before={total(ev("hands_on").before)} trend={ev("hands_on").now} color={COLORS.pink} />
            </Kpis>
            <Grid>
                <Card $span={2}>
                    <header>
                        <div>
                            <h3>Visitors each day</h3>
                            <p>Different browsers that opened the editor, with the period before for comparison</p>
                        </div>
                    </header>
                    <AreaLines
                        height={240}
                        series={[
                            { key: "now", label: "This period", color: COLORS.teal, data: visitors.now },
                            { key: "before", label: "Period before", color: COLORS.slate, data: visitors.before.map((p, i) => ({ day: visitors.now[i]?.day ?? p.day, n: p.n })) },
                        ]}
                    />
                </Card>
                <Card>
                    <header>
                        <div>
                            <h3>Getting started</h3>
                            <p>Of visitors who opened the editor, how many went on</p>
                        </div>
                    </header>
                    <Funnel
                        steps={[
                            { label: "Opened the editor", n: opened },
                            { label: "Made a first shape", n: data.reach.first_shape ?? 0 },
                            { label: "Asked the assistant", n: data.reach.assistant_prompt ?? 0 },
                            { label: "Shared a link", n: data.reach.share_created ?? 0 },
                            { label: "Clicked upgrade", n: data.reach.upgrade_clicked ?? 0 },
                        ]}
                    />
                </Card>
                <Card>
                    <header>
                        <div>
                            <h3>Feature reach</h3>
                            <p>Visitors who used each at least once</p>
                        </div>
                    </header>
                    <Ranked
                        rows={Object.entries(NAMES)
                            .map(([event, name]) => ({ label: name, n: data.reach[event] ?? 0 }))
                            .sort((a, b) => b.n - a.n)}
                        color={COLORS.purple}
                        note={(n) => (opened ? `${Math.round((n / opened) * 100)}%` : "")}
                    />
                </Card>
                <Card $span={2}>
                    <header>
                        <div>
                            <h3>What people do each day</h3>
                            <p>Times each feature was used</p>
                        </div>
                    </header>
                    <DayBars
                        height={240}
                        series={[
                            { key: "assistant", label: "Assistant", color: COLORS.purple, data: ev("assistant_prompt").now },
                            { key: "templates", label: "Templates", color: COLORS.green, data: ev("template_used").now },
                            { key: "hands", label: "Hands", color: COLORS.pink, data: ev("hands_on").now },
                            { key: "exports", label: "Exports", color: COLORS.amber, data: ev("export").now },
                            { key: "shares", label: "Shares", color: COLORS.teal, data: ev("share_created").now },
                        ]}
                    />
                </Card>
                <Card>
                    <header>
                        <div>
                            <h3>Exports</h3>
                            <p>By format</p>
                        </div>
                    </header>
                    <Donut slices={label("export")} />
                </Card>
                <Card>
                    <header>
                        <div>
                            <h3>Templates</h3>
                            <p>Which ones people start from</p>
                        </div>
                    </header>
                    <Donut slices={label("template_used")} />
                </Card>
            </Grid>
        </>
    );
}

type Assist = {
    period: string;
    top: { id: string; email: string; plan: string; prompts: number; steps: number; limit: number }[];
    visitors: { people: number; prompts: number };
    atLimit: number;
    months: { period: string; people: number; visitors: number; steps: number }[];
    limits: { guest: number; free: number; pro: number };
};

export function Assistant() {
    const { data, error } = useLoad<Assist>("/metrics/assistant");
    const events = useLoad<Events>("/metrics/events?days=30");
    if (error) return <Problem>{error}</Problem>;
    if (!data) return <Loading />;
    const ev = events.data?.configured ? events.data : null;
    const month = data.months.at(-1);
    const daily = ev ? split(ev.events.assistant_prompt ?? zeros(ev.visitors), 30) : null;
    return (
        <>
            <Header title="Assistant">
                Who uses the assistant and how much, against monthly limits of {data.limits.guest} (visitors), {data.limits.free} (free) and {data.limits.pro} (Pro).
            </Header>
            <Kpis>
                <Stat label={`Prompts in ${data.period}, signed in`} value={month?.people ?? 0} before={data.months.at(-2)?.people} color={COLORS.purple} />
                <Stat label={`Prompts in ${data.period}, visitors`} value={month?.visitors ?? 0} before={data.months.at(-2)?.visitors} color={COLORS.slate} />
                <Stat label="Model steps this month" value={month?.steps ?? 0} before={data.months.at(-2)?.steps} />
                <Stat label="People at their limit" value={data.atLimit} color={COLORS.amber} />
                <Stat label="Visitors using it this month" value={data.visitors.people} />
            </Kpis>
            <Grid>
                <Card>
                    <header>
                        <div>
                            <h3>Prompts by month</h3>
                            <p>Signed-in people and visitors</p>
                        </div>
                    </header>
                    <GroupBars
                        data={data.months.map((m) => ({ name: m.period, people: m.people, visitors: m.visitors }))}
                        keys={[
                            { key: "people", label: "Signed in", color: COLORS.purple },
                            { key: "visitors", label: "Visitors", color: COLORS.slate },
                        ]}
                    />
                </Card>
                <Card>
                    <header>
                        <div>
                            <h3>Prompts each day</h3>
                            <p>The last 30 days</p>
                        </div>
                    </header>
                    {daily ? <AreaLines series={[{ key: "prompts", label: "Prompts", color: COLORS.purple, data: daily.now }]} /> : <NoData>Needs the usage numbers connected.</NoData>}
                </Card>
                <Card $span={2}>
                    <header>
                        <div>
                            <h3>Top users this month</h3>
                            <p>Prompts used of their plan's limit</p>
                        </div>
                    </header>
                    <Ranked
                        rows={data.top.map((t) => ({ label: t.email, n: t.prompts, href: `/admin?s=people&id=${t.id}`, note: `of ${t.limit}` }))}
                        color={COLORS.purple}
                    />
                </Card>
            </Grid>
        </>
    );
}


export function Health() {
    const [days, setDays] = useKept<Days>("health-days", 7);
    const { data, error } = useLoad<Events>(`/metrics/events?days=${days}`);
    if (error) return <Problem>{error}</Problem>;
    if (!data) return <Loading />;
    if (!data.configured) return <NotSetUp />;
    const errors = split(data.errors, days);
    const visits = split(data.events.app_open ?? zeros(data.visitors), days);
    const rate = (e: number, v: number) => (v ? (e / v) * 100 : 0);
    return (
        <>
            <Header title="Health" actions={<RangePicker days={days} setDays={setDays} />}>
                Errors people's browsers reported, with stack traces. Superusers get a daily email when there are any.
            </Header>
            <Kpis>
                <Stat label="Errors" value={total(errors.now)} before={total(errors.before)} trend={errors.now} color={COLORS.red} goodWhenDown />
                <Stat
                    label="Errors per 100 visits"
                    value={Number(rate(total(errors.now), total(visits.now)).toFixed(1))}
                    before={Number(rate(total(errors.before), total(visits.before)).toFixed(1))}
                    color={COLORS.red}
                    goodWhenDown
                />
                <Stat label="Different errors" value={data.topErrors.length} />
            </Kpis>
            <Grid>
                <Card $span={2}>
                    <header>
                        <div>
                            <h3>Errors each day</h3>
                            <p>A jump right after a deploy usually means something broke</p>
                        </div>
                    </header>
                    <DayBars
                        stacked={false}
                        series={[
                            { key: "now", label: "This period", color: COLORS.red, data: errors.now },
                            { key: "before", label: "Period before", color: COLORS.slate, data: errors.before.map((p, i) => ({ day: errors.now[i]?.day ?? p.day, n: p.n })) },
                        ]}
                    />
                </Card>
                <Card $span={2}>
                    <header>
                        <div>
                            <h3>Errors</h3>
                            <p>Most frequent first. Open one for its stack trace</p>
                        </div>
                    </header>
                    <ErrorGroups days={days} />
                </Card>
            </Grid>
        </>
    );
}
