import * as m from "motion/react-m";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { ROLES, type Role } from "@shapeshift/shared/admin/roles";
import { Select } from "../../components/ui";
import { rowIn } from "../../ui/motion";
import { ago, day, go, useDebounced, useKept, useLoad } from "../nav";
import { Avatar, Badge, Dim, Header, Loading, Pager, PlanBadge, Problem, SearchBox, TableBox, Toolbar } from "../ui";
import { Empty } from "../charts";

type Row = { id: string; email: string; name: string | null; plan: string; plan_status: string | null; joined: number; scenes: number; prompts: number; active: number | null; role: Role | null };
type List = { total: number; page: number; pageSize: number; users: Row[] };

const COLUMNS: { key: string; label: string }[] = [
    { key: "email", label: "Person" },
    { key: "plan", label: "Plan" },
    { key: "scenes", label: "Scenes" },
    { key: "prompts", label: "Prompts this month" },
    { key: "active", label: "Last active" },
    { key: "joined", label: "Joined" },
];

export function People() {
    const [v, setV] = useKept("people", { q: "", plan: "", role: "", scenes: "", sort: "joined", dir: "desc" as "asc" | "desc", page: 0 });
    const set = (change: Partial<typeof v>) => setV({ ...v, page: 0, ...change });
    const q = useDebounced(v.q);
    const { sort, dir, page } = v;
    const params = new URLSearchParams({ q, plan: v.plan, role: v.role, scenes: v.scenes, sort, dir, page: String(page) });
    const { data, error, loading } = useLoad<List>(`/users?${params}`);

    const sortBy = (key: string) => {
        if (key === "plan") return;
        set(sort === key ? { dir: dir === "asc" ? "desc" : "asc" } : { sort: key, dir: key === "email" ? "asc" : "desc" });
    };

    return (
        <>
            <Header title="People">{data ? `${data.total.toLocaleString()} ${data.total === 1 ? "person" : "people"}` : "Everyone with an account"}</Header>
            <Toolbar onSubmit={(e) => e.preventDefault()}>
                <SearchBox value={v.q} onChange={(q) => set({ q })} placeholder="Search by email or name" label="Search people" />
                <Select value={v.plan} onChange={(e) => set({ plan: e.target.value })} aria-label="Plan">
                    <option value="">Every plan</option>
                    <option value="free">Free</option>
                    <option value="pro">Pro, paying</option>
                    <option value="given">Pro, given by hand</option>
                    <option value="trouble">Cancelling or overdue</option>
                </Select>
                <Select value={v.role} onChange={(e) => set({ role: e.target.value })} aria-label="Role">
                    <option value="">Everyone</option>
                    <option value="admin">Admins only</option>
                </Select>
                <Select value={v.scenes} onChange={(e) => set({ scenes: e.target.value })} aria-label="Scenes">
                    <option value="">With or without scenes</option>
                    <option value="yes">Has saved scenes</option>
                </Select>
            </Toolbar>
            {error && <Problem>{error}</Problem>}
            {!data && !error && <Loading kind="list" />}
            {data && !data.users.length && <Empty>Nobody matches.</Empty>}
            {data && data.users.length > 0 && (
                <Dim $busy={loading}>
                    <TableBox>
                        <table>
                            <thead>
                                <tr>
                                    {COLUMNS.map((c) => (
                                        <th key={c.key}>
                                            {c.key === "plan" ? (
                                                c.label
                                            ) : (
                                                <button type="button" aria-pressed={sort === c.key} onClick={() => sortBy(c.key)}>
                                                    {c.label}
                                                    {sort === c.key && (dir === "asc" ? <CaretUp size={12} /> : <CaretDown size={12} />)}
                                                </button>
                                            )}
                                        </th>
                                    ))}
                                    <th>Role</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.users.map((u, i) => (
                                    <m.tr key={u.id} {...rowIn(i)} tabIndex={0} onClick={() => go("people", u.id)} onKeyDown={(e) => e.key === "Enter" && go("people", u.id)}>
                                        <td>
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                                                <Avatar email={u.email} />
                                                <span>
                                                    <a href={`/admin?s=people&id=${u.id}`} onClick={(e) => e.preventDefault()} style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600 }}>
                                                        {u.email}
                                                    </a>
                                                    {u.name && <div className="muted">{u.name}</div>}
                                                </span>
                                            </span>
                                        </td>
                                        <td>
                                            <PlanBadge plan={u.plan} status={u.plan_status} />
                                        </td>
                                        <td>{u.scenes}</td>
                                        <td>{u.prompts}</td>
                                        <td className="muted">{ago(u.active)}</td>
                                        <td className="muted">{day(u.joined)}</td>
                                        <td>{u.role && <Badge $tone={u.role === "superuser" ? "accent" : "plain"}>{ROLES[u.role].label}</Badge>}</td>
                                    </m.tr>
                                ))}
                            </tbody>
                        </table>
                    </TableBox>
                    <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setV({ ...v, page })} />
                </Dim>
            )}
        </>
    );
}
