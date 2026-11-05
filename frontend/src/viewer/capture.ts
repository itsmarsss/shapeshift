// Draws the scene of a SceneView with `capture` and hands back its canvas: a
// picture taken this way shows the finished scene even if the page was in the
// background, where the browser stops drawing frames.
let drawNow: (() => HTMLCanvasElement) | null = null;

export const captureScene = () => drawNow?.() ?? null;

export function setCapture(draw: (() => HTMLCanvasElement) | null) {
    drawNow = draw;
}
