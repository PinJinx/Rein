# Platform Drivers

The driver layer is a cross-platform abstraction over native OS input APIs. Each platform implements the `PlatformInjector` interface, which is loaded dynamically at runtime based on `os.platform()`.

---

## Overview

| Platform | API | Virtual Device |
|---|---|---|
| Linux | uinput kernel subsystem | `/dev/uinput` |
| macOS | CoreGraphics `CGEvent` | System event tap |
| Windows | `SendInput` + Synthetic Pointer API | Win32 input queue |

---

## Linux Driver (`src/server/drivers/linux/`)

### Device Architecture

The Linux injector creates **three separate virtual input devices** via `/dev/uinput`:

```
/dev/uinput
  ├── "Virtual Mouse"    (EV_REL + EV_KEY: BTN_LEFT, BTN_RIGHT, BTN_MIDDLE)
  ├── "Virtual Keyboard" (EV_KEY: all mapped keycodes)
  └── "Virtual Touchpad" (EV_ABS: MT protocol slots + position axes)
```

Each device is a separate `UinputDevice` instance with its own file descriptor.

### Device Setup Flow

```typescript
// 1. Open /dev/uinput
const fd = openUinput("/dev/uinput")

// 2. Configure capabilities via ioctl
ioctlInt(fd, UI_SET_EVBIT, EV_REL)     // Enable relative events
ioctlInt(fd, UI_SET_RELBIT, REL_X)     // Enable X axis
ioctlInt(fd, UI_SET_KEYBIT, BTN_LEFT)  // Enable left button

// 3. Set up device info
ioctlStruct(fd, UI_DEV_SETUP, "uinput_setup *", { name, bustype:BUS_USB, vendor, product })

// 4. Create the device
ioctlNull(fd, UI_DEV_CREATE)
```

Native bindings are implemented using **Koffi** (`koffi` npm package) — a fast FFI library for calling C functions from Node.js without writing native addons.

### Mouse Injection

```typescript
injectMouseMove(dx: number, dy: number): void {
  writeEvent(fd, EV_REL, REL_X, Math.round(dx))
  writeEvent(fd, EV_REL, REL_Y, Math.round(dy))
  writeEvent(fd, EV_SYN, SYN_REPORT, 0)  // Commit event group
}
```

### Scroll Injection

```typescript
injectMouseWheel(dx: number, dy: number): void {
  const invert = this.config.invertScroll ? -1 : 1
  if (dy !== 0) writeEvent(fd, EV_REL, REL_WHEEL, Math.round(dy * invert * WHEEL_SCALE))
  if (dx !== 0) writeEvent(fd, EV_REL, REL_HWHEEL, Math.round(dx * invert * WHEEL_SCALE))
  writeEvent(fd, EV_SYN, SYN_REPORT, 0)
}
```

`WHEEL_SCALE = 3` — each scroll "tick" from the phone translates to 3 wheel scroll units.

### Multi-Touch Injection (MT Protocol B)

The touch device uses **Linux MT Protocol B** (slot-based):

```typescript
// For each contact:
writeEvent(fd, EV_ABS, ABS_MT_SLOT, slot)           // Select slot
writeEvent(fd, EV_ABS, ABS_MT_TRACKING_ID, trackId) // -1 to release
writeEvent(fd, EV_ABS, ABS_MT_POSITION_X, x)
writeEvent(fd, EV_ABS, ABS_MT_POSITION_Y, y)
writeEvent(fd, EV_ABS, ABS_MT_TOUCH_MAJOR, size)
writeEvent(fd, EV_ABS, ABS_MT_PRESSURE, pressure)
writeEvent(fd, EV_SYN, SYN_REPORT, 0)
```

Up to `MAX_CONTACTS` (10) simultaneous touch points are supported.

### Permissions

The user must be in the `uinput` group:

```bash
sudo groupadd -f uinput
echo 'KERNEL=="uinput", MODE="0660", GROUP="uinput"' | sudo tee /etc/udev/rules.d/99-rein.rules
sudo usermod -aG uinput $USER
sudo udevadm control --reload-rules && sudo udevadm trigger
```

---

## macOS Driver (`src/server/drivers/mac/`)

### API

Uses **CoreGraphics** `CGEvent` functions via Koffi FFI:

```typescript
// From structs.ts
const CGEventCreateMouseEvent  = lib.func("CGEventRef CGEventCreateMouseEvent(...)")
const CGEventPost              = lib.func("void CGEventPost(CGEventTapLocation, CGEventRef)")
const CGEventSetDoubleValueField = lib.func("void CGEventSetDoubleValueField(...)")
```

### Mouse Movement

```typescript
injectMouseMove(dx: number, dy: number): void {
  // Get current cursor position
  const currentPos = CGEventGetLocation(dummyEvent)
  const newX = currentPos.x + dx * sensitivity
  const newY = currentPos.y + dy * sensitivity
  const event = CGEventCreateMouseEvent(null, kCGEventMouseMoved, {x: newX, y: newY}, 0)
  CGEventPost(kCGHIDEventTap, event)
  CFRelease(event)
}
```

### Keyboard Injection

macOS keyboard injection handles two cases:

1. **Named keys** (arrow keys, function keys, modifiers): Mapped to `CGKeyCode` via `MAC_KEY_MAP`
2. **Unicode text**: Uses `CGEventKeyboardSetUnicodeString` to inject arbitrary text

