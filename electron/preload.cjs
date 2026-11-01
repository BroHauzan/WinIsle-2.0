const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  /**
   * Toggle click-through on transparent areas outside the Dynamic Island pill.
   * When ignore === true, { forward: true } forwards mousemove events so the renderer
   * detects when the cursor enters the Dynamic Island again.
   */
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', Boolean(ignore), options || { forward: true });
  },
  getServerUrl: () => {
    try {
      return ipcRenderer.sendSync('get-server-url') || 'http://127.0.0.1:45781';
    } catch {
      return 'http://127.0.0.1:45781';
    }
  },
  /**
   * Resolve native OS path for a dropped File object in Electron.
   */
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file) || file?.path || '';
      }
      return file?.path || '';
    } catch {
      return file?.path || '';
    }
  },
  /**
   * Copy a staged Shelf file (image or document path) to the native OS clipboard.
   */
  copyFileToClipboard: (payload) => {
    return ipcRenderer.invoke('shelf-copy-file', payload);
  },
  /**
   * Initiate a native OS file drag out of the Shelf into any external Windows app.
   */
  startFileDrag: (payload) => {
    ipcRenderer.send('shelf-start-drag', payload);
  },
  /**
   * Subscribe to global Alt+Q / Alt+I shortcut events dispatched from the Electron main process.
   */
  onToggleAssistant: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = () => callback();
    ipcRenderer.on('toggle-isle-assistant', handler);
    return () => {
      ipcRenderer.removeListener('toggle-isle-assistant', handler);
    };
  },
  /**
   * Subscribe to global Alt+H shortcut events for Mini Capsule Auto-Hide mode.
   */
  onToggleMiniCapsule: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = () => callback();
    ipcRenderer.on('toggle-mini-capsule', handler);
    return () => {
      ipcRenderer.removeListener('toggle-mini-capsule', handler);
    };
  },
  /**
   * Listen to cursor entering compact notch region from main process poll.
   */
  onCursorEnteredIsland: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = () => callback();
    ipcRenderer.on('cursor-entered-island', handler);
    return () => {
      ipcRenderer.removeListener('cursor-entered-island', handler);
    };
  },
  /**
   * Listen to cursor exiting island region.
   */
  onCursorLeftIsland: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = () => callback();
    ipcRenderer.on('cursor-left-island', handler);
    return () => {
      ipcRenderer.removeListener('cursor-left-island', handler);
    };
  },
  /**
   * Trigger native physical memory (Working Set) and V8 GC trimming.
   */
  trimMemory: () => {
    ipcRenderer.send('trim-memory');
  },
});
