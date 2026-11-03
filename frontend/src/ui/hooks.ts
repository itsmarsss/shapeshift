import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

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
