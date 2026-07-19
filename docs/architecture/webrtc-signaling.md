# WebRTC Signaling

Rein uses a **custom HTTP + SSE signaling protocol** rather than a dedicated WebSocket server. All signaling flows through the same Vite/Nitro server on a single port, making firewall configuration simple (only port 3000 needs to be open).

---

## Two WebRTC Connections Per Session

Each remote-control session establishes **two independent peer connections**:

```
Phone (Viewer)                          Desktop (Host)
──────────────────────────────────────────────────────
videoPc  (RTCPeerConnection)  ←───→  GStreamer WHIP sink
inputPc  (RTCPeerConnection)  ←───→  InputPeerConnection (node-datachannel)
```

| Connection | Initiator | Data |
|---|---|---|
| `videoPc` | GStreamer sends offer via WHIP | Video MediaTrack (one-way, recvonly) |
| `inputPc` | Browser sends offer | 2× DataChannels (bidirectional for ping/pong) |

---

## Signaling Flow Sequence

```
Phone                    HTTP Server               GStreamer / node-datachannel
──────────────────────────────────────────────────────────────────────────────

POST /api/session ──────────────────→ creates Session{id, state:"pending"}
                  ←── { sessionId } ──
                  
GET /api/webrtc/events?sessionId=X ─→ SSE stream opened (keepalive 15s)
                  ←── [SSE open] ────

POST /api/webrtc/input-offer ────────→ creates InputPeerConnection
  { sessionId, sdp: inputPcOffer }    processOffer(sdp) → node-datachannel
                  ←── { ok:true } ───
                                       ← generates answer SDP
                                      pushEvent("input-answer", {sdp})
                  ←── SSE: input-answer ──
                  
[GStreamer starts separately]
POST /api/webrtc/whip?sessionId=X ──→ session.offer = sdp
  Content-Type: application/sdp        session.state = "offering"
  Body: GStreamer SDP offer            pushEvent("offer", {sdp})
                  ←── SSE: offer ────────────────────────────────
                  
[Browser receives "offer" event]
  videoPc.setRemoteDescription(offer)
  answer = videoPc.createAnswer()
  videoPc.setLocalDescription(answer)
  
POST /api/webrtc/answer ─────────────→ session.answer = sdp
  { sessionId, sdp: browserAnswer }    session.state = "answered"
                  ←── { ok:true } ──  pushEvent("answer", {sdp})
                                       ← WHIP handler polls for answer
                                       HTTP 201 { answer SDP } → GStreamer
                                       
[ICE candidate exchange]
Phone → POST /api/webrtc/ice { from:"viewer", candidate }
      → pushEvent("viewer-ice", candidate) → SSE → GStreamer

GStreamer → POST /api/webrtc/gateway { candidate }
          → pushEvent("host-ice", candidate) → SSE → Browser

InputPeerConnection → pushEvent("input-ice", candidate) → SSE → Browser
Phone → POST /api/webrtc/ice { from:"viewer-input", candidate }
      → inputPc.addRemoteCandidate(...)

[ICE complete — P2P established]
Video frames: GStreamer ──P2P──→ Browser <video>
Input events: Browser ──DataChannel──→ node-datachannel → InputHandler
```

---

## Session Object

```typescript
interface Session {
  id: string           // crypto.randomUUID()
  createdAt: number    // Date.now()
  state: SessionState  // "pending" | "offering" | "answered" | "connected" | "closed"
  offer: string | null // GStreamer SDP offer (stored for late SSE subscribers)
  answer: string | null // Browser SDP answer (stored for WHIP polling)
  viewerIce: IceCandidate[] // Browser ICE candidates (buffered)
  hostIce: IceCandidate[]   // Host ICE candidates (buffered)
}
```

ICE candidates are **buffered in the session** so that a late-connecting SSE client can receive all previously seen candidates on connect. This handles the common race condition where the browser sets a remote description after some candidates have already arrived.

---

## SSE Event Stream (`GET /api/webrtc/events`)

The SSE connection is the signaling bus. On connect, the server immediately replays any already-buffered state:

```
if (session.offer)  → replay "offer" event
if (session.answer) → replay "answer" event
for viewerIce       → replay "viewer-ice" events
for hostIce         → replay "host-ice" events
```

A keepalive comment (`: keepalive`) is sent every 15 seconds to prevent proxy timeouts.

