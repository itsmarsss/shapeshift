import { useEffect, useState, type ReactNode } from "react";
import styled from "styled-components";
import { Segment, Segmented } from "../components/ui";
import { api } from "./api";
import { Bars, Card, Empty, Funnel, Grid, LineChart, Stat, type Point } from "./charts";

// The admin page's charts: growth and money from the database, and use and
// health from the anonymous usage events.

type Days = 7 | 30 | 90;

type DbMetrics = {
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

type EventMetrics =
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

const BLUE = "#4f7bff";
const PINK = "#ec4899";
const GREEN = "#22c55e";
const AMBER = "#f5a524";
const PURPLE = "#a855f7";

const sum = (points: Point[] = []) => points.reduce((n, p) => n + p.n, 0);
const bytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

const Head = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;

    p {
        margin: 0;
        color: var(--text-muted);
    }
`;

const Problem = styled.p`
    color: var(--danger);
`;

function Range({ days, setDays, children }: { days: Days; setDays: (d: Days) => void; children?: ReactNode }) {
    return (
        <Head>
            <p>{children}</p>
            <Segmented>
                {([7, 30, 90] as Days[]).map((d) => (
                    <Segment key={d} $active={days === d} onClick={() => setDays(d)}>
                        {d} days
                    </Segment>
                ))}
            </Segmented>
        </Head>
    );
}

function useMetrics<T>(path: string, days: Days) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        setError(null);
        api<T>(`${path}?days=${days}`)
            .then(setData)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the numbers."));
    }, [path, days]);
    return { data, error };
}

const STATUS: Record<string, string> = { "free:": "Free", "pro:active": "Pro, paying", "pro:trialing": "Pro, trial", "pro:canceling": "Pro, cancelling", "pro:past_due": "Pro, payment overdue", "pro:manual": "Pro, given by hand", "pro:": "Pro" };

export function GrowthSection() {
    const [days, setDays] = useState<Days>(30);
    const { data, error } = useMetrics<DbMetrics>("/metrics", days);
    if (error) return <Problem>{error}</Problem>;
    if (!data) return null;
    const plans = data.plans.map((p) => ({ label: STATUS[`${p.plan}:${p.status}`] ?? `${p.plan} (${p.status || "—"})`, n: p.n })).sort((a, b) => b.n - a.n);
    return (
        <>
            <Range days={days} setDays={setDays}>
                From the database: accounts, scenes and plans.
            </Range>
            <Grid $min={180}>
                <Stat label="People signed up" value={data.people.at(-1)?.n ?? 0} trend={data.people} />
                <Stat label={`New in ${days} days`} value={sum(data.signups)} trend={data.signups} />
                <Stat label={`Sign-ins in ${days} days`} value={sum(data.signins)} trend={data.signins} color={PURPLE} />
                <Stat label={`Scenes saved in ${days} days`} value={sum(data.scenes)} trend={data.scenes} color={GREEN} />
            </Grid>
            <Grid>
                <Card>
                    <h3>People</h3>
                    <p>Everyone signed up, by the end of each day</p>
                    <LineChart lines={[{ label: "People", color: BLUE, data: data.people }]} />
                </Card>
                <Card>
                    <h3>Sign-ups and sign-ins</h3>
                    <p>New accounts, and every time someone signs in</p>
                    <LineChart
                        area={false}
                        lines={[
                            { label: "Sign-ups", color: BLUE, data: data.signups },
                            { label: "Sign-ins", color: PURPLE, data: data.signins },
                        ]}
                    />
                </Card>
                <Card>
                    <h3>Scenes saved to the cloud</h3>
                    <p>New cloud scenes each day</p>
                    <LineChart lines={[{ label: "Scenes", color: GREEN, data: data.scenes }]} />
                </Card>
                <Card>
                    <h3>Feedback</h3>
                    <p>Messages from the feedback box each day</p>
                    <LineChart lines={[{ label: "Feedback", color: AMBER, data: data.feedback }]} />
                </Card>
            </Grid>
            <Grid>
                <Card>
                    <h3>Plans</h3>
                    <p>
                        {data.revenue.paying} paying · about ${data.revenue.monthlyLow}–${data.revenue.monthlyHigh} a month, depending on how many pay yearly
                    </p>
                    <Bars rows={plans} />
                </Card>
                <Card>
                    <h3>Assistant prompts by month</h3>
                    <p>
                        People signed in, and visitors who aren't
                    </p>
                    <Bars
                        rows={data.prompts.flatMap((m) => [
                            { label: `${m.period} · signed in`, n: m.people },
                            { label: `${m.period} · visitors`, n: m.visitors },
                        ])}
                        color={PURPLE}
                    />
                </Card>
                <Card>
                    <h3>Busiest creators</h3>
                    <p>
                        {data.storage.scenes.toLocaleString()} scenes in the cloud, {bytes(data.storage.bytes)} in all
                    </p>
                    <Bars rows={data.creators.map((c) => ({ label: c.email, n: c.scenes }))} color={GREEN} note={() => ""} />
                </Card>
            </Grid>
        </>
    );
}

const Setup = styled(Card)`
    ol {
        margin: 8px 0 0;
        padding-left: 20px;
        line-height: 1.7;
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
            <p>The app already records anonymous usage. To chart it here, the server needs a read-only Cloudflare token:</p>
            <ol>
                <li>
                    Cloudflare dashboard → My Profile → API Tokens → Create Token → Custom token, with the permission <code>Account · Account Analytics · Read</code>
                </li>
                <li>
                    Then run <code>cd backend && npx wrangler secret put ANALYTICS_TOKEN</code> and paste it in
                </li>
            </ol>
        </Setup>
    );
}

