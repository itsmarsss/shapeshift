import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type Theme = "system" | "dark" | "light";
export type Quality = "performance" | "balanced" | "sharp";
export type Units = "m" | "cm" | "mm";
export type AngleUnit = "deg" | "rad";
export type HandSide = "Right" | "Left";

export type Settings = {
    theme: Theme;
    showGrid: boolean;
    showAxes: boolean;
    fov: number;
    quality: Quality;
    shadows: boolean;
    orbitSpeed: number;
    zoomSpeed: number;
    zoomToCursor: boolean;
    units: Units;
    angleUnit: AngleUnit;
    confirmNew: boolean;
    autosave: boolean;
    handObject: HandSide;
    handOrbitSpeed: number;
    handZoomSpeed: number;
    pinchSensitivity: number;
    handSmoothing: number;
    cameraId: string;
    showHandPreview: boolean;
    showSkeleton: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
    theme: "system",
    showGrid: true,
    showAxes: true,
    fov: 45,
    quality: "sharp",
    shadows: true,
    orbitSpeed: 1,
    zoomSpeed: 1,
    zoomToCursor: true,
    units: "m",
    angleUnit: "deg",
    confirmNew: true,
    autosave: true,
    handObject: "Right",
    handOrbitSpeed: 1,
    handZoomSpeed: 1,
    pinchSensitivity: 1,
    handSmoothing: 0.5,
    cameraId: "",
    showHandPreview: true,
    showSkeleton: true,
};

const safeStorage: StateStorage = {
    getItem: (name) => {
        try {
            return localStorage.getItem(name);
        } catch {
            return null;
        }
    },
    setItem: (name, value) => {
        try {
            localStorage.setItem(name, value);
        } catch (error) {
            console.warn("Couldn't save settings", error);
        }
    },
    removeItem: (name) => {
        try {
            localStorage.removeItem(name);
        } catch (error) {
            console.warn("Couldn't clear settings", error);
        }
    },
};

type SettingsStore = Settings & {
    set: (patch: Partial<Settings>) => void;
    reset: () => void;
};

export const useSettings = create<SettingsStore>()(
    persist(
        (set) => ({
            ...DEFAULT_SETTINGS,
            set: (patch) => set(patch),
            reset: () => set(DEFAULT_SETTINGS),
        }),
        {
            name: "shapeshift-settings",
            version: 1,
            storage: createJSONStorage(() => safeStorage),
            merge: (persisted, current) => {
                const saved = (persisted ?? {}) as Partial<Settings>;
                const valid = Object.fromEntries(
                    Object.entries(saved).filter(
                        ([k, v]) => k in DEFAULT_SETTINGS && typeof v === typeof DEFAULT_SETTINGS[k as keyof Settings]
                    )
                );
                return { ...current, ...valid };
            },
        }
    )
);

export const UNIT_SCALE: Record<Units, number> = { m: 1, cm: 100, mm: 1000 };

export const DPR: Record<Quality, [number, number]> = {
    performance: [1, 1],
    balanced: [1, 1.5],
    sharp: [1, 2],
};
