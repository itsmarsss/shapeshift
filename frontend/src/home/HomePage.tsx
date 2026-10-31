import { useEffect, useMemo, type CSSProperties } from "react";
import styled from "styled-components";
import { ArrowRight, Cube, Plus } from "@phosphor-icons/react";
import { useAccount } from "../account/store";
import { SceneCard } from "../account/SceneCard";
import { useScene } from "../scene/store";
import { TEMPLATES, buildTemplate } from "../scene/templates";
import { useThumbnails } from "../scene/useThumbnails";
import { editorLinks } from "./links";
import { SiteShell } from "../site/SiteShell";
import { Container, Empty, PageHead, PrimaryAction, SecondaryAction, SectionHead, TileArt, TileCaption, Tiles, appearing, entering, tile } from "../site/parts";

// The scene that's open in the editor on this device, front and centre.
const Continue = styled.a`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    border: 1px solid var(--border);
    border-radius: 18px;
    overflow: hidden;
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    ${entering}

    &:hover {
        border-color: var(--border-strong);
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.12);
    }
    .art {
        position: relative;
        aspect-ratio: 2 / 1;
        background: linear-gradient(160deg, var(--surface-raised), var(--surface-hover));
        display: grid;
        place-items: center;
        color: var(--text-faint);
    }
    .art img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        ${appearing}
    }
    .text {
        padding: 28px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 6px;
        min-width: 0;
    }
    .kicker {
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    b {
        font-size: 20px;
        letter-spacing: -0.015em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    small {
        color: var(--text-muted);
        font-size: 13px;
    }
    .go {
        margin-top: 14px;
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 38px;
        padding: 0 16px;
        border-radius: 10px;
        background: var(--accent);
        color: var(--accent-text);
        font-weight: 600;
    }
    &:hover .go svg {
        transform: translateX(2px);
    }
    .go svg {
        transition: transform 0.15s ease;
    }

    @media (max-width: 640px) {
        grid-template-columns: 1fr;

        .art {
            aspect-ratio: 16 / 10;
        }
        .text {
            padding: 16px 16px 18px;
        }
        b {
            font-size: 17px;
        }
    }
`;

const Starter = styled.a<{ $blank?: boolean }>`
    ${tile}
    ${(p) => p.$blank && "border-style: dashed; border-color: var(--border-strong);"}

    ${TileArt} {
        color: ${(p) => (p.$blank ? "var(--accent)" : "var(--text-faint)")};
        background: ${(p) => (p.$blank ? "var(--surface)" : "")};
    }
`;

// The first page a signed-in person sees: their saved scenes and ways to
// start a new one, instead of being dropped into whatever was open last.
export default function HomePage() {
    const user = useAccount((s) => s.user);
    const loaded = useAccount((s) => s.loaded);
    const scenes = useAccount((s) => s.scenes);
    const cloudId = useAccount((s) => s.cloudId);
    const cloudTitle = useAccount((s) => s.cloudTitle);
    const error = useAccount((s) => s.saveError);
    const local = useScene((s) => s.doc);

    useEffect(() => {
        // Signed out elsewhere, or the session ran out: go straight to the editor.
        if (loaded && !user) location.replace("/edit");
        else if (user) void useAccount.getState().refreshScenes();
    }, [loaded, user]);

    const hasLocal = local.objects.length > 0 || local.lights.length > 0;
    // The scene open on this device first, then the templates.
    const docs = useMemo(() => [hasLocal ? local : null, ...TEMPLATES.map(buildTemplate)], [hasLocal, local]);
    const [localImage, ...templateImages] = useThumbnails(docs);
    const firstName = user?.name?.split(" ")[0];

    return (
        <SiteShell page="home">
            <Container>
                <PageHead>
                    <div>
                        <h1>{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</h1>
                        <p>Pick up where you left off, or start something new.</p>
                    </div>
                    <PrimaryAction href={editorLinks.blank}>
                        <Plus size={16} weight="bold" />
                        New scene
                    </PrimaryAction>
                </PageHead>

                {hasLocal && (
                    <Continue href="/edit" style={{ "--i": 1 } as CSSProperties}>
                        <div className="art">{localImage ? <img src={localImage} alt="" /> : <Cube size={40} />}</div>
                        <div className="text">
                            <span className="kicker">Continue</span>
                            <b>{cloudId ? cloudTitle || "Untitled scene" : "Your last scene"}</b>
                            <small>{cloudId ? "Saved to the cloud" : "Only on this device, not saved to the cloud yet"}</small>
                            <span className="go">
                                Open it
                                <ArrowRight size={16} weight="bold" />
                            </span>
                        </div>
                    </Continue>
                )}

                <SectionHead>
                    <h2>Start from a template</h2>
                </SectionHead>
                <Tiles $min={180}>
                    <Starter href={editorLinks.blank} $blank style={{ "--i": 2 } as CSSProperties}>
                        <TileArt>
                            <Plus size={34} />
                        </TileArt>
                        <TileCaption>
                            <b>Blank scene</b>
                            <small>An empty stage</small>
                        </TileCaption>
                    </Starter>
                    {TEMPLATES.map((t, i) => (
                        <Starter key={t.id} href={editorLinks.template(t.id)} title={t.blurb} style={{ "--i": i + 3 } as CSSProperties}>
                            <TileArt>{templateImages[i] ? <img src={templateImages[i]!} alt="" /> : null}</TileArt>
                            <TileCaption>
                                <b>{t.name}</b>
                                <small>{t.blurb}</small>
                            </TileCaption>
                        </Starter>
                    ))}
                </Tiles>

                <SectionHead>
                    <h2>Your scenes</h2>
                    {scenes.length > 0 && <span>{scenes.length}</span>}
                </SectionHead>
                {scenes.length ? (
                    <Tiles $min={200}>
                        {scenes.map((s, i) => (
                            <SceneCard key={s.id} scene={s} index={i} onOpen={() => location.assign(editorLinks.scene(s.id))} />
                        ))}
                    </Tiles>
                ) : (
                    <Empty>
                        <Cube size={32} />
                        <b>{error && loaded ? "Couldn't load your scenes" : "No saved scenes yet"}</b>
                        {error && loaded ? error : "Scenes you save to the cloud show up here, on any device you sign in on."}
                        <SecondaryAction href="/edit">Open the editor</SecondaryAction>
                    </Empty>
                )}
            </Container>
        </SiteShell>
    );
}
