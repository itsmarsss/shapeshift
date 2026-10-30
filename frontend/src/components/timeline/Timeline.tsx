import { useEffect, useRef } from "react";
import styled from "styled-components";
import { DiamondsFour, Pause, Play, Repeat, SkipBack, Trash, X } from "@phosphor-icons/react";
import { useShallow } from "zustand/react/shallow";
import { keyTimes } from "../../scene/animation";
import type { Command } from "../../scene/schema";
import { useScene } from "../../scene/store";
import { useTimeline } from "../../scene/timeline";
import { IconButton, Panel } from "../ui";

export const TIMELINE_HEIGHT = 92;

const Root = styled(Panel)`
    left: calc(var(--gap) * 2 + 46px);
    right: calc(var(--gap) * 2 + var(--chat-width, 0px));
    bottom: var(--gap);
    height: ${TIMELINE_HEIGHT}px;
    padding: 8px 10px;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    z-index: 35;
`;

const Controls = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
`;

const PlayButton = styled.button`
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 0;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--accent-text);

    &:hover {
        opacity: 0.9;
    }
`;

const Clock = styled.div`
    width: 86px;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;

    b {
        color: var(--text);
        font-size: 15px;
        font-weight: 600;
    }
`;

const Track = styled.div`
    position: relative;
    flex: 1;
    min-width: 120px;
    height: 54px;
    border-radius: var(--radius);
    background: var(--bg);
    border: 1px solid var(--border);
    cursor: ew-resize;
    touch-action: none;
    user-select: none;
`;

const Tick = styled.div<{ $major: boolean }>`
    position: absolute;
    bottom: 0;
    width: 1px;
    height: ${(p) => (p.$major ? 10 : 5)}px;
    background: var(--border-strong);

    span {
        position: absolute;
        bottom: 11px;
        left: 3px;
        color: var(--text-faint);
        font-size: 10px;
    }
`;

const Diamond = styled.button<{ $active: boolean; $faint: boolean }>`
    position: absolute;
    top: 14px;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    padding: 0;
    border: 1.5px solid ${(p) => (p.$active ? "#fff" : "transparent")};
    transform: rotate(45deg);
    background: ${(p) => (p.$faint ? "var(--text-faint)" : "var(--warning, #ffc53d)")};
    cursor: pointer;
`;

const Head = styled.div`
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 2px;
    margin-left: -1px;
    background: var(--accent);
    pointer-events: none;

    &::before {
        content: "";
        position: absolute;
        top: 0;
        left: -5px;
        border: 6px solid transparent;
        border-top-color: var(--accent);
    }
`;

const Hint = styled.div`
    position: absolute;
    inset: 0 12px;
    display: flex;
    align-items: center;
    color: var(--text-faint);
    font-size: 12px;
    pointer-events: none;
`;

const Side = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: stretch;
`;

const KeyButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border-radius: var(--radius);
    border: 1px solid var(--border-strong);
    background: var(--surface-raised);
    color: var(--text);
    font-weight: 500;
    white-space: nowrap;

    &:hover:not(:disabled) {
        background: var(--surface-hover);
    }
    &:disabled {
        color: var(--text-faint);
    }
`;

const Length = styled.label`
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-muted);
    font-size: 11px;

    input {
        width: 44px;
        height: 22px;
        padding: 0 4px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--bg);
        font-variant-numeric: tabular-nums;
    }
