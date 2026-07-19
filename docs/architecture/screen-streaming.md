# Screen Streaming

Rein streams the desktop screen to the phone using **GStreamer** as the encoder and **WebRTC WHIP** as the transport protocol. The server captures and encodes the video; the phone receives it via a WebRTC peer connection. The server **never** sees the raw video frames after encoding — they flow peer-to-peer.

---

## Architecture

```
Desktop Screen
     │
     ▼ (CaptureProvider)
  ─────────────────────────────────────────────────────────────────
  Linux (X11)    → ximagesrc
  Linux (Wayland) → XDG Desktop Portal + PipeWire → pipewiresrc
  macOS          → avfvideosrc (AVFoundation)
  Windows        → d3d11screencapturesrc (DXGI)
  ─────────────────────────────────────────────────────────────────
     │
     ▼ (GStreamer pipeline)
  queue (max-size-buffers=5, leaky=downstream)
  videoconvert / d3d11convert
  videoscale
  videorate (30 fps)
  encoder:
    macOS   → vtenc_h264 (VideoToolbox hardware H.264)
    Linux   → vp8enc (libvpx, 2.5 Mbps)
    Windows → vp8enc (libvpx, 2.5 Mbps)
     │
     ▼
  whipclientsink (WHIP)
     │
     ▼ HTTP POST /api/webrtc/whip?sessionId=...
     │
     ▼ (via SSE → Browser)
  RTCPeerConnection (videoPc, recvonly)
     │
     ▼
  <video> element on Phone
```

---

## GstManager (`src/server/gstreamer/gstManager.ts`)

`GstManager` wraps a single `gst-launch-1.0` child process per session. It:

1. Calls `CaptureProvider.initialize()` to acquire the capture source
2. Builds the pipeline argument array
3. Spawns `gst-launch-1.0` with the built pipeline
4. Monitors `stdout`/`stderr` for state changes and errors
5. Falls back to a test pattern (`videotestsrc pattern=ball`) if the main pipeline fails to preroll

### Pipeline Construction

```typescript
// Source blocks come from CaptureProvider (platform-specific)
const args = [...sourceBlocks]

// Common processing suffix (Linux/macOS):
args.push("!", "queue", "max-size-buffers=5", "leaky=downstream",
          "!", "videoconvert", "!", "videoscale", "!", "videorate")

// macOS encoder:
args.push("!", "video/x-raw,format=NV12,framerate=30/1",
          "!", "vtenc_h264", "realtime=true", "max-keyframe-interval=15",
          "allow-frame-reordering=false", "bitrate=2500")

// Linux / Windows encoder:
args.push("!", "video/x-raw,framerate=30/1",
          "!", "vp8enc", "deadline=1", "keyframe-max-dist=15", "target-bitrate=2500000")

// WHIP sink (all platforms):
args.push("!", "whipclientsink",
  `signaller::whip-endpoint=http://localhost:${port}/api/webrtc/whip?sessionId=${id}&token=${token}`,
  `signaller::auth-token=Bearer_${token}`)
