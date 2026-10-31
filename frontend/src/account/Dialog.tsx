import { useEffect, type ReactNode } from "react";
import styled from "styled-components";
import * as m from "motion/react-m";
import { X } from "@phosphor-icons/react";
import { IconButton } from "../components/ui";
import { fade, pop } from "../ui/motion";

const Backdrop = styled(m.div)`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 1000;
`;

const Box = styled(m.div)<{ $width: number }>`
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
        // Caught on the way in, so Escape closes the dialog without also
        // running the editor's Escape (which clears the selection).
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose]);
    return (
        <Backdrop {...fade} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <Box {...pop} $width={width} role="dialog" aria-modal="true" aria-label={title}>
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
