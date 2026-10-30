import { useEffect, useState } from "react";
import { useSettings } from "./store";
import { PALETTE } from "../ui/palette";

export type ResolvedTheme = "dark" | "light";

const query = () => window.matchMedia("(prefers-color-scheme: light)");

export function useResolvedTheme(): ResolvedTheme {
    const theme = useSettings((s) => s.theme);
    const [system, setSystem] = useState<ResolvedTheme>(() => (query().matches ? "light" : "dark"));
    useEffect(() => {
        const mq = query();
        const onChange = () => setSystem(mq.matches ? "light" : "dark");
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return theme === "system" ? system : theme;
}

// Palette colors for the current theme, for the 3D view.
export function usePalette() {
    return PALETTE[useResolvedTheme()];
}

export const SCENE_COLORS: Record<ResolvedTheme, { background: string; cell: string; section: string; ground: string; handle: string }> = {
    dark: { background: "#0d0e10", cell: "#24262b", section: "#34373e", ground: "#30333a", handle: "#c8ccd4" },
    light: { background: "#ececef", cell: "#d6d7db", section: "#b9bbc1", ground: "#b9bbc1", handle: "#ffffff" },
};
