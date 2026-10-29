import styled from "styled-components";
import { useState, useEffect } from "react";
import { CameraSlash, CircleNotch } from "@phosphor-icons/react";
import { useVideoStream } from "../holo/provider/VideoStreamContext";
import { Select } from "./ui";

const VideoContainer = styled.div`
    position: absolute;
    bottom: var(--gap);
    left: var(--gap);
    width: 220px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 20;
`;

const Frame = styled.div`
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--bg);
`;

const Video = styled.video`
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scaleX(-1);
    display: block;
`;

const Overlay = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
    padding: 8px;
`;

const CameraSelect = styled(Select)`
    height: 26px;
    font-size: 12px;
`;

export function VideoStream() {
    const { videoRef, status, getAvailableCameras, setActiveCamera } =
        useVideoStream();
    const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
    const [selectedCamera, setSelectedCamera] = useState<string>("");

    useEffect(() => {
        const loadCameras = async () => {
            const availableCameras = await getAvailableCameras();
            setCameras(availableCameras);
            if (availableCameras.length > 0) {
                setSelectedCamera(
                    (prev) => prev || availableCameras[0].deviceId
                );
            }
        };
        loadCameras();
    }, [getAvailableCameras]);

    // Listen for device changes
    useEffect(() => {
        const handleDeviceChange = () => {
            const loadCameras = async () => {
                const availableCameras = await getAvailableCameras();
                setCameras(availableCameras);
            };
            loadCameras();
        };

        navigator.mediaDevices.addEventListener(
            "devicechange",
            handleDeviceChange
        );
        return () => {
            navigator.mediaDevices.removeEventListener(
                "devicechange",
                handleDeviceChange
            );
        };
    }, [getAvailableCameras]);

    const handleCameraChange = (
        event: React.ChangeEvent<HTMLSelectElement>
    ) => {
        const cameraId = event.target.value;
        setSelectedCamera(cameraId);
        setActiveCamera(cameraId);
    };

    return (
        <VideoContainer>
            <Frame>
                <Video ref={videoRef} autoPlay muted playsInline />
                {status === "loading" && (
                    <Overlay>
                        <CircleNotch size={18} />
                        Starting camera
                    </Overlay>
                )}
                {status === "error" && (
                    <Overlay>
                        <CameraSlash size={18} />
                        Allow camera access to use hand controls
                    </Overlay>
                )}
            </Frame>
            {cameras.length > 1 && (
                <CameraSelect
                    value={selectedCamera}
                    onChange={handleCameraChange}
                >
                    {cameras.map((camera) => (
                        <option key={camera.deviceId} value={camera.deviceId}>
                            {camera.label ||
                                `Camera ${camera.deviceId.slice(0, 8)}`}
                        </option>
                    ))}
                </CameraSelect>
            )}
        </VideoContainer>
    );
}

export default VideoStream;
