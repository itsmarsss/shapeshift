import { useEffect, useState } from "react";

// Phones and narrow tablets get a layout built around the 3D view: panels open
// as bottom sheets, one at a time.
export const COMPACT_WIDTH = 720;
export const COMPACT = `(max-width: ${COMPACT_WIDTH}px)`;

export function isCompact() {
    return typeof window !== "undefined" && window.matchMedia(COMPACT).matches;
}

export function useCompact() {
    const [compact, setCompact] = useState(isCompact);
    useEffect(() => {
        const mq = window.matchMedia(COMPACT);
        const onChange = () => setCompact(mq.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return compact;
}
