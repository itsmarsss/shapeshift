import { create } from "zustand";
import { useScene } from "../scene/store";
import { eventListeners, type EventName } from "../telemetry";

// The first-steps checklist for new visitors: each step ticks itself off when
// they do it, wherever they do it from. Kept in this browser only.

export type Step = "ask" | "move" | "color" | "hands" | "share";
export const STEPS: Step[] = ["ask", "move", "color", "hands", "share"];

const KEY = "shapeshift-first-steps";
const ONBOARDED_KEY = "shapeshift-onboarded";

type Saved = { active: boolean; done: Step[] };

function load(): Saved {
    try {
        const saved = localStorage.getItem(KEY);
        if (saved) return JSON.parse(saved) as Saved;
        // Only people who haven't been here before get the checklist.
        return { active: !localStorage.getItem(ONBOARDED_KEY) && !new URL(location.href).searchParams.has("room"), done: [] };
    } catch {
        return { active: false, done: [] };
    }
}

function save(state: Saved) {
    try {
        localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
        // Storage is optional.
    }
}

type FirstSteps = Saved & {
    mark: (step: Step) => void;
    hide: () => void;
};

export const useFirstSteps = create<FirstSteps>()((set, get) => ({
    ...load(),
    mark: (step) => {
        const { active, done } = get();
        if (!active || done.includes(step)) return;
        const next = { active, done: [...done, step] };
        save(next);
        set(next);
    },
    hide: () => {
        const next = { active: false, done: get().done };
        save(next);
        set(next);
    },
}));

const FROM_EVENTS: Partial<Record<EventName, Step>> = { assistant_prompt: "ask", hands_on: "hands", share_created: "share", export: "share" };
eventListeners.add((event) => {
    const step = FROM_EVENTS[event];
    if (step) useFirstSteps.getState().mark(step);
});

// Moving or recolouring a shape that was already there.
useScene.subscribe((state, prev) => {
    if (state.doc === prev.doc || !useFirstSteps.getState().active) return;
    const before = new Map(prev.doc.objects.map((o) => [o.id, o]));
    for (const object of state.doc.objects) {
        const old = before.get(object.id);
        if (!old || old === object) continue;
        const same = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-6);
        if (!same(object.position, old.position) || !same(object.rotation, old.rotation) || !same(object.scale, old.scale)) useFirstSteps.getState().mark("move");
        if (object.material.color !== old.material.color) useFirstSteps.getState().mark("color");
    }
});
