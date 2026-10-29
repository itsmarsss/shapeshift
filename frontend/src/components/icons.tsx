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

export function TorusIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <ellipse cx="128" cy="128" rx="108" ry="76" />
            <path d="M64 116 C 90 160, 166 160, 192 116" />
            <path d="M82 134 C 102 102, 154 102, 174 134" />
        </Svg>
    );
}
