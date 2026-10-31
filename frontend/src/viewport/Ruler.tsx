import { useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { X } from "@phosphor-icons/react";
import { useSettings } from "../settings/store";
import { usePalette } from "../settings/theme";
import { formatLength } from "../ui/units";
import { useTools } from "./tools";

const label: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 4px 3px 8px",
    background: "var(--surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    color: "var(--text)",
    font: "12px/1.3 -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    transform: "translateY(-24px)",
};

const clear: React.CSSProperties = {
    display: "inline-flex",
    padding: 2,
    border: 0,
    borderRadius: 4,
    background: "transparent",
    color: "var(--text-muted)",
};

export function Ruler() {
    const points = useTools((s) => s.ruler);
    const units = useSettings((s) => s.units);
    const palette = usePalette();
    const dots = useMemo(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
        return g;
    }, [points]);

    if (!points.length) return null;
    const [a, b] = points.map((p) => new THREE.Vector3(...p));
    const mid = b ? a.clone().add(b).multiplyScalar(0.5) : a;

    return (
        <group>
            <points geometry={dots} renderOrder={3} raycast={() => null}>
                <pointsMaterial size={8} sizeAttenuation={false} color={palette.accent} depthTest={false} />
            </points>
            {b && <Line points={[a, b]} color={palette.accent} lineWidth={2} depthTest={false} renderOrder={3} raycast={() => null} />}
            {b && (
                <Html position={mid} center zIndexRange={[15, 0]}>
                    <div style={label} data-ruler>
                        <span>{formatLength(a.distanceTo(b), units)}</span>
                        <span style={{ color: "var(--text-muted)" }}>
                            {(["x", "y", "z"] as const).map((axis) => `${axis.toUpperCase()} ${formatLength(Math.abs(b[axis] - a[axis]), units).split(" ")[0]}`).join("  ")}
                        </span>
                        <button style={clear} title="Clear measurement" onClick={() => useTools.getState().clearRuler()}>
                            <X size={12} />
                        </button>
                    </div>
                </Html>
            )}
        </group>
    );
}
