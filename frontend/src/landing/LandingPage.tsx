import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import styled, { keyframes } from "styled-components";
import { ArrowRight, CaretDown, HandGrabbing, Microphone } from "@phosphor-icons/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Story } from "./Story";
import { HandDemo } from "./HandDemo";
import { useAccount } from "../account/store";
import { TEMPLATES, buildTemplate } from "../scene/templates";
import { LIBRARY, libraryPreview } from "../scene/library";
import { useThumbnails } from "../scene/useThumbnails";
import { editorLinks } from "../home/links";
import { SiteShell } from "../site/SiteShell";
import { PrimaryAction, SecondaryAction, TileArt, TileCaption, Tiles, entering, tile } from "../site/parts";

const HeroScene = lazy(() => import("./HeroScene"));

// What the hero's 3D window cycles through.
const SHOWCASE = [
    buildTemplate(TEMPLATES.find((t) => t.id === "cabin")!),
    libraryPreview(LIBRARY.find((i) => i.id === "rocket")!),
    buildTemplate(TEMPLATES.find((t) => t.id === "snowman")!),
    libraryPreview(LIBRARY.find((i) => i.id === "car")!),
];
const SHOWCASE_MS = 7000;
const FADE_MS = 350;

const WAYS = ["your hands.", "your voice.", "a sentence.", "a mouse."];
const WAY_MS = 2400;

// clip rather than hidden, which would stop the story's sticky scene from sticking.
const Wrap = styled.div`
    overflow-x: clip;
`;

const Hero = styled.section`
    position: relative;
    isolation: isolate;

    // Soft colour behind the top of the page.
    &::before {
        content: "";
        position: absolute;
        inset: -60px 0 0;
        z-index: -1;
        background:
            radial-gradient(700px 420px at 78% 30%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%),
            radial-gradient(600px 400px at 12% 10%, color-mix(in srgb, #a855f7 16%, transparent), transparent 70%);
        pointer-events: none;
    }
`;

const HeroInner = styled.div`
    // The first screen, less a strip at the bottom where the story peeks in,
    // but no taller than the content needs on a tall screen.
    min-height: min(calc(100svh - 60px - 140px), 660px);
    width: min(1120px, 100%);
    margin: 0 auto;
    padding: 64px 24px 72px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
    align-items: center;
    gap: 48px;

    @media (max-width: 900px) {
        min-height: 0;
        grid-template-columns: 1fr;
        gap: 36px;
        padding: 36px 16px 48px;
    }
`;

const nudge = keyframes`
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(5px); }
`;

// Points down to the story.
const More = styled.button`
    position: absolute;
    left: 50%;
    bottom: 18px;
    translate: -50% 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    font-weight: 600;
    font-size: 13px;

    &:hover {
        color: var(--text);
    }
    svg {
        @media (prefers-reduced-motion: no-preference) {
            animation: ${nudge} 1.6s ease-in-out infinite;
        }
    }
    @media (max-width: 900px) {
        display: none;
    }
`;

const Copy = styled.div`
    ${entering}

    h1 {
        margin: 18px 0 18px;
        font-size: clamp(38px, 5.6vw, 62px);
        line-height: 1.02;
        letter-spacing: -0.035em;
    }
    p {
        margin: 0;
        max-width: 480px;
        color: var(--text-muted);
        font-size: 17px;
        line-height: 1.55;
    }
`;

const Eyebrow = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    color: var(--text);
    font-size: 13px;
    font-weight: 600;

    svg {
        color: var(--accent);
    }
`;

const swap = keyframes`
    from {
        opacity: 0;
        transform: translateY(0.35em);
        filter: blur(4px);
    }
