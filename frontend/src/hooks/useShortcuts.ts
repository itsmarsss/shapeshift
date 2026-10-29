import { useEffect } from "react";
import { useScene } from "../scene/store";

const TRANSFORM_KEYS = { w: "translate", e: "rotate", r: "scale" } as const;

function isTyping(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function useShortcuts() {
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (isTyping(e.target)) return;
            const s = useScene.getState();
            const mod = e.metaKey || e.ctrlKey;
            const key = e.key.toLowerCase();

            if (mod && key === "z") {
                e.preventDefault();
                if (e.shiftKey) s.redo();
                else s.undo();
            } else if (mod && key === "y") {
                e.preventDefault();
                s.redo();
            } else if (mod && key === "d" && s.selectedId) {
                e.preventDefault();
                s.run({ type: "duplicate", target: s.selectedId });
            } else if ((key === "delete" || key === "backspace") && s.selectedId) {
                e.preventDefault();
                s.run({ type: "remove", target: s.selectedId });
            } else if (key === "escape") {
                s.select(null);
            } else if (!mod && key in TRANSFORM_KEYS) {
                s.setTransformMode(TRANSFORM_KEYS[key as keyof typeof TRANSFORM_KEYS]);
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
}
