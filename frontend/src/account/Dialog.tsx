import { useEffect, type ReactNode } from "react";
import styled from "styled-components";
import { X } from "@phosphor-icons/react";
import { IconButton } from "../components/ui";

const Backdrop = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 1000;
`;

const Box = styled.div<{ $width: number }>`
    width: min(${(p) => p.$width}px, 100%);
    max-height: min(640px, 100%);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 16px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    overflow: hidden;
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 12px 6px 20px;

    h2 {
        margin: 0;
        font-size: 16px;
    }
`;

const Body = styled.div`
    padding: 6px 20px 20px;
    overflow: auto;
`;

export function Dialog({ title, width = 400, onClose, children }: { title: string; width?: number; onClose: () => void; children: ReactNode }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <Backdrop onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <Box $width={width} role="dialog" aria-modal="true" aria-label={title}>
                <Head>
                    <h2>{title}</h2>
                    <IconButton title="Close" onClick={onClose}>
                        <X size={16} />
                    </IconButton>
                </Head>
                <Body>{children}</Body>
            </Box>
        </Backdrop>
    );
}
