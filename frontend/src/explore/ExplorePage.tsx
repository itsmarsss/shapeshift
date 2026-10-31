import { useEffect, useState, type CSSProperties } from "react";
import styled from "styled-components";
import { Cube, ShareNetwork } from "@phosphor-icons/react";
import { api, type ExploreScene } from "../account/api";
import { SiteShell } from "../site/SiteShell";
import { Container, Empty, PageHead, TileArt, TileCaption, Tiles, tile } from "../site/parts";

const Card = styled.a`
    ${tile}
`;

// Holds the place of a card while the list loads.
const Placeholder = styled.div`
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    background: var(--surface);

    div {
        aspect-ratio: 4 / 3;
        background: var(--surface-raised);
    }
    span {
        display: block;
        height: 12px;
        width: 60%;
        margin: 14px 12px;
        border-radius: 6px;
        background: var(--surface-raised);
    }
    @media (prefers-reduced-motion: no-preference) {
        animation: pulse 1.4s ease-in-out infinite;
    }
    @keyframes pulse {
        50% {
            opacity: 0.55;
        }
    }
`;

const More = styled.button`
    display: block;
    margin: 28px auto 0;
    height: 40px;
    padding: 0 20px;
    border-radius: 10px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;

    &:hover {
        background: var(--surface-hover);
    }
`;

function Thumb({ slug }: { slug: string }) {
    const [broken, setBroken] = useState(false);
    return <TileArt>{broken ? <Cube size={36} /> : <img src={api.publicThumbnailUrl(slug)} alt="" loading="lazy" onError={() => setBroken(true)} />}</TileArt>;
}

// Scenes people chose to share with everyone. Each opens its share page, where
// it can be looked around and remixed into your own editor.
export default function ExplorePage() {
    const [scenes, setScenes] = useState<ExploreScene[]>([]);
    const [next, setNext] = useState<number | null>(null);
    const [state, setState] = useState<"loading" | "ready" | "error">("loading");
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
        <SiteShell page="explore">
            <Container>
                <PageHead>
                    <div>
                        <h1>Explore</h1>
                        <p>Scenes people made and shared. Open one to look around, then remix it into your own.</p>
                    </div>
                </PageHead>
                {state === "loading" && (
                    <Tiles aria-label="Loading scenes">
                        {Array.from({ length: 8 }, (_, i) => (
                            <Placeholder key={i}>
                                <div />
                                <span />
                            </Placeholder>
                        ))}
                    </Tiles>
                )}
                {state === "error" && <Empty>Couldn't load scenes right now. Try again in a moment.</Empty>}
                {state === "ready" && scenes.length === 0 && (
                    <Empty>
                        <ShareNetwork size={32} />
                        <b>Nothing here yet</b>
                        Share a scene from My scenes and tick “Show in Explore” to be the first.
                    </Empty>
                )}
                {scenes.length > 0 && (
                    <Tiles>
                        {scenes.map((s, i) => (
                            <Card key={s.slug} href={`/s/${s.slug}`} style={{ "--i": i } as CSSProperties}>
                                <Thumb slug={s.slug} />
                                <TileCaption>
                                    <b>{s.title}</b>
                                    <small>{s.author ? `by ${s.author}` : "Shared scene"}</small>
                                </TileCaption>
                            </Card>
                        ))}
                    </Tiles>
                )}
                {next !== null && <More onClick={() => void loadMore()}>Show more</More>}
            </Container>
        </SiteShell>
    );
}
