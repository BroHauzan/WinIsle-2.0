const { app, BrowserWindow, screen, ipcMain, globalShortcut, Tray, Menu, nativeImage, clipboard, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn, execFile } = require('child_process');

// Catch any unhandled exceptions to avoid annoying crash dialogs in production
process.on('uncaughtException', (err) => {
  console.error('[WinIsle Main Process] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[WinIsle Main Process] Unhandled Rejection:', reason);
});

let PORT = Number(process.env.PORT) || 45781;
let SERVER_URL = `http://127.0.0.1:${PORT}`;

// Window dimensions large enough to fit the largest expanded Dynamic Island state (Lyrics mode 650px + shoulders)
// while keeping the rest of the window 100% transparent and click-through.
const OVERLAY_WIDTH = 740;
const OVERLAY_HEIGHT = 340;

// High-resolution embedded 32x32 Dynamic Island pill icon (PNG base64) so tray icon never fails
const TRAY_ICON_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAZklEQVR4nGNgGAWjYBSMglFAJPj///8zUvGAWEo1x8A0ysmp/KcUk+wIalpOliOobTmyI2jqAH5xLTgm2wGUBD8xDiDaEQMWAoMmDQxoLqC2IygujAakJKSGYyi2dBSMglEwCugBAJeCV9JYDherAAAAAElFTkSuQmCC';

let mainWindow = null;
let systemTray = null;
let devServerProcess = null;
let embeddedServerInstance = null;

// Prevent multiple instances of the Dynamic Island overlay
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// Allow HTML5 audio & YouTube embed audio to play immediately after async AI responses without user gesture blocking
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Ultra-lightweight Chromium & V8 flags: enforces strictly minimal RAM footprint (<100MB)
// Disables telemetry, crashpad collectors, multi-process site isolations, and unused background engines.
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch(
  'disable-features',
  'Translate,CalculateNativeWinOcclusion,AutofillServerCommunication,SpareRendererForSitePerProcess,BackForwardCache,MediaRouter'
);
app.commandLine.appendSwitch('enable-features', 'MemoryReducer');
app.commandLine.appendSwitch('renderer-process-limit', '1');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-gpu-memory-buffer-video-frames');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-zygote');
app.commandLine.appendSwitch('js-flags', '--expose-gc --max-old-space-size=64 --optimize_for_size');

/**
 * Check if WinIsle local server on targetPort is responding with valid identity handshake
 */
