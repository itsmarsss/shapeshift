import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import { Eyedropper } from "@phosphor-icons/react";
import { SWATCHES, hexToHsv, hsvToHex, normalizeHex, recentColors, rememberColor, type Hsv } from "../ui/color";

const Trigger = styled.button`
    width: 100%;
    height: 30px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px 0 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--text);
    font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;

    span {
        width: 22px;
        height: 22px;
        border-radius: 6px;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
        flex-shrink: 0;
    }
    &:hover {
        border-color: var(--border-strong);
    }
`;

const Pop = styled.div`
    position: fixed;
    z-index: 1000;
    width: 232px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
`;

const Swatches = styled.div`
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
`;

const Swatch = styled.button<{ $color: string; $active: boolean }>`
    aspect-ratio: 1;
    border: 0;
    border-radius: 8px;
    background: ${(p) => p.$color};
    box-shadow: ${(p) => (p.$active ? "0 0 0 2px var(--surface), 0 0 0 4px var(--accent)" : "inset 0 0 0 1px rgba(0, 0, 0, 0.15)")};
    cursor: pointer;

    &:hover {
        transform: scale(1.08);
    }
`;

const Label = styled.div`
    color: var(--text-muted);
    font-size: 11px;
`;

const Square = styled.div`
    position: relative;
    height: 132px;
    border-radius: 8px;
    touch-action: none;
    cursor: crosshair;
    background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent);
`;

const Hue = styled.div`
    position: relative;
    height: 14px;
    border-radius: 7px;
    touch-action: none;
    cursor: pointer;
    background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
`;

const Knob = styled.div`
    position: absolute;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.4);
    pointer-events: none;
`;

const Row = styled.div`
    display: flex;
    gap: 6px;

    input {
        flex: 1;
        min-width: 0;
        height: 30px;
        padding: 0 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
        color: var(--text);
        font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    button {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: transparent;
        color: var(--text-muted);
    }
`;

type EyeDropperApi = { open: () => Promise<{ sRGBHex: string }> };
const eyeDropper = () => (window as unknown as { EyeDropper?: new () => EyeDropperApi }).EyeDropper;

