import { create } from "zustand";
import { download } from "./io";
import { useScene } from "./store";
import { useTimeline } from "./timeline";
import { viewportCanvas } from "../viewport/snapshot";
import { track } from "../telemetry";

// `note` is a short message about the last recording, shown for a moment.
type RecordState = { recording: boolean; note: string | null };

export const useRecording = create<RecordState>()(() => ({ recording: false, note: null }));

let clear: ReturnType<typeof setTimeout> | undefined;
function say(note: string) {
    clearTimeout(clear);
    useRecording.setState({ note });
    clear = setTimeout(() => useRecording.setState({ note: null }), 7000);
}

function pickType() {
    const types = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
}

// Plays the animation once from the start in Render mode, records the
// viewport, and downloads the video. Everything goes back the way it was.
export async function recordAnimation() {
    const canvas = viewportCanvas();
    const type = pickType();
    if (!canvas || !type) return say("This browser can't record video. Try Chrome, Edge or Safari.");
    if (useRecording.getState().recording) return;

    const scene = useScene.getState();
    const timeline = useTimeline.getState();
    const before = { mode: scene.mode, selection: scene.selectedIds, time: timeline.time, loop: scene.doc.animation.loop };
    useRecording.setState({ recording: true, note: null });
    scene.setMode("render");
    scene.select(null);
    timeline.pause();
    timeline.seek(0);

    // Let Render mode draw a frame before recording starts.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (recorder.onstop = () => r()));
    recorder.start();

    // Play once, whatever the loop setting is.
    const { duration } = useScene.getState().doc.animation;
    const started = performance.now();
    await new Promise<void>((resolve) => {
        const step = () => {
            const t = (performance.now() - started) / 1000;
            useTimeline.getState().seek(Math.min(t, duration));
            if (t >= duration) resolve();
            else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    });
    await new Promise((r) => setTimeout(r, 120));
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());

    const s = useScene.getState();
    s.setMode(before.mode);
    s.selectMany(before.selection);
    useTimeline.getState().seek(before.time);
    useRecording.setState({ recording: false });

    const blob = new Blob(chunks, { type });
    const mp4 = type.startsWith("video/mp4");
    download(blob, `shapeshift.${mp4 ? "mp4" : "webm"}`, type);
    track("export", mp4 ? "mp4" : "webm", duration);
    // Firefox only records WebM, which some phones and apps won't open.
    say(mp4 ? "Saved your video as MP4." : "Saved as WebM, since this browser can't make MP4. Chrome, Edge and Safari save MP4.");
}