function isServerAlive(targetPort = PORT) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${targetPort}/api/winisle-health`, { timeout: 1000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(false);
      }
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (data?.app === 'winisle-desktop') {
            return resolve(true);
          }
        } catch {
          // ignore
        }
        resolve(false);
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Locate unpacked or standard dist directory
 */
function getUnpackedDistDir() {
  const candidateDistDirs = [
    process.env.ISLE_DIST_DIR,
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist'),
    path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'dist'),
    path.join(__dirname, '..', 'dist'),
    path.join(app.getAppPath(), 'dist'),
    path.join(process.resourcesPath || '', 'dist'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist'),
    path.resolve(process.cwd(), 'dist'),
  ].filter(Boolean);

  return (
    candidateDistDirs.find((d) => {
      try {
        const indexFile = path.join(d, 'index.html');
        return fs.existsSync(indexFile) && fs.statSync(indexFile).isFile();
      } catch {
        return false;
      }
    }) || path.join(app.getAppPath(), 'dist')
  );
}

/**
 * Wait until the local backend server is verified ready before showing the overlay
 */
async function waitForServerReady(targetPort = PORT, maxWaitMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isServerAlive(targetPort)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * Automatically start the local backend (server.ts / dist-server/server.cjs) inside the Electron lifecycle
 */
async function ensureLocalBackendRunning() {
  if (await isServerAlive(PORT)) {
    SERVER_URL = `http://127.0.0.1:${PORT}`;
    return;
  }

  // 1. Locate bundled Server across unpacked & packaged paths
  const candidateServerPaths = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist-server', 'server.cjs'),
    path.join(__dirname, '..', 'dist-server', 'server.cjs'),
    path.join(app.getAppPath(), 'dist-server', 'server.cjs'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist-server', 'server.cjs'),
    path.join(process.resourcesPath || '', 'dist-server', 'server.cjs'),
  ];

  const bundledServerPath = candidateServerPaths.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  const distDir = getUnpackedDistDir();

  process.env.PORT = String(PORT);
  process.env.ISLE_MANUAL_START = '1';
  if (app.isPackaged) {
    process.env.NODE_ENV = 'production';
    process.env.ISLE_ELECTRON_STATIC = '1';
  }
  process.env.ISLE_DIST_DIR = distDir;

  // 1. In-process bundled CommonJS server (Used in production Setup.exe and prebuilt server)
  if (bundledServerPath) {
    try {
      const serverMod = require(bundledServerPath);
      if (typeof serverMod.startServer === 'function') {
        embeddedServerInstance = await serverMod.startServer(PORT);
        const ready = await waitForServerReady(PORT, 8000);
        if (ready) {
          SERVER_URL = `http://127.0.0.1:${PORT}`;
          return;
        }
      }
    } catch (err) {
      console.error('Failed to start bundled server in-process:', err);
    }
  }

  // 2. Fallback ONLY for development mode (`electron .` without precompiling server)
  // NEVER attempt spawn in packaged production mode
  if (!app.isPackaged) {
    try {
      const rootDir = path.join(__dirname, '..');
      const tsxBin = path.join(
        rootDir,
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
      );

      if (fs.existsSync(tsxBin)) {
        devServerProcess = spawn(tsxBin, ['server.ts'], {
          cwd: rootDir,
          env: {
            ...process.env,
            PORT: String(PORT),
            ISLE_MANUAL_START: '0',
          },
          stdio: 'ignore',
          windowsHide: true,
          shell: false,
        });

        devServerProcess.on('error', (spawnErr) => {
          console.warn('Dev server process spawn error (safely handled):', spawnErr?.message);
        });

        await waitForServerReady(PORT, 10000);
        SERVER_URL = `http://127.0.0.1:${PORT}`;
      }
    } catch (spawnErr) {
      console.warn('Spawn fallback skipped or failed:', spawnErr?.message);
    }
  }
}

/**
 * Position the window flush at top: 0 and horizontally centered on the primary display
 */
function positionWindowTopCenter(win) {
  if (!win || win.isDestroyed()) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x: displayX, y: displayY, width: displayWidth } = primaryDisplay.bounds;
  const targetX = Math.round(displayX + (displayWidth - OVERLAY_WIDTH) / 2);
  const targetY = displayY; // top: 0 of primary display
  win.setBounds({
    x: targetX,
    y: targetY,
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
  });
}

/**
 * Create Windows System Tray Icon in Notification Area ("Show hidden icons" ^ menu)
 * Allows user to control WinIsle, toggle visibility, and exit completely
 */
function createSystemTray() {
  if (systemTray) return;

  let trayImage;
  const iconCandidatePaths = [
    path.join(__dirname, 'tray-icon.png'),
    path.join(app.getAppPath(), 'electron', 'tray-icon.png'),
    path.join(process.resourcesPath || '', 'app.asar', 'electron', 'tray-icon.png'),
    path.join(process.resourcesPath || '', 'electron', 'tray-icon.png'),
  ];

  const foundPath = iconCandidatePaths.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  if (foundPath) {
    trayImage = nativeImage.createFromPath(foundPath);
  } else {
    trayImage = nativeImage.createFromDataURL(TRAY_ICON_BASE64);
  }

  // Windows system tray prefers 16x16 icon
  try {
    trayImage = trayImage.resize({ width: 16, height: 16 });
  } catch {
    // ignore
  }

  systemTray = new Tray(trayImage);
  systemTray.setToolTip('WinIsle - Dynamic Island');

  const updateContextMenu = () => {
    const isVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
    const isAlwaysOnTop = mainWindow && !mainWindow.isDestroyed() && mainWindow.isAlwaysOnTop();

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'WinIsle Dynamic Island',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: isVisible ? 'Sembunyikan Island' : 'Tampilkan Island',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            createOverlayWindow();
          } else if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
          updateContextMenu();
        },
      },
      {
        label: 'Buka / Fokus Assistant (Alt+Q)',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            createOverlayWindow();
          } else {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.setIgnoreMouseEvents(false);
            mainWindow.webContents.send('toggle-isle-assistant');
          }
        },
      },
      {
        label: 'Reset Posisi ke Tengah Atas',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            positionWindowTopCenter(mainWindow);
            mainWindow.show();
          }
        },
      },
      {
        label: 'Always on Top',
        type: 'checkbox',
        checked: Boolean(isAlwaysOnTop),
        click: (menuItem) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setAlwaysOnTop(menuItem.checked, 'screen-saver');
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Optimalkan RAM Sekarang',
        click: () => {
          trimMemory();
        },
      },
      {
        label: 'Restart WinIsle',
        click: () => {
          app.relaunch();
          app.exit(0);
        },
      },
      {
        label: 'Keluar dari WinIsle',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);

    systemTray.setContextMenu(contextMenu);
  };

  updateContextMenu();

  // Left click on tray toggles or focuses WinIsle
  systemTray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createOverlayWindow();
    } else if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
    updateContextMenu();
  });
}

