import { useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { ROLES, type Role } from "@shapeshift/shared/admin/roles";
import { Button, Input, Select } from "../../components/ui";
import { ago, day, go, useLoad } from "../nav";
import { Avatar, Badge, Header, Pager, PlanBadge, Problem, TableBox, Toolbar } from "../ui";
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
    const [draft, setDraft] = useState("");
    const [q, setQ] = useState("");
    const [plan, setPlan] = useState("");
    const [role, setRole] = useState("");
    const [scenes, setScenes] = useState("");
    const [sort, setSort] = useState("joined");
    const [dir, setDir] = useState<"asc" | "desc">("desc");
    const [page, setPage] = useState(0);
    const params = new URLSearchParams({ q, plan, role, scenes, sort, dir, page: String(page) });
    const { data, error } = useLoad<List>(`/users?${params}`);

    const sortBy = (key: string) => {
        if (key === "plan") return;
        if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
        else {
            setSort(key);
            setDir(key === "email" ? "asc" : "desc");
        }
        setPage(0);
    };

    return (
        <>
            <Header title="People">{data ? `${data.total.toLocaleString()} ${data.total === 1 ? "person" : "people"}` : "Everyone with an account"}</Header>
            <Toolbar
                onSubmit={(e) => {
                    e.preventDefault();
                    setQ(draft);
                    setPage(0);
                }}
            >
                <Input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search by email or name" aria-label="Search people" />
                <Select value={plan} onChange={(e) => (setPlan(e.target.value), setPage(0))} aria-label="Plan">
                    <option value="">Every plan</option>
                    <option value="free">Free</option>
                    <option value="pro">Pro, paying</option>
                    <option value="given">Pro, given by hand</option>
                    <option value="trouble">Cancelling or overdue</option>
                </Select>
                <Select value={role} onChange={(e) => (setRole(e.target.value), setPage(0))} aria-label="Role">
                    <option value="">Everyone</option>
                    <option value="admin">Admins only</option>
                </Select>
                <Select value={scenes} onChange={(e) => (setScenes(e.target.value), setPage(0))} aria-label="Scenes">
                    <option value="">With or without scenes</option>
                    <option value="yes">Has saved scenes</option>
                </Select>
                <Button type="submit" $variant="primary">
                    Search
                </Button>
            </Toolbar>
            {error && <Problem>{error}</Problem>}
            {data && !data.users.length && <Empty>Nobody matches.</Empty>}
            {data && data.users.length > 0 && (
                <>
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
                                {data.users.map((u) => (
                                    <tr key={u.id} onClick={() => go("people", u.id)}>
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
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </TableBox>
                    <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
                </>
            )}
        </>
    );
}
