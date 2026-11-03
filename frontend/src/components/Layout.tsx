import { OfflineNote } from "./OfflineNote";
import { useDockLayout } from "../ui/useDockLayout";
import { Timeline, TIMELINE_HEIGHT } from "./timeline/Timeline";
import { useTimeline } from "../scene/timeline";
import { useCompact } from "../ui/compact";
import { useAccount } from "../account/store";
import { lazy, Suspense, useEffect, type ComponentType, type CSSProperties } from "react";
import { AnimatePresence } from "motion/react";
import styled from "styled-components";
import { GlobalStyle } from "./ui";
import Topbar from "./Topbar";
import Toolbar from "./Toolbar";
import Inspector from "./Inspector";
import { GridScale } from "./GridScale";
import { HistoryPanel } from "./HistoryPanel";
import { StartCard } from "./StartCard";
import { FirstSteps } from "./FirstSteps";
import { SelectionBar } from "./SelectionBar";
import { HandStartup } from "../hands/HandStartup";
import { Guide } from "./Guide";
import { ViewCube } from "./ViewCube";
import { Tooltips } from "./Tooltip";
import { RoomChat } from "../collab/RoomChat";
import { Viewport } from "../viewport/Viewport";
import { useShortcuts } from "../hooks/useShortcuts";
import { useUI } from "../ui/store";
import { resumeHands, useHands, warmUpHandsSoon } from "../hands/tracker";
import { useResolvedTheme } from "../settings/theme";

// Loaded after the editor so they don't hold up the first frame.
const ChatPanel = lazy(() => import("./ChatPanel"));
const HandUI = lazy(() => import("../hands/HandUI"));
const SignInDialog = lazy(() => import("../account/SignInDialog"));
const ScenesDialog = lazy(() => import("../account/ScenesDialog"));
const SettingsModal = lazy(() => import("../settings/SettingsModal"));
const TemplatesDialog = lazy(() => import("./TemplatesDialog"));
const FeedbackDialog = lazy(() => import("./FeedbackDialog"));
const Onboarding = lazy(() => import("./Onboarding"));

function Lazy({ of: Component }: { of: ComponentType }) {
    return (
        <Suspense fallback={null}>
            <Component />
        </Suspense>
    );
}

const Root = styled.div`
    position: relative;
    overflow: hidden;
    width: 100vw;
    height: 100vh;
`;

// The part of the editor that isn't a docked panel: the 3D view and what
// floats over it. It runs the full height, under the top bar, so the
// overlays inside keep measuring from the top of the window.
const Area = styled.div`
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--dock-left, 0px);
    right: var(--dock-right, 0px);
    overflow: hidden;
    pointer-events: none;

    > * {
        pointer-events: auto;
    }
`;

const Stage = styled.div`
    position: absolute;
    inset: var(--topbar) 0 0 0;
`;

export function Layout() {
    useShortcuts();
    const dock = useDockLayout();
    const assistantFloats = dock.open.assistant && !dock.docked("assistant") && !dock.compact;
    const inspectorFloats = dock.open.inspector && !dock.docked("inspector") && !dock.compact;
    const handsOn = useHands((s) => s.status !== "off");
    const showSettings = useUI((s) => s.showSettings);
    const showTemplates = useUI((s) => s.showTemplates);
    const showFeedback = useUI((s) => s.showFeedback);
    const showOnboarding = useUI((s) => s.showOnboarding);
    const timelineOpen = useTimeline((s) => s.open);
    const compact = useCompact();
    const showSignIn = useAccount((s) => s.showSignIn);
    const showScenes = useAccount((s) => s.showScenes);
    const theme = useResolvedTheme();
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);
    useEffect(() => {
        warmUpHandsSoon();
        void resumeHands();
    }, []);
    return (
        <Root
            data-editor
            style={
                {
                    "--dock-left": `${dock.left}px`,
                    "--dock-right": `${dock.right}px`,
                    // What a floating room chat keeps clear of on the right.
                    "--chat-width": assistantFloats ? "372px" : `${dock.right}px`,
                    // How much of each side the panels cover, so things meant
                    // for the middle of the 3D view (cards, the camera's fit)
                    // land in the part that's still visible. On phones the
                    // panels are bottom sheets instead.
                    // Measured inside the area beside any docked panels.
                    "--left-inset": compact ? "0px" : inspectorFloats ? "354px" : "70px",
                    "--right-inset": assistantFloats ? "372px" : "0px",
                    // Panels along the bottom sit above the timeline when it's open.
                    "--bottom-offset": timelineOpen ? `${(compact ? 120 : TIMELINE_HEIGHT) + 12}px` : "0px",
                } as CSSProperties
            }
        >
            <GlobalStyle />
            <Topbar />
            <Area>
                <Stage>
                    <Viewport />
                </Stage>
                <Toolbar />
                <GridScale />
                <HistoryPanel />
                <Timeline />
                <OfflineNote />
                <StartCard />
                <SelectionBar />
                <FirstSteps />
                <HandStartup />
                <ViewCube />
                <Suspense fallback={null}>{handsOn && <HandUI />}</Suspense>
            </Area>
            <Inspector />
            <Guide />
            <Tooltips />
            <RoomChat />
            <Suspense fallback={null}>
                <ChatPanel />
            </Suspense>
            {/* Each in its own Suspense so the first open of one doesn't blank the
                others, and kept by AnimatePresence until it has faded out. */}
            <AnimatePresence>
                {showSettings && <Lazy key="settings" of={SettingsModal} />}
                {showTemplates && <Lazy key="templates" of={TemplatesDialog} />}
                {showFeedback && <Lazy key="feedback" of={FeedbackDialog} />}
                {showSignIn && <Lazy key="sign-in" of={SignInDialog} />}
                {showScenes && <Lazy key="scenes" of={ScenesDialog} />}
                {showOnboarding && <Lazy key="onboarding" of={Onboarding} />}
            </AnimatePresence>
        </Root>
    );
}

export default Layout;