/**
 * Locate compiled native memory trimmer (trim-mem.exe)
 */
function locateTrimMemExe() {
  const candidatePaths = [
    path.join(__dirname, 'trim-mem.exe'),
    path.join(app.getAppPath(), 'electron', 'trim-mem.exe'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron', 'trim-mem.exe'),
    path.join(process.resourcesPath || '', 'electron', 'trim-mem.exe'),
  ];
  return (
    candidatePaths.find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    }) || null
  );
}

/**
 * Trims physical memory (Working Set) & invokes V8 Garbage Collection across all processes
 */
function trimMemory() {
  if (process.platform !== 'win32') return;

  // 1. Force V8 Garbage Collection in Main Process
  if (typeof global.gc === 'function') {
    try {
      global.gc();
    } catch {}
  }

  // 2. Force V8 Garbage Collection in Renderer Process
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents
      .executeJavaScript('if (typeof window.gc === "function") window.gc();')
      .catch(() => {});
  }

  // 3. Flush unreferenced working set pages to drop RAM usage under 60-90MB
  const trimExe = locateTrimMemExe();
  if (trimExe) {
    execFile(trimExe, ['WinIsle'], { windowsHide: true }, () => {});
  }
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x: displayX, y: displayY, width: displayWidth } = primaryDisplay.bounds;
  const initialX = Math.round(displayX + (displayWidth - OVERLAY_WIDTH) / 2);
  const initialY = displayY; // top: 0

  mainWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x: initialX,
    y: initialY,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
      devTools: !app.isPackaged,
      v8CacheOptions: 'none',
    },
  });

  // Keep overlay above taskbar and fullscreen windows ('screen-saver' level)
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Ensure window audio is never muted
  try {
    mainWindow.webContents.setAudioMuted(false);
  } catch {
    // ignore
  }

  // Enable click-through on transparent areas by default while forwarding mousemove events
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  const distDir = getUnpackedDistDir();
  const indexPath = path.join(distDir, 'index.html');

  const injectServerUrl = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents
        .executeJavaScript(`window.__WINISLE_SERVER_URL__ = ${JSON.stringify(SERVER_URL)};`)
        .catch(() => {});
    }
  };

  mainWindow.webContents.on('did-finish-load', () => {
    injectServerUrl();
    setTimeout(trimMemory, 2500);
  });
  mainWindow.webContents.on('dom-ready', injectServerUrl);

  // Dual-mode Loading:
  // Primary: Load through verified local server URL (http://127.0.0.1:45781) so all relative /api endpoints, WebSockets, and assets work seamlessly
  // Fallback: Direct local file loading
  mainWindow
    .loadURL(SERVER_URL)
    .then(() => {
      injectServerUrl();
    })
    .catch((err) => {
      console.warn('[WinIsle] Initial loadURL failed, trying direct file loading...', err?.message);
      if (fs.existsSync(indexPath)) {
        mainWindow.loadFile(indexPath).catch((e) => console.error('[WinIsle] Secondary loadFile error:', e));
      } else {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(SERVER_URL).catch(() => {});
          }
        }, 1200);
      }
    });

  // Re-center if monitor resolution or display scaling changes
  const handleDisplayChange = () => positionWindowTopCenter(mainWindow);
  screen.on('display-metrics-changed', handleDisplayChange);
  screen.on('display-added', handleDisplayChange);
  screen.on('display-removed', handleDisplayChange);

  // Windows OLE Drag & Drop DropTarget Support:
  // During an OS file drag in Windows Explorer (DoDragDrop), Windows suppresses WM_MOUSEMOVE,
  // so the renderer's mousemove handler cannot disable click-through on its own.
  // Polling cursor position every 45ms ensures that whenever the cursor enters the top-center
  // island pill (or expanded island), setIgnoreMouseEvents(false) is ALWAYS enforced so Windows OLE
  // immediately recognizes the Dynamic Island as a valid file drop target!
  let lastCursorInsideOuter = false;
  let lastCursorInsideNotch = false;
  const cursorCheckInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      clearInterval(cursorCheckInterval);
      return;
    }
    try {
      const cursor = screen.getCursorScreenPoint();
      const bounds = mainWindow.getBounds();
      const centerX = bounds.x + bounds.width / 2;

      // Compact notch pill hit zone (generous top-center zone so dragging a file to the pill always hits)
      const insideNotchZone =
        Math.abs(cursor.x - centerX) <= 175 &&
        cursor.y >= bounds.y &&
        cursor.y <= bounds.y + 62;

      // Expanded island outer zone
      const insideOuterZone =
        Math.abs(cursor.x - centerX) <= 290 &&
        cursor.y >= bounds.y &&
        cursor.y <= bounds.y + 250;

      // Whenever cursor is inside the top-center notch zone, unconditionally disable click-through
      // so OS file drag-and-drop (OLE IDropTarget) is NEVER blocked by WS_EX_TRANSPARENT!
      if (insideNotchZone) {
        mainWindow.setIgnoreMouseEvents(false);
        if (!lastCursorInsideNotch) {
          lastCursorInsideNotch = true;
          mainWindow.webContents.send('cursor-entered-island');
        }
      } else {
        lastCursorInsideNotch = false;
      }

      if (insideOuterZone !== lastCursorInsideOuter) {
        lastCursorInsideOuter = insideOuterZone;
        if (insideOuterZone) {
          mainWindow.setIgnoreMouseEvents(false);
        } else {
          mainWindow.webContents.send('cursor-left-island');
        }
      }
    } catch {
      // ignore
    }
  }, 45);

  mainWindow.on('closed', () => {
    clearInterval(cursorCheckInterval);
    mainWindow = null;
  });
}

