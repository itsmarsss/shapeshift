import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import styled from "styled-components";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { PencilSimple, SignOut, Sparkle } from "@phosphor-icons/react";
import { GlobalStyle } from "../components/ui";
import { useResolvedTheme } from "../settings/theme";
import { seemsSignedIn, useAccount } from "../account/store";
import { PLANS } from "@shapeshift/shared/billing/plans";
import { drop } from "../ui/motion";

const SignInDialog = lazy(() => import("../account/SignInDialog"));

export type SitePage = "home" | "explore" | "pricing";

const Page = styled.div`
    // The editor turns off page scrolling, so pages scroll inside themselves.
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
`;

const Nav = styled.header`
    position: sticky;
    top: 0;
    z-index: 10;
    padding-top: env(safe-area-inset-top, 0px);
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: saturate(1.4) blur(14px);
    border-bottom: 1px solid var(--border);
`;

const NavInner = styled.div`
    width: min(1120px, 100%);
    height: 60px;
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    align-items: center;
    gap: 8px;

    @media (max-width: 640px) {
        padding: 0 12px;
        gap: 4px;
    }
`;

const Brand = styled.a`
    display: flex;
    align-items: center;
    gap: 10px;
    margin-right: 16px;
    color: var(--text);
    text-decoration: none;
    font-weight: 700;
    font-size: 15px;
    letter-spacing: -0.01em;

    img {
        width: 28px;
        height: 28px;
    }
    @media (max-width: 640px) {
        margin-right: 4px;

        span {
            display: none;
        }
    }
`;

const Links = styled.nav`
    display: flex;
    gap: 2px;
    flex: 1;
    min-width: 0;

    a {
        height: 34px;
        padding: 0 12px;
        display: inline-flex;
        align-items: center;
        border-radius: 8px;
        color: var(--text-muted);
        text-decoration: none;
        font-weight: 500;
        white-space: nowrap;
        transition:
            background 0.15s ease,
            color 0.15s ease;
    }
    a:hover {
        color: var(--text);
        background: var(--surface-hover);
    }
    a[aria-current="page"] {
        color: var(--text);
        background: var(--surface-raised);
    }
    @media (max-width: 640px) {
        a {
            padding: 0 8px;
            font-size: 13px;
        }
    }
`;

const Editor = styled.a`
    height: 36px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 10px;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;

    &:hover {
        background: var(--accent-hover);
    }
    @media (max-width: 640px) {
        width: 36px;
        padding: 0;
        justify-content: center;

        span {
            display: none;
        }
    }
`;

const SignIn = styled.button`
    height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--text);
    font-weight: 500;
    white-space: nowrap;

    &:hover {
        background: var(--surface-hover);
    }
`;

const Account = styled.div`
    position: relative;
`;

const Avatar = styled.button`
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    background: var(--surface-raised);
    color: var(--text);
    font-weight: 700;
    font-size: 13px;

    &:hover,
    &[aria-expanded="true"] {
        border-color: var(--accent);
    }
`;

const Menu = styled(m.div)`
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 250px;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
    transform-origin: top right;

    header {
        padding: 10px 10px 12px;
        margin-bottom: 4px;
        border-bottom: 1px solid var(--border);
        min-width: 0;
    }
    header b,
    header small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    header small {
        color: var(--text-muted);
        margin-top: 2px;
    }
    a,
    button {
        width: 100%;
        height: 38px;
        padding: 0 10px;
        display: flex;
        align-items: center;
        gap: 10px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--text);
        text-decoration: none;
        font-size: 13px;
    }
    a:hover,
    button:hover {
        background: var(--surface-hover);
    }
`;

const Footer = styled.footer`
    // As wide as the page's content, so the line above it lines up.
    width: min(1072px, calc(100% - 48px));
    margin: 0 auto;
    padding: 24px 0 calc(32px + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    border-top: 1px solid var(--border);
    color: var(--text-faint);
    font-size: 12px;

    a {
        color: var(--text-muted);
        text-decoration: none;
    }
    a:hover {
        color: var(--text);
    }
    span {
        flex: 1;
    }
    @media (max-width: 640px) {
        width: calc(100% - 32px);
    }
`;

function initials(label: string) {
    const parts = label.split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function AccountMenu() {
    const user = useAccount((s) => s.user)!;
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        window.addEventListener("pointerdown", close);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);
    const label = user.name || user.email;
    const pro = user.plan === "pro";
    return (
        <Account ref={ref}>
            <Avatar title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                {initials(label)}
            </Avatar>
            <AnimatePresence>
                {open && (
                    <Menu {...drop} role="menu">
                        <header>
                            <b>{user.name || "Signed in"}</b>
                            <small>
                                {user.email} · {PLANS[user.plan].name}
                            </small>
                        </header>
                        <a role="menuitem" href="/pricing">
                            <Sparkle size={16} />
                            {pro ? "Your plan" : "Upgrade to Pro"}
                        </a>
                        <button role="menuitem" onClick={() => void useAccount.getState().signOut().then(() => location.replace("/edit"))}>
                            <SignOut size={16} />
                            Sign out
                        </button>
                    </Menu>
                )}
            </AnimatePresence>
        </Account>
    );
}

// The frame around every page outside the editor: one navigation bar, the
// page, and a footer.
export function SiteShell({ page, children }: { page: SitePage; children: ReactNode }) {
    const user = useAccount((s) => s.user);
    const loaded = useAccount((s) => s.loaded);
    const showSignIn = useAccount((s) => s.showSignIn);
    const theme = useResolvedTheme();
    // Until the account loads, guess from last time so the bar doesn't jump.
    const signedIn = loaded ? Boolean(user) : seemsSignedIn();

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);
    useEffect(() => {
        if (!useAccount.getState().loaded) void useAccount.getState().load();
    }, []);

    const current = (p: SitePage) => (p === page ? ("page" as const) : undefined);
    return (
        <Page>
            <GlobalStyle />
            <Nav>
                <NavInner>
                    <Brand href={signedIn ? "/" : "/edit"} aria-label="ShapeShift">
                        <img src="/icon.svg" alt="" />
                        <span>ShapeShift</span>
                    </Brand>
                    <Links aria-label="Site">
                        {signedIn && (
                            <a href="/" aria-current={current("home")}>
                                Your scenes
                            </a>
                        )}
                        <a href="/explore" aria-current={current("explore")}>
                            Explore
                        </a>
                        <a href="/pricing" aria-current={current("pricing")}>
                            Pricing
                        </a>
                    </Links>
                    {user ? <AccountMenu /> : loaded && <SignIn onClick={() => useAccount.getState().setShowSignIn(true)}>Sign in</SignIn>}
                    <Editor href="/edit" title="Open the editor">
                        <PencilSimple size={16} weight="bold" />
                        <span>Open editor</span>
                    </Editor>
                </NavInner>
            </Nav>
            {children}
            <Footer>
                <span>ShapeShift · Build in 3D with your hands, your voice, or a few words.</span>
                <a href="/explore">Explore</a>
                <a href="/pricing">Pricing</a>
                <a href="/edit">Editor</a>
            </Footer>
            <AnimatePresence>
                {showSignIn && (
                    <Suspense key="sign-in" fallback={null}>
                        <SignInDialog />
                    </Suspense>
                )}
            </AnimatePresence>
        </Page>
    );
}
