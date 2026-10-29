import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm";
const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type WorkerHand = { handedness: "Left" | "Right"; score: number; landmarks: number[] };
export type WorkerMessage = { type: "ready"; delegate: string } | { type: "hands"; time: number; hands: WorkerHand[] } | { type: "error"; message: string };

let landmarker: HandLandmarker | null = null;

Object.assign(self, {
    importScripts: (...urls: string[]) => {
        for (const url of urls) {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.send();
            (0, eval)(xhr.responseText);
        }
    },
});

async function create(delegate: "GPU" | "CPU") {
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
    });
}

const post = (msg: WorkerMessage, transfer: Transferable[] = []) => self.postMessage(msg, { transfer });

(async () => {
    try {
        landmarker = await create("GPU");
        post({ type: "ready", delegate: "GPU" });
    } catch {
        try {
            landmarker = await create("CPU");
            post({ type: "ready", delegate: "CPU" });
        } catch (error) {
            post({ type: "error", message: String(error) });
        }
    }
})();

self.onmessage = (e: MessageEvent<{ frame: ImageBitmap; time: number }>) => {
    const { frame, time } = e.data;
    if (!landmarker) {
        frame.close();
        return;
    }
    const result = landmarker.detectForVideo(frame, time);
    frame.close();
    const hands: WorkerHand[] = result.landmarks.map((points, i) => {
        const category = result.handedness[i]?.[0];
        return {
            handedness: category?.categoryName === "Left" ? "Right" : "Left",
            score: category?.score ?? 0,
            landmarks: points.flatMap((p) => [p.x, p.y, p.z]),
        };
    });
    post({ type: "hands", time, hands });
};
