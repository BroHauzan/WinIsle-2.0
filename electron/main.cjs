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

// High-resolution embedded 32x32 Bot Logo icon (PNG base64) so tray icon never fails
const TRAY_ICON_BASE64 = 'data:image/png;base64,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';

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
  'Translate,CalculateNativeWinOcclusion,AutofillServerCommunication,SpareRendererForSitePerProcess,BackForwardCache,MediaRouter,OptimizationHints,AudioServiceOutOfProcess'
);
app.commandLine.appendSwitch('enable-features', 'MemoryReducer');
app.commandLine.appendSwitch('enable-low-end-device-mode');
app.commandLine.appendSwitch('force-gpu-mem-available-mb', '16');
app.commandLine.appendSwitch('gpu-program-cache-size-kb', '256');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('renderer-process-limit', '1');
app.commandLine.appendSwitch('process-per-site');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-gpu-memory-buffer-video-frames');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-zygote');
app.commandLine.appendSwitch('disk-cache-size', '524288');
app.commandLine.appendSwitch('media-cache-size', '524288');
app.commandLine.appendSwitch('js-flags', '--expose-gc --max-old-space-size=24 --max-semi-space-size=1 --optimize_for_size');

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
      {
        label: 'Jalankan saat Startup Windows',
        type: 'checkbox',
        checked: isStartupEnabled(),
        click: (menuItem) => {
          registerWindowsStartup(menuItem.checked);
          updateContextMenu();
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

  // 3. Flush unreferenced working set pages to drop RAM usage under 50MB
  const trimExe = locateTrimMemExe();
  if (trimExe) {
    execFile(trimExe, ['WinIsle'], { windowsHide: true }, () => {});
    execFile(trimExe, ['msedgewebview2'], { windowsHide: true }, () => {});
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

let startupEnabledCache = true;

function isStartupEnabled() {
  if (process.platform !== 'win32') return startupEnabledCache;
  try {
    const settings = app.getLoginItemSettings();
    return Boolean(settings.openAtLogin);
  } catch {
    return startupEnabledCache;
  }
}

function registerWindowsStartup(enabled = true) {
  startupEnabledCache = Boolean(enabled);
  if (process.platform !== 'win32') return;

  const targetPath = process.execPath;
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      openAsHidden: false,
      path: targetPath,
    });
  } catch (err) {
    console.warn('[WinIsle] app.setLoginItemSettings error:', err?.message);
  }

  // Double-assurance: directly configure registry and Start Menu Startup shortcut via PowerShell
  try {
    const safeTarget = targetPath.replace(/'/g, "''");
    if (enabled) {
      const ps = `
        $ErrorActionPreference = 'SilentlyContinue'
        $target = '${safeTarget}'
        $targetDir = [System.IO.Path]::GetDirectoryName($target)
        Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'WinIsle' -Value ('"' + $target + '"')
        Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'IsleDynamicIsland' -Value ('"' + $target + '"')
        $startupFolder = [System.Environment]::GetFolderPath('Startup')
        if (Test-Path $startupFolder) {
          $wsh = New-Object -ComObject WScript.Shell
          $sc = $wsh.CreateShortcut((Join-Path $startupFolder 'WinIsle.lnk'))
          $sc.TargetPath = $target
          if ($targetDir) { $sc.WorkingDirectory = $targetDir }
          $sc.Description = 'WinIsle Dynamic Island'
          $sc.Save()
        }
      `;
      const encoded = Buffer.from(ps, 'utf16le').toString('base64');
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true }, () => {});
    } else {
      const ps = `
        $ErrorActionPreference = 'SilentlyContinue'
        Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'WinIsle' -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'IsleDynamicIsland' -ErrorAction SilentlyContinue
        $startupFolder = [System.Environment]::GetFolderPath('Startup')
        if (Test-Path $startupFolder) {
          Remove-Item (Join-Path $startupFolder 'WinIsle.lnk') -Force -ErrorAction SilentlyContinue
          Remove-Item (Join-Path $startupFolder 'IsleDynamicIsland.lnk') -Force -ErrorAction SilentlyContinue
        }
      `;
      const encoded = Buffer.from(ps, 'utf16le').toString('base64');
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true }, () => {});
    }
  } catch (err) {
    console.warn('[WinIsle] Direct registry startup configuration error:', err?.message);
  }
}

// IPC handlers for Windows Startup management
ipcMain.handle('get-startup-status', async () => {
  return { enabled: isStartupEnabled(), path: process.execPath };
});

ipcMain.handle('set-startup-status', async (_event, enable) => {
  registerWindowsStartup(Boolean(enable));
  return { success: true, enabled: Boolean(enable) };
});

