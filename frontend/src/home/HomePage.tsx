import { useEffect, useMemo } from "react";
import styled from "styled-components";
import { ArrowRight, Cube, Plus, SignOut } from "@phosphor-icons/react";
import { GlobalStyle } from "../components/ui";
import { useResolvedTheme } from "../settings/theme";
import { useAccount } from "../account/store";
import { Grid, SceneCard } from "../account/SceneCard";
import { useScene } from "../scene/store";
import { TEMPLATES, buildTemplate } from "../scene/templates";
import { renderThumbnail } from "../scene/thumbnail";
import { editorLinks } from "./links";

const Page = styled.div`
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
`;

const Header = styled.header`
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 10px;
    height: calc(56px + env(safe-area-inset-top, 0px));
    padding: env(safe-area-inset-top, 0px) 20px 0;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);

    img {
        width: 26px;
        height: 26px;
    }
    b {
        flex: 1;
        font-size: 15px;
    }
    small {
        color: var(--text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }
    button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 10px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: transparent;
        color: var(--text);
        white-space: nowrap;
    }
`;

const Main = styled.main`
    width: min(1080px, 100%);
    margin: 0 auto;
    padding: 28px 20px 48px;

    h1 {
        margin: 0 0 24px;
        font-size: 26px;
        letter-spacing: -0.01em;
    }
    h2 {
        margin: 32px 0 12px;
        font-size: 15px;
        color: var(--text-muted);
        font-weight: 600;
    }
`;

const Starters = styled.div`
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(150px, 1fr);
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: thin;
`;

const Starter = styled.a<{ $primary?: boolean }>`
    display: flex;
    flex-direction: column;
    border: 1px solid ${(p) => (p.$primary ? "var(--accent)" : "var(--border)")};
    border-radius: 12px;
    overflow: hidden;
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    transition: border-color 0.12s ease, transform 0.12s ease;

    &:hover {
        border-color: var(--accent);
        transform: translateY(-1px);
    }
    img,
    .art {
        width: 100%;
        aspect-ratio: 4 / 3;
        object-fit: cover;
        display: grid;
        place-items: center;
        background: var(--surface-raised);
        color: ${(p) => (p.$primary ? "var(--accent)" : "var(--text-faint)")};
    }
    span {
        padding: 8px 10px 10px;
        font-weight: 600;
        font-size: 13px;
    }
`;

const Continue = styled.a`
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    color: var(--text);
    text-decoration: none;

    img {
        width: 120px;
        aspect-ratio: 4 / 3;
        object-fit: cover;
        border-radius: 8px;
        background: var(--surface-raised);
    }
    div {
        flex: 1;
        min-width: 0;
    }
    b {
        display: block;
    }
    small {
        color: var(--text-muted);
    }
    > svg {
        color: var(--accent);
        flex-shrink: 0;
        margin-right: 6px;
    }
    &:hover {
        border-color: var(--accent);
    }
`;

const Empty = styled.div`
    padding: 36px 16px;
    border: 1px dashed var(--border-strong);
    border-radius: 14px;
    text-align: center;
    color: var(--text-muted);
    line-height: 1.6;
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
    const theme = useResolvedTheme();

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);
    useEffect(() => {
        void useAccount.getState().load();
    }, []);
    useEffect(() => {
        // Signed out elsewhere, or the session ran out: go straight to the editor.
        if (loaded && !user) location.replace("/edit");
        else if (user) void useAccount.getState().refreshScenes();
    }, [loaded, user]);

    const templateImages = useMemo(() => TEMPLATES.map((t) => renderThumbnail(buildTemplate(t))), []);
    const hasLocal = local.objects.length > 0 || local.lights.length > 0;
    const localImage = useMemo(() => (hasLocal ? renderThumbnail(local) : null), [hasLocal, local]);
    const firstName = user?.name?.split(" ")[0];

    return (
        <Page>
            <GlobalStyle />
            <Header>
                <img src="/icon.svg" alt="" />
                <b>ShapeShift</b>
                {user && <small>{user.email}</small>}
                {user && (
                    <button onClick={() => void useAccount.getState().signOut().then(() => location.replace("/edit"))}>
                        <SignOut size={16} />
                        Sign out
                    </button>
                )}
            </Header>
            <Main>
                <h1>{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</h1>

                {hasLocal && (
                    <>
                        <h2>Pick up where you left off</h2>
                        <Continue href="/edit">
                            {localImage ? <img src={localImage} alt="" /> : <span />}
                            <div>
                                <b>{cloudId ? cloudTitle || "Untitled scene" : "Your last scene"}</b>
                                <small>{cloudId ? "Saved to the cloud" : "Only on this device, not saved to the cloud yet"}</small>
                            </div>
                            <ArrowRight size={20} />
                        </Continue>
                    </>
                )}

                <h2>Start something new</h2>
                <Starters>
                    <Starter href={editorLinks.blank} $primary>
                        <span className="art">
                            <Plus size={36} />
                        </span>
                        <span>Blank scene</span>
                    </Starter>
                    {TEMPLATES.map((t, i) => (
                        <Starter key={t.id} href={editorLinks.template(t.id)} title={t.blurb}>
                            {templateImages[i] ? <img src={templateImages[i]!} alt="" /> : <span className="art" />}
                            <span>{t.name}</span>
                        </Starter>
                    ))}
                </Starters>

                <h2>Your scenes{scenes.length ? ` · ${scenes.length}` : ""}</h2>
                {scenes.length ? (
                    <Grid>
                        {scenes.map((s) => (
                            <SceneCard key={s.id} scene={s} onOpen={() => location.assign(editorLinks.scene(s.id))} />
                        ))}
                    </Grid>
                ) : (
                    <Empty>
                        <Cube size={32} />
                        <br />
                        {error && loaded ? error : "Scenes you save to the cloud show up here, on any device you sign in on."}
                    </Empty>
                )}
            </Main>
        </Page>
    );
}
