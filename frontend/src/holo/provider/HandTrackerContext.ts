import { createContext, useContext } from "react";
import type { Hand } from "../objects/hand";

export const FRAME_WIDTH = 640;
export const FRAME_HEIGHT = 360;

export interface HandData {
    hands: Hand[];
}

interface HandTrackerContextType {
    getData: () => HandData | null;
}

export const HandTrackerContext =
    createContext<HandTrackerContextType | null>(null);

export const useHandTracker = () => {
    const ctx = useContext(HandTrackerContext);
    if (!ctx)
        throw new Error(
            "useHandTracker must be used within a HandTrackerProvider"
        );
    return ctx;
};
