import styled from "styled-components";
import { useState, useEffect } from "react";
import { useVideoStream } from "../holo/provider/VideoStreamContext";

const VideoContainer = styled.div`
    position: absolute;
    bottom: 12px;
    left: 12px;
    width: 200px;
    background: rgba(18, 20, 26, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 10;
`;

const Video = styled.video`
    width: 100%;
    height: 100px;
    background: #0f1116;
    border-radius: 6px;
    transform: scaleX(-1);
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.06);
`;

const Status = styled.div`
    font-size: 10px;
    color: #8c8c8c;
    background: rgba(0, 0, 0, 0.3);
    padding: 3px 6px;
    border-radius: 4px;
    text-align: center;
    border: 1px solid rgba(255, 255, 255, 0.04);
`;

const CameraSelector = styled.select`
    background: rgba(0, 0, 0, 0.4);
    color: #e6e9ef;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    padding: 2px 4px;
    font-size: 9px;
    width: 100%;
    margin-top: 2px;

    option {
        background: #1e222c;
        color: #e6e9ef;
    }
`;

const Controls = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
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
        console.log("Switching to camera:", cameraId);
        setSelectedCamera(cameraId);
        setActiveCamera(cameraId);
    };

    return (
        <VideoContainer>
            <Video ref={videoRef} autoPlay muted />
            <Controls>
                <Status>{status}</Status>
                {cameras.length > 1 && (
                    <CameraSelector
                        value={selectedCamera}
                        onChange={handleCameraChange}
                    >
                        {cameras.map((camera) => (
                            <option
                                key={camera.deviceId}
                                value={camera.deviceId}
                            >
                                {camera.label ||
                                    `Camera ${camera.deviceId.slice(0, 8)}`}
                            </option>
                        ))}
                    </CameraSelector>
                )}
            </Controls>
        </VideoContainer>
    );
}

export default VideoStream;
