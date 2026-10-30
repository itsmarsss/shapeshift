import { OfflineNote } from "./OfflineNote";
import { Timeline, TIMELINE_HEIGHT } from "./timeline/Timeline";
import { useTimeline } from "../scene/timeline";
import { useCompact } from "../ui/compact";
import { useAccount } from "../account/store";
import { lazy, Suspense, useEffect, type CSSProperties } from "react";
import styled from "styled-components";
import { GlobalStyle } from "./ui";
import Topbar from "./Topbar";
import Toolbar from "./Toolbar";
import Inspector from "./Inspector";
import { HistoryPanel } from "./HistoryPanel";
import { StartCard } from "./StartCard";
import { Viewport } from "../viewport/Viewport";
import { useShortcuts } from "../hooks/useShortcuts";
import { useUI } from "../ui/store";
import { useHands } from "../hands/tracker";
import { useResolvedTheme } from "../settings/theme";

// Loaded after the editor so they don't hold up the first frame.
const ChatPanel = lazy(() => import("./ChatPanel"));
const HandUI = lazy(() => import("../hands/HandUI"));
const SignInDialog = lazy(() => import("../account/SignInDialog"));
const ScenesDialog = lazy(() => import("../account/ScenesDialog"));
const SettingsModal = lazy(() => import("../settings/SettingsModal"));
const TemplatesDialog = lazy(() => import("./TemplatesDialog"));
const Onboarding = lazy(() => import("./Onboarding"));

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
    const showTemplates = useUI((s) => s.showTemplates);
    const showOnboarding = useUI((s) => s.showOnboarding);
    const timelineOpen = useTimeline((s) => s.open);
    const compact = useCompact();
    const showSignIn = useAccount((s) => s.showSignIn);
    const showScenes = useAccount((s) => s.showScenes);
    const theme = useResolvedTheme();
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);
    return (
        <Root
            style={
                {
                    "--chat-width": showChat && !compact ? "360px" : "0px",
                    // Panels along the bottom sit above the timeline when it's open.
                    "--bottom-offset": timelineOpen ? `${(compact ? 120 : TIMELINE_HEIGHT) + 12}px` : "0px",
                } as CSSProperties
            }
        >
            <GlobalStyle />
            <Topbar />
            <Stage>
                <Viewport />
            </Stage>
            <Toolbar />
            <Inspector />
            <HistoryPanel />
            <Timeline />
            <OfflineNote />
            <StartCard />
            <Suspense fallback={null}>
                <ChatPanel />
                {handsOn && <HandUI />}
                {showSettings && <SettingsModal />}
                {showTemplates && <TemplatesDialog />}
                {showSignIn && <SignInDialog />}
                {showScenes && <ScenesDialog />}
                {showOnboarding && <Onboarding />}
            </Suspense>
        </Root>
    );
}

export default Layout;
