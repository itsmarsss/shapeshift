import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { StreamStatus } from "../types/streamstatus";

interface VideoStreamContextType {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    getAvailableCameras: () => Promise<MediaDeviceInfo[]>;
    setActiveCamera: (cameraId: string) => void;
    status: StreamStatus;
    getStream: () => MediaStream | null;
}

const VideoStreamContext = createContext<VideoStreamContextType | null>(null);

export const VideoStreamProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const activeCameraRef = useRef<string | null>(null);
    const [status, setStatus] = useState<StreamStatus>("idle");
    const streamRef = useRef<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const getAvailableCameras = useCallback(async (): Promise<
        MediaDeviceInfo[]
    > => {
        try {
            await navigator.mediaDevices.getUserMedia({ video: true });
        } catch {}
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter((d) => d.kind === "videoinput");
    }, []);

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setStatus("stopped");
        }
    }, []);

    const startStream = useCallback(
        async (deviceId: string) => {
            console.log("startStream called with deviceId:", deviceId);
            stopStream();
            setStatus("loading");
            try {
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        deviceId,
                        width: { ideal: 640 },
                        height: { ideal: 360 },
                    },
                });
                console.log("Got new stream:", newStream);
                streamRef.current = newStream;
                if (videoRef.current) {
                    console.log("Setting video srcObject");
                    videoRef.current.srcObject = newStream;
                    // Ensure the video plays after stream change
                    videoRef.current.play().catch(console.error);
                }
                setStatus("streaming");
            } catch (error) {
                console.error("Failed to start stream:", error);
                setStatus("error");
            }
        },
        [stopStream]
    );

    const setActiveCamera = useCallback(
        (id: string) => {
            console.log("setActiveCamera called with:", id);
            activeCameraRef.current = id;
            startStream(id);
        },
        [startStream]
    );

    useEffect(() => {
        const init = async () => {
            const cams = await getAvailableCameras();
            if (cams.length > 0 && !activeCameraRef.current) {
                activeCameraRef.current = cams[0].deviceId;
                startStream(cams[0].deviceId);
            }
        };
        init();
    }, [getAvailableCameras, startStream]);

    const value = useMemo<VideoStreamContextType>(
        () => ({
            videoRef,
            getAvailableCameras,
            setActiveCamera,
            status,
            getStream: () => streamRef.current,
        }),
        [status, setActiveCamera, getAvailableCameras]
    );

    return (
        <VideoStreamContext.Provider value={value}>
            {children}
        </VideoStreamContext.Provider>
    );
};

export const useVideoStream = () => {
    const ctx = useContext(VideoStreamContext);
    if (!ctx)
        throw new Error(
            "useVideoStream must be used within a VideoStreamProvider"
        );
    return ctx;
};
