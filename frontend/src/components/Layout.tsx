import { lazy, Suspense, type CSSProperties } from "react";
import styled from "styled-components";
import { GlobalStyle } from "./ui";
import Topbar from "./Topbar";
import Toolbar from "./Toolbar";
import Inspector from "./Inspector";
import BooleanPanel from "./BooleanPanel";
import { Viewport } from "../viewport/Viewport";
import { useShortcuts } from "../hooks/useShortcuts";
import { useUI } from "../ui/store";
import { useHands } from "../hands/tracker";

// Loaded after the editor so they don't hold up the first frame.
const ChatPanel = lazy(() => import("./ChatPanel"));
const HandUI = lazy(() => import("../hands/HandUI"));

const Root = styled.div`
    position: relative;
    width: 100vw;
    height: 100vh;
`;

const Stage = styled.div`
    position: absolute;
    inset: var(--topbar) 0 0 0;
`;

export function Layout() {
    useShortcuts();
    const showChat = useUI((s) => s.showChat);
    const handsOn = useHands((s) => s.status !== "off");
    return (
        <Root style={{ "--chat-width": showChat ? "360px" : "0px" } as CSSProperties}>
            <GlobalStyle />
            <Topbar />
            <Stage>
                <Viewport />
            </Stage>
            <Toolbar />
            <Inspector />
            <BooleanPanel />
            <Suspense fallback={null}>
                <ChatPanel />
                {handsOn && <HandUI />}
            </Suspense>
        </Root>
    );
}

export default Layout;
