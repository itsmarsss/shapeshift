import React, { useMemo, useRef } from "react";
import {
    ViewportContext,
    type ViewportActions,
    type ViewportContextValue,
} from "./ViewportContext";

const noop = () => {};

export function ViewportProvider({ children }: { children: React.ReactNode }) {
    const actionsRef = useRef<Partial<ViewportActions>>({});

    const value = useMemo<ViewportContextValue>(() => {
        return {
            resetCamera: () => (actionsRef.current.resetCamera || noop)(),
            createCube: () => (actionsRef.current.createCube || noop)(),
            createSphere: () => (actionsRef.current.createSphere || noop)(),
            startHandDrag: () => (actionsRef.current.startHandDrag || noop)(),
            updateHandDragNormalized: (u: number, v: number) =>
                (actionsRef.current.updateHandDragNormalized || noop)(u, v),
            endHandDrag: () => (actionsRef.current.endHandDrag || noop)(),
            orbitRotate: (dxN: number, dyN: number) =>
                (actionsRef.current.orbitRotate || noop)(dxN, dyN),
            orbitPan: (dxN: number, dyN: number) =>
                (actionsRef.current.orbitPan || noop)(dxN, dyN),
            orbitDolly: (delta: number) =>
                (actionsRef.current.orbitDolly || noop)(delta),
            register: (impl) => {
                actionsRef.current = { ...actionsRef.current, ...impl };
            },
        };
    }, []);

    return (
        <ViewportContext.Provider value={value}>
            {children}
        </ViewportContext.Provider>
    );
}