```typescript
injectText(text: string): void {
  for (const char of text) {
    const event = CGEventCreateKeyboardEvent(null, 0, true)
    CGEventKeyboardSetUnicodeString(event, 1, char)
    CGEventPost(kCGHIDEventTap, event)
    // Repeat for key-up
  }
}
```

### Touch / Gesture Injection

macOS touch injection uses `CGEvent` scroll events with scroll phase:

- **Scroll**: `kCGScrollEventUnitPixel` scroll events
- **Pinch/Zoom**: `CGEventSetDoubleValueField` with gesture phase fields

### Requirements

Accessibility permission must be granted in:
`System Settings → Privacy & Security → Accessibility`

---

## Windows Driver (`src/server/drivers/windows/`)

### API

Uses Win32 `SendInput` for mouse and keyboard, and the **Synthetic Pointer API** (`InitializeTouchInjection` / `InjectTouchInput`) for multi-touch.

```typescript
// From structs.ts
const SendInput          = lib.func("UINT SendInput(UINT, INPUT*, INT)")
const InjectTouchInput   = lib.func("BOOL InjectTouchInput(UINT, POINTER_TOUCH_INFO*)")
const InitializeTouchInjection = lib.func("BOOL InitializeTouchInjection(UINT32, DWORD)")
```

### Mouse Injection

```typescript
injectMouseMove(dx: number, dy: number): void {
  const input = {
    type: INPUT_MOUSE,
    mi: {
      dx: Math.round(dx),
      dy: Math.round(dy),
      dwFlags: MOUSEEVENTF_MOVE,  // Relative movement
      ...
    }
  }
  SendInput(1, input, INPUT_SIZE)
}
```

### Keyboard Injection

Windows keyboard injection handles:
1. **Scan code injection** for standard keys via `KEYEVENTF_SCANCODE`
2. **Unicode injection** via `KEYEVENTF_UNICODE` for `VK_PACKET`

```typescript
injectText(text: string): void {
  for (const char of text) {
    const code = char.charCodeAt(0)
    SendInput(1, { type: INPUT_KEYBOARD, ki: { wVk: 0, wScan: code, dwFlags: KEYEVENTF_UNICODE } })
    SendInput(1, { type: INPUT_KEYBOARD, ki: { wVk: 0, wScan: code, dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP } })
  }
}
```

### Multi-Touch Injection

```typescript
// Must be called once at startup:
InitializeTouchInjection(10, TOUCH_FEEDBACK_DEFAULT)

// For each touch frame:
InjectTouchInput(contactCount, touchPoints)
```

Each `POINTER_TOUCH_INFO` struct contains:
- `pointerInfo.pointerType = PT_TOUCH`
- `pointerInfo.pointerId` (per-finger ID)
- `pointerInfo.ptPixelLocation` (absolute screen coordinates)
- `touchMask`, `pressure`, `orientation`

---

## Key Mapping (`src/server/drivers/keyMap.ts`)

The `LINUX_KEY_MAP`, `MAC_KEY_MAP`, and `WIN_KEY_MAP` objects map logical key names (sent from the browser) to platform-specific key codes:

```typescript
// Logical name → Linux keycode (evdev)
const LINUX_KEY_MAP: Record<string, number> = {
  "enter": KEY_ENTER,      // 28
  "backspace": KEY_BACKSPACE, // 14
  "tab": KEY_TAB,           // 15
  "escape": KEY_ESC,        // 1
  "control": KEY_LEFTCTRL,  // 29
  "shift": KEY_LEFTSHIFT,   // 42
  "alt": KEY_LEFTALT,       // 56
  "meta": KEY_LEFTMETA,     // 125
  "arrowup": KEY_UP,        // 103
  // ... etc
}
```

### Supported Key Names

| Category | Keys |
|---|---|
| Modifiers | `control`, `shift`, `alt`, `meta` |
| Navigation | `arrowup`, `arrowdown`, `arrowleft`, `arrowright`, `home`, `end`, `pageup`, `pagedown` |
| Editing | `enter`, `backspace`, `delete`, `tab`, `escape`, `insert` |
| Function | `f1`–`f12` |
| Media | `volumeup`, `volumedown`, `mute` |
| Lock | `capslock`, `numlock`, `scrolllock` |

---

## Scroll Inversion

The `invertScroll` flag inverts the scroll direction at the driver level:

```typescript
// Linux:
const invert = this.config.invertScroll ? -1 : 1
writeEvent(fd, EV_REL, REL_WHEEL, Math.round(dy * invert * WHEEL_SCALE))
```

`invertScroll: false` (default) = natural scrolling (swipe up → content scrolls up)
`invertScroll: true` = traditional scrolling (swipe up → content scrolls down)

---

## Stub Injector (Unsupported Platforms)

If the platform is unknown or the injector fails to initialize, a **stub injector** is used that logs warnings on every call:

```typescript
function createStubInjector(): PlatformInjector {
  const warn = (method: string) =>
    console.warn(`[InputHandler] ${method} called on unsupported platform`)
  return {
    updateConfig: () => {},
    injectMouseMove: () => warn("injectMouseMove"),
    // ...
    destroy: () => {}
  }
}
```

The `onError` callback is invoked with `"unsupported-platform"` so the phone UI can display a meaningful error.
