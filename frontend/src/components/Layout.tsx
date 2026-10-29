import type React from "react";
import styled from "styled-components";
import { GlobalStyle } from "./ui";
import Topbar from "./Topbar";
import Toolbar from "./Toolbar";
import Inspector from "./Inspector";
import { useShortcuts } from "../hooks/useShortcuts";
import BooleanPanel from "./BooleanPanel";
import HolohandsOverlay from "../holo/components/HolohandsOverlay";
import Viewport from "./Viewport";
import ChatPanel from "./ChatPanel";
import { useEditor } from "../store/editor";
import VideoStream from "./VideoStream";
import { VideoStreamProvider } from "../holo/provider/VideoStreamProvider";
import AgentTimeline from "./AgentTimeline";
import { useAgentTimeline } from "../store/agentTimeline";

const Root = styled.div`
    position: relative;
    width: 100vw;
    height: 100vh;
`;

export function Layout() {
    useShortcuts();
    const showChat = useEditor((s) => s.showChatPanel);
    const editorMode = useEditor((s) => s.editorMode);
    const steps = useAgentTimeline((s) => s.steps);
    const showTimeline = useAgentTimeline((s) => s.showTimeline);
    return (
        <VideoStreamProvider>
            <Root style={{ "--chat-width": showChat ? "320px" : "0px" } as React.CSSProperties}>
                <GlobalStyle />
                <Topbar />
                {editorMode === "render" ? <Viewport /> : <HolohandsOverlay />}
                <Toolbar />
                <Inspector />
                <BooleanPanel />
                {showTimeline ? <AgentTimeline steps={steps} /> : null}
                {showChat ? <ChatPanel /> : null}
                <VideoStream />
            </Root>
        </VideoStreamProvider>
    );
}

export default Layout;
