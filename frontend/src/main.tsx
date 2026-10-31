import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { startAutosave } from "./scene/autosave";
import { joinRoomFromUrl } from "./collab/session";
import { openPendingRemix } from "./viewer/remix";
import { openFromUrl } from "./home/openFromUrl";
import { trackOpen, watchErrors } from "./telemetry";
import "./telemetryEvents";

// Offline support only in production builds, so development always gets fresh files.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

startAutosave();
openPendingRemix();
trackOpen();
watchErrors();
openFromUrl();
joinRoomFromUrl();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
