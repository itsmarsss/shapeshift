import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import { ArrowSquareOut, Copy, Cube } from "@phosphor-icons/react";
import { GlobalStyle } from "../components/ui";
import { evaluate } from "../scene/animation";
import { SceneDoc } from "@shapeshift/shared/scene/schema";
import { worldBounds } from "../assistant/assistant";
import { SceneMesh } from "../viewport/SceneMesh";
import { SceneLight } from "../viewport/SceneLight";
import { SceneEnvironment } from "../viewport/SceneEnvironment";
import { REMIX_KEY } from "./remix";


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
            {objects.map((o) => (
                <SceneMesh key={o.id} object={o} selected={false} hovered={false} showSelection={false} onSelect={() => {}} />
            ))}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[200, 200]} />
                <shadowMaterial opacity={0.35} />
            </mesh>
            <CameraControls makeDefault />
            <Frame doc={doc} />
        </>
    );
}

export default function ViewerPage({ slug }: { slug: string }) {
    const [shared, setShared] = useState<Shared | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/public/${slug}`)
            .then(async (res) => {
                const data = (await res.json()) as { title?: string; author?: string | null; doc?: unknown; error?: string };
                if (!res.ok) throw new Error(data.error ?? "This link isn't shared anymore.");
                const doc = SceneDoc.safeParse(data.doc);
                if (!doc.success) throw new Error("This scene couldn't be opened.");
                setShared({ title: data.title ?? "Untitled scene", author: data.author ?? null, doc: doc.data });
                document.title = `${data.title} · ShapeShift`;
            })
            .catch((err) => setError(err instanceof Error ? err.message : "This scene couldn't be opened."));
    }, [slug]);

    function remix() {
        if (!shared) return;
        try {
            localStorage.setItem(REMIX_KEY, JSON.stringify(shared.doc));
        } catch {
            // Too big for storage; open the editor anyway.
        }
        location.href = "/";
    }

    return (
        <Page>
            <GlobalStyle />
            <Bar>
                <img src="/icon.svg" alt="" />
                <div>
                    <b>{shared?.title ?? "ShapeShift"}</b>
                    <small>{shared ? (shared.author ? `by ${shared.author}` : "Shared scene") : error ? "" : "Loading…"}</small>
                </div>
                {shared && (
                    <Action $primary onClick={remix} title="Copy this scene into your own editor">
                        <Copy size={16} />
                        <span>Remix in ShapeShift</span>
                    </Action>
                )}
                <Action href="/" title="Open the editor">
                    <ArrowSquareOut size={16} />
                    <span>Open the editor</span>
                </Action>
            </Bar>
            {shared ? (
                <>
                    <Canvas shadows dpr={[1, 2]} camera={{ position: [4, 3.5, 6], fov: 45, near: 0.05, far: 500 }} style={{ position: "absolute", inset: 0 }}>
                        <Scene doc={shared.doc} />
                    </Canvas>
                    <Hint>Drag to look around · scroll or pinch to zoom</Hint>
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
