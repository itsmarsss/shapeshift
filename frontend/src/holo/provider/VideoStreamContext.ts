import { createContext, useContext } from "react";
import type { RefObject } from "react";
import type { StreamStatus } from "../types/streamstatus";

export interface VideoStreamContextType {
    videoRef: RefObject<HTMLVideoElement | null>;
    getAvailableCameras: () => Promise<MediaDeviceInfo[]>;
    setActiveCamera: (cameraId: string) => void;
    status: StreamStatus;
    getStream: () => MediaStream | null;
}

export const VideoStreamContext =
    createContext<VideoStreamContextType | null>(null);

export const useVideoStream = () => {
    const ctx = useContext(VideoStreamContext);
    if (!ctx)
        throw new Error(
            "useVideoStream must be used within a VideoStreamProvider"
        );
    return ctx;
};
