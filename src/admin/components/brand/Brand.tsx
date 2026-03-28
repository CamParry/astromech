export function Logo({ size = 28 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 26 26"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
        >
            <rect width="26" height="26" rx="6" fill="var(--am-color-primary-500)" />
            {/* Stylised A mark */}
            <path
                d="M13 5L20 20H6L13 5Z"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <line
                x1="9.5"
                y1="15"
                x2="16.5"
                y2="15"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}
