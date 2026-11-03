import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Envelope } from "@phosphor-icons/react";
import { ROLE_IDS, ROLES, type Role } from "@shapeshift/shared/admin/roles";
import { Button, Input, Select } from "../../components/ui";
import { api } from "../api";
import { EASE_OUT, rowIn } from "../../ui/motion";
import { ago, go, run, toast, useDebounced, useKept, useLoad, when } from "../nav";
import { Avatar, Badge, Confirm, Header, Loading, Note, Problem, SearchBox, TableBox, Toolbar } from "../ui";
import { NoData } from "../charts";

// Feedback, Explore moderation, admins and the activity log.

type Feedback = { id: string; at: number; email: string | null; userId: string | null; page: string | null; message: string; picture: boolean; read: boolean };

const Items = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const Item = styled(m.article)<{ $read: boolean }>`
    transition: border-color 0.2s ease;
    display: flex;
    gap: 16px;
    padding: 16px;
    border-radius: 14px;
    border: 1px solid ${(p) => (p.$read ? "var(--border)" : "rgba(245, 165, 36, 0.45)")};
    background: var(--surface);

    .main {
        flex: 1;
        min-width: 0;
    }
    .meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        color: var(--text-muted);
        font-size: 12px;
        margin-bottom: 8px;
    }
    .meta a,
    .meta button {
        border: 0;
        background: none;
        padding: 0;
        color: var(--text);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
    }
    p {
        margin: 0;
        white-space: pre-wrap;
        line-height: 1.5;
    }
    img {
        width: 180px;
        aspect-ratio: 4 / 3;
        object-fit: cover;
        border-radius: 10px;
        border: 1px solid var(--border);
        flex-shrink: 0;
    }
    .actions {
        display: flex;
        gap: 6px;
        margin-top: 12px;
    }
    @media (max-width: 640px) {
        flex-direction: column;
        img {
            width: 100%;
        }
    }
`;

