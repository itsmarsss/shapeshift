import { HandCommands } from "./HandCommands";
import { HandOverlay } from "./HandOverlay";
import { HandPreview } from "./HandPreview";

// Everything on screen for hand control, loaded once it's turned on.
export default function HandUI() {
    return (
        <>
            <HandOverlay />
            <HandPreview />
            <HandCommands />
        </>
    );
}
