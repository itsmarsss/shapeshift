// The one place the app's colors are defined (people in shared rooms get
// theirs from @shapeshift/shared/collab/protocol). CSS reads them through custom properties
// (see components/ui.ts) and the 3D view reads them directly, so the red,
// green and blue axes match everywhere: grid, gizmo and inspector.

export type ThemeName = "dark" | "light";

type Palette = {
    accent: string;
    accentHover: string;
    accentText: string;
    axisX: string;
    axisY: string;
    axisZ: string;
    success: string;
    warning: string;
    danger: string;
    // Outline for the hovered object, softer than the selection.
    hover: string;
};

export const PALETTE: Record<ThemeName, Palette> = {
    dark: {
        accent: "#5b80ff",
        accentHover: "#7c99ff",
        accentText: "#ffffff",
        axisX: "#ff5d5d",
        axisY: "#4cc38a",
        axisZ: "#4f8fff",
        success: "#4cc38a",
        warning: "#ffc53d",
        danger: "#ff6369",
        hover: "#9db4ff",
    },
    light: {
        accent: "#3d63f0",
        accentHover: "#5577f5",
        accentText: "#ffffff",
        axisX: "#e5484d",
        axisY: "#2b9a66",
        axisZ: "#2f6fe8",
        success: "#2b9a66",
        warning: "#c98a00",
        danger: "#dc3e42",
        hover: "#7a93f0",
    },
};
