# Authentication & Security

Rein's security model is designed for **local network use** — it doesn't assume a public internet threat model, but does protect against unauthorized access from other devices on the same LAN.

---

## Security Model

| Threat | Mitigation |
|---|---|
| Unauthorized LAN device controlling the desktop | Bearer token required for all remote-facing endpoints |
| Token theft via URL interception | Tokens are one-time generated, not reused across sessions (regenerated on settings load) |
| Token brute-force | 128-bit cryptographic random UUID |
| Timing attacks on token comparison | `crypto.timingSafeEqual()` used for all token checks |
| Remote code execution via config | Server-side allowlist of config keys + type/range validation |
| Request body attacks | Max body size: 64 KB |
| Cross-origin attacks | Server only responds to `/api/*` paths; CSP headers from Vite |
| Token persistence | File permissions `0o600` (owner read/write only) |
| Sensitive data in logs | GStreamer auth tokens are redacted in all log output |

---

## Token Generation

```typescript
export function generateToken(): string {
  return crypto.randomUUID()  // 128-bit CSPRNG — 2^122 entropy
}
```

A UUID v4 is used: 122 bits of cryptographic randomness. This is generated via Node.js `crypto.randomUUID()`, which uses the OS CSPRNG.

---

## Token Lifecycle

```
POST /api/auth/token (localhost only)
  └─ getActiveToken()  → return existing if present (avoids QR regeneration)
  └─ generateToken()   → crypto.randomUUID()
  └─ storeToken(token) → persist to tokens.json
  └─ return { token }

Settings page encodes token into QR: /trackpad?token=<TOKEN>

Phone scans QR → opens /trackpad?token=<TOKEN>
  └─ Token saved to localStorage for subsequent page loads
  └─ All API calls include: Authorization: Bearer <TOKEN>
```

---

## Token Store (`src/server/tokenStore.ts`)

### Persistence

Tokens are persisted to `tokens.json` (adjacent to the server source):

```typescript
const TOKENS_FILE = path.resolve(__dirname, "../tokens.json")
const EXPIRY_MS = 10 * 24 * 60 * 60 * 1000  // 10 days
```

File is written with mode `0o600`:
```typescript
await writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2), {
  encoding: "utf-8",
  mode: 0o600  // Owner read/write only — prevents other users from reading tokens
})
```

### Write Throttling

To avoid frequent disk writes during an active session, saves are throttled to **once per minute** (except for forced saves on token create/delete):

```typescript
const SAVE_THROTTLE_MS = 60 * 1000
if (!force && now - lastSaveTime < SAVE_THROTTLE_MS) return
```

### Expiry

Tokens expire after 10 days of inactivity. `purgeExpired()` is called on every read operation:

```typescript
function purgeExpired(): void {
  tokens = tokens.filter(t => now - t.lastUsed < EXPIRY_MS)
}
```

Each successful auth call runs `touchToken(token)` to reset the `lastUsed` timestamp.

### Timing-Safe Comparison

All token lookups use `crypto.timingSafeEqual()` to prevent timing side-channel attacks:

```typescript
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false  // Length check first (leaks length, but tokens are fixed-length UUIDs)
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
```

---

## Authorization Middleware

### `isLocalRequest(req)`

```typescript
export function isLocalRequest(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1"
}
```

Localhost requests bypass token checks. This allows the Settings page (running in the browser on the desktop itself) to call `POST /api/auth/token` without needing a token.

### `requireLocalhost(req, res)`

Used for highly privileged operations that must never be accessible from the network:
- `POST /api/auth/token` — generates new tokens
- `GET /api/auth/token` — reads active token
- `POST /api/host/start` — starts GStreamer
- `POST /api/host/stop` — stops GStreamer

```typescript
export function requireLocalhost(req, res): boolean {
  if (isLocalRequest(req)) return true
  res.writeHead(403, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: "Localhost only" }))
  return false
}
```

### `requireAuth(req, res)`

Used for all other API endpoints:

```typescript
export function requireAuth(req, res): boolean {
  if (isLocalRequest(req)) return true  // Localhost always passes

  // Check Authorization header: "Bearer <token>"
  const authHeader = req.headers.authorization ?? ""
  let token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null

  // Fall back to ?token= query parameter (for SSE, where headers are hard to set)
  if (!token) {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`)
    token = url.searchParams.get("token")
  }

  if (!token || !isKnownToken(token)) {
    res.writeHead(401, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "Unauthorized" }))
    return false
  }

  touchToken(token)  // Reset expiry
  return true
}
```

The `?token=` query parameter fallback is necessary for `EventSource` connections (SSE), which cannot set custom headers in all browsers.

---

## WHIP Endpoint Token

The GStreamer WHIP endpoint (`POST /api/webrtc/whip`) uses a **separate internal token**:

```typescript
// Generated in ensureHostRunnerActive():
const localToken = getActiveToken() ?? generateToken()
storeToken(localToken)

// Passed to GstManager → embedded in WHIP URL:
// whip-endpoint=http://localhost:PORT/api/webrtc/whip?sessionId=...&token=<localToken>
```

The WHIP endpoint accepts the token in either:
- Query string: `?token=<TOKEN>`
- Authorization header: `Bearer <TOKEN>` or `Bearer_<TOKEN>` (GStreamer's format)

---

## QR Code & URL Structure

The QR code generated on the settings page encodes:

```
http://<LAN_IP>:<PORT>/trackpad?token=<TOKEN>
```

The token is URL-encoded. On the phone:
1. Token is extracted from `?token=` query parameter
2. Saved to `localStorage` as `rein_auth_token`
3. Included as `Authorization: Bearer <token>` in all subsequent API calls

---

## Threat Model Limitations

Rein is designed for trusted local networks. It does **not** protect against:

- **Network sniffing**: HTTP is not HTTPS. On an untrusted network, tokens could be intercepted. Use a VPN for remote access.
- **Malicious LAN members**: Anyone who captures the QR code or intercepts the token URL has full input control.
- **Physical access**: Anyone who can see the QR code on screen can scan it.

For public or enterprise deployments, Rein should be run behind a reverse proxy with TLS.
