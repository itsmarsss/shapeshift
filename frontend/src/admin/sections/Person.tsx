import { useState } from "react";
import styled from "styled-components";
import { ArrowLeft, ArrowSquareOut, Copy } from "@phosphor-icons/react";
import { ROLES, type Permission, type Role } from "@shapeshift/shared/admin/roles";
import { Button, Input, TextButton } from "../../components/ui";
import { ago, day, go, run, toast, useLoad, when } from "../nav";
import { Avatar, Badge, Confirm, Loading, Panel, PlanBadge, Problem } from "../ui";
import { NoData, Kpis, Stat } from "../charts";
import { Tiles } from "../../site/parts";
import { SceneTile } from "../SceneTile";

type Scene = { id: string; title: string; size: number; created_at: number; updated_at: number; public_slug: string | null; listed: number };
type Detail = {
    id: string;
    email: string;
    name: string | null;
    plan: string;
    plan_status: string | null;
    plan_renews_at: number | null;
    stripe_customer_id: string | null;
    joined: number;
    active: number | null;
    role: Role | null;
    promptLimit: number;
    promptsThisMonth: number;
    signinsLast30: number;
    activeSessions: number;
    scenes: Scene[];
    sessions: { created_at: number; expires_at: number }[];
    usage: { period: string; prompts: number; steps: number }[];
    feedback: { id: string; at: number; page: string | null; message: string; read_at: number | null }[];
    log: { at: number; actor: string; action: string; detail: string }[];
};

const Top = styled.div`
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 16px;

    .who {
        flex: 1;
        min-width: 220px;
    }
    h2 {
        margin: 0;
        font-size: 22px;
        letter-spacing: -0.02em;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }
    .meta {
        margin-top: 4px;
        color: var(--text-muted);
        font-size: 13px;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
    }
    .icon {
        border: 0;
        background: none;
        color: var(--text-muted);
        padding: 2px;
    }
`;

const Back = styled(TextButton)`
    margin-bottom: 14px;
`;

const Columns = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: 12px;
    align-items: start;

    @media (max-width: 1000px) {
        grid-template-columns: minmax(0, 1fr);
    }
`;


const Actions = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;

    .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }
    .row span {
        color: var(--text-muted);
        font-size: 13px;
    }
    .danger {
        margin-top: 6px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
    }
    .danger input {
        width: 100%;
        margin: 8px 0;
    }
`;

const List = styled.ul`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;

    li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
    }
    li span:last-child {
        color: var(--text-muted);
        white-space: nowrap;
    }
    p {
        margin: 2px 0 0;
        white-space: pre-wrap;
    }
`;