```

### Fallback Pipeline

If the main pipeline fails to preroll (e.g., display capture not available), GstManager automatically switches to a test pattern:

```
videotestsrc is-live=true pattern=ball
! video/x-raw,framerate=30/1
! videoconvert
! vp8enc deadline=1 keyframe-max-dist=15 target-bitrate=2500000
! whipclientsink ...
```

This ensures the WebRTC connection still establishes (useful for debugging or headless setups).

### Error Redaction

Auth tokens in GStreamer stderr are automatically redacted in logs:
```typescript
logStr = logStr.replace(/auth-token=\S+/g, "auth-token=REDACTED")
```

---

## CaptureProvider (`src/server/gstreamer/captureProvider.ts`)

The `CaptureProvider` interface abstracts platform-specific screen capture initialization:

```typescript
interface CaptureProvider {
  initialize(onFailure?: (err: Error) => void): Promise<void>
  getGStreamerSource(): Promise<string[]>
  dispose(): Promise<void>
}
```

### Factory

```typescript
export function createCaptureProvider(): CaptureProvider {
  const platform = os.platform()
  if (platform === "win32") return new WindowsCaptureProvider()
  if (platform === "darwin") return new MacOSCaptureProvider()
  if (platform === "linux") {
    const isWayland = process.env.XDG_SESSION_TYPE === "wayland" || !!process.env.WAYLAND_DISPLAY
    return isWayland ? new LinuxWaylandPortalCaptureProvider() : new LinuxX11CaptureProvider()
  }
  throw new Error(`Unsupported OS platform: ${platform}`)
}
```

### Platform Implementations

#### Windows — `WindowsCaptureProvider`
```
d3d11screencapturesrc do-timestamp=true
! queue max-size-buffers=5 leaky=downstream
! d3d11convert
! d3d11download
```
Uses DirectX 11 DXGI screen capture. GPU-accelerated, zero CPU copies in the capture stage.

#### Linux X11 — `LinuxX11CaptureProvider`
```
ximagesrc display-name=:0 use-damage=false show-pointer=true
```
Uses X11 shared memory capture. The cursor is included in the stream.

#### Linux Wayland — `LinuxWaylandPortalCaptureProvider`
Uses the **XDG Desktop Portal** (`org.freedesktop.portal.ScreenCast`) via D-Bus. The user is prompted by their desktop environment to select which screen/window to share. Once approved, the portal provides a PipeWire node ID.

```typescript
await this.dbus.initializeDbus()  // Opens D-Bus, requests screen cast, gets pipewire node ID
const source = ["pipewiresrc", `path=${this.dbus.pipewireNodeId}`, "do-timestamp=true"]
```

The `ImplementDbus` utility handles:
1. D-Bus connection (`dbus-next`)
2. `CreateSession` call on `org.freedesktop.portal.ScreenCast`
3. `SelectSources` call
4. `Start` call → receives PipeWire node ID in response
5. Monitoring for unexpected portal session closure

#### macOS — `MacOSCaptureProvider`
```
avfvideosrc capture-screen=true capture-screen-cursor=true
```
Uses AVFoundation. Requires Accessibility permission granted to the terminal or IDE in System Settings → Privacy & Security.

---

## HostRunner (`src/server/gstreamer/hostRunner.ts`)

`HostRunner` is a session pool manager. It maintains a `Map<sessionId, GstManager>`:

```typescript
public handleIncomingClientOffer(sessionId: string, _clientOfferSdp: string): void {
  if (this.activeSessions.has(sessionId)) return // Already running

  const gst = new GstManager(sessionId)
  this.activeSessions.set(sessionId, gst)

  gst.on("exit", () => { /* cleanup */ })
  gst.on("capture-failure", (err) => { /* error reporting */ })

  void gst.start(this.token, this.serverPort)
}

public shutdown(): void {
  for (const [id, manager] of this.activeSessions) {
    this.stoppingSessions.add(id)
    manager.stop() // SIGTERM
  }
  this.activeSessions.clear()
}
```

The `HostRunner` is created lazily in `ensureHostRunnerActive()` the first time a session is created or an offer is received.

---

## GStreamer Installation (`scripts/install-gstreamer.js`)

The `postinstall` script detects the platform and:

- **Linux**: Checks for system GStreamer via `which gst-launch-1.0`
- **macOS**: Downloads and installs GStreamer from the official `.pkg` if not found
- **Windows**: Downloads and extracts GStreamer from the official `.msi`

Path resolution is handled by `src/server/gstreamer/gstPaths.ts`, which:
1. Checks common installation paths for the platform
2. Falls back to `gst-launch-1.0` on `$PATH`
3. Sets `GST_PLUGIN_PATH` and `GST_PLUGIN_SCANNER` environment variables for the spawned process

---

## Video Parameters

| Parameter | macOS | Linux | Windows |
|---|---|---|---|
| Codec | H.264 (vtenc_h264) | VP8 (vp8enc) | VP8 (vp8enc) |
| Bitrate | 2.5 Mbps | 2.5 Mbps | 2.5 Mbps |
| Framerate | 30 fps | 30 fps | 30 fps |
| Keyframe | Every 15 frames | Every 15 frames | Every 15 frames |
| Hardware | ✅ VideoToolbox | ❌ Software | ❌ Software |
| Color space | NV12 | Auto | Auto |

---

## Privacy Guarantee

GStreamer encodes the video and hands the encoded **RTP packets** directly to `whipclientsink`, which transmits them via DTLS-SRTP to the browser's `RTCPeerConnection`. The HTTP server only participates in the **signaling** (SDP/ICE exchange) — it never receives, processes, or stores any video frame data.
