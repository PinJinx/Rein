import React from 'react';

interface ExtraKeysProps {
    sendKey: (key: string) => void;
    onInputFocus: () => void;
}

const KEYS = ['Esc', 'Tab', 'Ctrl', 'Alt', 'Shift', 'Meta', 'Home', 'End', 'PgUp', 'PgDn', 'Del'];

export const ExtraKeys: React.FC<ExtraKeysProps> = ({ sendKey, onInputFocus }) => {
    const handleInteract = (e: React.PointerEvent, key: string) => {
        e.preventDefault();
        sendKey(key.toLowerCase());
        onInputFocus();
    };

    return (
        <div className="bg-base-300 p-2 overflow-x-auto whitespace-nowrap shrink-0 flex gap-2 hide-scrollbar">
            {KEYS.map(k => (
                <button
                    key={k}
                    className="btn btn-sm btn-neutral min-w-[3rem]"
                    onPointerDown={(e) => handleInteract(e, k)}
                >
                    {k}
                </button>
            ))}
        </div>
    );
};
