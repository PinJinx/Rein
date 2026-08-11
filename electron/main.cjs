const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
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

// Wait until server is ready
function waitForServer(url) {
  return new Promise((resolve) => {
    const check = () => {
      http
        .get(url, () => resolve())
        .on('error', () => setTimeout(check, 500));
    };
    check();
  });
}

// Start Nitro server (production)
function startServer() {
  return new Promise((resolve) => {
    const serverPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      '.output',
      'server',
      'index.mjs'
    );

    console.log("Starting server from:", serverPath);

    serverProcess = spawn('node', [serverPath], {
      stdio: 'inherit',      // DEBUG: pipe server output to terminal
      //windowsHide: true,     // hide CMD
      env: {
        ...process.env,
        HOST: serverHost,
        PORT: serverPort.toString(),
      },
    });

    waitForServer(`http://localhost:${serverPort}`).then(resolve);
  });
}

// Create window
function createWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Debug only if needed
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.log("LOAD FAILED:", code, desc);
  });
}

// App start
app.whenReady().then(async () => {
  await startServer();
  createWindow();
});

// Cleanup
app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});