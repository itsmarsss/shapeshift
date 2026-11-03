import type { ReactNode } from "react";
import styled from "styled-components";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Camera, Check, CircleNotch, DownloadSimple, Hand, WarningCircle } from "@phosphor-icons/react";
import { Button } from "../components/ui";
import { COMPACT } from "../ui/compact";
import { spin } from "../ui/keyframes";
import { drop, EASE_OUT_CSS } from "../ui/motion";
import { useHands } from "./tracker";

// While hand control starts: the camera, the tracker's download (about 22 MB,
// only the first time) and getting it running, each ticked off in turn.

const Spot = styled.div`
    position: absolute;
    top: calc(var(--topbar) + var(--gap));
    left: 50%;
    translate: -50% 0;
    width: min(340px, calc(100% - 24px));
    z-index: 40;

    @media ${COMPACT} {
        top: calc(var(--topbar) + env(safe-area-inset-top, 0px) + 8px);
    }
`;

const Card = styled(m.div)`
    padding: 14px 14px 12px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);

    header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        font-weight: 600;
    }
    header svg {
        color: var(--accent);
    }
    footer {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
        margin-top: 10px;
    }
    .error {
        color: var(--text-muted);
        margin: 0;
    }
`;

const Steps = styled.ol`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const StepRow = styled.li<{ $state: "done" | "now" | "later" }>`
    display: grid;
    grid-template-columns: 20px 1fr;
    gap: 10px;
    align-items: start;
    color: ${(p) => (p.$state === "later" ? "var(--text-faint)" : "var(--text)")};

    .icon {
        width: 20px;
        height: 20px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: ${(p) => (p.$state === "done" ? "var(--success)" : "transparent")};
        color: ${(p) => (p.$state === "done" ? "#fff" : p.$state === "now" ? "var(--accent)" : "var(--text-faint)")};
    }
    .spin {
        animation: ${spin} 0.9s linear infinite;
    }
    small {
        display: block;
        margin-top: 2px;
        color: var(--text-muted);
        font-size: 12px;
    }
`;

const Bar = styled.div`
    height: 6px;
    margin-top: 6px;
    border-radius: 999px;
    background: var(--surface-raised);
    overflow: hidden;

    i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--accent);
        transition: width 0.3s ${EASE_OUT_CSS};
    }
`;

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;

function Step({ state, Icon, label, children }: { state: "done" | "now" | "later"; Icon: typeof Camera; label: string; children?: ReactNode }) {
    return (
        <StepRow $state={state}>
            <span className="icon">{state === "done" ? <Check size={12} weight="bold" /> : state === "now" ? <CircleNotch className="spin" size={16} weight="bold" /> : <Icon size={14} />}</span>
            <span>
                {label}
                {children}
            </span>
        </StepRow>
    );
}

export function HandStartup() {
    const status = useHands((s) => s.status);
    const stage = useHands((s) => s.stage);
    const error = useHands((s) => s.error);
    const download = useHands((s) => s.download);
    const loaded = useHands((s) => s.loaded);
    const setEnabled = useHands((s) => s.setEnabled);

    const camera = stage === "camera" ? "now" : "done";
    const downloaded = loaded || (download !== null && download.loaded >= download.total);
    const fetching = downloaded ? "done" : stage === "camera" && !download ? "later" : "now";
    const ready = stage === "loading" && downloaded ? "now" : "later";
    const share = download && download.total ? download.loaded / download.total : 0;

    return (
        <AnimatePresence>
            {(status === "starting" || status === "error") && (
                <Spot key="hand-startup">
                    <Card {...drop} role="status" aria-label="Starting hand control">
                        <header>
                            {status === "error" ? <WarningCircle size={18} weight="fill" color="var(--danger)" /> : <Hand size={18} weight="fill" />}
                            {status === "error" ? "Hand control didn't start" : "Turning on hand control"}
                        </header>
                        {status === "error" ? (
                            <p className="error">{error}</p>
                        ) : (
                            <Steps>
                                <Step state={camera} Icon={Camera} label={camera === "done" ? "Camera on" : "Asking for the camera"}>
                                    {camera === "now" && <small>Allow it in the box your browser shows.</small>}
                                </Step>
                                {!loaded && (
                                    <Step state={fetching} Icon={DownloadSimple} label={downloaded ? "Hand tracking downloaded" : "Downloading hand tracking"}>
                                        {fetching === "now" && (
                                            <>
                                                <small>{download ? `${mb(download.loaded)} of ${mb(download.total)} · only the first time` : "Starting the download…"}</small>
                                                <Bar aria-hidden>
                                                    <i style={{ width: `${Math.round(share * 100)}%` }} />
                                                </Bar>
                                            </>
                                        )}
                                    </Step>
                                )}
                                <Step state={ready} Icon={Hand} label="Getting it ready">
                                    {ready === "now" && <small>A few seconds.</small>}
                                </Step>
                            </Steps>
                        )}
                        <footer>
                            {status === "error" ? (
                                <>
                                    <Button onClick={() => void setEnabled(false)}>Close</Button>
                                    <Button $variant="primary" onClick={() => void setEnabled(true)}>
                                        Try again
                                    </Button>
                                </>
                            ) : (
                                <Button onClick={() => void setEnabled(false)}>Cancel</Button>
                            )}
                        </footer>
                    </Card>
                </Spot>
            )}
        </AnimatePresence>
    );
}
