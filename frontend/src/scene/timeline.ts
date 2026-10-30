import { create } from "zustand";
import { evaluate, type Pose } from "./animation";
import { useScene } from "./store";

type TimelineState = {
    open: boolean;
    time: number;
    playing: boolean;
    // Animated values at `time`, by entity id.
    poses: Map<string, Pose>;
    setOpen: (open: boolean) => void;
    seek: (time: number) => void;
    play: () => void;
    pause: () => void;
    toggle: () => void;
};

const posesAt = (time: number) => evaluate(useScene.getState().doc.animation, time);

let raf = 0;
let last = 0;

export const useTimeline = create<TimelineState>()((set, get) => {
    function tick(now: number) {
        const { duration, loop } = useScene.getState().doc.animation;
        let time = get().time + (now - last) / 1000;
        last = now;
        if (time >= duration) {
            if (!loop) {
                set({ time: duration, playing: false, poses: posesAt(duration) });
                return;
            }
            time %= duration;
        }
        set({ time, poses: posesAt(time) });
        raf = requestAnimationFrame(tick);
    }

    return {
        open: false,
        time: 0,
        playing: false,
        poses: new Map(),
        setOpen: (open) => set({ open }),
        seek: (raw) => {
            const time = Math.min(Math.max(0, raw), useScene.getState().doc.animation.duration);
            set({ time, poses: posesAt(time) });
        },
        play: () => {
            if (get().playing) return;
            const { duration } = useScene.getState().doc.animation;
            if (get().time >= duration - 1e-3) set({ time: 0 });
            cancelAnimationFrame(raf);
            last = performance.now();
            set({ playing: true });
            raf = requestAnimationFrame(tick);
        },
        pause: () => {
            cancelAnimationFrame(raf);
            set({ playing: false });
        },
        toggle: () => (get().playing ? get().pause() : get().play()),
    };
});

// Keep poses current when the animation itself changes, such as a new keyframe.
useScene.subscribe((state, prev) => {
    if (state.doc.animation === prev.doc.animation) return;
    const { time } = useTimeline.getState();
    const duration = state.doc.animation.duration;
    useTimeline.setState({ time: Math.min(time, duration), poses: evaluate(state.doc.animation, Math.min(time, duration)) });
});

export function isAnimated(id: string) {
    return useScene.getState().doc.animation.tracks.some((t) => t.target === id);
}
