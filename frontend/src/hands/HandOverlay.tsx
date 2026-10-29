import { useEffect, useRef } from "react";
import styled from "styled-components";
import { live } from "./tracker";

const Layer = styled.div`
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
`;

const Cursor = styled.div`
    position: absolute;
    left: 0;
    top: 0;
    width: 18px;
    height: 18px;
    margin: -9px 0 0 -9px;
    border-radius: 50%;
    border: 2px solid rgba(236, 236, 238, 0.85);
    display: none;

    &[data-pinching="true"] {
        background: var(--accent);
        border-color: var(--accent);
        transform-origin: center;
    }
`;

export function HandOverlay() {
    const layer = useRef<HTMLDivElement>(null);
    const cursors = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        let raf = 0;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const el = layer.current;
            if (!el) return;
            const { width, height } = el.getBoundingClientRect();
            cursors.current.forEach((c, i) => {
                if (!c) return;
                const h = live.hands[i];
                c.style.display = h ? "block" : "none";
                if (!h) return;
                c.style.translate = `${h.x * width}px ${h.y * height}px`;
                c.dataset.pinching = String(h.pinching);
            });
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <Layer ref={layer}>
            <Cursor ref={(el) => void (cursors.current[0] = el)} />
            <Cursor ref={(el) => void (cursors.current[1] = el)} />
        </Layer>
    );
}