// IPC handler for local server URL resolution
ipcMain.on('get-server-url', (event) => {
  event.returnValue = SERVER_URL;
});

// IPC handler for dynamic click-through toggling from renderer
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  if (ignore) {
    // Do not enable click-through if the cursor is currently right inside the top-center notch zone!
    try {
      const cursor = screen.getCursorScreenPoint();
      const bounds = win.getBounds();
      const centerX = bounds.x + bounds.width / 2;
      if (Math.abs(cursor.x - centerX) <= 150 && cursor.y >= bounds.y && cursor.y <= bounds.y + 48) {
        win.setIgnoreMouseEvents(false);
        return;
      }
    } catch {
      // ignore
    }
    win.setIgnoreMouseEvents(true, options || { forward: true });
  } else {
    win.setIgnoreMouseEvents(false);
  }
});

// IPC handler to copy a Shelf file (image or text/path) to the Windows System Clipboard
ipcMain.handle('shelf-copy-file', async (_event, payload) => {
  try {
    if (!payload || typeof payload !== 'object') return false;
    const { filePath, dataUrl, name } = payload;
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
      const img = nativeImage.createFromDataURL(dataUrl);
      if (!img.isEmpty()) {
        clipboard.writeImage(img);
        return true;
      }
    }
    if (typeof filePath === 'string' && filePath && fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.webp', '.bmp'].includes(ext)) {
        const img = nativeImage.createFromPath(filePath);
        if (!img.isEmpty()) {
          clipboard.writeImage(img);
          return true;
        }
      }
      clipboard.writeText(filePath);
      return true;
    }
    if (typeof name === 'string' && name) {
      clipboard.writeText(name);
      return true;
    }
    return false;
  } catch {
    return false;
  }
});

