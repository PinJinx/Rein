# API Reference

All endpoints are served on the same port as the frontend (default: `3000`). All `/api/*` paths are handled by Rein before Vite or Nitro.

---

## Authentication

Most endpoints require a **Bearer token** in the `Authorization` header:

```
Authorization: Bearer <token>
```

For SSE connections (where headers can't be set), the token can be passed as a query parameter:

```
GET /api/webrtc/events?sessionId=...&token=<TOKEN>
```

**Localhost bypass**: Any request from `127.0.0.1`, `::1`, or `::ffff:127.0.0.1` automatically passes auth checks.

**Localhost-only endpoints**: Some endpoints are restricted to localhost only — they return `403` for any remote request.

---

## Endpoints

---

### `GET /api/host/ip`

Returns the server's LAN IP address.

**Auth**: Token or localhost

**Response** `200`:
```json
{ "ip": "192.168.1.42" }
```

**Response** `500`:
```json
{ "error": "Failed to get local IP" }
```

---

### `POST /api/auth/token`

Generates or returns the active auth token. Used by the Settings page to create the QR code URL.

**Auth**: **Localhost only** (returns `403` for remote requests)

**Response** `200`:
```json
{ "token": "550e8400-e29b-41d4-a716-446655440000" }
```

---

### `GET /api/auth/token`

Returns the current active token without generating a new one.

**Auth**: **Localhost only**

**Response** `200`:
```json
{ "token": "550e8400-e29b-41d4-a716-446655440000" }
```

**Response** `404`:
```json
{ "error": "No active token" }
```

---

### `POST /api/config`

Updates server configuration. Changes are applied immediately to active connections and buffered for disk write.

**Auth**: Token or localhost

**Request body**:
```json
{
  "frontendPort": 3000,
  "inputThrottleMs": 8,
  "sensitivity": 1.5,
  "invertScroll": false,
  "host": "0.0.0.0",
  "address": ""
}
```

All fields are optional. Only valid keys are processed (allowlist enforced).

**Validation**:
| Field | Type | Range | Notes |
|---|---|---|---|
| `frontendPort` | integer | 1–65535 | Triggers redirect on client |
| `inputThrottleMs` | integer | 1–1000 | ms between throttled events |
| `sensitivity` | float | 0.1–10.0 | Mouse speed multiplier |
| `invertScroll` | boolean | — | Swap scroll direction |
| `host` | string | ≤255 chars | Bind address |
| `address` | string | ≤255 chars | Override LAN IP |

**Response** `200`:
```json
{
  "ok": true,
  "config": { "frontendPort": 3000, "sensitivity": 1.5, ... }
}
```

**Response** `400`:
```json
{ "error": "Invalid port number (must be 1–65535)" }
```

---

### `POST /api/session`

Creates a new WebRTC session. Returns a session ID and viewer URL.

**Auth**: Token or localhost

**Response** `201`:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "viewerUrl": "http://192.168.1.42:3000/trackpad?session=550e8400..."
}
```

**Response** `500`:
```json
{ "error": "Failed to initialize and bind session host runtime cleanly" }
```

---

### `GET /api/session/:id`

Returns the current state of a session.

**Auth**: Token or localhost

**Path parameter**: `id` — session UUID

**Response** `200`:
```json
{
  "id": "550e8400-...",
  "state": "offering",
  "createdAt": 1720000000000,
  "hasOffer": true,
  "hasAnswer": false,
  "viewerIceCandidates": 3,
  "hostIceCandidates": 5
}
```

**Response** `404`:
```json
{ "error": "Session not found" }
```

---

### `DELETE /api/session/:id`

Closes and deletes a session. Sends `session-closed` SSE event. Closes associated InputPeerConnection.

**Auth**: Token or localhost

**Response** `200`:
```json
{ "ok": true }
```

---

### `GET /api/webrtc/events`

Opens a Server-Sent Events stream for the session. Used as the signaling bus.

**Auth**: Token or localhost

**Query params**:
- `sessionId` (required) — session UUID
- `token` (optional) — auth token (alternative to Authorization header)

**Response**: `Content-Type: text/event-stream`

Immediately replays buffered state on connect (existing offer, answer, ICE candidates).

**Events**:

| Event | Data | When |
|---|---|---|
| `offer` | `{ sessionId, sdp }` | GStreamer posts its offer |
| `answer` | `{ sessionId, sdp }` | Browser posts its answer |
| `host-ice` | `{ sessionId, candidate, sdpMid, sdpMLineIndex }` | Host ICE candidate |
| `viewer-ice` | `{ sessionId, candidate, sdpMid, sdpMLineIndex }` | Viewer ICE candidate |
| `input-answer` | `{ sessionId, sdp }` | Input PC SDP answer |
| `input-ice` | `{ sessionId, candidate, sdpMid }` | Input PC ICE candidate |
| `stream-error` | `{ type, message }` | Pipeline or connection error |
| `session-closed` | `{ sessionId }` | Session deleted |

Keepalive comment sent every 15 seconds: `: keepalive`

---

### `POST /api/webrtc/offer`

Stores a viewer's SDP offer and forwards to GStreamer host runner.

**Auth**: Token or localhost

**Request body**:
```json
{
  "sessionId": "550e8400-...",
  "sdp": "v=0\r\no=- ..."
}
```

**Response** `200`:
```json
{ "ok": true }
```

**Response** `400`: missing fields
**Response** `404`: session not found
**Response** `409`: session not in `pending` state

---

### `POST /api/webrtc/answer`

Stores the browser's SDP answer and pushes it via SSE.

**Auth**: Token or localhost

**Request body**:
```json
{
  "sessionId": "550e8400-...",
  "sdp": "v=0\r\no=- ..."
}
```

**Response** `200`:
```json
{ "ok": true }
```

---

### `POST /api/webrtc/ice`

Submits an ICE candidate from any party.

**Auth**: Token or localhost

**Request body**:
```json
{
  "sessionId": "550e8400-...",
  "candidate": "candidate:1 1 UDP ...",
  "sdpMid": "0",
  "sdpMLineIndex": 0,
  "from": "viewer"
}
```

**`from` values**:
| Value | Meaning | Action |
|---|---|---|
| `"viewer"` | Browser's video PC candidate | Store in `session.viewerIce`, push `viewer-ice` SSE event |
| `"viewer-input"` | Browser's input PC candidate | Forward to `InputPeerConnection.addRemoteCandidate()` |
| Any other | Host candidate | Store in `session.hostIce`, push `host-ice` SSE event |

**Response** `200`:
```json
{ "ok": true }
```

---

### `POST /api/webrtc/input-offer`

Submits the browser's input `RTCPeerConnection` SDP offer to create an `InputPeerConnection` on the server.

**Auth**: Token or localhost

**Request body**:
```json
{
  "sessionId": "550e8400-...",
  "sdp": "v=0\r\no=- ..."
}
```

On success, the server:
1. Creates an `InputPeerConnection` instance
2. Processes the offer (generates answer)
3. Pushes `input-answer` SSE event with the answer SDP

**Response** `200`:
```json
{ "ok": true }
```

**Response** `500`:
```json
{ "error": "..." }
```

---

### `POST /api/webrtc/gateway`

Internal endpoint used by GStreamer's WHIP signaling to forward SDP answers and ICE candidates from the host to the SSE stream.

**Auth**: None (internal only — not reachable from the internet without firewall bypass)

**Query params**: `sessionId` (required)

**Request body**: JSON with either:
- `{ "type": "answer", "sdp": "..." }` — pushes `answer` SSE event
- `{ "candidate": "...", "sdpMid": "...", "sdpMLineIndex": N }` — pushes `host-ice` SSE event

**Response** `200`:
```json
{ "status": "ok" }
```

---

### `POST /api/webrtc/whip`

WHIP protocol endpoint for GStreamer's `whipclientsink` element.

**Auth**: Token in `?token=` query param or `Authorization: Bearer_<TOKEN>` header

**Query params**: `sessionId` (required), `token` (required)

**Request**: Raw SDP offer body (`Content-Type: application/sdp`)

**Response** `201` (when browser answer is ready):
```
Content-Type: application/sdp
Location: /api/webrtc/whip?sessionId=...
Body: <SDP answer>
```

**Response** `408` (timeout after 5 seconds):
```json
{ "error": "WHIP signaling handshake timeout" }
```

---

### `POST /api/host/start`

Starts the GStreamer HostRunner if not already running.

**Auth**: **Localhost only**

**Response** `200`:
```json
{ "status": "running" }
```

**Response** `409`:
```json
{ "error": "Host already running" }
```

---

### `POST /api/host/stop`

Stops the GStreamer HostRunner and all active pipelines.

**Auth**: **Localhost only**

**Response** `200`:
```json
{ "status": "stopped" }
```

---

### `GET /api/host/status`

Returns the current GStreamer host status.

**Auth**: Token or localhost

**Response** `200`:
```json
{ "status": "running" }
```

**Possible values**: `"stopped"`, `"starting"`, `"running"`, `"error"`

---

## DataChannel Message Protocol

Input events are sent as JSON strings over WebRTC DataChannels.

### Message Types

All messages have a `type` field. Additional fields depend on type.

| `type` | Channel | Required Fields | Optional Fields |
|---|---|---|---|
| `move` | unordered | `dx: number`, `dy: number` | — |
| `scroll` | unordered | `dx: number`, `dy: number` | — |
| `zoom` | unordered | `delta: number` | — |
| `touch` | unordered | `contacts: TouchContact[]` | — |
| `click` | ordered | `button: "left"\|"right"\|"middle"`, `press: boolean` | — |
| `key` | ordered | `key: string` | — |
| `text` | ordered | `text: string` | — |
| `combo` | ordered | `keys: string[]` | — |
| `copy` | ordered | — | — |
| `paste` | ordered | — | — |
| `ping` | ordered | `timestamp: number` | — |

### `TouchContact` Shape

```typescript
interface TouchContact {
  id: number         // Per-finger tracking ID
  x: number          // Screen X coordinate (0–screenWidth)
  y: number          // Screen Y coordinate (0–screenHeight)
  state: "down" | "move" | "up"
}
```

### Server → Client Messages

| `type` | Channel | Fields |
|---|---|---|
| `pong` | ordered | `timestamp: number` (echo of ping timestamp) |
