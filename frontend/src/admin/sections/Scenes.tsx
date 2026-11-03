import type { Permission } from "@shapeshift/shared/admin/roles";
import { Select } from "../../components/ui";
import { Tiles } from "../../site/parts";
import { run, useDebounced, useKept, useLoad } from "../nav";
import { SceneTile, type AdminScene } from "../SceneTile";
import { Dim, Header, Loading, Pager, Problem, SearchBox, Toolbar } from "../ui";
import { NoData } from "../charts";

type List = { total: number; page: number; pageSize: number; scenes: AdminScene[] };

export function Scenes({ can }: { can: (p: Permission) => boolean }) {
    const [v, setV] = useKept("scenes", { q: "", shared: "", sort: "updated", page: 0 });
    const set = (change: Partial<typeof v>) => setV({ ...v, page: 0, ...change });
    const q = useDebounced(v.q);
    const { shared, sort, page } = v;
    const params = new URLSearchParams({ q, shared: shared === "shared" ? "yes" : "", listed: shared === "listed" ? "yes" : "", sort, dir: "desc", page: String(page) });
    const { data, error, loading, reload } = useLoad<List>(`/scenes?${params}`);
    const moderate = can("scenes.moderate");

    async function act(path: string, done: string, method = "POST") {
        if (await run(path, done, { method })) reload();
    }

    return (
        <>
            <Header title="Scenes">{data ? `${data.total.toLocaleString()} saved to the cloud` : "Every scene saved to the cloud"}</Header>
            <Toolbar onSubmit={(e) => e.preventDefault()}>
                <SearchBox value={v.q} onChange={(q) => set({ q })} placeholder="Search by title or owner" label="Search scenes" />
                <Select value={shared} onChange={(e) => set({ shared: e.target.value })} aria-label="Sharing">
                    <option value="">All scenes</option>
                    <option value="shared">Shared by link</option>
                    <option value="listed">On Explore</option>
                </Select>
                <Select value={sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort">
                    <option value="updated">Recently changed</option>
                    <option value="created">Newest</option>
                    <option value="size">Largest</option>
                </Select>
            </Toolbar>
            {error && <Problem>{error}</Problem>}
            {!data && !error && <Loading kind="cards" />}
            {data && !data.scenes.length && <NoData>No scenes match.</NoData>}
            {data && data.scenes.length > 0 && (
                <Dim $busy={loading}>
                    <Tiles $min={210}>
                        {data.scenes.map((s, i) => (
                            <SceneTile key={s.id} scene={s} index={i} moderate={moderate} act={(path, done, method) => void act(path, done, method)} />
                        ))}
                    </Tiles>
                    <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setV({ ...v, page })} />
                </Dim>
            )}
        </>
    );
}
