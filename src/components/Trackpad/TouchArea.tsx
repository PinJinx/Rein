import React from "react";

interface TouchAreaProps {
    scrollMode: boolean;
    isTracking: boolean;
    handlers: {
        onTouchStart: (e: React.TouchEvent) => void;
        onTouchMove: (e: React.TouchEvent) => void;
        onTouchEnd: (e: React.TouchEvent) => void;
    };
    status: "connecting" | "connected" | "disconnected";
}

export const TouchArea: React.FC<TouchAreaProps> = ({
    scrollMode,
    isTracking,
    handlers,
    status,
}) => {
    const statusColor =
        status === "connected"
            ? "#22c55e"
            : status === "connecting"
                ? "#f59e0b"
                : "#ef4444";

    const statusLabel =
        status === "connected"
            ? "Connected"
            : status === "connecting"
                ? "Connecting..."
                : "Disconnected";

    return (
        <div
            className="flex-1 relative touch-none select-none overflow-hidden"
            onTouchStart={handlers.onTouchStart}
            onTouchMove={handlers.onTouchMove}
            onTouchEnd={handlers.onTouchEnd}
            onMouseDown={(e) => e.preventDefault()}
            style={{
                background: `
          radial-gradient(ellipse at 30% 40%, rgba(99,102,241,0.04) 0%, transparent 60%),
          radial-gradient(ellipse at 70% 70%, rgba(196,24,126,0.04) 0%, transparent 60%),
          #080d14
        `,
            }}
        >
            {/* Subtle dot grid */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)`,
                    backgroundSize: "28px 28px",
                    backgroundPosition: "14px 14px",
                }}
            />

            {/* Status bar top */}
            <div
                className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 z-10"
                style={{
                    background: "linear-gradient(180deg, rgba(8,13,20,0.9) 0%, transparent 100%)",
                }}
            >
                <div className="flex items-center gap-2">
                    <div
                        className="rounded-full"
                        style={{
                            width: 7,
                            height: 7,
                            background: statusColor,
                            boxShadow: `0 0 6px ${statusColor}`,
                            animation: status === "connecting" ? "pulse 1.2s infinite" : undefined,
                        }}
                    />
                    <span
                        style={{
                            fontSize: 11,
                            fontFamily: "monospace",
                            fontWeight: 600,
                            color: statusColor,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            opacity: 0.9,
                        }}
                    >
                        {statusLabel}
                    </span>
                </div>

                {scrollMode && (
                    <div
                        className="flex items-center gap-1 px-2 py-1 rounded-full"
                        style={{
                            background: "rgba(59,130,246,0.15)",
                            border: "1px solid rgba(59,130,246,0.4)",
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#60a5fa",
                            letterSpacing: "0.06em",
                            fontFamily: "monospace",
                        }}
                    >
                        ↕ SCROLL
                    </div>
                )}
            </div>

            {/* Center watermark */}
            <div
                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                style={{ opacity: isTracking ? 0 : 0.18 }}
            >
                <div
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        border: "2px solid rgba(255,255,255,0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 10,
                    }}
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)">
                        <path d="M4 0l16 12.279-6.951 1.17 4.325 8.817-3.596 1.734-4.35-8.879-5.428 4.702z" />
                    </svg>
                </div>
                <span
                    style={{
                        color: "rgba(255,255,255,0.5)",
                        fontSize: 12,
                        fontFamily: "monospace",
                        letterSpacing: "0.15em",
                        fontWeight: 600,
                        textTransform: "uppercase",
                    }}
                >
                    Touch to Control
                </span>
                <span
                    style={{
                        color: "rgba(255,255,255,0.25)",
                        fontSize: 10,
                        fontFamily: "monospace",
                        letterSpacing: "0.1em",
                        marginTop: 4,
                    }}
                >
                    2-finger scroll · 2-tap right-click
                </span>
            </div>

            {/* Active tracking ring */}
            {isTracking && (
                <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ opacity: 0.4 }}
                >
                    <div
                        style={{
                            width: 60,
                            height: 60,
                            borderRadius: "50%",
                            border: "2px solid #6366f1",
                            animation: "ping 0.6s ease-out infinite",
                        }}
                    />
                </div>
            )}

            <style>{`
        @keyframes ping {
          0% { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
        </div>
    );
};
