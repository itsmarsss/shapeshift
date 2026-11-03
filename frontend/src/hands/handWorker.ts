import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm";
// Served from the app itself: Google's copy can take a minute to download.
// The name has a version, so it can be cached for good; a new model gets a new name.
const MODEL_URL = "/mediapipe/hand_landmarker-float16-v1.task";

export type WorkerHand = { handedness: "Left" | "Right"; score: number; landmarks: number[]; world?: number[] };
export type WorkerMessage =
    | { type: "progress"; loaded: number; total: number }
    | { type: "ready"; delegate: string }
    | { type: "hands"; time: number; hands: WorkerHand[] }
    | { type: "error"; message: string };

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

// The model, fetched here rather than by MediaPipe so its download can show
// progress. It's the biggest part of starting up.
async function fetchModel(): Promise<Uint8Array> {
    const res = await fetch(MODEL_URL);
    if (!res.ok || !res.body) throw new Error(`Model download failed (${res.status})`);
    const total = Number(res.headers.get("content-length")) || 7_800_000;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    let lastSent = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (loaded - lastSent > total / 50) {
            lastSent = loaded;
            post({ type: "progress", loaded, total });
        }
    }
    const model = new Uint8Array(loaded);
    let at = 0;
    for (const c of chunks) {
        model.set(c, at);
        at += c.length;
    }
    post({ type: "progress", loaded, total: loaded });
    return model;
}

async function create(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>, model: Uint8Array, delegate: "GPU" | "CPU") {
    return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: model, delegate },
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
        // The engine and the model download side by side.
        const [fileset, model] = await Promise.all([FilesetResolver.forVisionTasks(WASM_URL), fetchModel()]);
        try {
            landmarker = await create(fileset, model, "GPU");
            post({ type: "ready", delegate: "GPU" });
        } catch {
            // No usable graphics: the same files, run on the processor.
            landmarker = await create(fileset, model, "CPU");
            post({ type: "ready", delegate: "CPU" });
        }
    } catch (error) {
        post({ type: "error", message: String(error) });
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
            handedness: category?.categoryName === "Right" ? "Right" : "Left",
            score: category?.score ?? 0,
            landmarks: points.flatMap((p) => [p.x, p.y, p.z]),
            // Real-space positions in meters, used to estimate distance.
            world: result.worldLandmarks[i]?.flatMap((p) => [p.x, p.y, p.z]),
        };
    });
    post({ type: "hands", time, hands });
};
