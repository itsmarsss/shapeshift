import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { pulse } from "../ui/keyframes";
import styled from "styled-components";
import { Cube, ShareNetwork } from "@phosphor-icons/react";
import { api, type ExploreScene } from "../account/api";
import { SiteShell } from "../site/SiteShell";
import { Container, Empty, PageHead, SectionHead, TileArt, TileCaption, Tiles, tile } from "../site/parts";
import { buildTemplate } from "../scene/templates";
import { useThumbnails } from "../scene/useThumbnails";
import { SAMPLES } from "./samples";

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
        animation: ${pulse} 1.4s ease-in-out infinite;
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

    const sampleDocs = useMemo(() => SAMPLES.map(buildTemplate), []);
    const samplePictures = useThumbnails(sampleDocs);

    return (
        <SiteShell page="explore">
            <Container>
                <PageHead>
                    <div>
                        <h1>Explore</h1>
                        <p>Open a scene to look around it, then remix it into your own. Start with a few of ours.</p>
                    </div>
                </PageHead>
                <SectionHead style={{ marginTop: 0 }}>
                    <h2>Made by ShapeShift</h2>
                    <span>{SAMPLES.length}</span>
                </SectionHead>
                <Tiles>
                    {SAMPLES.map((sample, i) => (
                        <Card key={sample.id} href={`/explore/${sample.id}`} style={{ "--i": i } as CSSProperties}>
                            <TileArt>{samplePictures[i] ? <img src={samplePictures[i]!} alt="" /> : null}</TileArt>
                            <TileCaption>
                                <b>{sample.name}</b>
                                <small>{sample.blurb}</small>
                            </TileCaption>
                        </Card>
                    ))}
                </Tiles>

                <SectionHead>
                    <h2>From the community</h2>
                    {scenes.length > 0 && <span>{scenes.length}</span>}
                </SectionHead>
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
