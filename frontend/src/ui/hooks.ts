import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type React from "react";

// Closes a menu or popover on a press outside it, or on Escape.
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
    const latest = useRef(close);
    latest.current = close;
    useEffect(() => {
        if (!open) return;
        const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && latest.current();
        const key = (e: KeyboardEvent) => e.key === "Escape" && latest.current();
        window.addEventListener("pointerdown", away);
        window.addEventListener("keydown", key);
        return () => {
            window.removeEventListener("pointerdown", away);
            window.removeEventListener("keydown", key);
        };
    }, [ref, open]);
}

// Copies text, and says which thing was copied for a moment so a button can
// read "Copied". Clipboard access can be refused; that's reported, not thrown.
export function useCopy<K extends string = "text">(ms = 1600) {
    const [copied, setCopied] = useState<K | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    const copy = useCallback(
        async (text: string, what = "text" as K) => {
            try {
                await navigator.clipboard.writeText(text);
            } catch {
                return false;
            }
            setCopied(what);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(null), ms);
            return true;
        },
        [ms],
    );
    return { copied, copy };
}

// Marks a sideways-scrolling row with which ends have more to scroll to
// (data-more="start", "end" or "both"), so `fadeEdges` can fade those ends.
export function useScrollEdges(ref: RefObject<HTMLElement | null>, key?: unknown) {
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const mark = () => {
            const start = el.scrollLeft > 2;
            const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
            const more = start && end ? "both" : start ? "start" : end ? "end" : "";
            if (more) el.dataset.more = more;
            else delete el.dataset.more;
        };
        mark();
        el.addEventListener("scroll", mark, { passive: true });
        const ro = new ResizeObserver(mark);
        ro.observe(el);
        for (const child of el.children) ro.observe(child);
        return () => {
            el.removeEventListener("scroll", mark);
            ro.disconnect();
        };
    }, [ref, key]);
}

// Lets a floating card be dragged anywhere and remembers where, per `key`.
// Until it's moved it stays where its CSS puts it. Spread `handle` on the part
// to drag by; a press that moves less than a few pixels is still a click.
// `keepTransform` leaves transforms alone, for a panel that animates in with one.
export function useDraggable<T extends HTMLElement>(key: string, { keepTransform = false }: { keepTransform?: boolean } = {}) {
    const ref = useRef<T>(null);
    const storageKey = `shapeshift-place-${key}`;
    const [place, setPlace] = useState<{ x: number; y: number } | null>(() => {
        try {
            const saved = localStorage.getItem(storageKey);
            return saved ? (JSON.parse(saved) as { x: number; y: number }) : null;
        } catch {
            return null;
        }
    });
    const moved = useRef(false);

    // Kept on screen when the window shrinks.
    const clamp = useCallback((p: { x: number; y: number }) => {
        const el = ref.current;
        const w = el?.offsetWidth ?? 0;
        const h = el?.offsetHeight ?? 0;
        return { x: Math.min(Math.max(8, p.x), window.innerWidth - w - 8), y: Math.min(Math.max(8, p.y), window.innerHeight - h - 8) };
    }, []);
    useEffect(() => {
        if (!place) return;
        const fit = () => setPlace((p) => (p ? clamp(p) : p));
        fit();
        window.addEventListener("resize", fit);
        return () => window.removeEventListener("resize", fit);
    }, [place === null, clamp]); // eslint-disable-line react-hooks/exhaustive-deps

    const onPointerDown = useCallback(
        (e: React.PointerEvent) => {
            const el = ref.current;
            if (!el || e.button !== 0) return;
            const rect = el.getBoundingClientRect();
            const from = { x: e.clientX, y: e.clientY };
            moved.current = false;
            let last: { x: number; y: number } | null = null;
            const move = (ev: PointerEvent) => {
                if (!moved.current && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 4) return;
                moved.current = true;
                last = clamp({ x: rect.left + ev.clientX - from.x, y: rect.top + ev.clientY - from.y });
                setPlace(last);
            };
            const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                if (last)
                    try {
                        localStorage.setItem(storageKey, JSON.stringify(last));
                    } catch {
                        // Remembering is optional.
                    }
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
        },
        [clamp, storageKey],
    );
    // A drag that ends over a button isn't a press of it.
    const onClickCapture = useCallback((e: React.MouseEvent) => {
        if (moved.current) {
            e.stopPropagation();
            e.preventDefault();
            moved.current = false;
        }
    }, []);

    const style: React.CSSProperties | undefined = place
        ? { position: "fixed", left: place.x, top: place.y, right: "auto", bottom: "auto", ...(keepTransform ? {} : { translate: "none", transform: "none" }) }
        : undefined;
    return { ref, style, handle: { onPointerDown, onClickCapture, style: { cursor: "grab", touchAction: "none" } as React.CSSProperties }, dragged: place !== null };
}
