# Configuration Reference

All configuration is stored in `src/server-config.json`. This file is read at startup and updated at runtime via `POST /api/config`.

---

## `src/server-config.json`

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

---

## Fields

### `host`
- **Type**: `string`
- **Default**: `"0.0.0.0"`
- **Description**: The bind address for the HTTP server. `"0.0.0.0"` listens on all interfaces (required for LAN access). Set to `"127.0.0.1"` to restrict to localhost only.

### `frontendPort`
- **Type**: `integer`
- **Default**: `3000`
- **Range**: 1–65535
- **Description**: The TCP port for the HTTP server. All clients must connect to this port. Changing this via the Settings UI triggers a browser redirect to the new URL.

### `address`
- **Type**: `string`
- **Default**: `""`
- **Description**: Optional manual override for the LAN IP address shown in the QR code. Leave empty to use automatic detection via UDP socket.

### `inputThrottleMs`
- **Type**: `integer`
- **Default**: `8`
- **Range**: 1–1000
- **Description**: Minimum time in milliseconds between `move` and `scroll` events. Lower values increase responsiveness but use more bandwidth. The default of 8ms corresponds to ~125 Hz.

### `sensitivity`
- **Type**: `float`
- **Default**: `1.0`
- **Range**: 0.1–10.0
- **Description**: Mouse pointer speed multiplier applied at the server-side motion calculation. Combined with the acceleration curve (`ACCEL_FACTOR`, `ACCEL_EXPONENT`).

### `invertScroll`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: When `false` (natural scrolling), swiping up scrolls content up. When `true` (traditional scrolling), swiping up scrolls content down.

---

## Runtime vs. Restart

| Setting | Applied Immediately | Requires Restart |
|---|---|---|
| `sensitivity` | ✅ (propagated to InputPeerConnection) | ❌ |
| `invertScroll` | ✅ (propagated to InputPeerConnection) | ❌ |
| `frontendPort` | ❌ | ✅ |
| `host` | ❌ | ✅ |
| `inputThrottleMs` | ❌ (affects new connections) | ✅ for active |
| `address` | ✅ (next IP fetch) | ❌ |

---

## Write Behavior

Config changes via `POST /api/config` are **first buffered in memory** (`pendingConfigUpdates`). This prevents Vite from detecting the file change and restarting the dev server (Vite has a file watcher). The buffer is written to disk when the server process exits, or via future explicit flush.

In production (Nitro), there is no Vite watcher, so writes happen immediately.

---

## Client-Side Settings (LocalStorage)

These settings are stored on the **client device** (phone/tablet) only — never sent to or stored on the server:

| Key | Type | Default | Description |
|---|---|---|---|
| `rein_sensitivity` | string (float) | `"1.0"` | Mouse sensitivity (mirrors server config) |
| `rein_invert` | string (bool) | `"false"` | Scroll inversion (mirrors server config) |
| `rein_theme` | `"dark"` \| `"light"` | `"dark"` | DaisyUI theme |
| `rein_auth_token` | string | — | Cached auth token (from QR scan) |

Note: `rein_sensitivity` and `rein_invert` are mirrored to the server on change. The server value is authoritative for active connections; the local value is used as the initial value when loading the settings page.
