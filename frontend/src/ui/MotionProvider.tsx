import type { ReactNode } from "react";
import { LazyMotion, MotionConfig } from "motion/react";
import { EASE_OUT } from "./motion";

// The animation engine (only what the app uses: no drag or layout) loads after
// the first paint. The system's reduce-motion setting is honoured: things fade
// instead of moving.
const loadFeatures = () => import("./motionFeatures").then((m) => m.default);

export function MotionProvider({ children }: { children: ReactNode }) {
    return (
        <LazyMotion features={loadFeatures} strict>
            <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: EASE_OUT }}>
                {children}
            </MotionConfig>
        </LazyMotion>
    );
}