export function FeedbackSection({ canManage, onChange }: { canManage: boolean; onChange: () => void }) {
    const [items, setItems] = useState<Feedback[] | null>(null);
    const [next, setNext] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [v, setV] = useKept("feedback", { unread: true, q: "" });
    const { unread } = v;
    const q = useDebounced(v.q);
    const load = useCallback(
        (before?: number) => {
            const params = new URLSearchParams({ unread: unread ? "1" : "0", q, ...(before ? { before: String(before) } : {}) });
            api<{ items: Feedback[]; next: number | null }>(`/feedback?${params}`)
                .then((d) => {
                    setItems((prev) => (before ? [...(prev ?? []), ...d.items] : d.items));
                    setNext(d.next);
                })
                .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load feedback."));
        },
        [unread, q],
    );
    useEffect(() => load(), [load]);

    async function mark(item: Feedback, read: boolean) {
        if (!(await run(`/feedback/${item.id}/read`, read ? "Marked read" : "Marked unread", { body: { read } }))) return;
        setItems((prev) => (prev ?? []).flatMap((f) => (f.id !== item.id ? [f] : unread && read ? [] : [{ ...f, read }])));
        onChange();
    }

    return (
        <>
            <Header title="Feedback">What people sent from the feedback box, with the scene they were looking at.</Header>
            <Toolbar onSubmit={(e) => e.preventDefault()}>
                <SearchBox value={v.q} onChange={(q) => setV({ ...v, q })} placeholder="Search messages" label="Search feedback" />
                <Select value={unread ? "unread" : "all"} onChange={(e) => setV({ ...v, unread: e.target.value === "unread" })} aria-label="Which">
                    <option value="unread">Unread</option>
                    <option value="all">All</option>
                </Select>
            </Toolbar>
            {error && <Problem>{error}</Problem>}
            {!items && !error && <Loading kind="list" />}
            {items && !items.length && <NoData>{unread ? "All caught up." : "No feedback yet."}</NoData>}
            <Items>
                <AnimatePresence initial={false}>
                {(items ?? []).map((f, i) => (
                    <Item key={f.id} $read={f.read} {...rowIn(i)} exit={{ opacity: 0, x: 24, transition: { duration: 0.2, ease: EASE_OUT } }}>
                        {f.picture && <img src={`/api/admin/feedback/${f.id}/picture`} alt="What they were looking at" loading="lazy" />}
                        <div className="main">
                            <div className="meta">
                                {f.email && <Avatar email={f.email} size={22} />}
                                {f.userId ? <button onClick={() => go("people", f.userId)}>{f.email}</button> : <span>{f.email ?? "No email"}</span>}
                                <span>·</span>
                                <span title={when(f.at)}>{ago(f.at)}</span>
                                {f.page && (
                                    <>
                                        <span>·</span>
                                        <span>{f.page}</span>
                                    </>
                                )}
                                {!f.read && <Badge $tone="amber">Unread</Badge>}
                            </div>
                            <p>{f.message}</p>
                            <div className="actions">
                                {canManage && <Button onClick={() => void mark(f, !f.read)}>{f.read ? "Mark unread" : "Mark read"}</Button>}
                                {f.email && (
                                    <Button as="a" href={`mailto:${f.email}?subject=${encodeURIComponent("Your ShapeShift feedback")}`}>
                                        <Envelope size={14} /> Reply
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Item>
                ))}
                </AnimatePresence>
            </Items>
            {next && (
                <Button style={{ marginTop: 12 }} onClick={() => load(next)}>
                    Show older
                </Button>
            )}
        </>
    );
}

type Listed = { slug: string; title: string; published_at: number | null; owner: string };

export function ExploreSection() {
    const { data, error, reload } = useLoad<{ scenes: Listed[] }>("/explore");
    async function unlist(slug: string) {
        if (await run(`/explore/${slug}/unlist`, "Taken off Explore")) reload();
    }
    return (
        <>
            <Header title="Explore">Community scenes listed in the public gallery. Taking one off keeps its link working.</Header>
            {error && <Problem>{error}</Problem>}
            {!data && !error && <Loading kind="list" />}
            {data && !data.scenes.length && <NoData>Nothing from the community on Explore yet.</NoData>}
            {data && data.scenes.length > 0 && (
                <TableBox>
                    <table>
                        <thead>
                            <tr>
                                <th>Scene</th>
                                <th>By</th>
                                <th>Listed</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {data.scenes.map((s, i) => (
                                <m.tr key={s.slug} {...rowIn(i)} onClick={() => window.open(`/s/${s.slug}`, "_blank", "noopener")}>
                                    <td style={{ fontWeight: 600 }}>{s.title}</td>
                                    <td className="muted">{s.owner}</td>
                                    <td className="muted">{ago(s.published_at)}</td>
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <Confirm label="Take off Explore" sure="Take it off" variant="danger" onConfirm={() => void unlist(s.slug)} />
                                    </td>
                                </m.tr>
                            ))}
                        </tbody>
                    </table>
                </TableBox>
            )}
        </>
    );
}

type AdminRow = { id: string | null; email: string; role: Role; added_by: string | null; added_at: number | null; fixed: boolean };

const RoleCards = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
    margin-bottom: 14px;

    div {
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--surface);
        font-size: 13px;
    }
    b {
        display: block;
        margin-bottom: 2px;
    }
    span {
        color: var(--text-muted);
    }
`;

export function AdminsSection({ me }: { me: string }) {
    const { data, error, reload } = useLoad<{ admins: AdminRow[] }>("/admins");
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<Role>("support");
    const [problem, setProblem] = useState<string | null>(null);

    async function add() {
        setProblem(null);
        try {
            await api("/admins", { method: "POST", body: { email, role } });
            toast(`${email} is now ${ROLES[role].label.toLowerCase()}`);
            setEmail("");
            reload();
        } catch (e) {
            setProblem(e instanceof Error ? e.message : "Couldn't add them.");
        }
    }

    return (
        <>
            <Header title="Admins">Who can open this page, and what each can do.</Header>
            <RoleCards>
                {ROLE_IDS.map((r) => (
                    <div key={r}>
                        <b>{ROLES[r].label}</b>
                        <span>{ROLES[r].about}</span>
                    </div>
                ))}
            </RoleCards>
            <Toolbar
                onSubmit={(e) => {
                    e.preventDefault();
                    void add();
                }}
            >
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" aria-label="Email of the new admin" required />
                <Select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
                    {ROLE_IDS.filter((r) => r !== "superuser").map((r) => (
                        <option key={r} value={r}>
                            {ROLES[r].label}
                        </option>
                    ))}
                </Select>
                <Button type="submit" $variant="primary">
                    Add or change
                </Button>
            </Toolbar>
            <Note>They need to have signed in once. Superusers come from the server settings and can't be changed here.</Note>
            {(problem || error) && <Problem>{problem ?? error}</Problem>}
            {data && (
                <TableBox>
                    <table>
                        <thead>
                            <tr>
                                <th>Admin</th>
                                <th>Role</th>
                                <th>Added</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {data.admins.map((a, i) => (
                                <m.tr key={a.email} {...rowIn(i)} onClick={() => a.id && go("people", a.id)}>
                                    <td>
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                                            <Avatar email={a.email} />
                                            {a.email}
                                        </span>
                                    </td>
                                    <td>
                                        <Badge $tone={a.role === "superuser" ? "accent" : "plain"}>{ROLES[a.role].label}</Badge>
                                    </td>
                                    <td className="muted">{a.fixed ? "From server settings" : `${ago(a.added_at)} by ${a.added_by ?? "—"}`}</td>
                                    <td onClick={(e) => e.stopPropagation()}>
                                        {!a.fixed && a.id && a.email !== me && <Confirm label="Remove" sure="Remove" variant="danger" onConfirm={() => void run(`/admins/${a.id}`, `Removed ${a.email}`, { method: "DELETE" }).then((ok) => ok && reload())} />}
                                    </td>
                                </m.tr>
                            ))}
                        </tbody>
                    </table>
                </TableBox>
            )}
        </>
    );
}

export function ActivitySection() {
    const { data, error } = useLoad<{ entries: { at: number; actor: string; action: string; detail: string }[] }>("/log");
    const [filter, setFilter] = useState("");
    const entries = (data?.entries ?? []).filter((e) => !filter || `${e.actor} ${e.action} ${e.detail}`.toLowerCase().includes(filter.toLowerCase()));
    return (
        <>
            <Header title="Activity">Everything done on this page, newest first.</Header>
            <Toolbar onSubmit={(e) => e.preventDefault()}>
                <SearchBox value={filter} onChange={setFilter} placeholder="Filter by who, what or whom" label="Filter activity" />
            </Toolbar>
            {error && <Problem>{error}</Problem>}
            {!data && !error && <Loading kind="list" />}
            {data && !entries.length && <NoData>Nothing here.</NoData>}
            {entries.length > 0 && (
                <TableBox>
                    <table>
                        <thead>
                            <tr>
                                <th>When</th>
                                <th>Who</th>
                                <th>What</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((e, i) => (
                                <m.tr key={`${e.at}:${i}`} {...rowIn(i)} style={{ cursor: "default" }}>
                                    <td className="muted" title={when(e.at)}>
                                        {ago(e.at)}
                                    </td>
                                    <td>{e.actor}</td>
                                    <td>
                                        <Badge>{e.action}</Badge>
                                    </td>
                                    <td>{e.detail}</td>
                                </m.tr>
                            ))}
                        </tbody>
                    </table>
                </TableBox>
            )}
        </>
    );
}