`;

function isTyping(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function Timeline() {
    const open = useTimeline((s) => s.open);
    const setOpen = useTimeline((s) => s.setOpen);
    const time = useTimeline((s) => s.time);
    const playing = useTimeline((s) => s.playing);
    const seek = useTimeline((s) => s.seek);
    const toggle = useTimeline((s) => s.toggle);
    const animation = useScene((s) => s.doc.animation);
    const selectedIds = useScene(useShallow((s) => s.selectedIds));
    const run = useScene((s) => s.run);
    const track = useRef<HTMLDivElement>(null);

    const { duration, loop } = animation;
    const mine = selectedIds.flatMap((id) => keyTimes(animation, id));
    const shown = selectedIds.length ? [...new Set(mine)] : keyTimes(animation);
    const atKey = shown.some((t) => Math.abs(t - time) < 0.02);

    function addKey() {
        const { selectedIds: ids } = useScene.getState();
        if (!ids.length) return;
        const t = Math.round(useTimeline.getState().time * 100) / 100;
        run(ids.map((target): Command => ({ type: "keyframe", target, time: t })));
    }

    function removeKey() {
        const { selectedIds: ids } = useScene.getState();
        const t = shown.find((k) => Math.abs(k - useTimeline.getState().time) < 0.02);
        if (t === undefined) return;
        run(ids.map((target): Command => ({ type: "removeKeyframe", target, time: t })));
    }

    // Space plays and pauses, K adds a keyframe.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.code === "Space") {
                e.preventDefault();
                useTimeline.getState().toggle();
            } else if (e.key.toLowerCase() === "k") {
                e.preventDefault();
                addKey();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // addKey only reads fresh state.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open) return null;

    function seekFromPointer(clientX: number) {
        const rect = track.current?.getBoundingClientRect();
        if (!rect) return;
        const t = ((clientX - rect.left) / rect.width) * duration;
        // Snap to keyframes that are close, which makes them easy to land on.
        const near = shown.find((k) => Math.abs(k - t) < duration * 0.012);
        seek(near ?? Math.round(t * 20) / 20);
    }

    const step = duration <= 5 ? 0.5 : duration <= 20 ? 1 : duration <= 60 ? 5 : 10;
    const ticks = Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step);
    const pct = (t: number) => `${(t / duration) * 100}%`;

    return (
        <Root aria-label="Animation timeline">
            <Controls>
                <IconButton title="Back to start" onClick={() => seek(0)}>
                    <SkipBack size={16} weight="fill" />
                </IconButton>
                <PlayButton title={playing ? "Pause (Space)" : "Play (Space)"} onClick={toggle}>
                    {playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
                </PlayButton>
            </Controls>
            <Clock>
                <b>{time.toFixed(1)}s</b>
                <div>of {duration}s</div>
            </Clock>
            <Track
                ref={track}
                onPointerDown={(e) => {
                    if ((e.target as HTMLElement).dataset.key) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    useTimeline.getState().pause();
                    seekFromPointer(e.clientX);
                }}
                onPointerMove={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e.clientX);
                }}
            >
                {ticks.map((t) => (
                    <Tick key={t} $major={Number.isInteger(t)} style={{ left: pct(t) }}>
                        {Number.isInteger(t) && <span>{t}s</span>}
                    </Tick>
                ))}
                {shown.map((t) => (
                    <Diamond
                        key={t}
                        data-key="1"
                        style={{ left: pct(t) }}
                        $active={Math.abs(t - time) < 0.02}
                        $faint={!selectedIds.length}
                        title={`Keyframe at ${t}s`}
                        onClick={() => {
                            useTimeline.getState().pause();
                            seek(t);
                        }}
                    />
                ))}
                <Head style={{ left: pct(time) }} />
                {!animation.tracks.length && (
                    <Hint>Select something and press Keyframe, move the playhead, move it, and press Keyframe again. Or ask the assistant to “make it spin”.</Hint>
                )}
            </Track>
            <Side>
                <KeyButton onClick={addKey} disabled={!selectedIds.length} title="Record the selection here (K)">
                    <DiamondsFour size={15} weight="fill" />
                    Keyframe
                </KeyButton>
                <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                    <Length title="Animation length">
                        <input
                            type="number"
                            min={0.5}
                            max={600}
                            step={0.5}
                            value={duration}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (v > 0) run({ type: "timeline", duration: Math.min(600, v) }, { coalesce: "timeline:duration" });
                            }}
                        />
                        s
                    </Length>
                    <IconButton $size={24} $active={loop} title={loop ? "Looping" : "Plays once"} onClick={() => run({ type: "timeline", loop: !loop })}>
                        <Repeat size={14} />
                    </IconButton>
                    <IconButton $size={24} title="Delete this keyframe" disabled={!atKey || !selectedIds.length} onClick={removeKey}>
                        <Trash size={14} />
                    </IconButton>
                </div>
            </Side>
            <IconButton $size={26} title="Close timeline" onClick={() => setOpen(false)} style={{ alignSelf: "flex-start" }}>
                <X size={14} />
            </IconButton>
        </Root>
    );
}

export default Timeline;
