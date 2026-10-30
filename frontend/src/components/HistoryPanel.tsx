import { useEffect, useMemo, useRef } from "react";
import styled from "styled-components";
import { ClockCounterClockwise, Minus, PencilSimple, Plus, X } from "@phosphor-icons/react";
import { useScene } from "../scene/store";
import { describeDiff, diffKind } from "../scene/describe";
import { useUI } from "../ui/store";
import { COMPACT } from "../ui/compact";
import { IconButton, Panel, PanelHeader, PanelTitle } from "./ui";

const Root = styled(Panel)`
    top: calc(var(--topbar) + var(--gap));
    right: calc(var(--gap) + var(--chat-width, 0px));
    width: 260px;
    max-height: min(480px, calc(100% - var(--topbar) - var(--gap) * 2 - var(--bottom-offset, 0px)));
    z-index: 30;

    @media ${COMPACT} {
        top: auto;
        left: 0;
        right: 0;
        bottom: 0;
        width: auto;
        border-radius: 16px 16px 0 0;
        border-bottom: 0;
        padding-bottom: env(safe-area-inset-bottom, 0px);
        box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.4);
        z-index: 60;
        max-height: 55vh;
    }
`;

const List = styled.ol`
    list-style: none;
    margin: 0;
    padding: 6px;
    overflow: auto;
    scrollbar-width: thin;
`;

const Step = styled.button<{ $current: boolean; $undone: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius);
    background: ${(p) => (p.$current ? "var(--surface-raised)" : "transparent")};
    color: ${(p) => (p.$undone ? "var(--text-faint)" : "var(--text)")};
    font-weight: ${(p) => (p.$current ? 600 : 400)};
    text-align: left;

    &:hover {
        background: var(--surface-hover);
    }
    svg {
        flex-shrink: 0;
        color: ${(p) => (p.$current ? "var(--accent)" : "var(--text-muted)")};
    }
    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

const Note = styled.p`
    margin: 0;
    padding: 8px 14px 12px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.4;
`;

const ICONS = { add: Plus, remove: Minus, edit: PencilSimple };

export function HistoryPanel() {
    const show = useUI((s) => s.showHistory);
    const setShow = useUI((s) => s.setShowHistory);
    const past = useScene((s) => s.past);
    const future = useScene((s) => s.future);
    const travel = useScene((s) => s.travel);
    const currentRef = useRef<HTMLLIElement>(null);

    // Oldest first, like reading down a list of what happened.
    const steps = useMemo(
        () => [...past, ...future].map((diff) => ({ label: describeDiff(diff), kind: diffKind(diff) })),
        [past, future],
    );
    const at = past.length;

    useEffect(() => {
        if (show) currentRef.current?.scrollIntoView({ block: "nearest" });
    }, [show, at]);

    if (!show) return null;

    return (
        <Root role="dialog" aria-label="History">
            <PanelHeader>
                <PanelTitle>History</PanelTitle>
                <IconButton title="Close history" onClick={() => setShow(false)}>
                    <X size={16} />
                </IconButton>
            </PanelHeader>
            <List>
                <li ref={at === 0 ? currentRef : undefined}>
                    <Step $current={at === 0} $undone={false} aria-current={at === 0 ? "step" : undefined} onClick={() => travel(-at)}>
                        <ClockCounterClockwise size={16} />
                        <span>Start</span>
                    </Step>
                </li>
                {steps.map((step, i) => {
                    const Icon = ICONS[step.kind];
                    const current = i + 1 === at;
                    return (
                        <li key={i} ref={current ? currentRef : undefined}>
                            <Step
                                $current={current}
                                $undone={i >= at}
                                aria-current={current ? "step" : undefined}
                                title={i >= at ? "Redo up to here" : "Go back to here"}
                                onClick={() => travel(i + 1 - at)}
                            >
                                <Icon size={16} />
                                <span>{step.label}</span>
                            </Step>
                        </li>
                    );
                })}
            </List>
            <Note>
                {steps.length === 0
                    ? "Your changes will show up here. Click one to go back to it."
                    : "Click a step to go back to it. Faded steps can be brought back until you make a new change."}
            </Note>
        </Root>
    );
}

export default HistoryPanel;
