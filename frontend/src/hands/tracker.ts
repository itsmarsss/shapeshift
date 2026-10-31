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
let worker: Worker | null = null;
let stopLoop: (() => void) | null = null;

function teardown() {
    stopLoop?.();
    stopLoop = null;
    worker?.terminate();
    worker = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    live.hands = [];
    live.frames = [];
    live.video = null;
}

export const useHands = create<HandStore>()((set, get) => ({
    status: "off",
    error: null,
    setEnabled: async (on) => {
        if (!on) {
            teardown();
            set({ status: "off", error: null });
            return;
        }
        if (get().status !== "off" && get().status !== "error") return;
        set({ status: "starting", error: null });

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
            set({ status: "error", error: "Allow camera access to use hand control." });
            return;
        }

        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
        live.video = video;

        const gestures = new GestureTracker();
        worker = new Worker(new URL("./handWorker.ts", import.meta.url), { type: "module" });
        let busy = false;
        let lastTime = -1;

        worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
            const msg = e.data;
            if (msg.type === "ready") {
                set({ status: "running" });
                track("hands_on");
            }
            else if (msg.type === "error") {
                teardown();
                set({ status: "error", error: "Hand tracking failed to load." });
            } else {
                busy = false;
                if (replaying) return;
                live.frames = msg.hands;
                live.hands = gestures.update(msg.hands, msg.time, video.videoWidth / Math.max(1, video.videoHeight));
                if (recording.active) recording.frames.push({ time: msg.time, hands: msg.hands });
            }
        };

        let raf = 0;
        const tick = async () => {
            raf = requestAnimationFrame(tick);
            if (busy || !worker || get().status !== "running" || video.readyState < 2 || video.currentTime === lastTime) return;
            lastTime = video.currentTime;
            busy = true;
            const frame = await createImageBitmap(video);
            const time = performance.now();
            if (worker) worker.postMessage({ frame, time }, [frame]);
            else frame.close();
        };
        raf = requestAnimationFrame(tick);
        stopLoop = () => cancelAnimationFrame(raf);
    },
}));
