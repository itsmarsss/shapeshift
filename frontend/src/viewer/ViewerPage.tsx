import { useEffect, useState } from "react";
import { Action as SiteAction } from "../site/parts";
import { useCopy } from "../ui/hooks";
import styled from "styled-components";
import { ArrowSquareOut, Check, Code, Compass, Copy, Cube } from "@phosphor-icons/react";
import { Button, GlobalStyle, TextArea } from "../components/ui";
import { SceneDoc } from "@shapeshift/shared/scene/schema";
import { REMIX_KEY } from "./remix";
import { SceneView } from "./SceneView";
import { embedCode } from "./embed";
import { SAMPLES } from "../explore/samples";
import { buildTemplate } from "../scene/templates";


const Page = styled.div`
    position: fixed;
    inset: 0;
    background: var(--bg);
`;

const Bar = styled.header`
    position: absolute;
    top: calc(12px + env(safe-area-inset-top, 0px));
    left: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 10px 10px 14px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    backdrop-filter: blur(10px);
    border: 1px solid var(--border);
    border-radius: 14px;
    z-index: 10;

    img {
        width: 28px;
        height: 28px;
    }
    div {
        flex: 1;
        min-width: 0;
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

// Smaller than the site's, to fit the viewer's top bar.
const Action = styled(SiteAction)`
    height: 34px;
    padding: 0 12px;
    gap: 6px;
    font-weight: 500;

    @media (max-width: 520px) {
        span {
            display: none;
        }
    }
`;

const Center = styled.div`
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--text-muted);
    text-align: center;
    gap: 12px;
`;

const Hint = styled.div`
    position: absolute;
    bottom: calc(14px + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    color: var(--text-faint);
    font-size: 12px;
    pointer-events: none;
`;

// The small link in the corner of an embedded scene, so people who see it on
// another site can find their way to making their own.
const Badge = styled.a`
    position: absolute;
    left: 10px;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px 6px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    backdrop-filter: blur(10px);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 12px;
    text-decoration: none;
    z-index: 10;

    img {
        width: 16px;
        height: 16px;
    }
    span {
        color: var(--accent);
        font-weight: 600;
    }
    &:hover {
        border-color: var(--accent);
    }
`;

const EmbedBox = styled.div`
    position: absolute;
    top: calc(76px + env(safe-area-inset-top, 0px));
    right: 12px;
    width: min(380px, calc(100% - 24px));
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
    z-index: 11;

    p {
        margin: 0;
        color: var(--text-muted);
        font-size: 12px;
    }
    textarea {
        height: 86px;
        resize: none;
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
`;

type Shared = { title: string; author: string | null; doc: SceneDoc };

function remixDoc(doc: SceneDoc) {
    try {
        localStorage.setItem(REMIX_KEY, JSON.stringify(doc));
    } catch {
        // Too big for storage; open the editor anyway.
    }
    location.href = "/edit";
}

// A shared scene by its link, or one of the sample projects from Explore.
export default function ViewerPage({ slug, sample }: { slug?: string; sample?: string }) {
    const [shared, setShared] = useState<Shared | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showEmbed, setShowEmbed] = useState(false);
    const { copied, copy } = useCopy();
    // Shown inside someone else's page: just the scene and a link back.
    const embedded = new URLSearchParams(location.search).has("embed");

    useEffect(() => {
        if (sample !== undefined) {
            const found = SAMPLES.find((s) => s.id === sample);
            if (!found) return setError("There's no sample with that name.");
            setShared({ title: found.name, author: "ShapeShift", doc: buildTemplate(found) });
            document.title = `${found.name} · ShapeShift`;
            return;
        }
        fetch(`/api/public/${slug}`)
            .then(async (res) => {
                const data = (await res.json()) as { title?: string; author?: string | null; doc?: unknown; error?: string };
                if (!res.ok) throw new Error(data.error ?? "This link isn't shared anymore.");
                const doc = SceneDoc.safeParse(data.doc);
                if (!doc.success) throw new Error("This scene couldn't be opened.");
                setShared({ title: data.title ?? "Untitled scene", author: data.author ?? null, doc: doc.data });
                // Remix links from an embed open here in a new tab, since an
                // embedded page's storage isn't shared with the editor.
                if (new URLSearchParams(location.search).has("remix")) remixDoc(doc.data);
                document.title = `${data.title} · ShapeShift`;
            })
            .catch((err) => setError(err instanceof Error ? err.message : "This scene couldn't be opened."));
    }, [slug, sample]);

    const code = shared && slug ? embedCode(location.origin, slug, shared.title) : "";
    const copyEmbed = () => copy(code);

    return (
        <Page>
            <GlobalStyle />
            {!embedded && (
                <Bar>
                    <img src="/icon.svg" alt="" />
                    <div>
                        <b>{shared?.title ?? "ShapeShift"}</b>
                        <small>{shared ? (shared.author ? `by ${shared.author}` : "Shared scene") : error ? "" : "Loading…"}</small>
                    </div>
                    {shared && (
                        <Action as="button" type="button" $primary onClick={() => remixDoc(shared.doc)} title="Copy this scene into your own editor">
                            <Copy size={16} />
                            <span>Remix in ShapeShift</span>
                        </Action>
                    )}
                    {shared && slug && (
                        <Action as="button" type="button" onClick={() => setShowEmbed((v) => !v)} title="Show this scene on your own site">
                            <Code size={16} />
                            <span>Embed</span>
                        </Action>
                    )}
                    <Action href="/explore" title="More scenes people have shared">
                        <Compass size={16} />
                        <span>Explore</span>
                    </Action>
                    <Action href="/edit" title="Open the editor">
                        <ArrowSquareOut size={16} />
                        <span>Open the editor</span>
                    </Action>
                </Bar>
            )}
            {showEmbed && shared && !embedded && (
                <EmbedBox role="dialog" aria-label="Embed this scene">
                    <p>Paste this into your site, blog or class page. People can look around and remix it.</p>
                    <TextArea readOnly value={code} aria-label="Embed code" onFocus={(e) => e.target.select()} />
                    <Button $variant="primary" onClick={() => void copyEmbed()}>
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? "Copied" : "Copy embed code"}
                    </Button>
                </EmbedBox>
            )}
            {shared ? (
                <>
                    <SceneView doc={shared.doc} />
                    {embedded && slug ? (
                        <Badge href={`/s/${slug}?remix=1`} target="_blank" rel="noopener" title="Open a copy of this scene in ShapeShift">
                            <img src="/icon.svg" alt="" />
                            Made with ShapeShift · <span>Remix</span>
                        </Badge>
                    ) : (
                        <Hint>Drag to look around · scroll or pinch to zoom</Hint>
                    )}
                </>
            ) : (
                <Center>
                    <div>
                        <Cube size={40} />
                        <p>{error ?? "Loading the scene…"}</p>
                    </div>
                </Center>
            )}
        </Page>
    );
}