export function Person({ id, can }: { id: string; can: (p: Permission) => boolean }) {
    const { data, error, reload } = useLoad<Detail>(`/users/${id}`);
    const [typed, setTyped] = useState("");

    async function act(path: string, done: string, method = "POST", body?: unknown) {
        const ok = await run(path, done, { method, body });
        if (ok) reload();
        return ok;
    }

    if (error) return <Problem>{error}</Problem>;
    if (!data) return <Loading />;
    const manual = data.plan === "pro" && data.plan_status === "manual";
    const shared = data.scenes.filter((s) => s.public_slug).length;
    const listed = data.scenes.filter((s) => s.listed && s.public_slug).length;

    return (
        <>
            <Back onClick={() => go("people")}>
                <ArrowLeft size={16} /> People
            </Back>
            <Top>
                <Avatar email={data.email} size={56} />
                <div className="who">
                    <h2>
                        {data.email}
                        <button
                            className="icon"
                            title="Copy email"
                            onClick={() => {
                                void navigator.clipboard?.writeText(data.email).then(
                                    () => toast("Email copied"),
                                    () => toast("Couldn't copy it", "bad"),
                                );
                            }}
                        >
                            <Copy size={16} />
                        </button>
                        <PlanBadge plan={data.plan} status={data.plan_status} />
                        {data.role && <Badge $tone="accent">{ROLES[data.role].label}</Badge>}
                    </h2>
                    <div className="meta">
                        {data.name && <span>{data.name}</span>}
                        <span>Joined {day(data.joined)}</span>
                        <span>Last active {ago(data.active)}</span>
                        {data.plan_renews_at && <span>Renews {day(data.plan_renews_at)}</span>}
                        {data.stripe_customer_id && (
                            <a href={`https://dashboard.stripe.com/customers/${data.stripe_customer_id}`} target="_blank" rel="noopener">
                                Stripe customer <ArrowSquareOut size={12} />
                            </a>
                        )}
                    </div>
                </div>
            </Top>
            <Kpis>
                <Stat label="Scenes" value={data.scenes.length} />
                <Stat label="Shared · on Explore" value={`${shared} · ${listed}`} />
                <Stat label={`Prompts this month (of ${data.promptLimit})`} value={data.promptsThisMonth} />
                <Stat label="Sign-ins in 30 days" value={data.signinsLast30} />
                <Stat label="Signed in on" value={`${data.activeSessions} ${data.activeSessions === 1 ? "device" : "devices"}`} />
            </Kpis>
            <Columns>
                <div>
                    <Panel>
                        <h3>Scenes</h3>
                        {data.scenes.length ? (
                            <Tiles $min={170}>
                                {data.scenes.map((s, i) => (
                                    <SceneTile key={s.id} scene={s} index={i} moderate={can("scenes.moderate") || can("users.manage")} act={(path, done, method) => void act(path, done, method)} />
                                ))}
                            </Tiles>
                        ) : (
                            <NoData>No saved scenes.</NoData>
                        )}
                    </Panel>
                    <Panel>
                        <h3>Feedback from them</h3>
                        {data.feedback.length ? (
                            <List>
                                {data.feedback.map((f) => (
                                    <li key={f.id}>
                                        <span>
                                            <p>{f.message}</p>
                                        </span>
                                        <span>
                                            {when(f.at)} · {f.page ?? "—"}
                                        </span>
                                    </li>
                                ))}
                            </List>
                        ) : (
                            <NoData>None.</NoData>
                        )}
                    </Panel>
                </div>
                <div>
                    <Panel>
                        <h3>Account</h3>
                        <Actions>
                            {can("users.plans") && (
                                <div className="row">
                                    <span>{data.plan === "pro" ? (manual ? "Pro, given by hand" : "Paying for Pro (change it in Stripe)") : "On the free plan"}</span>
                                    {data.plan === "pro" ? (
                                        manual && <Confirm label="Back to Free" sure="Make Free" variant="danger" onConfirm={() => void act(`/users/${id}/plan`, "Moved to Free", "POST", { plan: "free" })} />
                                    ) : (
                                        <Confirm label="Give Pro" sure="Give Pro" onConfirm={() => void act(`/users/${id}/plan`, "Pro given", "POST", { plan: "pro" })} />
                                    )}
                                </div>
                            )}
                            {can("users.manage") && (
                                <>
                                    <div className="row">
                                        <span>{data.promptsThisMonth} prompts used this month</span>
                                        <Confirm label="Reset prompts" sure="Reset" disabled={!data.promptsThisMonth} onConfirm={() => void act(`/users/${id}/usage/reset`, "Prompts reset")} />
                                    </div>
                                    <div className="row">
                                        <span>Signed in on {data.activeSessions} {data.activeSessions === 1 ? "device" : "devices"}</span>
                                        <Confirm label="Sign out everywhere" sure="Sign out" variant="danger" disabled={!data.activeSessions} onConfirm={() => void act(`/users/${id}/signout`, `Signed out on ${data.activeSessions} ${data.activeSessions === 1 ? "device" : "devices"}`)} />
                                    </div>
                                </>
                            )}
                            {can("admins.manage") && data.role !== "superuser" && (
                                <div className="row">
                                    <span>{data.role ? `Admin role: ${ROLES[data.role].label}` : "Not an admin"}</span>
                                    <Button onClick={() => go("admins")}>Change in Admins</Button>
                                </div>
                            )}
                            {can("users.delete") && data.role !== "superuser" && (
                                <div className="danger">
                                    <span>Delete this account and all {data.scenes.length} of their scenes. This can't be undone.</span>
                                    <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type ${data.email} to confirm`} aria-label="Type the email to confirm" />
                                    <Button
                                        $variant="danger"
                                        disabled={typed.trim().toLowerCase() !== data.email}
                                        onClick={() => void act(`/users/${id}`, `Deleted ${data.email}`, "DELETE").then((ok) => ok && go("people"))}
                                    >
                                        Delete account
                                    </Button>
                                </div>
                            )}
                        </Actions>
                    </Panel>
                    <Panel>
                        <h3>Assistant use</h3>
                        {data.usage.length ? (
                            <List>
                                {data.usage.map((u) => (
                                    <li key={u.period}>
                                        <span>{u.period}</span>
                                        <span>
                                            {u.prompts} prompts · {u.steps} steps
                                        </span>
                                    </li>
                                ))}
                            </List>
                        ) : (
                            <NoData>Hasn't used the assistant.</NoData>
                        )}
                    </Panel>
                    <Panel>
                        <h3>Sign-ins</h3>
                        {data.sessions.length ? (
                            <List>
                                {data.sessions.map((s) => (
                                    <li key={s.created_at}>
                                        <span>{when(s.created_at)}</span>
                                        <span>{s.expires_at > Date.now() ? `until ${day(s.expires_at)}` : "ended"}</span>
                                    </li>
                                ))}
                            </List>
                        ) : (
                            <NoData>None kept.</NoData>
                        )}
                    </Panel>
                    <Panel>
                        <h3>Admin activity about them</h3>
                        {data.log.length ? (
                            <List>
                                {data.log.map((l, i) => (
                                    <li key={i}>
                                        <span>
                                            {l.action} · {l.actor}
                                        </span>
                                        <span>{when(l.at)}</span>
                                    </li>
                                ))}
                            </List>
                        ) : (
                            <NoData>None.</NoData>
                        )}
                    </Panel>
                </div>
            </Columns>
        </>
    );
}