// IPC handler for launching any Windows application natively from Electron main process
ipcMain.handle('launch-app', async (_event, appName) => {
  const clean = String(appName || '')
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\b(aplikasi|app|program|software)\b/gi, '')
    .trim();
  if (!clean) return { success: false, appName: '', error: 'Empty appName' };

  if (process.platform !== 'win32') {
    return { success: true, appName: clean, matchedName: clean };
  }

  return new Promise((resolve) => {
    const safeQ = clean.replace(/'/g, "''");
    const ps = `
      $ErrorActionPreference = 'SilentlyContinue'
      $q = '${safeQ}'.Trim()
      $aliasMap = @{
        'chrome' = 'chrome.exe'; 'google chrome' = 'chrome.exe';
        'edge' = 'msedge.exe'; 'microsoft edge' = 'msedge.exe';
        'brave' = 'brave.exe'; 'firefox' = 'firefox.exe';
        'notepad' = 'notepad.exe';
        'calculator' = 'calc.exe'; 'kalkulator' = 'calc.exe'; 'calc' = 'calc.exe';
        'explorer' = 'explorer.exe'; 'file explorer' = 'explorer.exe';
        'settings' = 'ms-settings:'; 'pengaturan' = 'ms-settings:'; 'setting' = 'ms-settings:';
        'task manager' = 'taskmgr.exe'; 'taskmgr' = 'taskmgr.exe';
        'control panel' = 'control.exe';
        'paint' = 'mspaint.exe'; 'mspaint' = 'mspaint.exe';
        'cmd' = 'cmd.exe'; 'command prompt' = 'cmd.exe';
        'powershell' = 'powershell.exe'; 'terminal' = 'wt.exe'; 'windows terminal' = 'wt.exe';
        'snipping tool' = 'SnippingTool.exe';
        'word' = 'winword.exe'; 'microsoft word' = 'winword.exe';
        'excel' = 'excel.exe'; 'microsoft excel' = 'excel.exe';
        'powerpoint' = 'powerpnt.exe'; 'ppt' = 'powerpnt.exe';
        'vscode' = 'code'; 'vs code' = 'code'; 'visual studio code' = 'code';
        'spotify' = 'spotify:'; 'discord' = 'discord:'; 'whatsapp' = 'whatsapp:'; 'wa' = 'whatsapp:';
        'telegram' = 'tg:'; 'steam' = 'steam:'
      }
      $lowerQ = $q.ToLower()
      $startApps = Get-StartApps
      $matched = $startApps | Where-Object { $_.Name -ieq $q } | Select-Object -First 1
      if (-not $matched) { $matched = $startApps | Where-Object { $_.Name -like "$q*" } | Select-Object -First 1 }
      if (-not $matched) { $matched = $startApps | Where-Object { $_.Name -like "*$q*" } | Select-Object -First 1 }
      if (-not $matched) { $matched = $startApps | Where-Object { $_.AppID -like "*$q*" } | Select-Object -First 1 }
      if ($matched) {
        $appId = $matched.AppID
        try {
          $shell = New-Object -ComObject Shell.Application
          $shell.NameSpace('shell:AppsFolder').ParseName($appId).InvokeVerb('open')
        } catch {
          Start-Process "shell:AppsFolder\\$appId"
        }
        Write-Output $matched.Name
        exit 0
      }
      $shortcutDirs = @(
        "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
        "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",
        "$env:USERPROFILE\\Desktop"
      )
      foreach ($dir in $shortcutDirs) {
        if (Test-Path $dir) {
          $lnk = Get-ChildItem -Path $dir -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.BaseName -like "*$q*" } | Select-Object -First 1
          if ($lnk) {
            Start-Process -FilePath $lnk.FullName
            Write-Output $lnk.BaseName
            exit 0
          }
        }
      }
      if ($aliasMap.ContainsKey($lowerQ)) {
        Start-Process $aliasMap[$lowerQ]
        Write-Output $q
        exit 0
      }
      Start-Process $q -ErrorAction Stop
      Write-Output $q
    `;
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 7000 },
      (err, stdout) => {
        const out = String(stdout || '').trim();
        if (!err && out) {
          resolve({ success: true, appName: clean, matchedName: out });
        } else {
          resolve({ success: false, appName: clean, error: err?.message || 'Not found' });
        }
      }
    );
  });
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

  // Ensure WinIsle is registered in Windows Startup on launch
  if (process.platform === 'win32') {
    registerWindowsStartup(true);
  }

  // Initialize System Tray immediately so user always sees WinIsle in Notification Area ("Show hidden icons")
  createSystemTray();

  await ensureLocalBackendRunning();
  createOverlayWindow();

  // Periodic idle memory trimming: flushes unreferenced buffers every 8s to ensure RAM remains strictly <50MB
  setInterval(trimMemory, 8000);

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