// Follows the pointer across an element while it's held down, as fractions of
// its width and height.
function drag(e: ReactPointerEvent<HTMLDivElement>, onMove: (x: number, y: number) => void) {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const at = (ev: { clientX: number; clientY: number }) => {
        const r = el.getBoundingClientRect();
        onMove(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
    };
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
}

type Props = {
    value: string;
    // Called continuously while picking, so the scene updates live.
    onChange: (hex: string) => void;
    // Called once when the picker closes, to end the undo step.
    onCommit?: () => void;
    label?: string;
};

// A swatch that opens a picker: the app's palette, recent colors, a shade
// square and hue bar for anything else, a hex field, and an eyedropper.
export function ColorPicker({ value, onChange, onCommit, label = "Color" }: Props) {
    const [open, setOpen] = useState(false);
    const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
    const [text, setText] = useState(value);
    const [pos, setPos] = useState({ left: 0, top: 0 });
    const trigger = useRef<HTMLButtonElement>(null);
    const pop = useRef<HTMLDivElement>(null);
    const last = useRef(value);
    const [recent, setRecent] = useState<string[]>([]);

    // Follow changes from elsewhere (undo, the assistant) without losing the
    // hue of a grey the person is dragging through.
    useEffect(() => {
        if (value !== last.current) {
            last.current = value;
            setHsv(hexToHsv(value));
            setText(value);
        }
    }, [value]);

    function emit(hex: string, next?: Hsv) {
        last.current = hex;
        setHsv(next ?? hexToHsv(hex));
        setText(hex);
        onChange(hex);
    }

    function close() {
        setOpen(false);
        rememberColor(last.current);
        onCommit?.();
    }

    // Open beside the swatch, flipped above it when there's no room below.
    useLayoutEffect(() => {
        if (!open || !trigger.current || !pop.current) return;
        const t = trigger.current.getBoundingClientRect();
        const p = pop.current.getBoundingClientRect();
        const below = t.bottom + 6 + p.height <= window.innerHeight - 8;
        setPos({
            left: Math.min(Math.max(8, t.left), window.innerWidth - p.width - 8),
            top: below ? t.bottom + 6 : Math.max(8, t.top - 6 - p.height),
        });
    }, [open]);

    // The listeners below always call the latest close.
    const dismissRef = useRef(close);
    useLayoutEffect(() => {
        dismissRef.current = close;
    });
    useEffect(() => {
        const dismiss = () => dismissRef.current();
        if (!open) return;
        const outside = (e: PointerEvent) => {
            const target = e.target as Node;
            if (!pop.current?.contains(target) && !trigger.current?.contains(target)) dismiss();
        };
        // Caught on the way in, so the editor's Escape (clear the selection) doesn't also run.
        const key = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            dismiss();
        };
        window.addEventListener("pointerdown", outside);
        window.addEventListener("keydown", key, true);
        return () => {
            window.removeEventListener("pointerdown", outside);
            window.removeEventListener("keydown", key, true);
        };
    }, [open]);

    const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
    const Dropper = eyeDropper();

    return (
        <>
            <Trigger
                ref={trigger}
                type="button"
                aria-label={`${label}: ${value}`}
                aria-expanded={open}
                onClick={() => {
                    if (open) return close();
                    setRecent(recentColors());
                    setOpen(true);
                }}
            >
                <span style={{ background: value }} />
                {value}
            </Trigger>
            {open &&
                createPortal(
                    <Pop ref={pop} role="dialog" aria-label={`Pick ${label.toLowerCase()}`} style={pos}>
                        <Swatches>
                            {SWATCHES.map((c) => (
                                <Swatch key={c} type="button" title={c} aria-label={c} $color={c} $active={c === value} onClick={() => emit(c)} />
                            ))}
                        </Swatches>
                        {recent.length > 0 && (
                            <>
                                <Label>Recent</Label>
                                <Swatches>
                                    {recent.slice(0, 5).map((c) => (
                                        <Swatch key={c} type="button" title={c} aria-label={`Recent ${c}`} $color={c} $active={c === value} onClick={() => emit(c)} />
                                    ))}
                                </Swatches>
                            </>
                        )}
                        <Square
                            aria-label="Shade"
                            style={{ backgroundColor: hueColor }}
                            onPointerDown={(e) =>
                                drag(e, (x, y) => {
                                    const next = { h: hsv.h, s: x, v: 1 - y };
                                    emit(hsvToHex(next), next);
                                })
                            }
                        >
                            <Knob style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }} />
                        </Square>
                        <Hue
                            aria-label="Hue"
                            onPointerDown={(e) =>
                                drag(e, (x) => {
                                    const next = { ...hsv, h: x * 360 };
                                    emit(hsvToHex(next), next);
                                })
                            }
                        >
                            <Knob style={{ left: `${(hsv.h / 360) * 100}%`, top: "50%", background: hueColor }} />
                        </Hue>
                        <Row>
                            <input
                                aria-label="Hex color"
                                value={text}
                                spellCheck={false}
                                onChange={(e) => {
                                    setText(e.target.value);
                                    const hex = normalizeHex(e.target.value);
                                    if (hex) emit(hex);
                                }}
                                onBlur={() => setText(last.current)}
                                onKeyDown={(e) => e.key === "Enter" && close()}
                            />
                            {Dropper && (
                                <button
                                    type="button"
                                    title="Pick a color from the screen"
                                    onClick={async () => {
                                        try {
                                            const { sRGBHex } = await new Dropper().open();
                                            const hex = normalizeHex(sRGBHex);
                                            if (hex) emit(hex);
                                        } catch {
                                            // Cancelled.
                                        }
                                    }}
                                >
                                    <Eyedropper size={16} />
                                </button>
                            )}
                        </Row>
                    </Pop>,
                    document.body
                )}
        </>
    );
}
