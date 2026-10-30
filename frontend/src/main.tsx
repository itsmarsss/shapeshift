import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { startAutosave } from "./scene/autosave";
import { joinRoomFromUrl } from "./collab/session";
import { openPendingRemix } from "./viewer/remix";

startAutosave();
openPendingRemix();
joinRoomFromUrl();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
