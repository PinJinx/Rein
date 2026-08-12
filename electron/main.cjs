const { app, BrowserWindow, utilityProcess } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow;
let serverProcess;
let serverHost = '0.0.0.0';
let serverPort = 3000;

try {
  const candidates = [
    path.join(__dirname, '..', 'src', 'server-config.json'),
    path.join(process.cwd(), 'src', 'server-config.json'),
    path.join(process.cwd(), 'server-config.json'),
  ];
  if (process.resourcesPath) {
    candidates.unshift(
      path.join(process.resourcesPath, 'src', 'server-config.json'),
      path.join(process.resourcesPath, 'server-config.json')
    );
  }
  for (const configPath of candidates) {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.host) serverHost = config.host;
      if (config.frontendPort) serverPort = config.frontendPort;
      break;
    }
  }
} catch (e) {
  console.warn('Failed to load server config:', e);
}

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// Wait until server is ready (with timeout)
function waitForServer(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (Date.now() > deadline) {
        return reject(new Error(`Server did not start within ${timeoutMs}ms`));
      }
      http
        .get(url, () => resolve())
        .on('error', () => setTimeout(check, 500));
    };
    check();
  });
}

// Start Nitro server (production)
function startServer() {
  return new Promise((resolve, reject) => {
    // utilityProcess runs plain Node.js — it CANNOT read from inside app.asar.
    // Only paths that are fully on disk work. Priority:
    //   1. extraResources copy: resources/.output/  (flat on disk, always preferred)
    //   2. app.asar.unpacked copy (only works if ALL node_modules are also unpacked)
    const candidates = [
      path.join(process.resourcesPath, '.output', 'server', 'index.mjs'),
      path.join(process.resourcesPath, 'app.asar.unpacked', '.output', 'server', 'index.mjs'),
    ];

    const logPath = path.join(process.resourcesPath, '..', 'rein-main.log');
    const log = (msg) => {
      const line = `[${new Date().toISOString()}] ${msg}\n`;
      process.stdout.write(line);
      try { fs.appendFileSync(logPath, line); } catch(_) {}
    };

    log(`process.resourcesPath: ${process.resourcesPath}`);
    log(`__dirname: ${__dirname}`);
    for (const c of candidates) log(`candidate exists=${fs.existsSync(c)}: ${c}`);

    const serverPath = candidates.find(c => fs.existsSync(c));
    if (!serverPath) {
      const msg = 'Cannot find server index.mjs in any candidate path!';
      log(`[ERROR] ${msg}`);
      return reject(new Error(msg));
    }

    // Check that node_modules are adjacent to the server (not inside asar)
    const nodeModulesPath = path.join(path.dirname(path.dirname(serverPath)), '..', 'node_modules');
    log(`node_modules adjacent: ${fs.existsSync(nodeModulesPath)} at ${nodeModulesPath}`);

    log(`Starting server from: ${serverPath}`);

    serverProcess = utilityProcess.fork(serverPath, [], {
      stdio: 'pipe',
      env: {
        ...process.env,
        HOST: serverHost,
        PORT: serverPort.toString(),
      },
    });

    let serverLog = '';
    const appendLog = (chunk) => {
      serverLog += chunk;
      process.stdout.write(chunk);
      try { fs.appendFileSync(logPath, chunk); } catch(_) {}
    };

    if (serverProcess.stdout) serverProcess.stdout.on('data', d => appendLog(d.toString()));
    if (serverProcess.stderr) serverProcess.stderr.on('data', d => appendLog(d.toString()));

    serverProcess.on('exit', (code) => {
      log(`Server process exited with code ${code}`);
      const crashLog = `Exit code: ${code}\n${serverLog}`;
      try { fs.writeFileSync(path.join(process.resourcesPath, '..', 'server-crash.log'), crashLog); } catch(_) {}
    });

    waitForServer(`http://localhost:${serverPort}`, 30000).then(resolve).catch(reject);
  });
}

// Create window
function createWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // Show immediately — don't rely on ready-to-show (it won't fire if server is down)
    show: true,
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    process.stdout.write(`[LOAD FAILED] code=${code} desc=${desc}\n`);
  });
}

// App start
app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (err) {
    console.error('[FATAL] Server failed to start:', err.message);
    // Still create window so we can see *something*, or show error
    createWindow();
    return;
  }
  createWindow();
});

// Cleanup
app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});