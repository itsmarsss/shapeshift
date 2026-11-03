import { useEffect, type CSSProperties, type ReactNode } from "react";
import styled from "styled-components";
import * as m from "motion/react-m";
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

const Box = styled(m.div)`
    width: min(400px, 100%);
    max-height: min(640px, 100%);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 16px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    overflow: hidden;
`;

// A box over a dimmed page. With onClose, Escape and a press on the dimmed
// area close it; without, it stays until the content closes it. Style the box
// with styled(Modal) or className.
export function Modal({ label, onClose, className, style, children }: { label: string; onClose?: () => void; className?: string; style?: CSSProperties; children: ReactNode }) {
    useEffect(() => {
        if (!onClose) return;
        // Caught on the way in, so Escape closes this without also running the
        // editor's Escape (which clears the selection).
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose]);
    return (
        <Backdrop {...fade} onPointerDown={(e) => onClose && e.target === e.currentTarget && onClose()}>
            <Box {...pop} className={className} style={style} role="dialog" aria-modal="true" aria-label={label}>
                {children}
            </Box>
        </Backdrop>
    );
}
