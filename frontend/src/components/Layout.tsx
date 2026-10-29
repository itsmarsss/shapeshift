import type React from "react";
import styled from "styled-components";
import { GlobalStyle } from "./ui";
import Topbar from "./Topbar";
import Toolbar from "./Toolbar";
import Inspector from "./Inspector";
import BooleanPanel from "./BooleanPanel";
import ChatPanel from "./ChatPanel";
import { Viewport } from "../viewport/Viewport";
import { useShortcuts } from "../hooks/useShortcuts";
import { useUI } from "../ui/store";
import { HandOverlay } from "../hands/HandOverlay";
import { HandPreview } from "../hands/HandPreview";
import { HandCommands } from "../hands/HandCommands";

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
    return (
        <Root style={{ "--chat-width": showChat ? "360px" : "0px" } as React.CSSProperties}>
            <GlobalStyle />
            <Topbar />
            <Stage>
                <Viewport />
                <HandOverlay />
            </Stage>
            <Toolbar />
            <Inspector />
            <BooleanPanel />
            <ChatPanel />
            <HandPreview />
            <HandCommands />
        </Root>
    );
}

export default Layout;
