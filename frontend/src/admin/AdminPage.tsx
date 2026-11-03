import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import styled from "styled-components";
import {
    ChartLineUp,
    ChatCircleText,
    Compass,
    Cube,
    Heartbeat,
    ListChecks,
    ShieldCheck,
    Sparkle,
    SquaresFour,
    TrendUp,
    Users,
    type IconProps,
} from "@phosphor-icons/react";
import { ROLES, type Permission, type Role } from "@shapeshift/shared/admin/roles";
import { SiteShell } from "../site/SiteShell";
import { Empty } from "../site/parts";
import { api } from "./api";
import { go, useRoute } from "./nav";
import { Badge } from "./ui";
import { People } from "./sections/People";
import { Person } from "./sections/Person";
import { Scenes } from "./sections/Scenes";
import { Assistant, Dashboard, Growth, Health, Usage } from "./sections/Insights";
import { ActivitySection, AdminsSection, ExploreSection, FeedbackSection } from "./sections/Manage";

// The team's admin page at /admin. The server decides who gets in and what
// each role may do; this shows only the sections the signed-in admin can use.

type Me = { email: string; role: Role; permissions: Permission[] };

const Frame = styled.div`
    width: min(1360px, 100%);
    margin: 0 auto;
    padding: 24px 24px 64px;
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 28px;
    align-items: start;

    @media (max-width: 860px) {
        grid-template-columns: 1fr;
        padding: 16px 16px 48px;
    }
`;

const Side = styled.nav`
    position: sticky;
    top: 84px;
    display: flex;
    flex-direction: column;
    gap: 18px;

    .me {
        padding: 12px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: var(--surface);
        font-size: 12px;
        min-width: 0;
    }
    .me b {
        display: block;
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-bottom: 4px;
    }
    .group > span {
        display: block;
        padding: 0 12px 6px;
        color: var(--text-faint);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    button {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        height: 38px;
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
    button[aria-current="page"] svg {
        color: var(--accent);
    }
    .count {
        margin-left: auto;
        min-width: 20px;
        padding: 0 6px;
        border-radius: 999px;
        background: var(--accent);
        color: var(--accent-text);
        font-size: 11px;
        text-align: center;
    }
    @media (max-width: 860px) {
        position: static;
        flex-direction: row;
        flex-wrap: nowrap;
        overflow-x: auto;
        gap: 6px;

        .me,
        .group > span {
            display: none;
        }
        .group {
            display: flex;
            gap: 2px;
        }
        button {
            width: auto;
            white-space: nowrap;
        }
    }
`;

type Section = { id: string; label: string; Icon: ComponentType<IconProps>; needs: Permission | Permission[] };

const GROUPS: { title: string; sections: Section[] }[] = [
    {
        title: "Insights",
        sections: [
            { id: "dashboard", label: "Dashboard", Icon: SquaresFour, needs: "overview" },
            { id: "growth", label: "Growth", Icon: TrendUp, needs: "metrics" },
            { id: "usage", label: "Usage", Icon: ChartLineUp, needs: "metrics" },
            { id: "assistant", label: "Assistant", Icon: Sparkle, needs: "metrics" },
            { id: "health", label: "Health", Icon: Heartbeat, needs: "metrics" },
        ],
    },
    {
        title: "Manage",
        sections: [
            { id: "people", label: "People", Icon: Users, needs: "users.read" },
            { id: "scenes", label: "Scenes", Icon: Cube, needs: ["scenes.moderate", "users.read"] },
            { id: "feedback", label: "Feedback", Icon: ChatCircleText, needs: "feedback.read" },
            { id: "explore", label: "Explore", Icon: Compass, needs: "explore.moderate" },
        ],
    },
    {
        title: "Team",
        sections: [
            { id: "admins", label: "Admins", Icon: ShieldCheck, needs: "admins.manage" },
            { id: "activity", label: "Activity", Icon: ListChecks, needs: "admins.manage" },
        ],
    },
];

export default function AdminPage() {
    const [me, setMe] = useState<Me | null | false>(null);
    const [unread, setUnread] = useState(0);
    const route = useRoute();

    const refreshUnread = () =>
        void api<{ attention: { unread: number } }>("/dashboard")
            .then((d) => setUnread(d.attention.unread))
            .catch(() => {});
    useEffect(() => {
        document.title = "Admin · ShapeShift";
        api<Me>("/me")
            .then((m) => {
                setMe(m);
                if (m.permissions.includes("overview")) refreshUnread();
            })
            .catch(() => setMe(false));
    }, []);

    if (me === null) return <SiteShell page="admin" wide>{null}</SiteShell>;
    if (me === false)
        return (
            <SiteShell page="admin" wide>
                <Frame style={{ display: "block" }}>
                    <Empty>
                        <b>Page not found</b>
                        <a href="/">Back to ShapeShift</a>
                    </Empty>
                </Frame>
            </SiteShell>
        );

    const can = (p: Permission) => me.permissions.includes(p);
    const allowed = (s: Section) => (Array.isArray(s.needs) ? s.needs.some(can) : can(s.needs));
    const groups = GROUPS.map((g) => ({ ...g, sections: g.sections.filter(allowed) })).filter((g) => g.sections.length);
    const all = groups.flatMap((g) => g.sections);
    const current = all.find((s) => s.id === route.s) ?? all[0];

    let body: ReactNode = null;
    switch (current?.id) {
        case "dashboard":
            body = <Dashboard can={can} />;
            break;
        case "growth":
            body = <Growth />;
            break;
        case "usage":
            body = <Usage />;
            break;
        case "assistant":
            body = <Assistant />;
            break;
        case "health":
            body = <Health />;
            break;
        case "people":
            body = route.id ? <Person key={route.id} id={route.id} can={can} /> : <People />;
            break;
        case "scenes":
            body = <Scenes can={can} />;
            break;
        case "feedback":
            body = <FeedbackSection canManage={can("feedback.manage")} onChange={refreshUnread} />;
            break;
        case "explore":
            body = <ExploreSection />;
            break;
        case "admins":
            body = <AdminsSection me={me.email} />;
            break;
        case "activity":
            body = <ActivitySection />;
            break;
    }

    return (
        <SiteShell page="admin" wide>
            <Frame>
                <Side aria-label="Admin sections">
                    <div className="me">
                        <b title={me.email}>{me.email}</b>
                        <Badge $tone={me.role === "superuser" ? "accent" : "plain"}>{ROLES[me.role].label}</Badge>
                    </div>
                    {groups.map((g) => (
                        <div className="group" key={g.title}>
                            <span>{g.title}</span>
                            {g.sections.map((s) => (
                                <button key={s.id} aria-current={s.id === current?.id ? "page" : undefined} onClick={() => go(s.id)}>
                                    <s.Icon size={18} />
                                    {s.label}
                                    {s.id === "feedback" && unread > 0 && <span className="count">{unread}</span>}
                                </button>
                            ))}
                        </div>
                    ))}
                </Side>
                <main>{body}</main>
            </Frame>
        </SiteShell>
    );
}
