import styled, { css, keyframes } from "styled-components";
import { ArrowClockwise, ArrowCounterClockwise, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { useScene } from "../../scene/store";
import { useAssistant, type Turn } from "../../assistant/store";
import { ActivityList } from "./ActivityList";
import { RichText } from "./RichText";

const spin = keyframes`to { transform: rotate(360deg); }`;
const shimmer = keyframes`
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
`;

const Root = styled.section`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const Prompt = styled.div`
    align-self: flex-end;
    max-width: 88%;
    padding: 7px 11px;
    border-radius: 14px 14px 4px 14px;
    background: var(--accent);
    color: var(--accent-text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.45;
`;

const Body = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-right: 8px;
`;

const Status = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 12px;

    svg {
        animation: ${spin} 0.9s linear infinite;
    }
    span {
        background: linear-gradient(90deg, var(--text-muted) 0%, var(--text) 50%, var(--text-muted) 100%);
        background-size: 200% 100%;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        animation: ${shimmer} 1.6s linear infinite;
    }
`;

const Note = styled.div<{ $tone?: "error" }>`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius);
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-muted);
    background: var(--surface-raised);
    ${(p) =>
        p.$tone === "error" &&
        css`
            color: var(--text);
            background: color-mix(in srgb, var(--danger) 12%, transparent);
            border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
            svg {
                color: var(--danger);
                flex-shrink: 0;
                margin-top: 1px;
            }
        `}
`;

const Meta = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 24px;
    color: var(--text-faint);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
`;

const Action = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;

    &:hover:not(:disabled) {
        color: var(--text);
        border-color: var(--border-strong);
        background: var(--surface-raised);
    }
    &:disabled {
        opacity: 0.5;
    }
`;

function seconds(turn: Turn) {
    if (!turn.finishedAt) return "";
    const s = (turn.finishedAt - turn.startedAt) / 1000;
    return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

function TurnHistoryButton({ turn }: { turn: Turn }) {
    // Subscribe to the history ends so the button tracks undo and redo from anywhere.
    const top = useScene((s) => s.past[s.past.length - 1]);
    const next = useScene((s) => s.future[0]);
    const undoTurn = useAssistant((s) => s.undoTurn);
    const redoTurn = useAssistant((s) => s.redoTurn);
    if (!turn.entry) return null;
    if (top === turn.entry)
        return (
            <Action onClick={() => undoTurn(turn.id)} title="Undo everything from this reply">
                <ArrowCounterClockwise size={12} /> Undo
            </Action>
        );
    if (next === turn.entry)
        return (
            <Action onClick={() => redoTurn(turn.id)} title="Redo this reply">
                <ArrowClockwise size={12} /> Redo
            </Action>
        );
    return null;
}

export function TurnView({ turn, last }: { turn: Turn; last: boolean }) {
    const retry = useAssistant((s) => s.retry);
    const running = useAssistant((s) => s.running);
    const changes = turn.items.reduce((n, item) => n + (item.kind === "activity" ? item.activities.filter((a) => a.changed).length : 0), 0);

    return (
        <Root>
            <Prompt>{turn.prompt}</Prompt>
            <Body>
                {turn.items.map((item, i) =>
                    item.kind === "text" ? <RichText key={i} text={item.text} /> : <ActivityList key={i} activities={item.activities} />
                )}
                {turn.status === "running" && (
                    <Status role="status">
                        <CircleNotch size={13} weight="bold" />
                        <span>{turn.writing ? `${turn.writing}…` : "Thinking…"}</span>
                    </Status>
                )}
                {turn.status === "done" && turn.note && <Note>{turn.note}</Note>}
                {turn.status === "stopped" && <Note>Stopped. Anything already changed is still in the scene.</Note>}
                {turn.status === "error" && turn.error && (
                    <Note $tone="error" role="alert">
                        <WarningCircle size={14} weight="fill" />
                        <div style={{ flex: 1 }}>{turn.error.message}</div>
                        {last && turn.error.retryable && (
                            <Action onClick={retry} disabled={running}>
                                Retry
                            </Action>
                        )}
                    </Note>
                )}
                {turn.status !== "running" && (changes > 0 || turn.finishedAt) && (
                    <Meta>
                        {changes > 0 && <span>{changes === 1 ? "1 change" : `${changes} changes`}</span>}
                        {changes > 0 && <span>·</span>}
                        <span>{seconds(turn)}</span>
                        <span style={{ flex: 1 }} />
                        <TurnHistoryButton turn={turn} />
                    </Meta>
                )}
            </Body>
        </Root>
    );
}
