import { useEffect, useState } from "react";
import styled from "styled-components";
import { ArrowLeft, Compass, Cube } from "@phosphor-icons/react";
import { GlobalStyle } from "../components/ui";
import { useResolvedTheme } from "../settings/theme";
import { api, type ExploreScene } from "../account/api";
import { seemsSignedIn } from "../account/store";

const Page = styled.div`
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    color: var(--text);
`;

const Header = styled.header`
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 12px;
    height: calc(56px + env(safe-area-inset-top, 0px));
    padding: env(safe-area-inset-top, 0px) 20px 0;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);

    a {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--text-muted);
        text-decoration: none;
    }
    a:hover {
        color: var(--text);
    }
`;

const Main = styled.main`
    width: min(1080px, 100%);
    margin: 0 auto;
    padding: 28px 20px 48px;

    h1 {
        margin: 0 0 6px;
        font-size: 26px;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    > p {
        margin: 0 0 24px;
        color: var(--text-muted);
    }
`;

const Grid = styled.div`
    display: grid;
    // Two across on phones, more on wider screens.
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 14px;
`;

const Card = styled.a`
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    transition: border-color 0.12s ease, transform 0.12s ease;

    &:hover {
        border-color: var(--accent);
        transform: translateY(-1px);
    }
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
        display: block;
    }
    div:last-child {
        padding: 10px 12px 12px;
    }
    b {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    small {
        color: var(--text-muted);
    }
`;

const More = styled.button`
    display: block;
    margin: 24px auto 0;
    height: 38px;
    padding: 0 18px;
    border-radius: var(--radius);
    border: 1px solid var(--border-strong);
    background: transparent;
    color: var(--text);
    font-weight: 500;
`;

const Empty = styled.div`
    padding: 48px 16px;
    border: 1px dashed var(--border-strong);
    border-radius: 14px;
    text-align: center;
    color: var(--text-muted);
    line-height: 1.6;
`;

function Thumb({ slug }: { slug: string }) {
    const [broken, setBroken] = useState(false);
    return <div className="art">{broken ? <Cube size={36} /> : <img src={api.publicThumbnailUrl(slug)} alt="" loading="lazy" onError={() => setBroken(true)} />}</div>;
}

// Scenes people chose to share with everyone. Each opens its share page, where
// it can be looked around and remixed into your own editor.
export default function ExplorePage() {
    const [scenes, setScenes] = useState<ExploreScene[]>([]);
    const [next, setNext] = useState<number | null>(null);
    const [state, setState] = useState<"loading" | "ready" | "error">("loading");
    const theme = useResolvedTheme();

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);
    useEffect(() => {
        document.title = "Explore · ShapeShift";
        api.explore()
            .then((page) => {
                setScenes(page.scenes);
                setNext(page.next);
                setState("ready");
            })
            .catch(() => setState("error"));
    }, []);

    async function loadMore() {
        if (next === null) return;
        const page = await api.explore(next).catch(() => null);
        if (!page) return;
        setScenes((s) => [...s, ...page.scenes]);
        setNext(page.next);
    }

    return (
        <Page>
            <GlobalStyle />
            <Header>
                <a href={seemsSignedIn() ? "/" : "/edit"}>
                    <ArrowLeft size={16} />
                    {seemsSignedIn() ? "Your scenes" : "Back to the editor"}
                </a>
            </Header>
            <Main>
                <h1>
                    <Compass size={26} /> Explore
                </h1>
                <p>Scenes people made and shared. Open one to look around, then remix it into your own.</p>
                {state === "loading" && <Empty>Loading…</Empty>}
                {state === "error" && <Empty>Couldn't load scenes right now. Try again in a moment.</Empty>}
                {state === "ready" && scenes.length === 0 && (
                    <Empty>
                        Nothing here yet.
                        <br />
                        Share a scene from My scenes and tick “Show in Explore” to be the first.
                    </Empty>
                )}
                {scenes.length > 0 && (
                    <Grid>
                        {scenes.map((s) => (
                            <Card key={s.slug} href={`/s/${s.slug}`}>
                                <Thumb slug={s.slug} />
                                <div>
                                    <b>{s.title}</b>
                                    <small>{s.author ? `by ${s.author}` : "Shared scene"}</small>
                                </div>
                            </Card>
                        ))}
                    </Grid>
                )}
                {next !== null && <More onClick={() => void loadMore()}>Show more</More>}
            </Main>
        </Page>
    );
}
