import { createContext, useContext } from "react";

export type ViewportActions = {
    resetCamera: () => void;
    createCube: () => void;
    createSphere: () => void;
    startHandDrag: () => void;
    updateHandDragNormalized: (u: number, v: number) => void;
    endHandDrag: () => void;
    orbitRotate: (dxN: number, dyN: number) => void;
    orbitPan: (dxN: number, dyN: number) => void;
    orbitDolly: (delta: number) => void;
};

export type ViewportContextValue = ViewportActions & {
    register: (impl: Partial<ViewportActions>) => void;
};

export const ViewportContext = createContext<ViewportContextValue | null>(
    null
);

export function useViewportActions() {
    const ctx = useContext(ViewportContext);
    if (!ctx)
        throw new Error(
            "useViewportActions must be used within ViewportProvider"
        );
    return ctx;
}

export function useRegisterViewportActions() {
    return useViewportActions().register;
}
