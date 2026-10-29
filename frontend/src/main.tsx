import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { startAutosave } from "./scene/autosave";
import { joinRoomFromUrl } from "./collab/session";

startAutosave();
joinRoomFromUrl();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
