# Development Guide

This guide covers everything needed to get Rein running locally, contribute code, and test across platforms.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | LTS recommended |
| npm | Bundled with Node | |
| GStreamer | 1.20+ | Auto-installed by `postinstall` on macOS/Windows; system package on Linux |
| Linux: uinput access | — | See Linux-specific setup below |
| macOS: Accessibility | — | Required for input injection |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/AOSSIE-Org/Rein.git
cd Rein

# 2. Install (also installs/checks GStreamer via postinstall)
npm install

# 3. Run dev server
npm run dev

# 4. Open in browser
open http://localhost:3000/settings
```

---

## Platform-Specific Setup

### Linux

Rein uses `/dev/uinput` for virtual input devices. Setup is required once:

```bash
# Create the uinput group
sudo groupadd -f uinput

# Set device permissions
sudo tee /etc/udev/rules.d/99-rein.rules <<EOF
KERNEL=="uinput", MODE="0660", GROUP="uinput"
EOF

# Add your user to the group
sudo usermod -aG uinput $USER

# Reload rules
sudo udevadm control --reload-rules
sudo udevadm trigger

# Log out and back in, then verify:
ls -l /dev/uinput
# Should show: crw-rw---- 1 root uinput ... /dev/uinput
```

#### GStreamer on Linux

Install via your package manager:

```bash
# Ubuntu / Debian
sudo apt install gstreamer1.0-tools gstreamer1.0-plugins-base \
  gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly \
  gstreamer1.0-libav

# Fedora / RHEL
sudo dnf install gstreamer1 gstreamer1-plugins-base gstreamer1-plugins-good \
  gstreamer1-plugins-bad-free gstreamer1-plugins-ugly

# Arch Linux
sudo pacman -S gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly
```

#### Wayland (PipeWire + XDG Desktop Portal)

For Wayland sessions, ensure:
```bash
systemctl --user status pipewire pipewire-pulse
systemctl --user status xdg-desktop-portal xdg-desktop-portal-gnome  # or -kde, -wlr, etc.
```

If the portal is not running, start it:
```bash
systemctl --user start xdg-desktop-portal
```

#### Nix / NixOS

A `shell.nix` is provided:
```bash
nix-shell
npm install
npm run dev
```

### macOS

Grant Accessibility permission to your terminal or IDE:
```
System Settings → Privacy & Security → Accessibility → Add your terminal
```

GStreamer is automatically downloaded by `npm install` (postinstall script).

### Windows

GStreamer is automatically downloaded by `npm install`.

For testing, ensure Windows Defender / antivirus doesn't block the GStreamer executable.

---

## NPM Scripts

| Script | Command | Description |
|---|---|---|
| `predev` | `biome check . --write` | Auto-format before dev |
| `dev` | `vite dev --host` | Start Vite dev server |
| `build` | `vite build` | Production build → `.output/` |
| `start` | `vite preview --host --open` | Preview production build |
| `electron` | `npx electron .` | Run Electron (requires production build) |
| `electron-dev` | `concurrently ...` | Run Electron with Vite dev server |
| `dist` | `electron-builder` | Package Electron app |
| `test` | `vitest run` | Run all tests |
| `check` | `biome check .` | Lint & format check |
| `check:fix` | `biome check . --write` | Auto-fix lint & format |

---

## Project Structure

```
Rein/
├── electron/
│   └── main.cjs              # Electron main process
├── public/
│   └── app_icon/             # App icons
├── scripts/
│   └── install-gstreamer.js  # GStreamer postinstall script
├── src/
│   ├── components/
│   │   └── Trackpad/         # React UI components
│   │       ├── Buffer.tsx
│   │       ├── ControlBar.tsx
│   │       ├── ErrorComponent.tsx
│   │       ├── ExtraKeys.tsx
│   │       ├── ScreenMirror.tsx
│   │       └── TouchArea.tsx
│   ├── contexts/
│   │   └── ConnectionProvider.tsx  # DataChannel React context
│   ├── hooks/
│   │   ├── useRemoteConnection.ts  # Thin wrapper over ConnectionProvider
│   │   ├── useTrackpadGesture.ts   # Touch gesture state machine
│   │   └── useWebRtcStream.ts      # Full WebRTC session lifecycle
│   ├── routes/
│   │   ├── __root.tsx         # Root layout + navigation
│   │   ├── index.tsx          # Redirect to /settings
│   │   ├── settings.tsx       # Settings & QR page
│   │   └── trackpad.tsx       # Main remote control page
│   ├── server/
│   │   ├── api/
│   │   │   ├── InputPeerConnection.ts  # node-datachannel peer
│   │   │   ├── apiHandlers.ts          # All REST handler functions
│   │   │   ├── apiState.ts             # Shared in-memory state
│   │   │   └── getLocalIp.ts           # LAN IP detection
│   │   ├── drivers/
│   │   │   ├── keyMap.ts               # Key name → code mapping
│   │   │   ├── utils.ts                # Motion acceleration
│   │   │   ├── linux/                  # uinput driver
│   │   │   ├── mac/                    # CoreGraphics driver
│   │   │   └── windows/                # Win32 / Synthetic Pointer driver
│   │   ├── gstreamer/
│   │   │   ├── captureProvider.ts      # Platform capture source factory
│   │   │   ├── gstManager.ts           # gst-launch-1.0 process manager
│   │   │   ├── gstPaths.ts             # GStreamer binary path resolution
│   │   │   ├── hostRunner.ts           # Session pool manager
│   │   │   └── utils.ts                # D-Bus / PipeWire utilities
│   │   ├── constants.ts
│   │   ├── InputHandler.ts             # Throttle + dispatch + sanitize
│   │   ├── server.ts                   # HTTP router + AsyncLocalStorage
│   │   ├── tokenStore.ts               # Token CRUD + persistence
│   │   └── types.ts                    # Shared TypeScript types
│   ├── utils/
│   │   ├── i18n.ts                     # Simple key-value i18n
│   │   └── logger.ts                   # Winston logger
│   ├── config.tsx                      # App constants (themes, storage keys)
│   ├── router.tsx                      # TanStack Router setup
│   ├── routeTree.gen.ts                # Auto-generated route tree
│   ├── server-config.json              # Runtime server configuration
│   ├── styles.css                      # Global Tailwind CSS
│   ├── tokens.json                     # Persisted auth tokens (gitignored)
│   └── types.tsx                       # Global TypeScript types
├── biome.json                          # Biome linter/formatter config
├── package.json
├── postcss.config.js
├── shell.nix                           # Nix development environment
├── tsconfig.json
└── vite.config.ts                      # Vite build config + signaling plugin
```

---

## Testing

### Unit Tests

```bash
npm run test
```

Uses [Vitest](https://vitest.dev/) with jsdom. Test files follow the `*.test.ts` / `*.spec.ts` convention.

### Manual Testing on a VM

1. Set VirtualBox network adapter to **Bridged Adapter**
2. Select your active Wi-Fi or Ethernet interface
3. Run `npm run dev` in the VM
4. Find the VM's LAN IP: `ip addr` or `hostname -I`
5. Connect your phone to the same Wi-Fi
6. Navigate to `http://<VM_IP>:3000/settings`

