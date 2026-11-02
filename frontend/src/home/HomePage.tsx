import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import styled from "styled-components";
import { ArrowRight, Cube, Plus, Sparkle } from "@phosphor-icons/react";
import { useAccount } from "../account/store";
import { SceneCard } from "../account/SceneCard";
import { useScene } from "../scene/store";
import { TEMPLATES, buildTemplate } from "../scene/templates";
import { useThumbnails } from "../scene/useThumbnails";
import { editorLinks } from "./links";
import { SiteShell } from "../site/SiteShell";
import { Container, Empty, PrimaryAction, SecondaryAction, SectionHead, TileArt, TileCaption, Tiles, appearing, entering, tile } from "../site/parts";

const HeroScene = lazy(() => import("../landing/HeroScene"));

const IDEAS = ["A cozy cabin by a lake", "A robot that waves", "A tiny solar system", "A castle with four towers"];

// The welcome, with a box to describe what to make next.
const Greeting = styled.section`
    position: relative;
    isolation: isolate;
    margin-bottom: 28px;
    padding: 36px 36px 30px;
    border-radius: 24px;
    border: 1px solid var(--border);
    background:
        radial-gradient(520px 260px at 92% 0%, color-mix(in srgb, #a855f7 20%, transparent), transparent 70%),
        radial-gradient(620px 300px at 0% 100%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 70%),
        var(--surface);
    ${entering}

    .top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
    }
    h1 {
        margin: 0;
        font-size: clamp(28px, 4vw, 40px);
        letter-spacing: -0.03em;
        line-height: 1.1;
    }
    p {
        margin: 8px 0 0;
        color: var(--text-muted);
        font-size: 16px;
    }
    @media (max-width: 640px) {
        padding: 22px 18px 20px;
        border-radius: 18px;
    }
`;

const Ask = styled.form`
    margin-top: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 16px;
    border-radius: 16px;
    border: 1px solid var(--border-strong);
    background: var(--bg);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
    transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;

    &:focus-within {
        border-color: var(--accent);
        box-shadow: 0 0 0 4px var(--accent-soft);
    }
    > svg {
        color: var(--accent);
        flex-shrink: 0;
    }
    input {
        flex: 1;
        min-width: 0;
        height: 44px;
        border: 0;
        outline: 0;
        background: transparent;
        font-size: 16px;
    }
    button {
        height: 44px;
        padding: 0 18px;
        border: 0;
        border-radius: 12px;
        background: var(--accent);
        color: var(--accent-text);
        font-weight: 700;
        white-space: nowrap;
    }
    button:disabled {
        opacity: 0.5;
    }
`;

const Ideas = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;

    a {
        height: 32px;
        padding: 0 12px;
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--surface) 70%, transparent);
        color: var(--text-muted);
        font-size: 13px;
        text-decoration: none;
        transition:
            color 0.15s ease,
            border-color 0.15s ease;
    }
    a:hover {
        color: var(--text);
        border-color: var(--accent);
    }
`;

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
    .art canvas {
        position: absolute !important;
        inset: 0;
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
        // Signed out elsewhere, or the session ran out: back to the front page.
        if (loaded && !user) location.replace("/");
        else if (user) void useAccount.getState().refreshScenes();
    }, [loaded, user]);

    const hasLocal = local.objects.length > 0 || local.lights.length > 0;
    // The scene open on this device first, then the templates.
    const docs = useMemo(() => [hasLocal ? local : null, ...TEMPLATES.map(buildTemplate)], [hasLocal, local]);
    const [localImage, ...templateImages] = useThumbnails(docs);
    const firstName = user?.name?.split(" ")[0];
    const [idea, setIdea] = useState("");

    return (
        <SiteShell page="home">
            <Container>
                <Greeting>
                    <div className="top">
                        <div>
                            <h1>{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</h1>
                            <p>What are we making today?</p>
                        </div>
                        <PrimaryAction href={editorLinks.blank}>
                            <Plus size={16} weight="bold" />
                            New scene
                        </PrimaryAction>
                    </div>
                    <Ask
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (idea.trim()) location.assign(editorLinks.ask(idea.trim()));
                        }}
                    >
                        <Sparkle size={20} weight="fill" />
                        <input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Describe something to build…" aria-label="Describe something to build" />
                        <button type="submit" disabled={!idea.trim()}>
                            Build it
                        </button>
                    </Ask>
                    <Ideas>
                        {IDEAS.map((text) => (
                            <a key={text} href={editorLinks.ask(text)}>
                                {text}
                            </a>
                        ))}
                    </Ideas>
                </Greeting>

                {hasLocal && (
                    <Continue href="/edit" style={{ "--i": 1 } as CSSProperties}>
                        <div className="art">
                            {/* A still picture until the turning 3D view has loaded. */}
                            <Suspense fallback={localImage ? <img src={localImage} alt="" /> : <Cube size={40} />}>
                                <HeroScene doc={local} interactive={false} />
                            </Suspense>
                        </div>
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
