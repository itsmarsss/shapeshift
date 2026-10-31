import { useEffect, useState } from "react";
import type { SceneDoc } from "@shapeshift/shared/scene/schema";
import { renderThumbnail } from "./thumbnail";

// Pictures of several scenes, drawn one at a time after the page has painted,
// so a page full of them opens at once and fills in. Pass a memoized list.
export function useThumbnails(docs: readonly (SceneDoc | null)[], width?: number, height?: number): (string | null)[] {
    const [images, setImages] = useState<(string | null)[]>([]);
    useEffect(() => {
        let timer = 0;
        let next = 0;
        const step = () => {
            if (next >= docs.length) return;
            const at = next++;
            const doc = docs[at];
            const image = doc ? renderThumbnail(doc, width, height) : null;
            setImages((prev) => {
                const copy = prev.slice(0, docs.length);
                copy[at] = image;
                return copy;
            });
            timer = window.setTimeout(step, 16);
        };
        // After the next frame, so the page is on screen first.
        const frame = requestAnimationFrame(() => (timer = window.setTimeout(step, 0)));
        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(timer);
        };
    }, [docs, width, height]);
    return images;
}
