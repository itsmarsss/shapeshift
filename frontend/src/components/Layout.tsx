import { lazy, Suspense, useEffect, type CSSProperties } from "react";
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
import { useResolvedTheme } from "../settings/theme";

// Loaded after the editor so they don't hold up the first frame.
const ChatPanel = lazy(() => import("./ChatPanel"));
const HandUI = lazy(() => import("../hands/HandUI"));
const SettingsModal = lazy(() => import("../settings/SettingsModal"));

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
    const showSettings = useUI((s) => s.showSettings);
    const theme = useResolvedTheme();
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);
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
                {showSettings && <SettingsModal />}
            </Suspense>
        </Root>
    );
}

export default Layout;
