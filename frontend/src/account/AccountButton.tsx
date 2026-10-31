import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { ChatTeardropText, CheckCircle, CloudArrowUp, CloudSlash, FolderOpen, SignOut, Sparkle, UserCircle, WarningCircle } from "@phosphor-icons/react";
import { COMPACT, MEDIUM } from "../ui/compact";
import { PLANS } from "@shapeshift/shared/billing/plans";
import { useAccount } from "./store";
import { useUI } from "../ui/store";

const Wrap = styled.div`
    position: relative;
    margin-right: 4px;
`;

const SignIn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: transparent;
    color: var(--text);
    font-weight: 500;
    white-space: nowrap;

    &:hover {
        background: var(--surface-hover);
    }
    span {
        @media ${MEDIUM} {
            display: none;
        }
    }
    @media ${COMPACT} {
        padding: 0 6px;
        border: 0;
    }
`;

const Avatar = styled.button`
    position: relative;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 0;
    background: var(--accent);
    color: var(--accent-text);
    font-size: 12px;
    font-weight: 700;
`;

const Dot = styled.span<{ $state: string }>`
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--surface);
    background: ${(p) => (p.$state === "error" ? "var(--danger)" : p.$state === "saving" ? "var(--warning)" : "var(--success)")};
`;

const Menu = styled.div`
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 260px;
    max-width: calc(100vw - 24px);
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    z-index: 200;

    header {
        padding: 8px 10px 10px;
        border-bottom: 1px solid var(--border);
        margin-bottom: 4px;
    }
    header b {
        display: block;
    }
    header small {
        color: var(--text-muted);
    }
    button {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        height: 38px;
        padding: 0 10px;
        border: 0;
        border-radius: var(--radius);
        background: transparent;
        color: var(--text);
        text-align: left;
    }
    button:hover {
        background: var(--surface-raised);
    }
`;

const Status = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    color: var(--text-muted);
    font-size: 12px;
`;

const initials = (name: string) =>
    name
        .split(/[\s@._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("") || "?";

export function AccountButton() {
    const user = useAccount((s) => s.user);
    const loaded = useAccount((s) => s.loaded);
    const load = useAccount((s) => s.load);
    const cloudId = useAccount((s) => s.cloudId);
    const cloudTitle = useAccount((s) => s.cloudTitle);
    const save = useAccount((s) => s.save);
    const saveError = useAccount((s) => s.saveError);
    const usage = useAccount((s) => s.usage);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!open) return;
        const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [open]);

    if (!loaded) return null;
    const act = (fn: () => void) => () => {
        setOpen(false);
        fn();
    };

    if (!user)
        return (
            <Wrap>
                <SignIn title="Sign in to save scenes to the cloud" onClick={() => useAccount.getState().setShowSignIn(true)}>
                    <UserCircle size={18} />
                    <span>Sign in</span>
                </SignIn>
            </Wrap>
        );

    const label = user.name || user.email;
    return (
        <Wrap ref={ref}>
            <Avatar title={label} onClick={() => setOpen((v) => !v)}>
                {initials(label)}
                {cloudId && <Dot $state={save} />}
            </Avatar>
            {open && (
                <Menu role="menu">
                    <header>
                        <b>{user.name || "Signed in"}</b>
                        <small>{user.email}</small>
                    </header>
                    <Status>
                        <Sparkle size={14} />
                        {PLANS[user.plan].name} plan
                        {usage && ` · ${usage.prompts.used} of ${usage.prompts.limit} prompts used this month`}
                    </Status>
                    <Status>
                        {save === "error" ? (
                            <>
                                <WarningCircle size={14} color="var(--danger)" /> {saveError ?? "Couldn't save"}
                            </>
                        ) : cloudId ? (
                            <>
                                <CheckCircle size={14} color="var(--success)" /> {save === "saving" ? "Saving…" : `Saving to “${cloudTitle}”`}
                            </>
                        ) : (
                            <>
                                <CloudSlash size={14} /> This scene is only on this device
                            </>
                        )}
                    </Status>
                    {!cloudId && (
                        <button role="menuitem" onClick={act(() => void useAccount.getState().saveToCloud())}>
                            <CloudArrowUp size={18} /> Save to the cloud
                        </button>
                    )}
                    <button role="menuitem" onClick={act(() => useAccount.getState().setShowScenes(true))}>
                        <FolderOpen size={18} /> My scenes
                    </button>
                    <button role="menuitem" onClick={act(() => location.assign("/pricing"))}>
                        <Sparkle size={18} /> {user.plan === "pro" ? "Manage your plan" : "Upgrade to Pro"}
                    </button>
                    <button role="menuitem" onClick={act(() => useUI.getState().setShowFeedback(true))}>
                        <ChatTeardropText size={18} /> Send feedback
                    </button>
                    <button role="menuitem" onClick={act(() => void useAccount.getState().signOut())}>
                        <SignOut size={18} /> Sign out
                    </button>
                </Menu>
            )}
        </Wrap>
    );
}
