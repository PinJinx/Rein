# Server Layer

The Rein server is a **Node.js HTTP server** embedded directly into the Vite dev server (development) or run as a standalone Nitro process (production). It handles all signaling, authentication, configuration, and bridges the GStreamer pipeline to the browser.

---

## Entry Point: `vite.config.ts`

```typescript
// vite.config.ts (simplified)
{
  name: "rein-server",
  async configureServer(server) {
    attachSignalingRoutes(server.httpServer)
  },
  async configurePreviewServer(server) {
    attachSignalingRoutes(server.httpServer)
  }
}
```

The Vite plugin injects all `/api/*` routes **before** Vite's own middleware using `server.prependListener("request", ...)`. This means API requests are handled by Rein and never fall through to Vite's static file handler.

---

## Route Table (`src/server/server.ts`)

| Method | Pattern | Handler | Auth |
|---|---|---|---|
| `GET` | `/api/host/ip` | `handleGetIp` | Token or localhost |
| `POST` | `/api/config` | `handleUpdateConfig` | Token or localhost |
| `POST` | `/api/session` | `handleCreateSession` | Token or localhost |
| `GET` | `/api/session/:id` | `handleGetSession` | Token or localhost |
| `DELETE` | `/api/session/:id` | `handleDeleteSession` | Token or localhost |
| `POST` | `/api/webrtc/offer` | `handleOffer` | Token or localhost |
| `POST` | `/api/webrtc/answer` | `handleAnswer` | Token or localhost |
| `POST` | `/api/webrtc/ice` | `handleIce` | Token or localhost |
| `GET` | `/api/webrtc/events` | `handleEvents` | Token or localhost |
| `POST` | `/api/host/start` | `handleHostStart` | **Localhost only** |
| `POST` | `/api/host/stop` | `handleHostStop` | **Localhost only** |
| `GET` | `/api/host/status` | `handleHostStatus` | Token or localhost |
| `POST` | `/api/webrtc/input-offer` | `handleInputOffer` | Token or localhost |
| `POST` | `/api/auth/token` | `handleGenerateToken` | **Localhost only** |
| `GET` | `/api/auth/token` | `handleGetToken` | **Localhost only** |
| `POST` | `/api/webrtc/gateway` | `handleGstSignalingGateway` | None (internal) |
| `POST` | `/api/webrtc/whip` | `handleWhipSignalingExchange` | Token |

---

## `AsyncLocalStorage` Context (`reinStorage`)

Rein uses Node.js `AsyncLocalStorage` to solve a subtle problem: Vite intercepts responses and applies its own middleware. When `__handledByRein` is `true` but we're outside our `reinStorage.run()` context, `res.write`, `res.end`, etc., are no-ops — preventing Vite from double-writing headers.

```typescript
// Inside the request listener
Promise.resolve()
  .then(() => reinStorage.run(true, () => route.handler(req, res, ...params)))
  .catch(...)
```

Every response helper (`json()`, SSE writes) calls `reinStorage.run(true, () => ...)` so they are always executed in the correct context.

---

## Shared State (`src/server/api/apiState.ts`)

All signaling state is held in module-level variables (effectively singletons per Node.js process):

```typescript
export const sessions      = new Map<string, Session>()       // Active sessions
export const sseClients    = new Map<string, Set<ServerResponse>>() // SSE subscribers
export const inputConnections = new Map<string, InputPeerConnection>() // Input WebRTC peers

export let hostStatus: HostStatus = "stopped"
export let runnerInstance: HostRunner | null = null
export let pendingConfigUpdates: Record<string, unknown> | null = null
```

### Session State Machine

```
pending → offering → answered → connected → closed
```

| State | Meaning |
|---|---|
| `pending` | Session created, no SDP yet |
| `offering` | GStreamer sent an offer (WHIP) |
| `answered` | Browser sent back an answer |
| `connected` | ICE connected (implicit) |
| `closed` | Session deleted or errored |

---

## `pushEvent()` — SSE Broadcast

```typescript
export function pushEvent(sessionId: string, event: string, data: unknown): void {
  const clients = sseClients.get(sessionId)
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    reinStorage.run(true, () => res.write(payload))
  }
}
```

This broadcasts a named SSE event to all connected viewers for a session. Events sent over SSE:

| Event | Direction | Purpose |
|---|---|---|
| `offer` | Host → Viewer | GStreamer's SDP offer |
| `answer` | Viewer → Host (relayed) | Browser's SDP answer |
| `host-ice` | Host → Viewer | GStreamer ICE candidates |
| `viewer-ice` | Viewer → Host (relayed) | Browser ICE candidates |
| `input-answer` | Server → Viewer | InputPeerConnection SDP answer |
| `input-ice` | Server → Viewer | InputPeerConnection ICE candidates |
| `stream-error` | Server → Viewer | Pipeline failures |
| `session-closed` | Server → Viewer | Session teardown |

---

## `ensureHostRunnerActive()` — Lazy Runner Initialization

The `HostRunner` is initialized lazily on first session creation or offer receipt:

```typescript
export function ensureHostRunnerActive(localBaseUrl: string): HostRunner {
  if (runnerInstance) return runnerInstance

  setHostStatus("starting")
  const localToken = getActiveToken() ?? generateToken()
  storeToken(localToken)
  const runner = new HostRunner(localBaseUrl, localToken, streamErrorCallback)
  setRunnerInstance(runner)
  setHostStatus("running")
  return runner
}
```

The `localToken` is used by GStreamer's WHIP sink to authenticate its POST to `/api/webrtc/whip`. This is an internal token, separate from the QR-code token distributed to mobile clients.

---

## Configuration (`src/server-config.json`)

```json
{
  "host": "0.0.0.0",
  "frontendPort": 3000,
  "address": "",
  "inputThrottleMs": 8,
  "sensitivity": 1.0,
  "invertScroll": false
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `host` | string | `"0.0.0.0"` | Bind address |
| `frontendPort` | number | `3000` | HTTP server port |
| `address` | string | `""` | Optional override LAN IP |
| `inputThrottleMs` | number | `8` | Minimum ms between move/scroll events |
| `sensitivity` | number | `1.0` | Mouse speed multiplier (0.1–10.0) |
| `invertScroll` | boolean | `false` | Natural vs. traditional scroll direction |

Config changes via `POST /api/config` are **buffered in memory** (`pendingConfigUpdates`) to avoid triggering a Vite server restart (Vite watches JSON files). Changes are written to disk on process exit.

---

## IP Detection (`src/server/api/getLocalIp.ts`)

```typescript
// dgram UDP connect — no packets sent, OS selects the outbound NIC
const socket = dgram.createSocket("udp4")
socket.connect(1, "1.1.1.1", () => {
  const ip = socket.address().address
  socket.close()
  resolve(ip)
})
```

This is a well-known trick for getting the LAN IP: connecting a UDP socket selects the OS routing table entry without sending any data. The resulting `socket.address().address` is the LAN IP.