### Testing Without GStreamer

If GStreamer is not available, the pipeline falls back to `videotestsrc pattern=ball` — an animated ball pattern. This allows testing the WebRTC data channel input path without a real screen capture.

---

## Code Style

Rein uses [Biome](https://biomejs.dev/) for linting and formatting:

```bash
npm run check        # Check only
npm run check:fix    # Auto-fix
```

Key style rules:
- ES6+ syntax, `const` preferred over `let`
- No `any` types
- Arrow functions for callbacks
- No `console.log` in committed code (use `logger.ts`)
- Keep functions small and focused

---

## Contributing

1. Join the [Discord server](https://discord.com/invite/C8wHmwtczs) (Project → Rein) — **mandatory**
2. Find or create an issue
3. Fork the repo and create a feature branch
4. Make changes, run `npm run check:fix` and `npm run test`
5. Submit a PR with a clear description
6. Post your PR link in the Discord channel

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the full guide.

---

## Environment Variables

| Variable | Used By | Description |
|---|---|---|
| `DISPLAY` | GStreamer (X11) | X11 display (default `:0`) |
| `XAUTHORITY` | GStreamer (X11) | X11 auth cookie path |
| `XDG_SESSION_TYPE` | CaptureProvider | Detect Wayland session |
| `WAYLAND_DISPLAY` | CaptureProvider | Detect Wayland session |
| `GST_PLUGIN_PATH` | GstManager | GStreamer plugin search path |
| `GST_PLUGIN_SCANNER` | GstManager | GStreamer plugin scanner binary |
| `VITE_DEV_SERVER_URL` | Electron dev | URL for Electron to load |
| `HOST` | Nitro production | Server bind address |
| `PORT` | Nitro production | Server port |