### SSE Event Reference

| Event Name | Payload | Sent When |
|---|---|---|
| `offer` | `{ sessionId, sdp }` | GStreamer posts its SDP offer |
| `answer` | `{ sessionId, sdp }` | Browser posts its SDP answer |
| `host-ice` | `{ sessionId, candidate, sdpMid, sdpMLineIndex }` | GStreamer or InputPC emits an ICE candidate |
| `viewer-ice` | `{ sessionId, candidate, sdpMid, sdpMLineIndex }` | Browser sends a viewer ICE candidate |
| `input-answer` | `{ sessionId, sdp }` | InputPeerConnection generates its SDP answer |
| `input-ice` | `{ sessionId, candidate, sdpMid }` | InputPeerConnection emits an ICE candidate |
| `stream-error` | `{ type, message }` | GStreamer fails, ICE fails, etc. |
| `session-closed` | `{ sessionId }` | Session is deleted |

---

## WHIP Protocol Handshake

[WHIP (WebRTC-HTTP Ingestion Protocol)](https://www.ietf.org/archive/id/draft-ietf-wish-whip-01.txt) is used so GStreamer's standard `whipclientsink` element can negotiate WebRTC with the browser-facing peer.

```
1. GStreamer POSTs SDP offer to /api/webrtc/whip?sessionId=...
   - Auth: Bearer token in query string or Authorization header
   - Body: raw SDP (Content-Type: application/sdp)

2. Server stores offer, pushes "offer" SSE event

3. Browser receives SSE "offer", creates answer, POSTs to /api/webrtc/answer

4. WHIP handler polls session.answer every 100ms (up to 5s)

5. When answer found → HTTP 201 with SDP body → GStreamer finishes handshake
```

The `handleGstSignalingGateway` endpoint handles the reverse path: GStreamer's local ICE candidates from the WHIP flow are sent to the SSE stream as `host-ice` events.

---

## InputPeerConnection WebRTC

The input channel uses `node-datachannel` (a native Node.js WebRTC implementation) rather than the browser's WebRTC API.

```typescript
const inputPc = new InputPeerConnection(sessionId, onLocalCandidate, config, onClosed, onError)
const answerSdp = await inputPc.processOffer(sdp)
pushEvent(sessionId, "input-answer", { sessionId, sdp: answerSdp })
```

**SCTP tuning:** `nodeDataChannel.setSctpSettings({ delayedSackTime: 0 })` is called globally. This disables the 200ms delayed acknowledgment timer in SCTP, keeping the browser's send window open and eliminating periodic latency spikes.

---

## ICE Candidate Routing

ICE candidates from different sources are routed to different handlers:

```typescript
// POST /api/webrtc/ice
if (from === "viewer-input") {
  // Browser's input PC candidates → node-datachannel
  inputPc.addRemoteCandidate(candidate, sdpMid)
} else if (from === "viewer") {
  // Browser's video PC candidates → SSE for GStreamer
  session.viewerIce.push(ice)
  pushEvent(sessionId, "viewer-ice", { ...ice })
} else {
  // GStreamer's candidates → SSE for browser's video PC
  session.hostIce.push(ice)
  pushEvent(sessionId, "host-ice", { ...ice })
}
```

The `from` field in the POST body disambiguates the source and determines the routing.

---

## Reconnection & Error Handling

The `useWebRtcStream` hook implements an **exponential backoff retry loop** with up to 5 attempts:

```typescript
const backoffDelay = Math.min(2000 * 2 ** retryCountRef.current, 30000)
// Attempt 1: 2s, 2: 4s, 3: 8s, 4: 16s, 5: 30s
```

Before retrying, it checks `GET /api/host/status` to distinguish between:
- **Server online** → retry the WebRTC setup (transient failure)
- **Server offline** → surface error to user ("Server has quit or is unreachable")

### Video Stream Watchdog

A 2-second interval polls WebRTC stats (`videoPc.getStats()`). If `bytesReceived` doesn't increase for 4 seconds while the track is active, it triggers `handleNetworkFailure()` — automatically recovering from a silent freeze without user intervention.

```typescript
if (bytes > lastBytesReceived) {
  lastBytesReceived = bytes
  lastBytesTime = now
} else if (now - lastBytesTime > 4000) {
  // Freeze detected → reconnect
  handleNetworkFailure()
}
```
