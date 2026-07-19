# Electron Wrapper

Rein ships as both a **web app** (accessed directly in a browser) and an **Electron desktop application**. The Electron wrapper provides a native window, handles server lifecycle, and enables single-instance enforcement.

---

## `electron/main.cjs`

The Electron main process (`electron/main.cjs`) is responsible for:

1. Reading server config (`src/server-config.json`)
2. Enforcing single-instance lock
3. Spawning the Nitro production server
4. Waiting for the server to become ready
5. Creating the `BrowserWindow` pointing to `localhost`

### Config Loading

```javascript
const configPath = './src/server-config.json'
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  if (config.host) serverHost = config.host
  if (config.frontendPort) serverPort = config.frontendPort
}
```

Defaults: `host = "0.0.0.0"`, `port = 3000`.

### Single Instance Lock

```javascript
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}
```

Prevents multiple Rein windows from running simultaneously.

### Server Startup

```javascript
function startServer() {
  const serverPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    '.output', 'server', 'index.mjs'
  )
  serverProcess = spawn('node', [serverPath], {
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, HOST: serverHost, PORT: serverPort.toString() }
  })
  return waitForServer(`http://localhost:${serverPort}`)
}
```

The Nitro server is pre-built into `.output/server/index.mjs` during `npm run build`. The `waitForServer` function polls `http://localhost:<port>` every 500ms until it responds.

### BrowserWindow

```javascript
mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  show: false  // Hidden until 'ready-to-show' to prevent flash
})
mainWindow.loadURL(`http://localhost:${serverPort}`)
mainWindow.once('ready-to-show', () => mainWindow.show())
```

### Cleanup

```javascript
app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})
```

macOS convention: app stays in Dock even after all windows close.

---

## Build Configuration (`package.json`)

```json
{
  "build": {
    "appId": "com.rein.app",
    "productName": "Rein",
    "asar": true,
    "asarUnpack": [".output/**/*", "node_modules/@nut-tree-fork/**/*"],
    "extraResources": [{ "from": ".output", "to": ".output" }],
    "files": [".output/**/*", "electron/**/*", "package.json"],
    "linux": { "target": "AppImage" },
    "win": { "target": "portable" },
    "mac": { "target": "dmg" }
  }
}
```

The `.output` directory (Nitro build artifact) is:
- Included in the ASAR archive
- Also unpacked from ASAR (`asarUnpack`) so native modules (Koffi, node-datachannel) can access the filesystem

### Build Scripts

```bash
npm run build      # Vite + Nitro production build → .output/
npm run dist       # electron-builder → platform installer
```

---

## Electron vs. Browser Mode

| Feature | Browser (`npm run dev`) | Electron |
|---|---|---|
| Server | Vite dev server (inline) | Separate Nitro process |
| Frontend | `http://localhost:3000` | `http://localhost:3000` (embedded) |
| HMR | ✅ | ❌ |
| Native window | ❌ | ✅ |
| Auto-launch | ❌ | ✅ (with OS startup config) |
| DevTools | ✅ | Disabled (removable) |

---

## Electron Dev Mode

```bash
npm run electron-dev
```

Uses `concurrently` to run:
1. `vite` — starts the Vite dev server
2. `wait-on http://localhost:3000 && VITE_DEV_SERVER_URL=... electron .` — waits for Vite, then launches Electron pointing to the dev server
