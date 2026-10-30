import { useEffect } from "react";
import { useScene } from "../scene/store";
import { PRIMITIVES } from "@shapeshift/shared/scene/schema";
import { addShape, dropSelection, duplicateSelection, groupSelection, removeSelection, selectAll, ungroupSelection } from "../scene/selection";
import { useTools } from "../viewport/tools";
import { useUI } from "../ui/store";

const TRANSFORM_KEYS = { w: "translate", e: "rotate", r: "scale" } as const;

function isTyping(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function useShortcuts() {
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            const s = useScene.getState();
            const ui = useUI.getState();
            const mod = e.metaKey || e.ctrlKey;
            const key = e.key.toLowerCase();

            if (mod && key === ",") {
                e.preventDefault();
                ui.setShowSettings(true);
                return;
            }
            if (isTyping(e.target) || ui.showSettings || ui.showOnboarding) return;

            if (mod && key === "z") {
                e.preventDefault();
                if (e.shiftKey) s.redo();
                else s.undo();
            } else if (mod && key === "y") {
                e.preventDefault();
                s.redo();
            } else if (mod && key === "d" && s.selectedId) {
                e.preventDefault();
                duplicateSelection();
            } else if (mod && key === "g") {
                e.preventDefault();
                if (e.shiftKey) ungroupSelection();
                else groupSelection();
            } else if (mod && key === "a") {
                e.preventDefault();
                selectAll();
            } else if ((key === "delete" || key === "backspace") && s.selectedId) {
                e.preventDefault();
                removeSelection();
            } else if (mod && key === "l") {
                e.preventDefault();
                ui.setShowChat(true);
                setTimeout(() => document.querySelector<HTMLTextAreaElement>("[data-chat-input]")?.focus(), 50);
            } else if (!mod && /^[1-6]$/.test(key) && s.mode !== "render") {
                addShape(PRIMITIVES[Number(key) - 1]);
            } else if (!mod && key === "d" && s.selectedIds.length && s.mode === "object") {
                dropSelection();
            } else if (key === "escape") {
                if (useTools.getState().tool !== "select") useTools.getState().setTool("select");
                else s.select(null);
            } else if (!mod && key in TRANSFORM_KEYS) {
                s.setTransformMode(TRANSFORM_KEYS[key as keyof typeof TRANSFORM_KEYS]);
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
}
