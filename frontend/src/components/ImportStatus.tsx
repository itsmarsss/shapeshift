import { useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";
import { FileArrowDown, X } from "@phosphor-icons/react";
import { openFiles, useImport } from "../import/state";
import { IconButton } from "./ui";

const Card = styled.div`
    position: absolute;
    left: 50%;
    bottom: calc(var(--gap) + var(--bottom-offset, 0px) + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    width: min(360px, calc(100% - var(--gap) * 2));
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    z-index: 70;
`;

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;

    > div {
        flex: 1;
        min-width: 0;
    }
    b {
        display: block;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    small {
        color: var(--text-muted);
    }
`;

const slide = keyframes`
    from { transform: translateX(-100%); }
    to { transform: translateX(250%); }
`;

const Track = styled.div`
    height: 4px;
    border-radius: 2px;
    background: var(--surface-raised);
    overflow: hidden;
`;

const Fill = styled.div<{ $indeterminate: boolean }>`
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
    transition: width 0.2s ease;
    ${(p) => (p.$indeterminate ? "width: 40%;" : "")}
    animation: ${(p) => (p.$indeterminate ? slide : "none")} 1.2s ease-in-out infinite;
`;

const Message = styled.div`
    color: var(--text-muted);
    line-height: 1.4;
`;

function Elapsed() {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        const start = Date.now();
        const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
        return () => clearInterval(timer);
    }, []);
    return seconds >= 2 ? <small>{seconds}s</small> : null;
}

// Progress while a model is read, and what went wrong if it couldn't be.
export function ImportStatus() {
    const { busy, file, label, fraction, error, dismiss } = useImport();
    if (!busy && !error) return null;
    return (
        <Card role={error ? "alert" : "status"} aria-label={error ? "Import failed" : "Importing"}>
            <Row>
                <FileArrowDown size={18} />
                <div>
                    <b>{error ? `Couldn't open ${file ?? "that file"}` : label}</b>
                    {!error && <small>{file}</small>}
                </div>
                {busy && <Elapsed />}
                {error && (
                    <IconButton title="Dismiss" onClick={dismiss}>
                        <X size={16} />
                    </IconButton>
                )}
            </Row>
            {error ? (
                <Message>{error}</Message>
            ) : (
                <Track>
                    <Fill $indeterminate={fraction === null} style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }} />
                </Track>
            )}
        </Card>
    );
}

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    pointer-events: none;

    div {
        padding: 18px 24px;
        border: 2px dashed var(--accent);
        border-radius: var(--radius-lg);
        background: var(--surface);
        font-size: 15px;
        font-weight: 500;
    }
`;

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");

// Drop a model file anywhere on the editor to open it.
export function DropZone() {
    const [over, setOver] = useState(false);
    useEffect(() => {
        let depth = 0;
        const enter = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth++;
            setOver(true);
        };
        const overHandler = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            e.dataTransfer!.dropEffect = "copy";
        };
        const leave = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            depth = Math.max(0, depth - 1);
            if (!depth) setOver(false);
        };
        const drop = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth = 0;
            setOver(false);
            if (e.dataTransfer?.files.length) openFiles(e.dataTransfer.files);
        };
        window.addEventListener("dragenter", enter);
        window.addEventListener("dragover", overHandler);
        window.addEventListener("dragleave", leave);
        window.addEventListener("drop", drop);
        return () => {
            window.removeEventListener("dragenter", enter);
            window.removeEventListener("dragover", overHandler);
            window.removeEventListener("dragleave", leave);
            window.removeEventListener("drop", drop);
        };
    }, []);
    if (!over) return null;
    return (
        <Overlay>
            <div>Drop to open</div>
        </Overlay>
    );
}
