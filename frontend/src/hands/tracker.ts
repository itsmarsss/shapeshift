import { create } from "zustand";
import { GestureTracker, type HandFrame, type HandState } from "./gestures";
import type { WorkerMessage } from "./handWorker";
import { tuning } from "./gestures";
import { useSettings } from "../settings/store";
import { track } from "../telemetry";

export type HandStatus = "off" | "starting" | "running" | "error";

type HandStore = {
    status: HandStatus;
    error: string | null;
    // While starting: waiting on the camera, or how much of the tracker has
    // downloaded (0 to 1, only the first time; it's cached after).
    stage: "camera" | "loading" | null;
    progress: number | null;
    setEnabled: (on: boolean) => Promise<void>;
};

export const useHandHover = create<{ hoveredId: string | null }>()(() => ({ hoveredId: null }));

export const live: { hands: HandState[]; frames: HandFrame[]; video: HTMLVideoElement | null } = {
    hands: [],
    frames: [],
    video: null,
};

export type Recording = { time: number; hands: HandFrame[] }[];

export const recording: { active: boolean; frames: Recording } = { active: false, frames: [] };

let replaying = false;

export function replay(frames: Recording) {
    if (!frames.length) return;
    replaying = true;
    const gestures = new GestureTracker();
    let i = 0;
    const step = () => {
        if (i < frames.length) {
            live.frames = frames[i].hands;
            live.hands = gestures.update(frames[i].hands, frames[i].time);
            i++;
            requestAnimationFrame(step);
        } else {
            live.frames = [];
            live.hands = [];
            replaying = false;
        }
    };
    requestAnimationFrame(step);
}

const applyTuning = () => {
    const s = useSettings.getState();
    tuning.sensitivity = s.pinchSensitivity;
    tuning.smoothing = s.handSmoothing;
};
applyTuning();
useSettings.subscribe(applyTuning);

let stream: MediaStream | null = null;
let stopLoop: (() => void) | null = null;

// The tracker: a worker with the model loaded. Loading it is the slow part
// (about 22 MB the first time, then compiling it and setting up the graphics),
// so it starts as early as there's a hint it'll be wanted, and stays loaded
// when hand control is turned off, so turning it back on is quick.
type Engine = { worker: Worker; ready: Promise<void>; onHands: ((msg: Extract<WorkerMessage, { type: "hands" }>) => void) | null };
let engine: Engine | null = null;

export function warmUpHands(): Engine {
    if (engine) return engine;
    const worker = new Worker(new URL("./handWorker.ts", import.meta.url), { type: "module" });
    const current: Engine = { worker, ready: Promise.resolve(), onHands: null };
    current.ready = new Promise<void>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === "progress") {
                if (useHands.getState().status === "starting") useHands.setState({ progress: msg.loaded / msg.total });
            } else if (msg.type === "ready") resolve();
            else if (msg.type === "error") {
                reject(new Error(msg.message));
                worker.terminate();
                if (engine === current) engine = null;
            } else current.onHands?.(msg);
        };
    });
    // Nobody waiting on it yet; a failure is reported when someone does.
    current.ready.catch(() => {});
    engine = current;
    return current;
}

// Warms up in the background, later, for someone who has used hand control
// before; for everyone else it waits for a hint like pointing at the button.
export function warmUpHandsSoon() {
    if (!useSettings.getState().handsUsed) return;
    const start = () => void warmUpHands();
    if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 5000 });
    else setTimeout(start, 3000);
}

function teardown() {
    stopLoop?.();
    stopLoop = null;
    if (engine) engine.onHands = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    live.hands = [];
    live.frames = [];
    live.video = null;
}

export const useHands = create<HandStore>()((set, get) => ({
    status: "off",
    error: null,
    stage: null,
    progress: null,
    setEnabled: async (on) => {
        if (!on) {
            // Turned off on purpose, so it stays off next time.
            useSettings.getState().set({ handsAutoStart: false });
            teardown();
            set({ status: "off", error: null, stage: null, progress: null });
            return;
        }
        if (get().status !== "off" && get().status !== "error") return;
        set({ status: "starting", error: null, stage: "camera", progress: null });

        // The tracker loads while the camera is asked for, not after.
        const tracker = warmUpHands();
        try {
            const cameraId = useSettings.getState().cameraId;
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 360 },
                    ...(cameraId ? { deviceId: { ideal: cameraId } } : { facingMode: "user" }),
                },
            });
        } catch {
            teardown();
            set({ status: "error", error: "Allow camera access to use hand control.", stage: null });
            return;
        }
        if (get().status !== "starting") return teardown();

        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
        live.video = video;

        set({ stage: "loading" });
        try {
            await tracker.ready;
        } catch {
            teardown();
            set({ status: "error", error: "Hand tracking failed to load. Check your connection and try again.", stage: null });
            return;
        }
        if (get().status !== "starting") return teardown();

        const gestures = new GestureTracker();
        let busy = false;
        let lastTime = -1;
        tracker.onHands = (msg) => {
            busy = false;
            if (replaying) return;
            live.frames = msg.hands;
            live.hands = gestures.update(msg.hands, msg.time, video.videoWidth / Math.max(1, video.videoHeight));
            if (recording.active) recording.frames.push({ time: msg.time, hands: msg.hands });
        };
        set({ status: "running", stage: null, progress: null });
        useSettings.getState().set({ handsAutoStart: true, handsUsed: true });
        track("hands_on");

        let raf = 0;
        const tick = async () => {
            raf = requestAnimationFrame(tick);
            if (busy || get().status !== "running" || video.readyState < 2 || video.currentTime === lastTime) return;
            lastTime = video.currentTime;
            busy = true;
            const frame = await createImageBitmap(video);
            const time = performance.now();
            if (engine === tracker && tracker.onHands) tracker.worker.postMessage({ frame, time }, [frame]);
            else frame.close();
        };
        raf = requestAnimationFrame(tick);
        stopLoop = () => cancelAnimationFrame(raf);
    },
}));

// Turns hand control back on when the editor opens for someone who had it on
// last time, but only if the browser still lets the camera start without asking.
export async function resumeHands() {
    if (!useSettings.getState().handsAutoStart || useHands.getState().status !== "off") return;
    try {
        const camera = await navigator.permissions.query({ name: "camera" as PermissionName });
        if (camera.state !== "granted") return;
    } catch {
        return;
    }
    void useHands.getState().setEnabled(true);
}