const NAMES: Record<string, string> = {
    app_open: "Opened the editor",
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

export function UsageSection() {
    const [days, setDays] = useState<Days>(30);
    const { data, error } = useMetrics<EventMetrics>("/metrics/events", days);
    if (error) return <Problem>{error}</Problem>;
    if (!data) return null;
    if (!data.configured) return <NotSetUp />;
    const opened = data.reach.app_open ?? 0;
    const reach = Object.entries(NAMES)
        .filter(([event]) => event !== "app_open")
        .map(([event, label]) => ({ label, n: data.reach[event] ?? 0 }))
        .sort((a, b) => b.n - a.n);
    const label = (event: string) => data.labels.filter((l) => l.event === event).map((l) => ({ label: l.label || "—", n: l.n }));
    return (
        <>
            <Range days={days} setDays={setDays}>
                Anonymous use of the app: one browser counts as one visitor.
            </Range>
            <Grid $min={180}>
                <Stat label={`Visitors in ${days} days`} value={opened} trend={data.visitors} />
                <Stat label="Made a first shape" value={data.reach.first_shape ?? 0} trend={data.events.first_shape} color={GREEN} />
                <Stat label="Time to a first shape (median)" value={data.firstShape.count ? `${data.firstShape.medianSeconds}s` : "—"} />
                <Stat label="Assistant prompts" value={sum(data.events.assistant_prompt)} trend={data.events.assistant_prompt} color={PURPLE} />
            </Grid>
            <Grid>
                <Card>
                    <h3>Visitors each day</h3>
                    <p>Different browsers that opened the editor</p>
                    <LineChart lines={[{ label: "Visitors", color: BLUE, data: data.visitors }]} />
                </Card>
                <Card>
                    <h3>Getting started</h3>
                    <p>Of everyone who opened the editor, how many went on to each step</p>
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
                    <h3>What people use</h3>
                    <p>Visitors who used each feature at least once</p>
                    <Bars rows={reach} note={(n) => (opened ? `${Math.round((n / opened) * 100)}%` : "")} />
                </Card>
                <Card>
                    <h3>Features over time</h3>
                    <p>Times each was used, per day</p>
                    <LineChart
                        area={false}
                        lines={[
                            { label: "Assistant", color: PURPLE, data: data.events.assistant_prompt ?? data.visitors.map((p) => ({ ...p, n: 0 })) },
                            { label: "Hands", color: PINK, data: data.events.hands_on ?? data.visitors.map((p) => ({ ...p, n: 0 })) },
                            { label: "Templates", color: GREEN, data: data.events.template_used ?? data.visitors.map((p) => ({ ...p, n: 0 })) },
                            { label: "Exports", color: AMBER, data: data.events.export ?? data.visitors.map((p) => ({ ...p, n: 0 })) },
                        ]}
                    />
                </Card>
                <Card>
                    <h3>Exports</h3>
                    <p>By format</p>
                    <Bars rows={label("export")} color={AMBER} />
                </Card>
                <Card>
                    <h3>Templates</h3>
                    <p>Which ones people start from</p>
                    <Bars rows={label("template_used")} color={GREEN} />
                </Card>
            </Grid>
        </>
    );
}

const ErrorList = styled.ol`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;

    li {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 10px;
        align-items: baseline;
        padding: 8px 10px;
        border-radius: 10px;
        background: var(--surface-raised);
        font-size: 13px;
    }
    code {
        overflow-wrap: anywhere;
    }
    small {
        color: var(--text-muted);
    }
`;

export function HealthSection() {
    const [days, setDays] = useState<Days>(7);
    const { data, error } = useMetrics<EventMetrics>("/metrics/events", days);
    if (error) return <Problem>{error}</Problem>;
    if (!data) return null;
    if (!data.configured) return <NotSetUp />;
    const total = sum(data.errors);
    return (
        <>
            <Range days={days} setDays={setDays}>
                Crashes and errors people's browsers reported. Full stacks are in the Worker's logs.
            </Range>
            <Grid $min={180}>
                <Stat label={`Errors in ${days} days`} value={total} trend={data.errors} color="var(--danger)" />
                <Stat label="Errors per 100 visitors" value={data.reach.app_open ? ((total / data.reach.app_open) * 100).toFixed(1) : "—"} />
            </Grid>
            <Grid>
                <Card>
                    <h3>Errors each day</h3>
                    <p>A jump after a deploy usually means something broke</p>
                    <LineChart lines={[{ label: "Errors", color: "#e5484d", data: data.errors }]} />
                </Card>
                <Card>
                    <h3>Most common</h3>
                    <p>Grouped by message</p>
                    {data.topErrors.length ? (
                        <ErrorList>
                            {data.topErrors.map((e, i) => (
                                <li key={i}>
                                    <small>{e.place || "app"}</small>
                                    <code>{e.message || "(no message)"}</code>
                                    <b>{e.n}</b>
                                </li>
                            ))}
                        </ErrorList>
                    ) : (
                        <Empty>No errors. Nice.</Empty>
                    )}
                </Card>
            </Grid>
        </>
    );
}
