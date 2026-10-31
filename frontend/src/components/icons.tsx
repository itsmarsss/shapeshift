type IconProps = { size?: number };

function Svg({ size = 20, children }: IconProps & { children: React.ReactNode }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 256 256"
            fill="none"
            stroke="currentColor"
            strokeWidth={16}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {children}
        </svg>
    );
}

export function ConeIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M128 24 L36 192" />
            <path d="M128 24 L220 192" />
            <path d="M36 192 A92 36 0 0 0 220 192" />
            <path d="M36 192 A92 36 0 0 1 220 192" strokeDasharray="10 22" />
        </Svg>
    );
}

export function WedgeIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M40 200 L40 64 L216 200 Z" />
            <path d="M40 64 L96 32 L240 160 L216 200" />
        </Svg>
    );
}

export function RoofIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M24 192 L88 88 L152 192 Z" />
            <path d="M88 88 L176 56 L232 156 L152 192" />
        </Svg>
    );
}

export function PyramidIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M128 28 L32 176 L128 224 L224 176 Z" />
            <path d="M128 28 L128 224" />
        </Svg>
    );
}

export function HalfSphereIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M28 176 A100 100 0 0 1 228 176" />
            <ellipse cx="128" cy="176" rx="100" ry="28" />
        </Svg>
    );
}

export function TubeIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <ellipse cx="128" cy="64" rx="88" ry="32" />
            <ellipse cx="128" cy="64" rx="48" ry="16" />
            <path d="M40 64 L40 192 A88 32 0 0 0 216 192 L216 64" />
        </Svg>
    );
}

export function ParaboloidIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M36 196 C 52 92, 96 32, 128 32 C 160 32, 204 92, 220 196" />
            <ellipse cx="128" cy="196" rx="92" ry="28" />
        </Svg>
    );
}

export function TorusIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <ellipse cx="128" cy="128" rx="108" ry="76" />
            <path d="M64 116 C 90 160, 166 160, 192 116" />
            <path d="M82 134 C 102 102, 154 102, 174 134" />
        </Svg>
    );
}
