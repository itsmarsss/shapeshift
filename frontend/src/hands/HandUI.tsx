import { HandCommands } from "./HandCommands";
import { HandOverlay } from "./HandOverlay";
import { HandPreview } from "./HandPreview";
import { HandMenu } from "./HandMenu";
import { HandTutorial } from "./HandTutorial";

// Everything on screen for hand control, loaded once it's turned on.
export default function HandUI() {
    return (
        <>
            <HandOverlay />
            <HandPreview />
            <HandCommands />
            <HandMenu />
            <HandTutorial />
        </>
    );
}
