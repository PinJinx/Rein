import React from 'react';

interface TouchAreaProps {
    scrollMode: boolean;
    isTracking: boolean;
    handlers: {
        onTouchStart: (e: React.TouchEvent) => void;
        onTouchMove: (e: React.TouchEvent) => void;
        onTouchEnd: (e: React.TouchEvent) => void;
    };
    status: 'connecting' | 'connected' | 'disconnected';
}

export const TouchArea: React.FC<TouchAreaProps> = ({ scrollMode, isTracking, handlers, status }) => {
    const handleStart = (e: React.TouchEvent) => {
        handlers.onTouchStart(e);
    };

    const handlePreventFocus = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    return (
        <div
            className="bg-neutral-800 relative touch-none select-none flex items-center justify-center p-4"
            style={{ width: "100%", height: "100%" }}
            onTouchStart={handleStart}
            onTouchMove={handlers.onTouchMove}
            onTouchEnd={handlers.onTouchEnd}
            onMouseDown={handlePreventFocus}
        >
            {/* Status strip at very top */}
            <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: status === "connected" ? "#22c55e" : status === "connecting" ? "#f59e0b" : "#ef4444",
            }} />

            <div className="text-neutral-600 text-center pointer-events-none">
                <div className="text-4xl mb-2 opacity-20">
                    {scrollMode ? 'Scroll Mode' : 'Touch Area'}
                </div>
            </div>

            {scrollMode && (
                <div className="absolute top-4 right-4 badge badge-info">SCROLL Active</div>
            )}
        </div>
    );
};
