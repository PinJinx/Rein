import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { useRemoteConnection } from '../hooks/useRemoteConnection'
import { useTrackpadGesture } from '../hooks/useTrackpadGesture'
import { ControlBar } from '../components/Trackpad/ControlBar'
import { ExtraKeys } from '../components/Trackpad/ExtraKeys'
import { TouchArea } from '../components/Trackpad/TouchArea'
import { BufferBar } from '@/components/Trackpad/Buffer'
import { ModifierState } from '@/types'

export const Route = createFileRoute('/trackpad')({
    component: TrackpadPage,
})

function TrackpadPage() {
    const [scrollMode, setScrollMode] = useState(false)
    const [modifier, setModifier] = useState<ModifierState>('Release')
    const [buffer, setBuffer] = useState<string[]>([])
    const [keyboardOn, setKeyboardOn] = useState(false)

    const [isMobile, setIsMobile] = useState(
        typeof window !== 'undefined' ? window.innerWidth < 768 : true
    )

    const [controlsVisible, setControlsVisible] = useState(
        typeof window !== 'undefined' ? window.innerWidth < 768 : true
    )

    const bufferText = buffer.join(' + ')
    const hiddenInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768
            setIsMobile(mobile)
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const toggleKeyboard = () => {
        setKeyboardOn(prev => {
            const next = !prev;

            if (next) {
                setTimeout(() => hiddenInputRef.current?.focus(), 50);
            } else {
                hiddenInputRef.current?.blur();
            }

            return next;
        });
    };


    const [sensitivity] = useState(() => {
        if (typeof window === 'undefined') return 1.0
        const s = localStorage.getItem('rein_sensitivity')
        return s ? parseFloat(s) : 1.0
    })

    const [invertScroll] = useState(() => {
        if (typeof window === 'undefined') return false
        const s = localStorage.getItem('rein_invert')
        return s ? JSON.parse(s) : false
    })

    const { status, send, sendCombo } = useRemoteConnection()
    const { isTracking, handlers } = useTrackpadGesture(
        send,
        scrollMode,
        sensitivity,
        invertScroll
    )

    const handleClick = (button: 'left' | 'right') => {
        send({ type: 'click', button, press: true })
        setTimeout(() => send({ type: 'click', button, press: false }), 50)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const key = e.key.toLowerCase()

        if (modifier !== 'Release') {
            if (key === 'backspace') {
                e.preventDefault()
                setBuffer(prev => prev.slice(0, -1))
                return
            }
            if (key === 'escape') {
                e.preventDefault()
                setModifier('Release')
                setBuffer([])
                return
            }
            if (key !== 'unidentified' && key.length > 1) {
                e.preventDefault()
                handleModifier(key)
            }
            return
        }

        if (key === 'backspace') send({ type: 'key', key: 'backspace' })
        else if (key === 'enter') send({ type: 'key', key: 'enter' })
        else if (key !== 'unidentified' && key.length > 1)
            send({ type: 'key', key })
    }

    const handleModifierState = () => {
        switch (modifier) {
            case 'Active':
                if (buffer.length > 0) setModifier('Hold')
                else setModifier('Release')
                break
            case 'Hold':
                setModifier('Release')
                setBuffer([])
                break
            case 'Release':
                setModifier('Active')
                setBuffer([])
                break
        }
    }

    const handleModifier = (key: string) => {
        if (modifier === 'Hold') {
            sendCombo([...buffer, key])
        } else if (modifier === 'Active') {
            setBuffer(prev => [...prev, key])
        }
    }

    const sendText = (val: string) => {
        if (!val) return
        const toSend = val.length > 1 ? `${val} ` : val
        send({ type: 'text', text: toSend })
    }

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        if (!val) return
        e.target.value = ''
        if (modifier !== 'Release') handleModifier(val)
        else sendText(val)
    }

    const handleContainerClick = (e: React.MouseEvent) => {
        if (e.currentTarget === e.target && keyboardOn) {
            hiddenInputRef.current?.focus()
        }
    }

    const stopPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation()
    }

    return (
        <div
            className="flex flex-col h-full overflow-hidden"
            style={{ background: '#080d14' }}
            onClick={handleContainerClick}
        >
            <TouchArea
                isTracking={isTracking}
                scrollMode={scrollMode}
                handlers={handlers}
                status={status}
            />

            {bufferText !== '' && <BufferBar bufferText={bufferText} />}

            <div onClick={stopPropagation} onPointerDown={stopPropagation}>
                <ControlBar
                    scrollMode={scrollMode}
                    modifier={modifier}
                    buffer={bufferText}
                    keyboardOn={keyboardOn}
                    onToggleScroll={() => setScrollMode(v => !v)}
                    onLeftClick={() => handleClick('left')}
                    onRightClick={() => handleClick('right')}
                    onKeyboardToggle={toggleKeyboard}
                    onModifierToggle={handleModifierState}
                />

                {isMobile ? (
                    // MOBILE → show/hide full keyboard
                    controlsVisible && (
                        <ExtraKeys
                            sendKey={(k) => {
                                if (modifier !== 'Release') handleModifier(k);
                                else send({ type: 'key', key: k });
                            }}
                        />
                    )
                ) : (
                    // LAPTOP
                    <>
                        {/* First 3 rows always visible */}
                        <ExtraKeys
                            sendKey={(k) => {
                                if (modifier !== 'Release') handleModifier(k);
                                else send({ type: 'key', key: k });
                            }}
                            visibleRows={3}
                        />

                        {/* Remaining rows toggle (no gap) */}
                        {controlsVisible && (
                            <ExtraKeys
                                sendKey={(k) => {
                                    if (modifier !== 'Release') handleModifier(k);
                                    else send({ type: 'key', key: k });
                                }}
                                startRow={3}
                                noTopBorder
                            />
                        )}
                    </>
                )}




            </div>

            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    setControlsVisible(v => !v)
                }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    width: '100%',
                    padding: '5px 0 4px 0',
                    background:
                        'linear-gradient(180deg, #0d1420 0%, #0a1018 100%)',
                    border: 'none',
                    borderTop: '1px solid rgba(255,255,255,0.07)',
                    cursor: 'pointer',
                    color: 'rgba(148,163,184,0.5)',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    userSelect: 'none',
                }}
            >
                <span
                    style={{
                        transform: controlsVisible
                            ? 'rotate(0deg)'
                            : 'rotate(180deg)',
                        display: 'inline-block',
                        transition: 'transform 0.25s',
                        fontSize: 10,
                    }}
                >
                    ▼
                </span>

                <span>
                    {isMobile
                        ? controlsVisible
                            ? 'HIDE CONTROLS'
                            : 'SHOW CONTROLS'
                        : controlsVisible
                            ? 'HIDE MORE CONTROLS'
                            : 'SHOW MORE CONTROLS'}
                </span>

                <span
                    style={{
                        transform: controlsVisible
                            ? 'rotate(0deg)'
                            : 'rotate(180deg)',
                        display: 'inline-block',
                        transition: 'transform 0.25s',
                        fontSize: 10,
                    }}
                >
                    ▼
                </span>
            </button>

            {keyboardOn && (
                <input
                    ref={hiddenInputRef}
                    className="opacity-0 absolute bottom-0 pointer-events-none h-0 w-0"
                    onKeyDown={handleKeyDown}
                    onChange={handleInput}
                    autoFocus
                    autoComplete="on"
                    autoCorrect="off"
                    autoCapitalize="off"
                />
            )}

        </div>
    )
}