`;

// The changing end of the headline.
const Way = styled.span`
    display: block;
    background: linear-gradient(90deg, var(--accent), #a855f7 60%, #ec4899);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    padding-bottom: 0.08em;

    @media (prefers-reduced-motion: no-preference) {
        animation: ${swap} 0.45s cubic-bezier(0.22, 1, 0.36, 1);
    }
`;

const Ctas = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 28px;

    a {
        height: 48px;
        padding: 0 22px;
        font-size: 15px;
        border-radius: 12px;
    }
    a:first-child {
        box-shadow: 0 10px 30px color-mix(in srgb, var(--accent) 35%, transparent);
    }
`;

const Small = styled.div`
    margin-top: 16px;
    color: var(--text-faint);
    font-size: 13px;
`;

const bob = keyframes`
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
`;

// A window onto the editor with a live scene in it.
const Window = styled.div`
    position: relative;
    aspect-ratio: 5 / 4;
    border-radius: 22px;
    border: 1px solid var(--border-strong);
    background: linear-gradient(170deg, var(--surface), var(--surface-raised));
    box-shadow:
        0 40px 80px -20px rgba(0, 0, 0, 0.35),
        0 0 0 8px color-mix(in srgb, var(--surface) 50%, transparent);
    ${entering}
    --i: 2;

    canvas {
        border-radius: 22px;
        touch-action: pan-y;
    }
`;

const Scene = styled.div`
    position: absolute;
    inset: 0;
    transition: opacity ${FADE_MS}ms ease;
`;

const Chrome = styled.div`
    position: absolute;
    top: 14px;
    left: 16px;
    z-index: 1;
    display: flex;
    gap: 6px;

    i {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--border-strong);
    }
`;

const Chip = styled.div`
    position: absolute;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    pointer-events: none;

    svg {
        color: var(--accent);
    }
    @media (prefers-reduced-motion: no-preference) {
        animation: ${bob} 4s ease-in-out infinite;
    }
    @media (max-width: 520px) {
        font-size: 12px;
        padding: 7px 11px;
    }
`;

const Section = styled.section`
    width: min(1120px, 100%);
    margin: 0 auto;
    padding: 72px 24px;

    > h2 {
        margin: 0 auto 10px;
        max-width: 640px;
        text-align: center;
        font-size: clamp(26px, 3.4vw, 36px);
        letter-spacing: -0.025em;
    }
    > p {
        margin: 0 auto 40px;
        max-width: 560px;
        text-align: center;
        color: var(--text-muted);
        font-size: 16px;
        line-height: 1.55;
    }
    @media (max-width: 640px) {
        padding: 48px 16px;
    }
`;

const Template = styled.a`
    ${tile}
`;

const Band = styled.section`
    width: min(1072px, calc(100% - 48px));
    margin: 24px auto 72px;
    padding: 56px 24px;
    border-radius: 28px;
    text-align: center;
    color: #fff;
    background:
        radial-gradient(500px 260px at 85% 0%, rgba(236, 72, 153, 0.45), transparent 70%),
        radial-gradient(600px 300px at 10% 100%, rgba(168, 85, 247, 0.5), transparent 70%),
        var(--accent);

    h2 {
        margin: 0 0 10px;
        font-size: clamp(26px, 3.6vw, 38px);
        letter-spacing: -0.025em;
    }
    p {
        margin: 0 0 26px;
        opacity: 0.85;
        font-size: 16px;
    }
    a {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 48px;
        padding: 0 24px;
        border-radius: 12px;
        background: #fff;
        color: #111;
        font-weight: 700;
        text-decoration: none;
    }
    @media (max-width: 640px) {
        width: calc(100% - 32px);
        padding: 40px 20px;
    }
`;

// Shows the four ways to build, one after another.
function useCycle(count: number, ms: number) {
    const [index, setIndex] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setIndex((i) => (i + 1) % count), ms);
        return () => clearInterval(timer);
    }, [count, ms]);
    return index;
}

const at = (i: number) => ({ "--i": i }) as CSSProperties;

