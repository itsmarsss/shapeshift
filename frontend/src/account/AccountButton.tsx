import { useEffect, useRef, useState } from "react";
import { Avatar, Button, Menu } from "../components/ui";
import { initials } from "../ui/format";
import { useDismiss } from "../ui/hooks";
import { AnimatePresence } from "motion/react";
import { drop } from "../ui/motion";
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

const SignIn = styled(Button).attrs({ $variant: "outline" })`
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

const AccountMenu = styled(Menu)`
    right: 0;
    width: 260px;
`;

const Status = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    color: var(--text-muted);
    font-size: 12px;
`;

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

    useDismiss(ref, open, () => setOpen(false));

    if (!loaded) return null;
    const act = (fn: () => void) => () => {
        setOpen(false);
        fn();
    };

    if (!user)
        return (
            <Wrap>
                <SignIn data-guide="account" title="Sign in to save scenes to the cloud" onClick={() => useAccount.getState().setShowSignIn(true)}>
                    <UserCircle size={18} />
                    <span>Sign in</span>
                </SignIn>
            </Wrap>
        );

    const label = user.name || user.email;
    return (
        <Wrap ref={ref}>
            <Avatar as="button" data-guide="account" title={label} onClick={() => setOpen((v) => !v)}>
                {initials(label)}
                {cloudId && <Dot $state={save} />}
            </Avatar>
            <AnimatePresence>
                {open && (
                    <AccountMenu {...drop} style={{ transformOrigin: "top right" }} role="menu">
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
                    </AccountMenu>
                )}
            </AnimatePresence>
        </Wrap>
    );
}
