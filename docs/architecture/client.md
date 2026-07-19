# Client Layer

The Rein client is a **React 19 SPA** built with TanStack Start (TanStack Router + SSR). It runs in the phone's browser and provides the touchpad interface, keyboard integration, screen mirror, and settings UI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start (TanStack Router + Nitro SSR) |
| UI | React 19 (with React Compiler) |
| Styling | Tailwind CSS v4 + DaisyUI |
| Build | Vite 8 + Rolldown |
| Language | TypeScript 5 |
| Icons | Lucide React + React Icons |
| QR Code | `qrcode` npm package |

---

## Route Structure

```
src/routes/
  __root.tsx      — Root layout (ConnectionProvider, theme, navigation)
  index.tsx       — Redirects to /settings
  settings.tsx    — Settings page (QR code, server config, client settings)
  trackpad.tsx    — Main remote control page
```

### Root Layout (`__root.tsx`)

Wraps the entire app in `ConnectionProvider` and sets up the global DaisyUI theme (`data-theme` attribute). Includes a bottom navigation bar for switching between Settings and Trackpad.

### Settings Page (`settings.tsx`)

On load (from localhost only):
1. `GET /api/host/ip` → fetches LAN IP for QR encoding
2. `POST /api/auth/token` → generates/fetches auth token
3. Encodes `http://<IP>:<PORT>/trackpad?token=<TOKEN>` as a QR code using `qrcode` npm

Client settings stored in `localStorage`:
- `rein_sensitivity` — mouse speed multiplier
- `rein_invert` — scroll direction
- `rein_theme` — DaisyUI theme (dark/light)
- `rein_auth_token` — cached auth token

Server settings (applied via `POST /api/config`):
- `frontendPort` — port number (triggers redirect to new URL after save)
- `sensitivity` — propagated immediately to active `InputPeerConnection`
- `invertScroll` — propagated immediately to active `InputPeerConnection`

### Trackpad Page (`trackpad.tsx`)

The main remote control UI. Composed of:

```
TrackpadPage
├── ScreenMirror / ErrorComponent  (video stream or error state)
├── TouchArea                       (gesture capture surface)
├── BufferBar                       (modifier key display)
├── ControlBar                      (buttons: scroll, left/right click, keyboard, modifier)
├── ExtraKeys                       (arrow keys, function keys, special keys)
└── hidden <input>                  (triggers native mobile keyboard)
```

Token handling on trackpad load:
```typescript
const urlToken = searchParams.get("token")
const token = urlToken || localStorage.getItem("rein_auth_token")
// If from URL, persist to localStorage for future page loads
if (urlToken) localStorage.setItem("rein_auth_token", urlToken)
```

---

## `ConnectionProvider` Context (`src/contexts/ConnectionProvider.tsx`)

A React context that manages the two DataChannel references and exposes a unified `send()` API:

```typescript
interface ConnectionContextType {
  status: "connecting" | "connected" | "disconnected"
  latency: number | null
  send: (msg: unknown) => void
  registerDataChannel: (unorderedDc: RTCDataChannel, orderedDc: RTCDataChannel) => void
}
```

### Channel Registration

`registerDataChannel(unorderedDc, orderedDc)` is called by `useWebRtcStream` once the DataChannels are created. The provider:
1. Stores refs to both channels
2. Sets up `onopen`, `onclose`, `onerror` handlers for status tracking
3. Sets up `onmessage` for `pong` responses

### Message Routing

```typescript
const isUnordered = type === "move" || type === "scroll" || type === "touch" || type === "zoom"
const targetDc = isUnordered ? unorderedDcRef.current : orderedDcRef.current
// Fallback to the other channel if primary is not open
```

### Ping/Pong Heartbeat

When `status === "connected"`, a ping is sent every 2 seconds via the ordered channel. The `pong` response calculates RTT latency for display in the `ControlBar`.

---

## `useWebRtcStream` Hook (`src/hooks/useWebRtcStream.ts`)

The central hook managing the full WebRTC lifecycle.

### State

```typescript
const [trackActive, setTrackActive]     // Is video track playing?
const [videoStream, setVideoStream]     // MediaStream from GStreamer
const [activeSessionId, setActiveSessionId] // Current session UUID
const [error, setError]                 // Error message string
const [errorHandle, setErrorHandle]     // Error title/type
const [reconnectAttempt, setReconnectAttempt] // Triggers useEffect re-run
```

### Session Provisioning

```typescript
useEffect(() => {
  // If sessionId is already in URL (returning to page), use it
  const querySessionId = urlParams.get("session")
  if (querySessionId && reconnectAttempt === 0) {
    setActiveSessionId(querySessionId)
    return
  }
  // Otherwise, create a new session
  fetch("/api/session", { method: "POST", headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.json())
    .then(data => {
      setActiveSessionId(data.sessionId)
      // Update URL so refreshing the page reuses the same session
      newUrl.searchParams.set("session", data.sessionId)
      window.history.replaceState({}, "", newUrl.toString())
    })
}, [token, reconnectAttempt])
```

### WebRTC Setup (after sessionId known)

