import styled from "styled-components";
import type { StepResult } from "../agent/types";
import { useAgentTimeline } from "../store/agentTimeline";

const Rail = styled.div`
    position: absolute;
    top: 56px;
    bottom: 12px;
    right: 300px; /* to the left of chat panel */
    width: 260px;
    background: rgba(18, 20, 26, 0.9);
    color: #e6e9ef;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 40;
`;

const Header = styled.div`
    padding: 8px 12px;
    font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const CloseBtn = styled.button`
    background: #12141a;
    color: #e6e9ef;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 12px;
`;

const Steps = styled.div`
    flex: 1;
    overflow: auto;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const Row = styled.div<{ ok: boolean }>`
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: ${(p) => (p.ok ? "rgba(30, 34, 44, 0.7)" : "rgba(60, 20, 20, 0.5)")};
    border-radius: 10px;
    padding: 8px;
    font-size: 12px;
`;

const Badge = styled.span`
    display: inline-block;
    padding: 2px 6px;
    margin-right: 6px;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 999px;
    background: rgba(255,255,255,0.06);
    font-size: 11px;
`;

export function AgentTimeline({ steps }: { steps: StepResult[] }) {
    const setShow = useAgentTimeline((s) => s.setShowTimeline);
    return (
        <Rail>
            <Header>
                <div>Agent Timeline</div>
                <CloseBtn onClick={() => setShow(false)}>✕</CloseBtn>
            </Header>
            <Steps>
                {steps.length === 0 ? (
                    <div style={{ opacity: 0.6, fontSize: 12 }}>No steps yet</div>
                ) : (
                    steps.map((s, i) => {
                        const tool = s.tool?.name;
                        const args = s.tool?.args || {};
                        const diff = s.diff || { addedIds: [], removedIds: [], updatedIds: [] };
                        const diffs: string[] = [];
                        if (diff.addedIds.length) diffs.push(`+${diff.addedIds.length} added`);
                        if (diff.removedIds.length) diffs.push(`-${diff.removedIds.length} removed`);
                        if (diff.updatedIds.length) diffs.push(`~${diff.updatedIds.length} updated`);
                        return (
                            <Row key={i} ok={s.ok}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <div>{tool}</div>
                                    <div>{s.ok ? "✅" : "❌"}</div>
                                </div>
                                <div style={{ opacity: 0.8, marginTop: 4 }}>{shortArgs(args)}</div>
                                <div style={{ marginTop: 6 }}>
                                    {diffs.map((d, j) => (
                                        <Badge key={j}>{d}</Badge>
                                    ))}
                                </div>
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