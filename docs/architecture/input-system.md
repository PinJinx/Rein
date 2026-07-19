# Input System

The input system is the core of Rein — it translates touch gestures on a phone into native OS-level input events on the desktop in real time. This document covers the full stack from gesture detection to kernel-level event injection.

---

## Pipeline Overview

```
Phone Touch Event
       │
       ▼
useTrackpadGesture (React Hook)
  ├── 1-finger move    →  { type: "move",   dx, dy }
  ├── 2-finger pan     →  { type: "scroll", dx, dy }
  ├── 2-finger pinch   →  { type: "zoom",   delta }
  ├── tap (1/2/3 fgr)  →  { type: "click",  button, press }
  ├── long-press       →  { type: "click",  button:"left", press:true } (drag)
  └── keyboard input   →  { type: "key" | "text" | "combo" }
       │
       ▼
ConnectionProvider.send()
  ├── move/scroll/zoom/touch → DataChannel "input-unordered" (ordered:false, maxRetransmits:0)
  └── key/text/combo/click  → DataChannel "input-ordered"   (ordered:true)
       │
       ▼  (WebRTC P2P DataChannel)
       │
       ▼
InputPeerConnection.onMessage()
  └── JSON.parse → validate type → InputHandler.handleMessage()
       │
       ▼
InputHandler
  ├── sanitizeMessage()    — clamp coords, truncate text
  ├── throttle()           — 8ms minimum for move/scroll
  └── dispatch()           — route to PlatformInjector
       │
       ├── Linux:   LinuxInputInjector  →  /dev/uinput  (kernel virtual device)
       ├── macOS:   MacInputInjector    →  CoreGraphics CGEvent
       └── Windows: WindowsInputInjector → SendInput + Synthetic Pointer API
```

---

## Gesture Recognition (`useTrackpadGesture`)

Located at `src/hooks/useTrackpadGesture.ts`.

### State Machine

The hook maintains a `Map<identifier, TrackedTouch>` of all active finger contacts. It processes `touchstart`, `touchmove`, `touchend`, and `touchcancel` events.

### Gesture Rules

| Fingers | Action | Output |
|---|---|---|
| 1 | Move (after threshold) | `{ type: "move", dx, dy }` |
| 1 | Tap (< 250ms, < 10px) | Left click |
| 2 | Tap | Right click |
| 3 | Tap | Middle click |
| 1 | Long-press (> 250ms), then move | Drag (hold left, move) |
| 2 | Pan (without pinch) | `{ type: "scroll", dx:-sumX, dy:-sumY }` |
| 2 | Spread/squeeze (> 10px delta) | `{ type: "zoom", delta }` |
| Scroll mode | 1 finger | Scroll (with axis lock) |

### Axis Lock (Scroll Mode)

When `scrollMode` is enabled (one-finger scroll), movement is axis-locked to prevent diagonal scrolling:

```typescript
if (absDx > absDy * axisThreshold) dy = 0   // Horizontal scroll only
else if (absDy > absDx * axisThreshold) dx = 0 // Vertical scroll only
```

Default `axisThreshold` is 2.5 — the dominant axis must be 2.5× stronger to unlock.

### Movement Threshold

Different thresholds apply based on touch count to prevent accidental drags:
- 1 finger: 10px
- 2 fingers: 15px
- 3+ fingers: 15px

### Drag Detection

```
touchstart → tap candidate
  (if no touchmove within 250ms and finger lifts → tap)
  (if left-click tap → wait 250ms timeout for second touch)
  (if second touch arrives before timeout → convert to drag: hold button down)
  (if no second touch → release button)
```

---

## DataChannel Routing (`ConnectionProvider`)

Located at `src/contexts/ConnectionProvider.tsx`.

```typescript
const isUnordered = type === "move" || type === "scroll" || type === "touch" || type === "zoom"
const targetDc = isUnordered ? unorderedDcRef.current : orderedDcRef.current

if (targetDc?.readyState === "open") {
  targetDc.send(JSON.stringify(msg))
} else {
  // Fallback to the other channel
  fallbackDc.send(JSON.stringify(msg))
}
```

**Latency design:** The unordered channel is configured with `maxRetransmits: 0` — if a mouse movement packet is lost, it is silently discarded (never retransmitted). This is correct behavior: a stale position delta would cause a jump.

### Ping/Pong Latency Measurement

Every 2 seconds, the provider sends `{ type: "ping", timestamp: Date.now() }`. The server's `InputPeerConnection` echo responds with `{ type: "pong", timestamp }`. The round-trip time is displayed in the `ControlBar`.

---

## `InputHandler` (`src/server/InputHandler.ts`)

### Message Validation & Sanitization

```typescript
private sanitizeMessage(msg: InputMessage): void {
  // Truncate text to MAX_TEXT_LENGTH (10,000 chars)
  if (msg.text?.length > MAX_TEXT_LENGTH) msg.text = msg.text.substring(0, MAX_TEXT_LENGTH)
  // Clamp coordinates to ±2000
  msg.dx    = clampFinite(msg.dx,    -MAX_COORD, MAX_COORD)
  msg.dy    = clampFinite(msg.dy,    -MAX_COORD, MAX_COORD)
  msg.delta = clampFinite(msg.delta, -MAX_COORD, MAX_COORD)
}
```