// The front page for people without an account. Signed-in people get their
// scenes instead (see App), and anyone can head straight into the editor.
export default function LandingPage() {
    const user = useAccount((s) => s.user);
    const way = useCycle(WAYS.length, WAY_MS);
    // The hero fades out, swaps scene and fades back in.
    const [shown, setShown] = useState(0);
    const [fading, setFading] = useState(false);
    useEffect(() => {
        let swap = 0;
        const timer = setInterval(() => {
            setFading(true);
            swap = window.setTimeout(() => {
                setShown((i) => (i + 1) % SHOWCASE.length);
                setFading(false);
            }, FADE_MS);
        }, SHOWCASE_MS);
        return () => {
            clearInterval(timer);
            clearTimeout(swap);
        };
    }, []);
    const templateDocs = useMemo(() => TEMPLATES.map(buildTemplate), []);
    const pictures = useThumbnails(templateDocs);

    // Signed in after all (on another tab, or with this page open): their scenes.
    useEffect(() => {
        if (user) location.replace("/");
    }, [user]);
    useEffect(() => {
        document.title = "ShapeShift · Build in 3D with your hands";
    }, []);

    // Sections rise into place as they scroll into view.
    const wrap = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = wrap.current;
        if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        gsap.registerPlugin(ScrollTrigger);
        const scroller = el.closest<HTMLElement>("[data-scroller]") ?? undefined;
        const ctx = gsap.context(() => {
            for (const target of gsap.utils.toArray<HTMLElement>("[data-reveal]")) {
                gsap.from(target.children, {
                    y: 48,
                    opacity: 0,
                    duration: 0.9,
                    ease: "power3.out",
                    stagger: 0.08,
                    scrollTrigger: { trigger: target, scroller, start: "top 82%", once: true },
                });
            }
        }, el);
        return () => ctx.revert();
    }, []);

    return (
        <SiteShell page="landing">
            <Wrap ref={wrap}>
                <Hero>
                    <HeroInner>
                        <Copy>
                            <Eyebrow>
                                <HandGrabbing size={16} weight="bold" />
                                Hand tracking, right in your browser
                            </Eyebrow>
                            <h1>
                                Build in 3D with
                                <Way key={way}>{WAYS[way]}</Way>
                            </h1>
                            <p>
                                ShapeShift is a 3D editor for everyone. Pinch to grab, say what you want and watch it appear, then print it, animate it or share
                                it.
                            </p>
                            <Ctas>
                                <PrimaryAction href="/edit">
                                    Start creating, free
                                    <ArrowRight size={18} weight="bold" />
                                </PrimaryAction>
                                <SecondaryAction href="/explore">See what people made</SecondaryAction>
                            </Ctas>
                            <Small>No sign-up · Nothing to install · Works with any webcam</Small>
                        </Copy>
                        <Window>
                            <Chrome aria-hidden>
                                <i />
                                <i />
                                <i />
                            </Chrome>
                            <Scene style={{ opacity: fading ? 0 : 1 }}>
                                <Suspense fallback={null}>
                                    <HeroScene doc={SHOWCASE[shown]} />
                                </Suspense>
                            </Scene>
                            <Chip style={{ top: "14%", left: "-4%" }} aria-hidden>
                                <HandGrabbing size={18} weight="fill" />
                                Pinch to grab
                            </Chip>
                            <Chip style={{ bottom: "12%", right: "-3%", animationDelay: "-2s" }} aria-hidden>
                                <Microphone size={18} weight="fill" />
                                “Add a red roof”
                            </Chip>
                        </Window>
                    </HeroInner>
                    <More
                        onClick={() =>
                            document.querySelector('[aria-label="How it works"]')?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
                        }
                    >
                        See how it works
                        <CaretDown size={16} weight="bold" />
                    </More>
                </Hero>

                <Story />
                <HandDemo />

                <Section data-reveal>
                    <h2>Start from something</h2>
                    <p>Open a template and make it yours.</p>
                    <Tiles $min={190}>
                        {TEMPLATES.map((t, i) => (
                            <Template key={t.id} href={editorLinks.template(t.id)} style={at(i)}>
                                <TileArt>{pictures[i] ? <img src={pictures[i]!} alt="" /> : null}</TileArt>
                                <TileCaption>
                                    <b>{t.name}</b>
                                    <small>{t.blurb}</small>
                                </TileCaption>
                            </Template>
                        ))}
                    </Tiles>
                </Section>

                <Band data-reveal>
                    <h2>Your first scene takes a minute</h2>
                    <p>Free, in your browser, no account needed.</p>
                    <a href="/edit">
                        Start creating
                        <ArrowRight size={18} weight="bold" />
                    </a>
                </Band>
            </Wrap>
        </SiteShell>
    );
}