// IPC handler to drag a Shelf file out into any Windows application (Explorer, Discord, WhatsApp, etc.)
ipcMain.on('shelf-start-drag', (event, payload) => {
  try {
    if (!payload || typeof payload !== 'object') return;
    let targetPath = payload.filePath;
    const fileName = String(payload.name || 'file').replace(/[<>:"/\\|?*]/g, '_');

    // If the file doesn't have a disk path yet (or was added via dataUrl), materialize it in os.tmpdir()
    if ((!targetPath || !fs.existsSync(targetPath)) && typeof payload.dataUrl === 'string' && payload.dataUrl.includes(';base64,')) {
      const base64Data = payload.dataUrl.split(';base64,').pop();
      if (base64Data) {
        const tempDir = path.join(os.tmpdir(), 'winisle-shelf');
        fs.mkdirSync(tempDir, { recursive: true });
        targetPath = path.join(tempDir, fileName);
        fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
      }
    }

    if (targetPath && fs.existsSync(targetPath)) {
      let dragIcon = nativeImage.createFromDataURL(TRAY_ICON_BASE64);
      if (typeof payload.dataUrl === 'string' && payload.dataUrl.startsWith('data:image/')) {
        const thumb = nativeImage.createFromDataURL(payload.dataUrl);
        if (!thumb.isEmpty()) {
          dragIcon = thumb.resize({ width: 48, height: 48 });
        }
      }
      event.sender.startDrag({
        file: targetPath,
        icon: dragIcon,
      });
    }
  } catch (err) {
    console.warn('[WinIsle] shelf-start-drag failed:', err?.message);
  }
});

// IPC handler to trigger instant native working set & V8 memory trimming from renderer
ipcMain.on('trim-memory', () => {
  trimMemory();
});

app.whenReady().then(async () => {
  // Spoof Referer & Origin for YouTube embed requests so YouTube never blocks music videos on http://127.0.0.1 (Error 150/153)
  try {
    session.defaultSession.webRequest.onBeforeSendHeaders(
      {
        urls: [
          '*://*.youtube.com/*',
          '*://*.youtube-nocookie.com/*',
          '*://*.googlevideo.com/*',
        ],
      },
      (details, callback) => {
        details.requestHeaders['Referer'] = 'https://www.youtube.com/';
        details.requestHeaders['Origin'] = 'https://www.youtube.com';
        callback({ requestHeaders: details.requestHeaders });
      }
    );
  } catch {
    // ignore
  }

  // Configure automatic launch at Windows startup when packaged
  if (app.isPackaged && process.platform === 'win32') {
    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
      });
    } catch {
      // ignore
    }
  }

  // Initialize System Tray immediately so user always sees WinIsle in Notification Area ("Show hidden icons")
  createSystemTray();

  await ensureLocalBackendRunning();
  createOverlayWindow();

  // Periodic idle memory trimming: flushes unreferenced buffers every 45s to ensure RAM remains strictly <100MB
  setInterval(trimMemory, 45000);

  // Register global Alt+Q shortcut so user can summon Isle Assistant even over fullscreen games/apps
  try {
    globalShortcut.register('Alt+Q', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createOverlayWindow();
        return;
      }
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('toggle-isle-assistant');
    });
  } catch {
    // ignore shortcut registration errors
  }

  // Register global Alt+H shortcut to toggle Mini Capsule Auto-Hide mode (so Chrome tabs are never blocked)
  try {
    globalShortcut.register('Alt+H', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createOverlayWindow();
        return;
      }
      mainWindow.webContents.send('toggle-mini-capsule');
    });
  } catch {
    // ignore shortcut registration errors
  }
});

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    positionWindowTopCenter(mainWindow);
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (systemTray && !systemTray.isDestroyed()) {
    try {
      systemTray.destroy();
    } catch {
      // ignore
    }
    systemTray = null;
  }
  if (embeddedServerInstance && typeof embeddedServerInstance.close === 'function') {
    try {
      embeddedServerInstance.close();
    } catch {
      // ignore
    }
  }
  if (devServerProcess) {
    try {
      devServerProcess.kill();
    } catch {
      // ignore
    }
  }
});

app.on('window-all-closed', () => {
  // If app is not explicitly quitting, keep running in System Tray
  if (app.isQuitting) {
    app.quit();
  }
});
