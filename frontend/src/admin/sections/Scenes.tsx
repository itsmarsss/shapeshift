import { useState } from "react";
import styled from "styled-components";
import { Cube } from "@phosphor-icons/react";
import type { Permission } from "@shapeshift/shared/admin/roles";
import { Button, Input, Select } from "../../components/ui";
import { api } from "../api";
import { ago, bytes, go, useLoad } from "../nav";
import { Badge, Confirm, Header, Pager, Problem, Toolbar } from "../ui";
import { Empty } from "../charts";

type Scene = { id: string; title: string; size: number; created_at: number; updated_at: number; public_slug: string | null; listed: number; owner_id: string; owner: string };
type List = { total: number; page: number; pageSize: number; scenes: Scene[] };

const Cards = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
`;

const Card = styled.div`
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    background: var(--surface);

    .art {
        aspect-ratio: 4 / 3;
        display: grid;
        place-items: center;
        background: var(--surface-raised);
        color: var(--text-faint);
    }
    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .body {
        padding: 10px 12px 12px;
    }
    b {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .owner {
        display: block;
        margin: 2px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
    }
    small {
        display: block;
        color: var(--text-muted);
        margin-bottom: 6px;
    }
    .row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }
    .actions {
        margin-top: 8px;
    }
    .actions button,
    .actions a {
        height: 26px;
        padding: 0 8px;
        font-size: 12px;
    }
`;

function Thumb({ id }: { id: string }) {
    const [broken, setBroken] = useState(false);
    return <div className="art">{broken ? <Cube size={30} /> : <img src={`/api/admin/scenes/${id}/thumbnail`} alt="" loading="lazy" onError={() => setBroken(true)} />}</div>;
}

export function Scenes({ can }: { can: (p: Permission) => boolean }) {
    const [draft, setDraft] = useState("");
    const [q, setQ] = useState("");
    const [shared, setShared] = useState("");
    const [sort, setSort] = useState("updated");
    const [page, setPage] = useState(0);
    const [problem, setProblem] = useState<string | null>(null);
    const params = new URLSearchParams({ q, shared: shared === "shared" ? "yes" : "", listed: shared === "listed" ? "yes" : "", sort, dir: "desc", page: String(page) });
    const { data, error, reload } = useLoad<List>(`/scenes?${params}`);
    const moderate = can("scenes.moderate");

    async function act(path: string, method = "POST") {
        setProblem(null);
        try {
            await api(path, { method });
            reload();
        } catch (e) {
            setProblem(e instanceof Error ? e.message : "That didn't work.");
        }
    }

    return (
        <>
            <Header title="Scenes">{data ? `${data.total.toLocaleString()} saved to the cloud` : "Every scene saved to the cloud"}</Header>
            <Toolbar
                onSubmit={(e) => {
                    e.preventDefault();
                    setQ(draft);
                    setPage(0);
                }}
            >
                <Input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search by title or owner" aria-label="Search scenes" />
                <Select value={shared} onChange={(e) => (setShared(e.target.value), setPage(0))} aria-label="Sharing">
                    <option value="">All scenes</option>
                    <option value="shared">Shared by link</option>
                    <option value="listed">On Explore</option>
                </Select>
                <Select value={sort} onChange={(e) => (setSort(e.target.value), setPage(0))} aria-label="Sort">
                    <option value="updated">Recently changed</option>
                    <option value="created">Newest</option>
                    <option value="size">Largest</option>
                </Select>
                <Button type="submit" $variant="primary">
                    Search
                </Button>
            </Toolbar>
            {(problem || error) && <Problem>{problem ?? error}</Problem>}
            {data && !data.scenes.length && <Empty>No scenes match.</Empty>}
            {data && data.scenes.length > 0 && (
                <>
                    <Cards>
                        {data.scenes.map((s) => (
                            <Card key={s.id}>
                                <Thumb id={s.id} />
                                <div className="body">
                                    <b title={s.title}>{s.title}</b>
                                    <a className="owner" href={`/admin?s=people&id=${s.owner_id}`} onClick={(e) => (e.preventDefault(), go("people", s.owner_id))}>
                                        {s.owner}
                                    </a>
                                    <small>
                                        {ago(s.updated_at)} · {bytes(s.size)}
                                    </small>
                                    <div className="row">
                                        {s.public_slug && <Badge $tone="green">Shared</Badge>}
                                        {s.public_slug && s.listed ? <Badge $tone="accent">On Explore</Badge> : null}
                                    </div>
                                    {moderate && (
                                        <div className="row actions">
                                            {s.public_slug && (
                                                <Button as="a" href={`/s/${s.public_slug}`} target="_blank" rel="noopener">
                                                    View
                                                </Button>
                                            )}
                                            {s.public_slug && s.listed ? <Confirm label="Unlist" sure="Unlist" onConfirm={() => void act(`/scenes/${s.id}/unlist`)} /> : null}
                                            {s.public_slug && <Confirm label="Unshare" sure="Unshare" variant="danger" onConfirm={() => void act(`/scenes/${s.id}/unshare`)} />}
                                            <Confirm label="Delete" sure="Delete it" variant="danger" onConfirm={() => void act(`/scenes/${s.id}`, "DELETE")} />
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </Cards>
                    <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
                </>
            )}
        </>
    );
}
