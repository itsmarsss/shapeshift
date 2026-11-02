import { useCallback, useEffect, useState, type ReactNode } from "react";
import styled from "styled-components";
import { ChartBar, ChatCircleText, Compass, ListChecks, ShieldCheck, Users } from "@phosphor-icons/react";
import { ROLE_IDS, ROLES, type Permission, type Role } from "@shapeshift/shared/admin/roles";
import { SiteShell } from "../site/SiteShell";
import { Container, Empty, PageHead } from "../site/parts";
import { Button, Input, Select } from "../components/ui";

// The team's admin page at /admin. The server decides who gets in and what
// each role may do; this only shows the sections the signed-in admin can use.

type Me = { email: string; role: Role; permissions: Permission[] };

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const res = await fetch(`/api/admin${path}`, {
        method: init?.method ?? "GET",
        headers: init?.body ? { "content-type": "application/json" } : undefined,
        body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong.");
    return data as T;
}

const when = (at: number | null) => (at ? new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

const Layout = styled.div`
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    gap: 28px;
    align-items: start;

    @media (max-width: 760px) {
        grid-template-columns: 1fr;
    }
`;

const Nav = styled.nav`
    position: sticky;
    top: 84px;
    display: flex;
    flex-direction: column;
    gap: 2px;

    button {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 40px;
        padding: 0 12px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: var(--text-muted);
        font-weight: 600;
        text-align: left;
    }
    button:hover {
        background: var(--surface-hover);
        color: var(--text);
    }
    button[aria-current="page"] {
        background: var(--surface-raised);
        color: var(--text);
    }
    span {
        margin-left: auto;
        min-width: 20px;
        padding: 0 6px;
        border-radius: 999px;
        background: var(--accent);
        color: var(--accent-text);
        font-size: 11px;
        text-align: center;
    }
    @media (max-width: 760px) {
        position: static;
        flex-direction: row;
        overflow-x: auto;
    }
`;

const Stats = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;

    div {
        padding: 18px;
        border-radius: 16px;
        border: 1px solid var(--border);
        background: var(--surface);
    }
    b {
        display: block;
        font-size: 28px;
        letter-spacing: -0.02em;
    }
    small {
        color: var(--text-muted);
    }
`;

const List = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const Card = styled.div<{ $dim?: boolean }>`
    display: flex;
    gap: 16px;
    padding: 16px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    opacity: ${(p) => (p.$dim ? 0.6 : 1)};

    .main {
        flex: 1;
        min-width: 0;
    }
    .meta {
        color: var(--text-muted);
        font-size: 12px;
        margin-bottom: 6px;
    }
    p {
        margin: 0;
        white-space: pre-wrap;
        line-height: 1.5;
    }
    img {
        width: 140px;
        aspect-ratio: 4 / 3;
        object-fit: cover;
        border-radius: 10px;
        border: 1px solid var(--border);
        flex-shrink: 0;
    }
    .actions {
        display: flex;
        gap: 6px;
        align-items: flex-start;
        flex-shrink: 0;
    }
    @media (max-width: 600px) {
        flex-direction: column;
        img {
            width: 100%;
        }
    }
`;

const Table = styled.div`
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);

    table {
        width: 100%;
        border-collapse: collapse;
        min-width: 640px;
    }
    th,
    td {
        padding: 10px 14px;
        text-align: left;
        border-bottom: 1px solid var(--border);
        white-space: nowrap;
    }
    th {
        color: var(--text-muted);
        font-weight: 600;
        font-size: 12px;
    }
    tr:last-child td {
        border-bottom: 0;
    }
`;

const Bar = styled.form`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;

    input {
        flex: 1;
        min-width: 200px;
        height: 38px;
    }
    select {
        height: 38px;
    }
`;

const Note = styled.p`
    margin: 0 0 16px;
    color: var(--text-muted);
`;

const Problem = styled.p`
    color: var(--danger);
`;

const Pill = styled.span<{ $on?: boolean }>`
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    background: ${(p) => (p.$on ? "var(--accent-soft)" : "var(--surface-raised)")};
    color: ${(p) => (p.$on ? "var(--accent)" : "var(--text-muted)")};
`;

// A button that asks once more before it acts.
function Confirm({ label, sure, onConfirm, variant }: { label: string; sure: string; onConfirm: () => void; variant?: "danger" }) {
    const [asking, setAsking] = useState(false);
    return asking ? (
        <>
            <Button $variant={variant ?? "primary"} onClick={() => (setAsking(false), onConfirm())}>
                {sure}
            </Button>
            <Button onClick={() => setAsking(false)}>Cancel</Button>
        </>
    ) : (
        <Button onClick={() => setAsking(true)}>{label}</Button>
    );
}

// Loads a section's data, and reloads it after a change.
function useLoad<T>(load: () => Promise<T>) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const reload = useCallback(() => {
        load()
            .then((d) => (setData(d), setError(null)))
            .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load this."));
    }, [load]);
    useEffect(reload, [reload]);
    return { data, error, reload };
}

type Overview = { people: number; newThisWeek: number; pro: number; scenes: number; shared: number; listed: number; unreadFeedback: number; promptsThisMonth: number };

function OverviewSection() {
    const { data, error } = useLoad(useCallback(() => api<Overview>("/overview"), []));
    if (error) return <Problem>{error}</Problem>;
    if (!data) return null;
    const stats: [string, number][] = [
        ["People signed up", data.people],
        ["New this week", data.newThisWeek],
        ["On Pro", data.pro],
        ["Scenes saved", data.scenes],
        ["Shared by link", data.shared],
        ["On Explore", data.listed],
        ["Unread feedback", data.unreadFeedback],
        ["Assistant prompts this month", data.promptsThisMonth],
    ];
    return (
        <Stats>
            {stats.map(([label, n]) => (
                <div key={label}>
                    <b>{n.toLocaleString()}</b>
                    <small>{label}</small>
                </div>
            ))}
        </Stats>
    );
}

type Feedback = { id: string; at: number; email: string | null; page: string | null; message: string; picture: boolean; read: boolean };

function FeedbackSection({ canManage, onChange }: { canManage: boolean; onChange: () => void }) {
    const [items, setItems] = useState<Feedback[]>([]);
    const [next, setNext] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const load = useCallback((before?: number) => {
        api<{ items: Feedback[]; next: number | null }>(`/feedback${before ? `?before=${before}` : ""}`)
            .then((d) => {
                setItems((prev) => (before ? [...prev, ...d.items] : d.items));
                setNext(d.next);
            })
            .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load feedback."));
    }, []);
    useEffect(() => load(), [load]);

    async function mark(item: Feedback, read: boolean) {
        await api(`/feedback/${item.id}/read`, { method: "POST", body: { read } });
        setItems((prev) => prev.map((f) => (f.id === item.id ? { ...f, read } : f)));
        onChange();
    }

    if (error) return <Problem>{error}</Problem>;
    if (!items.length) return <Empty>No feedback yet.</Empty>;
    return (
        <List>
            {items.map((f) => (
                <Card key={f.id} $dim={f.read}>
                    {f.picture && <img src={`/api/admin/feedback/${f.id}/picture`} alt="What they were looking at" loading="lazy" />}
                    <div className="main">
                        <div className="meta">
                            {when(f.at)} · {f.email ?? "No email"} · {f.page ?? "—"}
                        </div>
                        <p>{f.message}</p>
                    </div>
                    {canManage && (
                        <div className="actions">
                            <Button onClick={() => void mark(f, !f.read)}>{f.read ? "Mark unread" : "Mark read"}</Button>
                        </div>
                    )}
                </Card>
            ))}
            {next && <Button onClick={() => load(next)}>Show older</Button>}
        </List>
    );
}

type Person = { id: string; email: string; name: string | null; plan: string; plan_status: string | null; joined: number; scenes: number; role: Role | null };

function PeopleSection({ canPlan }: { canPlan: boolean }) {
    const [q, setQ] = useState("");
    const [query, setQuery] = useState("");
    const { data, error, reload } = useLoad(useCallback(() => api<{ users: Person[] }>(`/users?q=${encodeURIComponent(query)}`), [query]));

    async function setPlan(p: Person, plan: "free" | "pro") {
        await api(`/users/${p.id}/plan`, { method: "POST", body: { plan } });
        reload();
    }

    return (
        <>
            <Bar
                onSubmit={(e) => {
                    e.preventDefault();
                    setQuery(q);
                }}
            >
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email" aria-label="Search by email" />
                <Button type="submit" $variant="primary">
                    Search
                </Button>
            </Bar>
            {error && <Problem>{error}</Problem>}
            {data && !data.users.length && <Empty>Nobody matches.</Empty>}
            {data && data.users.length > 0 && (
                <Table>
                    <table>
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>Plan</th>
                                <th>Scenes</th>
                                <th>Joined</th>
                                <th>Admin</th>
                                {canPlan && <th />}
                            </tr>
                        </thead>
                        <tbody>
                            {data.users.map((p) => (
                                <tr key={p.id}>
                                    <td>
                                        {p.email}
                                        {p.name && <small style={{ color: "var(--text-muted)" }}> · {p.name}</small>}
                                    </td>
                                    <td>
                                        <Pill $on={p.plan === "pro"}>{p.plan === "pro" ? (p.plan_status === "manual" ? "Pro (given)" : "Pro") : "Free"}</Pill>
                                    </td>
                                    <td>{p.scenes}</td>
                                    <td>{new Date(p.joined).toLocaleDateString()}</td>
                                    <td>{p.role ? ROLES[p.role].label : ""}</td>
                                    {canPlan && (
                                        <td>
                                            {p.plan === "pro" ? (
                                                p.plan_status === "manual" && <Confirm label="Back to Free" sure="Yes, make Free" onConfirm={() => void setPlan(p, "free")} variant="danger" />
                                            ) : (
                                                <Confirm label="Give Pro" sure="Yes, give Pro" onConfirm={() => void setPlan(p, "pro")} />
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Table>
            )}
        </>
    );
}

type Listed = { slug: string; title: string; published_at: number | null; owner: string };

function ExploreSection() {
    const { data, error, reload } = useLoad(useCallback(() => api<{ scenes: Listed[] }>("/explore"), []));
    async function unlist(slug: string) {
        await api(`/explore/${slug}/unlist`, { method: "POST" });
        reload();
    }
    if (error) return <Problem>{error}</Problem>;
    if (!data) return null;
    if (!data.scenes.length) return <Empty>Nothing from the community on Explore yet.</Empty>;
    return (
        <>
            <Note>Taking a scene off Explore keeps its link working; it just isn't listed any more.</Note>
            <List>
                {data.scenes.map((s) => (
                    <Card key={s.slug}>
                        <div className="main">
                            <div className="meta">
                                {s.owner} · {when(s.published_at)}
                            </div>
                            <a href={`/s/${s.slug}`} target="_blank" rel="noopener">
                                {s.title}
                            </a>
                        </div>
                        <div className="actions">
                            <Confirm label="Take off Explore" sure="Yes, take it off" onConfirm={() => void unlist(s.slug)} variant="danger" />
                        </div>
                    </Card>
                ))}
            </List>
        </>
    );
}

type AdminRow = { id: string | null; email: string; role: Role; added_by: string | null; added_at: number | null; fixed: boolean };

function AdminsSection({ me }: { me: Me }) {
    const { data, error, reload } = useLoad(useCallback(() => api<{ admins: AdminRow[] }>("/admins"), []));
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<Role>("support");
    const [problem, setProblem] = useState<string | null>(null);

    async function add() {
        setProblem(null);
        try {
            await api("/admins", { method: "POST", body: { email, role } });
            setEmail("");
            reload();
        } catch (e) {
            setProblem(e instanceof Error ? e.message : "Couldn't add them.");
        }
    }
    async function remove(id: string) {
        await api(`/admins/${id}`, { method: "DELETE" });
        reload();
    }

    return (
        <>
            <Bar
                onSubmit={(e) => {
                    e.preventDefault();
                    void add();
                }}
            >
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" aria-label="Email of the new admin" required />
                <Select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
                    {ROLE_IDS.map((r) => (
                        <option key={r} value={r}>
                            {ROLES[r].label} · {ROLES[r].about}
                        </option>
                    ))}
                </Select>
                <Button type="submit" $variant="primary">
                    Add or change
                </Button>
            </Bar>
            <Note>They need to have signed in once. Superusers from the server settings can't be removed here.</Note>
            {(problem || error) && <Problem>{problem ?? error}</Problem>}
            {data && (
                <Table>
                    <table>
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Added</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {data.admins.map((a) => (
                                <tr key={a.email}>
                                    <td>{a.email}</td>
                                    <td>
                                        <Pill $on={a.role === "superuser"}>{ROLES[a.role].label}</Pill>
                                    </td>
                                    <td>{a.fixed ? "From server settings" : `${when(a.added_at)} by ${a.added_by ?? "—"}`}</td>
                                    <td>{!a.fixed && a.id && a.email !== me.email && <Confirm label="Remove" sure="Yes, remove" onConfirm={() => void remove(a.id!)} variant="danger" />}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Table>
            )}
        </>
    );
}

function ActivitySection() {
    const { data, error } = useLoad(useCallback(() => api<{ entries: { at: number; actor: string; action: string; detail: string }[] }>("/log"), []));
    if (error) return <Problem>{error}</Problem>;
    if (!data) return null;
    if (!data.entries.length) return <Empty>Nothing done here yet.</Empty>;
    return (
        <Table>
            <table>
                <thead>
                    <tr>
                        <th>When</th>
                        <th>Who</th>
                        <th>What</th>
                    </tr>
                </thead>
                <tbody>
                    {data.entries.map((e, i) => (
                        <tr key={i}>
                            <td>{when(e.at)}</td>
                            <td>{e.actor}</td>
                            <td>
                                {e.action} · {e.detail}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Table>
    );
}

type Tab = { id: string; label: string; Icon: typeof ChartBar; needs: Permission; render: () => ReactNode };

export default function AdminPage() {
    const [me, setMe] = useState<Me | null | false>(null);
    const [tab, setTab] = useState("overview");
    const [unread, setUnread] = useState(0);

    const refreshUnread = useCallback(() => {
        api<Overview>("/overview")
            .then((o) => setUnread(o.unreadFeedback))
            .catch(() => {});
    }, []);
    useEffect(() => {
        document.title = "Admin · ShapeShift";
        api<Me>("/me")
            .then((m) => {
                setMe(m);
                if (m.permissions.includes("overview")) refreshUnread();
            })
            .catch(() => setMe(false));
    }, [refreshUnread]);

    if (me === null) return <SiteShell page="admin">{null}</SiteShell>;
    if (me === false)
        return (
            <SiteShell page="admin">
                <Container>
                    <Empty>
                        <b>Page not found</b>
                        <a href="/">Back to ShapeShift</a>
                    </Empty>
                </Container>
            </SiteShell>
        );

    const tabs: Tab[] = [
        { id: "overview", label: "Overview", Icon: ChartBar, needs: "overview", render: () => <OverviewSection /> },
        {
            id: "feedback",
            label: "Feedback",
            Icon: ChatCircleText,
            needs: "feedback.read",
            render: () => <FeedbackSection canManage={me.permissions.includes("feedback.manage")} onChange={refreshUnread} />,
        },
        { id: "people", label: "People", Icon: Users, needs: "users.read", render: () => <PeopleSection canPlan={me.permissions.includes("users.plans")} /> },
        { id: "explore", label: "Explore", Icon: Compass, needs: "explore.moderate", render: () => <ExploreSection /> },
        { id: "admins", label: "Admins", Icon: ShieldCheck, needs: "admins.manage", render: () => <AdminsSection me={me} /> },
        { id: "activity", label: "Activity", Icon: ListChecks, needs: "admins.manage", render: () => <ActivitySection /> },
    ].filter((t) => me.permissions.includes(t.needs as Permission)) as Tab[];
    const current = tabs.find((t) => t.id === tab) ?? tabs[0];

    return (
        <SiteShell page="admin">
            <Container>
                <PageHead>
                    <div>
                        <h1>Admin</h1>
                        <p>
                            Signed in as {me.email} · {ROLES[me.role].label}
                        </p>
                    </div>
                </PageHead>
                <Layout>
                    <Nav aria-label="Admin sections">
                        {tabs.map((t) => (
                            <button key={t.id} aria-current={t.id === current.id ? "page" : undefined} onClick={() => setTab(t.id)}>
                                <t.Icon size={18} />
                                {t.label}
                                {t.id === "feedback" && unread > 0 && <span>{unread}</span>}
                            </button>
                        ))}
                    </Nav>
                    <section aria-label={current.label}>{current.render()}</section>
                </Layout>
            </Container>
        </SiteShell>
    );
}