### Throttle (8ms default)

```typescript
private throttle(msg: InputMessage): boolean {
  const now = Date.now()
  if (now - this.lastMoveTime < this.throttleMs) {
    this.pendingMove = msg  // Replace last pending — only latest matters
    if (!this.moveTimer) {
      this.moveTimer = setTimeout(() => {
        // Flush the latest pending after throttle window
        this.handleMessage(this.pendingMove)
      }, this.throttleMs)
    }
    return true // Suppress this event
  }
  this.lastMoveTime = now
  return false
}
```

This is a **leading-edge throttle with trailing flush**: the first event in a burst passes immediately, subsequent events within the window are coalesced, and the last event is always eventually dispatched.

### Motion Acceleration (`applyMotion`)

Located at `src/server/drivers/utils.ts`:

```
if |dx| < ACCEL_THRESHOLD (1px):  pass through as-is
else:  ax = sign(dx) * (|dx|^ACCEL_EXPONENT) * ACCEL_FACTOR * sensitivity
```

Constants:
- `ACCEL_THRESHOLD = 1` (below this, no acceleration)
- `ACCEL_FACTOR = 0.8`
- `ACCEL_EXPONENT = 1.2`
- `sensitivity` from config (default 1.0)

This gives the feel of OS pointer acceleration where slow movements are precise and fast swipes cover more distance.

### Dispatch Table

| `type` | Action |
|---|---|
| `move` | `applyMotion(dx, dy)` → `injector.injectMouseMove(ax, ay)` |
| `click` | Validate button → `injector.injectMouseButton(button, press)` |
| `scroll` | `injector.injectMouseWheel(dx, dy)` |
| `zoom` | `Ctrl + wheel`: clamp delta to ±5 steps → hold Ctrl → scroll → release |
| `key` | Map key name → `injector.injectKey(key)` |
| `combo` | Validate keys (max 10) → `injector.injectCombo(keys)` |
| `text` | `injector.injectText(text)` |
| `touch` | Validate contacts → `injector.injectTouch(contacts)` |
| `copy` | `Ctrl+C` (Linux/Win) or `Cmd+C` (macOS) |
| `paste` | `Ctrl+V` (Linux/Win) or `Cmd+V` (macOS) |

---

## Platform Injector Interface

```typescript
type PlatformInjector = {
  updateConfig(config: Partial<InputConfig>): void
  injectMouseMove(dx: number, dy: number): void
  injectMouseButton(button: "left" | "right" | "middle", isDown: boolean): void
  injectMouseWheel(dx: number, dy: number): void
  injectKey(key: string, pos?: string): void
  injectCombo(keys: string[]): void
  injectText(text: string): void
  injectTouch(contacts: TouchContact[]): void
  destroy(): void
}
```

Platform selection happens at `InputHandler` construction:

```typescript
const plat = os.platform()
if (plat === "win32") this.injector = new WindowsInputInjector(config)
else if (plat === "linux") this.injector = new LinuxInputInjector(config)
else if (plat === "darwin") this.injector = new MacInputInjector(config)
else this.injector = createStubInjector() // Warns on all calls
```

---

## `InputConfig`

```typescript
interface InputConfig {
  sensitivity: number      // 0.1–10.0, multiplier for mouse speed
  invertScroll: boolean    // Swap scroll direction
  acceleration: boolean    // Enable pointer acceleration
  screenWidth: number      // Used for touch coordinate mapping (default: 1920)
  screenHeight: number     // Used for touch coordinate mapping (default: 1080)
}
```

Config can be updated at runtime via `inputPc.updateConfig(partial)` without reconnecting. This is triggered immediately when `POST /api/config` changes `sensitivity` or `invertScroll`.

---

## Modifier Key State Machine (Trackpad UI)

The modifier system enables keyboard shortcuts from a touchscreen:

```
Release → (tap Ctrl/Shift/etc.) → Active
Active  → (tap another key)      → send combo, stay Active
Active  → (tap Ctrl/Shift again) → Hold
Hold    → (tap key)              → send combo, return to Release
Hold    → (tap again)            → Release, clear buffer
```

This state machine is implemented in `src/routes/trackpad.tsx` with `modifier` state and a `buffer` array of queued modifier keys.

---

## Input Message Type Reference

```typescript
interface InputMessage {
  type: "move" | "click" | "scroll" | "key" | "text" | "zoom" | "combo" | "touch" | "copy" | "paste"
  dx?: number              // Mouse delta X (move/scroll)
  dy?: number              // Mouse delta Y (move/scroll)
  button?: "left" | "right" | "middle"  // Click button
  press?: boolean          // true = press, false = release
  key?: string             // Key name (e.g. "enter", "backspace", "a")
  keys?: string[]          // Key combo (e.g. ["control", "z"])
  text?: string            // UTF-8 text to inject
  delta?: number           // Pinch zoom delta
  contacts?: TouchContact[] // Multi-touch points
}
```
