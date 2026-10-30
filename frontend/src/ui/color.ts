// Color helpers for the color picker: hex strings in and out, HSV in between
// because that's what the picker's square and hue bar show.

export type Hsv = { h: number; s: number; v: number };

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

export function normalizeHex(input: string): string | null {
    let hex = input.trim().replace(/^#/, "").toLowerCase();
    if (/^[0-9a-f]{3}$/.test(hex)) hex = [...hex].map((c) => c + c).join("");
    return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
}

export function hexToHsv(hex: string): Hsv {
    const n = parseInt((normalizeHex(hex) ?? "#000000").slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = 0;
    if (d) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
    }
    return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
    const f = (k: number) => {
        const x = (k + h / 60) % 6;
        return v - v * clamp(s) * Math.max(0, Math.min(x, 4 - x, 1));
    };
    return `#${[f(5), f(3), f(1)].map((c) => Math.round(clamp(c) * 255).toString(16).padStart(2, "0")).join("")}`;
}

// Picked to look good on 3D shapes under the editor's lighting: a few neutrals,
// then bright and soft versions of each hue, then wood, stone and skin tones.
export const SWATCHES = [
    "#ffffff", "#c8ccd4", "#8a8f99", "#4b4f58", "#1d1d1f",
    "#e5484d", "#f28c28", "#f5c518", "#46a758", "#12a594",
    "#3e8ed0", "#4f5bd5", "#8e4ec6", "#d6409f", "#ff8fa3",
    "#ffd6a5", "#fdffb6", "#caffbf", "#a0e7e5", "#bdb2ff",
    "#8b5a2b", "#c49a6c", "#e8d3b0", "#9ca3af", "#f1c27d",
];

const RECENT_KEY = "shapeshift-recent-colors";
const RECENT_MAX = 10;

export function recentColors(): string[] {
    try {
        const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
        return Array.isArray(list) ? list.filter((c): c is string => typeof c === "string" && normalizeHex(c) !== null) : [];
    } catch {
        return [];
    }
}

export function rememberColor(hex: string) {
    const color = normalizeHex(hex);
    if (!color) return;
    try {
        const list = [color, ...recentColors().filter((c) => c !== color)].slice(0, RECENT_MAX);
        localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {
        // Optional.
    }
}