```typescript
useEffect(() => {
  if (!activeSessionId) return

  // 1. Create video peer (recvonly)
  const videoPc = new RTCPeerConnection({ iceServers: [], bundlePolicy: "max-bundle" })
  videoPc.addTransceiver("video", { direction: "recvonly" })
  videoPc.ontrack = (event) => { setVideoStream(event.streams[0]); setTrackActive(true) }

  // 2. Create input peer (DataChannels only)
  const inputPc = new RTCPeerConnection({ iceServers: [] })
  const dcUnordered = inputPc.createDataChannel("input-unordered", { ordered: false, maxRetransmits: 0 })
  const dcOrdered = inputPc.createDataChannel("input-ordered", { ordered: true })
  registerDataChannel(dcUnordered, dcOrdered)

  // 3. Open SSE signaling channel
  const sse = new EventSource(`/api/webrtc/events?sessionId=${id}&token=${token}`)

  // 4. Handle video offer from GStreamer (via SSE)
  sse.addEventListener("offer", async (event) => {
    const { sdp } = JSON.parse(event.data)
    await videoPc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }))
    const answer = await videoPc.createAnswer()
    await videoPc.setLocalDescription(answer)
    await fetch("/api/webrtc/answer", { method: "POST", body: JSON.stringify({ sessionId, sdp: answer.sdp }) })
  })

  // 5. Handle input answer from server (via SSE)
  sse.addEventListener("input-answer", async (event) => {
    const { sdp } = JSON.parse(event.data)
    await inputPc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }))
  })

  // 6. Send our input offer to server
  const offer = await inputPc.createOffer()
  await inputPc.setLocalDescription(offer)
  await fetch("/api/webrtc/input-offer", { method: "POST", body: JSON.stringify({ sessionId, sdp: offer.sdp }) })

  // 7. ICE candidate handlers...
  // 8. Video stream watchdog...
}, [activeSessionId, token])
```

---

## `useTrackpadGesture` Hook (`src/hooks/useTrackpadGesture.ts`)

See [Input System — Gesture Recognition](./input-system.md#gesture-recognition-usetrackpadgesture) for full details.

Returns:
```typescript
{
  isTracking: boolean,  // Any active touch on the surface
  handlers: {
    onTouchStart, onTouchMove, onTouchEnd, onTouchCancel
  }
}
```

---

## Trackpad UI Components

### `ScreenMirror` (`src/components/Trackpad/ScreenMirror.tsx`)

Renders the GStreamer video stream in a `<video>` element. The touch handlers from `useTrackpadGesture` are overlaid on the video so the phone can simultaneously watch the screen and interact with it.

```tsx
<video
  ref={videoRef}
  autoPlay
  playsInline
  muted
  onTouchStart={handlers.onTouchStart}
  // ... other handlers
/>
```

When `trackActive` is false (video not yet connected), shows a loading spinner with connection status.

### `TouchArea` (`src/components/Trackpad/TouchArea.tsx`)

A blank touch surface (when screen mirror is not active or the user prefers a simpler trackpad). Shows a "scroll mode" indicator when active.

### `ControlBar` (`src/components/Trackpad/ControlBar.tsx`)

The horizontal button bar below the touch area. Contains:
- Connection status indicator (🔴/🟡/🟢) with latency
- Left / Right click buttons
- Scroll mode toggle
- Modifier key toggle (Ctrl/Shift state machine)
- Keyboard open/close button
- Extra keys panel toggle

### `ExtraKeys` (`src/components/Trackpad/ExtraKeys.tsx`)

A collapsible panel with hardware-mapped keys:
- Arrow keys (↑↓←→)
- Function keys (F1–F12)
- Navigation (Home, End, PgUp, PgDn)
- Edit keys (Tab, Escape, Delete, Insert)
- Media keys (Vol+, Vol–, Mute)

### `BufferBar` (`src/components/Trackpad/Buffer.tsx`)

A slim bar that appears at the top of the touch area showing the current modifier key buffer (e.g., `Ctrl + Shift + `).

### `ErrorComponent` (`src/components/Trackpad/ErrorComponent.tsx`)

Displayed when a WebRTC connection error occurs. Shows the error type (title), message, and a **Reconnect** button that calls the `reconnect()` function from `useWebRtcStream`.

---

## Mobile Keyboard Integration

Rein uses a **hidden `<input>` element** trick to access the native mobile keyboard without rendering a visible text field:

```tsx
<input
  ref={hiddenInputRef}
  className="opacity-0 absolute bottom-0 pointer-events-none h-0 w-0"
  defaultValue=" "      // Prevents backspace from being missed
  onKeyDown={handleKeyDown}
  onChange={handleInput}
  onCompositionStart={handleCompositionStart}
  onCompositionEnd={handleCompositionEnd}
  autoComplete="off" autoCorrect="off" autoCapitalize="off"
  spellCheck={false}
  inputMode="text"
/>
```

The `defaultValue=" "` sentinel ensures there's always one character before the cursor, so `deleteContentBackward` input events are always detectable (without it, backspace on an empty field fires no event on some mobile browsers).

### IME Composition Support

For CJK input (Chinese, Japanese, Korean), the input uses `compositionstart`/`compositionend` events. Characters are only sent to the server after the composition is complete (`compositionend`), not during candidate selection.

### Key Handling Priority

1. `onKeyDown` — captures special keys (Enter, Escape, arrow keys, function keys) before `onChange`
2. `onChange` — handles regular text input via `inputType` field of the native event
3. `onCompositionEnd` — handles IME-composed text
