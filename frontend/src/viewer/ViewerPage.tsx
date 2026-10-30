import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import { ArrowSquareOut, Check, Code, Copy, Cube } from "@phosphor-icons/react";
import { Button, GlobalStyle } from "../components/ui";
import { evaluate } from "../scene/animation";
import { SceneDoc } from "@shapeshift/shared/scene/schema";
import { worldBounds } from "../assistant/assistant";
import { SceneMesh } from "../viewport/SceneMesh";
import { cutGeometries } from "../scene/holes";
import { SceneLight } from "../viewport/SceneLight";
import { SceneEnvironment } from "../viewport/SceneEnvironment";
import { REMIX_KEY } from "./remix";
import { embedCode } from "./embed";


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

const Action = styled.a<{ $primary?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 12px;
    border-radius: var(--radius);
    border: 1px solid ${(p) => (p.$primary ? "var(--accent)" : "var(--border-strong)")};
    background: ${(p) => (p.$primary ? "var(--accent)" : "transparent")};
    color: ${(p) => (p.$primary ? "var(--accent-text)" : "var(--text)")};
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;

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
        padding: 8px;
        border-radius: var(--radius);
        border: 1px solid var(--border);
        background: var(--bg);
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
`;

type Shared = { title: string; author: string | null; doc: SceneDoc };

// Points the camera at everything in the scene once it loads.
function Frame({ doc }: { doc: SceneDoc }) {
    const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
    useEffect(() => {
        if (!controls || !doc.objects.length) return;
        const box = new THREE.Box3();
        for (const o of doc.objects) {
            const b = worldBounds(o);
            box.expandByPoint(new THREE.Vector3(...b.min)).expandByPoint(new THREE.Vector3(...b.max));
        }
        void controls.fitToBox(box, false, { paddingTop: 0.4, paddingBottom: 0.4, paddingLeft: 0.4, paddingRight: 0.4 });
    }, [controls, doc]);
    return null;
}

function Scene({ doc }: { doc: SceneDoc }) {
    const [time, setTime] = useState(0);
    const animated = doc.animation.tracks.length > 0;
    const clock = useRef(0);
    useFrame((_, delta) => {
        if (!animated) return;
        clock.current += delta;
        const { duration, loop } = doc.animation;
        setTime(loop ? clock.current % duration : Math.min(clock.current, duration));
    });
    const poses = useMemo(() => (animated ? evaluate(doc.animation, time) : new Map()), [animated, doc, time]);
    const objects = doc.objects.map((o) => {
        const p = poses.get(o.id);
        return p ? { ...o, position: p.position ?? o.position, rotation: p.rotation ?? o.rotation, scale: p.scale ?? o.scale, material: p.color ? { ...o.material, color: p.color } : o.material } : o;
    });
    const cuts = cutGeometries(objects);
    const lights = doc.lights.map((l) => {
        const p = poses.get(l.id);
        return p ? { ...l, position: p.position ?? l.position, color: p.color ?? l.color, intensity: p.intensity ?? l.intensity } : l;
    });
    return (
        <>
            <color attach="background" args={["#0d0e10"]} />
            <hemisphereLight args={["#ffffff", "#30333a", lights.length ? 0.35 : 0.7]} />
            {!lights.length && <directionalLight position={[-5, 10, 3]} intensity={1.8} castShadow shadow-mapSize={[2048, 2048]} />}
            {lights.map((l) => (
                <SceneLight key={l.id} light={l} selected={false} showMarker={false} onSelect={() => {}} />
            ))}
            <SceneEnvironment preset={doc.environment} />
            {objects.map((o) =>
                o.hole ? null : <SceneMesh key={o.id} object={o} selected={false} hovered={false} showSelection={false} onSelect={() => {}} cut={cuts.get(o.id)} />
            )}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[200, 200]} />
                <shadowMaterial opacity={0.35} />
            </mesh>
            <CameraControls makeDefault />
            <Frame doc={doc} />
        </>
    );
}

function remixDoc(doc: SceneDoc) {
    try {
        localStorage.setItem(REMIX_KEY, JSON.stringify(doc));
    } catch {
        // Too big for storage; open the editor anyway.
    }
    location.href = "/edit";
}

export default function ViewerPage({ slug }: { slug: string }) {
    const [shared, setShared] = useState<Shared | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showEmbed, setShowEmbed] = useState(false);
    const [copied, setCopied] = useState(false);
    // Shown inside someone else's page: just the scene and a link back.
    const embedded = new URLSearchParams(location.search).has("embed");

    useEffect(() => {
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
    }, [slug]);

    const code = shared ? embedCode(location.origin, slug, shared.title) : "";
    async function copyEmbed() {
        await navigator.clipboard?.writeText(code).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
    }

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
                        <Action $primary onClick={() => remixDoc(shared.doc)} title="Copy this scene into your own editor">
                            <Copy size={16} />
                            <span>Remix in ShapeShift</span>
                        </Action>
                    )}
                    {shared && (
                        <Action onClick={() => setShowEmbed((v) => !v)} title="Show this scene on your own site">
                            <Code size={16} />
                            <span>Embed</span>
                        </Action>
                    )}
                    <Action href="/" title="Open the editor">
                        <ArrowSquareOut size={16} />
                        <span>Open the editor</span>
                    </Action>
                </Bar>
            )}
            {showEmbed && shared && !embedded && (
                <EmbedBox role="dialog" aria-label="Embed this scene">
                    <p>Paste this into your site, blog or class page. People can look around and remix it.</p>
                    <textarea readOnly value={code} aria-label="Embed code" onFocus={(e) => e.target.select()} />
                    <Button $variant="primary" onClick={() => void copyEmbed()}>
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? "Copied" : "Copy embed code"}
                    </Button>
                </EmbedBox>
            )}
            {shared ? (
                <>
                    <Canvas shadows dpr={[1, 2]} camera={{ position: [4, 3.5, 6], fov: 45, near: 0.05, far: 500 }} style={{ position: "absolute", inset: 0 }}>
                        <Scene doc={shared.doc} />
                    </Canvas>
                    {embedded ? (
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
