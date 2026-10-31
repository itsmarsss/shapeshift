import { useScene } from "./scene/store";
import { secondsSinceFirstOpen, track } from "./telemetry";

// The first shape anyone makes in this browser, and how long it took them to
// get there: the clearest sign of whether getting started is easy.
const FIRST_SHAPE_KEY = "shapeshift-first-shape";

useScene.subscribe((state, prev) => {
    if (state.doc.objects.length === 0 || prev.doc.objects.length > 0) return;
    try {
        if (localStorage.getItem(FIRST_SHAPE_KEY)) return;
        localStorage.setItem(FIRST_SHAPE_KEY, "1");
    } catch {
        return;
    }
    track("first_shape", "", secondsSinceFirstOpen());
});
