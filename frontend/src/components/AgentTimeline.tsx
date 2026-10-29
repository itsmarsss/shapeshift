import styled from "styled-components";
import { CheckCircle, WarningCircle, X } from "@phosphor-icons/react";
import type { StepResult } from "../agent/types";
import { useAgentTimeline } from "../store/agentTimeline";
import { IconButton, Panel, PanelHeader, PanelTitle } from "./ui";

const Rail = styled(Panel)`
    top: calc(var(--topbar) + var(--gap));
    bottom: var(--gap);
    right: calc(var(--gap) * 2 + var(--chat-width, 0px));
    width: 260px;
    z-index: 40;
`;

const Steps = styled.div`
    flex: 1;
    overflow: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const Row = styled.div`
    padding: 8px 10px;
    border-radius: var(--radius);
    background: var(--surface-raised);
    font-size: 12px;
`;

const RowHead = styled.div<{ $ok: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
    svg {
        color: ${(p) => (p.$ok ? "var(--success)" : "var(--danger)")};
    }
`;

const Args = styled.div`
    margin-top: 4px;
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    word-break: break-all;
`;

const Changes = styled.div`
    margin-top: 4px;
    color: var(--text-muted);
`;

const Empty = styled.div`
    padding: 8px 6px;
    color: var(--text-muted);
`;

export function AgentTimeline({ steps }: { steps: StepResult[] }) {
    const setShow = useAgentTimeline((s) => s.setShowTimeline);
    return (
        <Rail>
            <PanelHeader>
                <PanelTitle>Agent steps</PanelTitle>
                <IconButton title="Close" onClick={() => setShow(false)}>
                    <X size={16} />
                </IconButton>
            </PanelHeader>
            <Steps>
                {steps.length === 0 ? (
                    <Empty>Steps appear here when the assistant falls back to built-in commands.</Empty>
                ) : (
                    steps.map((s, i) => {
                        const diff = s.diff || { addedIds: [], removedIds: [], updatedIds: [] };
                        const changes = [
                            diff.addedIds.length && `${diff.addedIds.length} added`,
                            diff.removedIds.length && `${diff.removedIds.length} removed`,
                            diff.updatedIds.length && `${diff.updatedIds.length} updated`,
                        ].filter(Boolean);
                        return (
                            <Row key={i}>
                                <RowHead $ok={s.ok}>
                                    {s.ok ? <CheckCircle size={14} weight="fill" /> : <WarningCircle size={14} weight="fill" />}
                                    {s.tool?.name.replace(/_/g, " ")}
                                </RowHead>
                                <Args>{shortArgs(s.tool?.args || {})}</Args>
                                {changes.length > 0 && <Changes>{changes.join(" · ")}</Changes>}
                            </Row>
                        );
                    })
                )}
            </Steps>
        </Rail>
    );
}

function shortArgs(args: object): string {
    try {
        const pruned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args || {})) {
            if (v == null) continue;
            if (Array.isArray(v)) pruned[k] = v.map((x) => (typeof x === "number" ? Number(x.toFixed?.(3) ?? x) : x));
            else if (typeof v === "object") pruned[k] = "{...}";
            else pruned[k] = v;
        }
        return JSON.stringify(pruned);
    } catch {
        return "";
    }
}

export default AgentTimeline; 