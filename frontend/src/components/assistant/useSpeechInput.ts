import { useCallback, useEffect, useRef, useState } from "react";
import { useVoice, VOICE_TOGGLE_EVENT } from "../../ui/voice";

// Web Speech API types are not in lib.dom yet.
type Recognition = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function useSpeechInput({ onInterim, onFinal, onError }: { onInterim: (text: string) => void; onFinal: (text: string) => void; onError: (message: string) => void }) {
    const [listening, setListeningState] = useState(false);
    const setListening = useCallback((on: boolean) => {
        setListeningState(on);
        useVoice.setState({ listening: on });
    }, []);
    const supported = typeof window !== "undefined" && !!recognitionCtor();
    const recognitionRef = useRef<Recognition | null>(null);
    const handlers = useRef({ onInterim, onFinal, onError });
    handlers.current = { onInterim, onFinal, onError };

    const toggle = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            return;
        }
        const Ctor = recognitionCtor();
        if (!Ctor) {
            handlers.current.onError("Voice input isn't supported in this browser. Try Chrome or Edge.");
            return;
        }
        const recognition = new Ctor();
        let finalText = "";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || "en-US";
        recognition.onresult = (event) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const r = event.results[i];
                if (r.isFinal) finalText += `${r[0].transcript} `;
                else interim += r[0].transcript;
            }
            handlers.current.onInterim(`${finalText}${interim}`.trim());
        };
        recognition.onerror = (event) => {
            if (event.error === "not-allowed" || event.error === "service-not-allowed") handlers.current.onError("Microphone access was blocked.");
            else if (event.error !== "aborted" && event.error !== "no-speech") handlers.current.onError(`Voice input failed (${event.error}).`);
        };
        recognition.onend = () => {
            recognitionRef.current = null;
            setListening(false);
            const text = finalText.trim();
            if (text) handlers.current.onFinal(text);
        };
        recognitionRef.current = recognition;
        try {
            recognition.start();
            setListening(true);
        } catch {
            recognitionRef.current = null;
            handlers.current.onError("Couldn't start voice input.");
        }
    }, [setListening]);

    useEffect(() => {
        window.addEventListener(VOICE_TOGGLE_EVENT, toggle);
        return () => {
            window.removeEventListener(VOICE_TOGGLE_EVENT, toggle);
            recognitionRef.current?.abort();
            recognitionRef.current = null;
        };
    }, [toggle]);

    return { listening, supported, toggle };
}
