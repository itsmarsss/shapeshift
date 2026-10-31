import { create } from "zustand";

// The library that cuts and joins solids (about 300 kB) loads only when a
// scene needs it: holes, combining two shapes, or exporting a cut model. Until
// it arrives, holes draw uncut for a moment.

type Csg = typeof import("three-bvh-csg");

let csg: Csg | null = null;
let loading: Promise<Csg> | null = null;

export const useCsg = create<{ ready: boolean }>(() => ({ ready: false }));

export function loadCsg(): Promise<Csg> {
    loading ??= import("three-bvh-csg").then((module) => {
        csg = module;
        useCsg.setState({ ready: true });
        return module;
    });
    return loading;
}

// The library if it's here already; otherwise starts fetching it.
export function csgNow(): Csg | null {
    if (!csg) void loadCsg();
    return csg;
}

export class CsgNotReady extends Error {
    constructor() {
        super("Combining shapes is still getting ready. Try again in a moment.");
    }
}

export function requireCsg(): Csg {
    const module = csgNow();
    if (!module) throw new CsgNotReady();
    return module;
}
