import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { getApiBaseUrl, isDesktopRuntime } from './utils/apiBase';

if (typeof window !== 'undefined') {
  const winAny = window as any;

  // Install Tauri 2.0 -> window.electronAPI compatibility bridge if running inside Tauri WebView2
  if ((winAny.__TAURI_INTERNALS__ || window.location.hostname === 'tauri.localhost') && !winAny.electronAPI) {
    const tauriInvoke = (cmd: string, args?: Record<string, unknown>) => {
      try {
        if (typeof winAny.__TAURI_INTERNALS__?.invoke === 'function') {
          return winAny.__TAURI_INTERNALS__.invoke(cmd, args || {});
        }
      } catch {
        // ignore
      }
      return Promise.resolve();
    };

    winAny.electronAPI = {
      isElectron: true,
      isTauri: true,
      setIgnoreMouseEvents: (ignore: boolean) => {
        tauriInvoke('set_ignore_mouse_events', { ignore: Boolean(ignore) });
      },
      getServerUrl: () => winAny.__WINISLE_SERVER_URL__ || 'http://127.0.0.1:45781',
      onToggleAssistant: (callback: () => void) => {
        if (typeof callback !== 'function') return () => {};
        const handler = () => callback();
        window.addEventListener('winisle:toggle-assistant', handler);
        return () => window.removeEventListener('winisle:toggle-assistant', handler);
      },
      onToggleMiniCapsule: (callback: () => void) => {
        if (typeof callback !== 'function') return () => {};
        const handler = () => callback();
        window.addEventListener('winisle:toggle-mini-capsule', handler);
        return () => window.removeEventListener('winisle:toggle-mini-capsule', handler);
      },
      trimMemory: () => {
        tauriInvoke('trim_memory', {});
      },
      setHardwareStatus: (patch: { volume?: number; muted?: boolean; brightness?: number }) => {
        tauriInvoke('set_hardware_status', {
          volume: typeof patch?.volume === 'number' ? patch.volume : null,
          muted: typeof patch?.muted === 'boolean' ? patch.muted : null,
          brightness: typeof patch?.brightness === 'number' ? patch.brightness : null,
        });
      },
    };
  }

  // Route relative /api/* fetch requests to embedded local backend when in Tauri or file:// desktop runtime
  if (isDesktopRuntime()) {
    try {
      const origFetch = window.fetch.bind(window);
      const customFetch = function (input: RequestInfo | URL, init?: RequestInit) {
        if (typeof input === 'string' && input.startsWith('/api/')) {
          const base = getApiBaseUrl();
          if (base) {
            return origFetch(`${base}${input}`, init);
          }
        }
        return origFetch(input, init);
      };
      try {
        window.fetch = customFetch;
      } catch {
        Object.defineProperty(window, 'fetch', {
          value: customFetch,
          writable: true,
          configurable: true,
        });
      }
    } catch {
      // Ignore in restrictive web sandboxes
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

