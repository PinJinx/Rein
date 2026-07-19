# Rein Documentation

> A cross-platform remote desktop & controller — turn any touchscreen device into a trackpad, keyboard, and screen mirror for your PC.

---

## Welcome to Rein

Rein is an open-source, cross-platform remote input system built on top of **WebRTC**. It allows any phone, tablet, or browser-equipped device on your local network to act as a trackpad, keyboard, clipboard relay, and even a live screen mirror for your desktop — all with **sub-8ms input latency** and **zero cloud dependency**.

The project is a **GSOC 2026 project** under [AOSSIE](https://aossie.gitlab.io/).

---

## Table of Contents

| Section | Description |
|---|---|
| [Architecture Overview](./architecture/overview.md) | End-to-end system design & data flow |
| [Server Layer](./architecture/server.md) | Nitro/Vite HTTP signaling server internals |
| [WebRTC Signaling](./architecture/webrtc-signaling.md) | Session management, SDP, ICE, SSE bridge |
| [Input System](./architecture/input-system.md) | Cross-platform input injection pipeline |
| [Screen Streaming](./architecture/screen-streaming.md) | GStreamer WHIP pipeline & capture providers |
| [Client Layer](./architecture/client.md) | React frontend, gestures, data channels |
| [Authentication & Security](./architecture/auth.md) | Token store, auth flow, security model |
| [Platform Drivers](./architecture/drivers.md) | Linux uinput, macOS CoreGraphics, Windows SendInput |
| [Electron Wrapper](./architecture/electron.md) | Desktop app packaging |
| [Development Guide](./guides/development.md) | Setup, running, testing |
| [Configuration Reference](./guides/configuration.md) | All config options |
| [API Reference](./api/endpoints.md) | Full HTTP API documentation |

---

## Quick Navigation

- **New to Rein?** Start with the [Architecture Overview](./architecture/overview.md)
- **Want to contribute?** Read the [Development Guide](./guides/development.md)
- **Integrating via API?** See the [API Reference](./api/endpoints.md)
- **Platform-specific setup?** Check [Platform Drivers](./architecture/drivers.md)
