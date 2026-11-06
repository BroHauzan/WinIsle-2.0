import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface IslandRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  hidden?: boolean;
}

export interface VolumePayload {
  volume: number; // 0..100
  muted: boolean;
  is_self: boolean;
}

export interface BatteryInfo {
  percentage: number; // 0..100
  is_charging: boolean;
}

export interface HardwareStatus {
  volume: number;
  muted: boolean;
  brightness: number;
  battery: BatteryInfo | null;
}

export interface SystemMediaInfo {
  title: string;
  artist: string;
  album: string;
  is_playing: boolean;
  position_ms: number;
  duration_ms: number;
  source_app: string;
  shuffle_active: boolean;
  cover_url?: string;
}

export type VolumeChangeCallback = (payload: VolumePayload) => void;
export type ToggleAssistantCallback = () => void;
export type SystemMediaChangeCallback = (media: SystemMediaInfo | null) => void;
export type SimpleEventCallback = () => void;

/**
 * Checks if running inside the Tauri 2.0 native environment.
 */
export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)
  );
}

// ── Event Stream Listeners ──

const volumeListeners = new Set<VolumeChangeCallback>();
let unlistenVolumePromise: Promise<UnlistenFn> | null = null;
let unlistenVolumeFn: UnlistenFn | null = null;

/**
 * Subscribes to instantaneous CoreAudio volume change events.
 * Returns an unlisten cleanup function.
 */
export function onVolumeChanged(callback: VolumeChangeCallback): () => void {
  volumeListeners.add(callback);

  if (isTauri() && !unlistenVolumePromise) {
    unlistenVolumePromise = listen<VolumePayload>('volume_changed', (event) => {
      for (const listener of volumeListeners) {
        try {
          listener(event.payload);
        } catch (e) {
          console.error('[TauriBridge] Error in volume_changed listener:', e);
        }
      }
    });

    unlistenVolumePromise.then((unlisten) => {
      unlistenVolumeFn = unlisten;
    }).catch((err) => {
      console.warn('[TauriBridge] Failed to register volume_changed listener:', err);
    });
  }

  return () => {
    volumeListeners.delete(callback);
    if (volumeListeners.size === 0 && unlistenVolumeFn) {
      unlistenVolumeFn();
      unlistenVolumeFn = null;
      unlistenVolumePromise = null;
    }
  };
}

const assistantListeners = new Set<ToggleAssistantCallback>();
let unlistenAssistantPromise: Promise<UnlistenFn> | null = null;
let unlistenAssistantFn: UnlistenFn | null = null;

/**
 * Subscribes to global Alt+Q hotkey or tray assistant toggle events.
 */
export function onToggleAssistant(callback: ToggleAssistantCallback): () => void {
  assistantListeners.add(callback);

  if (isTauri() && !unlistenAssistantPromise) {
    unlistenAssistantPromise = listen('toggle_isle_assistant', () => {
      for (const listener of assistantListeners) {
        try {
          listener();
        } catch (e) {
          console.error('[TauriBridge] Error in toggle_isle_assistant listener:', e);
        }
      }
    });

    unlistenAssistantPromise.then((unlisten) => {
      unlistenAssistantFn = unlisten;
    }).catch((err) => {
      console.warn('[TauriBridge] Failed to register toggle_isle_assistant listener:', err);
    });
  }

  return () => {
    assistantListeners.delete(callback);
    if (assistantListeners.size === 0 && unlistenAssistantFn) {
      unlistenAssistantFn();
      unlistenAssistantFn = null;
      unlistenAssistantPromise = null;
    }
  };
}

const mediaListeners = new Set<SystemMediaChangeCallback>();
let unlistenMediaPromise: Promise<UnlistenFn> | null = null;
let unlistenMediaFn: UnlistenFn | null = null;

/**
 * Subscribes to Windows GSMTC system media playback change events (YouTube Music, Chrome, Spotify, etc.).
 */
export function onSystemMediaChanged(callback: SystemMediaChangeCallback): () => void {
  mediaListeners.add(callback);

  if (isTauri() && !unlistenMediaPromise) {
    unlistenMediaPromise = listen<SystemMediaInfo | null>('system_media_changed', (event) => {
      for (const listener of mediaListeners) {
        try {
          listener(event.payload);
        } catch (e) {
          console.error('[TauriBridge] Error in system_media_changed listener:', e);
        }
      }
    });

    unlistenMediaPromise.then((unlisten) => {
      unlistenMediaFn = unlisten;
    }).catch((err) => {
      console.warn('[TauriBridge] Failed to register system_media_changed listener:', err);
    });
  }

  return () => {
    mediaListeners.delete(callback);
    if (mediaListeners.size === 0 && unlistenMediaFn) {
      unlistenMediaFn();
      unlistenMediaFn = null;
      unlistenMediaPromise = null;
    }
  };
}

const compactListeners = new Set<SimpleEventCallback>();
let unlistenCompactPromise: Promise<UnlistenFn> | null = null;
let unlistenCompactFn: UnlistenFn | null = null;

/**
 * Subscribes to global ALT + H hotkey toggle events.
 */
export function onToggleCompact(callback: SimpleEventCallback): () => void {
  compactListeners.add(callback);

  if (isTauri() && !unlistenCompactPromise) {
    unlistenCompactPromise = listen('toggle_compact_mode', () => {
      for (const listener of compactListeners) {
        try {
          listener();
        } catch (e) {
          console.error('[TauriBridge] Error in toggle_compact_mode listener:', e);
        }
      }
    });

    unlistenCompactPromise
      .then((unlisten) => {
        unlistenCompactFn = unlisten;
      })
      .catch((err) => {
        console.warn('[TauriBridge] Failed to register toggle_compact_mode listener:', err);
      });
  }

  return () => {
    compactListeners.delete(callback);
    if (compactListeners.size === 0 && unlistenCompactFn) {
      unlistenCompactFn();
      unlistenCompactFn = null;
      unlistenCompactPromise = null;
    }
  };
}

const autoCompactListeners = new Set<SimpleEventCallback>();
let unlistenAutoCompactPromise: Promise<UnlistenFn> | null = null;
let unlistenAutoCompactFn: UnlistenFn | null = null;

/**
 * Subscribes to tab-bar top-zone auto-compact events.
 */
export function onRequestAutoCompact(callback: SimpleEventCallback): () => void {
  autoCompactListeners.add(callback);

  if (isTauri() && !unlistenAutoCompactPromise) {
    unlistenAutoCompactPromise = listen('request_auto_compact', () => {
      for (const listener of autoCompactListeners) {
        try {
          listener();
        } catch (e) {
          console.error('[TauriBridge] Error in request_auto_compact listener:', e);
        }
      }
    });

    unlistenAutoCompactPromise
      .then((unlisten) => {
        unlistenAutoCompactFn = unlisten;
      })
      .catch((err) => {
        console.warn('[TauriBridge] Failed to register request_auto_compact listener:', err);
      });
  }

  return () => {
    autoCompactListeners.delete(callback);
    if (autoCompactListeners.size === 0 && unlistenAutoCompactFn) {
      unlistenAutoCompactFn();
      unlistenAutoCompactFn = null;
      unlistenAutoCompactPromise = null;
    }
  };
}

// ── Native Hardware Commands ──

/**
 * Queries master volume, mute, display brightness, and battery state from native Windows APIs.
 */
export async function getHardwareStatus(): Promise<HardwareStatus> {
  if (!isTauri()) {
    return {
      volume: 50,
      muted: false,
      brightness: 70,
      battery: null,
    };
  }

  const [volumeRes, muteRes, brightnessRes, batteryRes] = await Promise.allSettled([
    invoke<number>('get_volume'),
    invoke<boolean>('get_mute'),
    invoke<number>('get_brightness'),
    invoke<BatteryInfo>('get_battery_status'),
  ]);

  const volume = volumeRes.status === 'fulfilled' ? volumeRes.value : 50;
  const muted = muteRes.status === 'fulfilled' ? muteRes.value : false;
  const brightness = brightnessRes.status === 'fulfilled' ? brightnessRes.value : 70;
  const battery = batteryRes.status === 'fulfilled' ? batteryRes.value : null;

  return {
    volume,
    muted,
    brightness,
    battery,
  };
}

/**
 * Sets Windows Master Volume scalar (0..100) via CoreAudio endpoint.
 */
export async function setMasterVolume(val: number): Promise<void> {
  const volume = Math.max(0, Math.min(100, Math.round(val)));
  if (isTauri()) {
    try {
      await invoke('set_volume', { volume });
    } catch (e) {
      console.warn('[TauriBridge] set_volume command failed:', e);
    }
  }
}

/**
 * Sets Windows Master Mute state via CoreAudio endpoint.
 */
export async function setMasterMute(muted: boolean): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('set_mute', { muted: Boolean(muted) });
    } catch (e) {
      console.warn('[TauriBridge] set_mute command failed:', e);
    }
  }
}

/**
 * Adjusts display brightness (0..100) via WMI ACPI or DXVA2 DDC/CI.
 */
export async function setBrightness(val: number): Promise<void> {
  const level = Math.max(0, Math.min(100, Math.round(val)));
  if (isTauri()) {
    try {
      await invoke('set_brightness', { level });
    } catch (e) {
      console.warn('[TauriBridge] set_brightness command failed:', e);
    }
  }
}

/**
 * Updates the Dynamic Island interactive bounding rect for the Rust cursor monitor.
 */
export async function updateIslandBounds(rect: IslandRect): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('update_island_bounds', { rect });
    } catch (e) {
      console.warn('[TauriBridge] update_island_bounds command failed:', e);
    }
  }
}

/**
 * Locks the window into interactive mode (disables click-through) when modals or assistant are open.
 */
export async function setInteractiveLock(locked: boolean): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('set_interactive_lock', { locked: Boolean(locked) });
    } catch (e) {
      console.warn('[TauriBridge] set_interactive_lock command failed:', e);
    }
  }
}

/**
 * Controls whether clicks outside the island pass through to underlying windows.
 */
export async function setClickThrough(ignore: boolean): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('set_click_through', { ignore: Boolean(ignore) });
    } catch (e) {
      console.warn('[TauriBridge] set_click_through command failed:', e);
    }
  }
}

/**
 * Captures full desktop screenshot via native Win32 GDI calls.
 * Returns base64-encoded PNG string starting with `iVBORw0KGgo`.
 */
export async function getSystemScreenshot(): Promise<string> {
  if (isTauri()) {
    try {
      return await invoke<string>('get_system_screenshot');
    } catch (e) {
      console.warn('[TauriBridge] get_system_screenshot failed:', e);
      throw e;
    }
  }
  throw new Error('Not running in Tauri environment');
}

/**
 * Captures a fast 4x-downsampled backdrop image of the desktop area directly behind the Dynamic Island.
 */
export async function getIslandBackdrop(): Promise<string | null> {
  if (isTauri()) {
    try {
      return await invoke<string>('get_island_backdrop');
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Queries active system media playback from Windows GSMTC (e.g. YouTube Music, Chrome, Spotify).
 */
export async function getSystemMedia(): Promise<SystemMediaInfo | null> {
  if (isTauri()) {
    try {
      return await invoke<SystemMediaInfo | null>('get_system_media');
    } catch (e) {
      console.warn('[TauriBridge] get_system_media failed:', e);
      return null;
    }
  }
  return null;
}

/**
 * Sends transport command (play, pause, play_pause, next, prev, shuffle) to active system media session.
 */
export async function sendSystemMediaCommand(action: string, targetShuffle?: boolean): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('send_system_media_command', { action, targetShuffle });
    } catch (e) {
      console.warn('[TauriBridge] send_system_media_command failed:', e);
    }
  }
}

/**
 * Executes an HTTPS POST to Bynara AI Router natively via Rust (curl.exe with CREATE_NO_WINDOW)
 * so WebView2 CORS policies never block AI requests in the Tauri desktop binary.
 */
export async function askBynaraAiNative(
  baseUrl: string,
  apiKey: string,
  payloadJson: string
): Promise<string> {
  if (isTauri()) {
    return await invoke<string>('ask_bynara_ai', {
      baseUrl,
      apiKey,
      payloadJson,
    });
  }
  throw new Error('Not running in Tauri environment');
}

/**
 * Fetches text/JSON from an external HTTPS URL via native Rust curl.exe to bypass WebView2 CORS.
 */
export async function fetchUrlText(url: string): Promise<string> {
  if (!isTauri()) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }
  return await invoke<string>('fetch_url_text', { url });
}

export interface StartupStatusResponse {
  enabled: boolean;
  registeredPath?: string;
  source?: string;
  platform?: string;
  message?: string;
}

/**
 * Checks if WinIsle is registered in Windows Startup.
 */
export async function getWindowsStartupStatus(): Promise<StartupStatusResponse> {
  if (typeof window !== 'undefined') {
    const winAny = window as any;
    if (typeof winAny.electronAPI?.getStartupStatus === 'function') {
      try {
        const res = await winAny.electronAPI.getStartupStatus();
        if (res && typeof res.enabled === 'boolean') return res;
      } catch (e) {
        console.warn('[Bridge] electronAPI.getStartupStatus error:', e);
      }
    }
  }

  try {
    const res = await fetch('/api/system/startup');
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[Bridge] fetch /api/system/startup error:', err);
  }

  return { enabled: true, platform: 'unknown' };
}

/**
 * Toggles WinIsle registration in Windows Startup.
 */
export async function setWindowsStartupStatus(enabled: boolean): Promise<StartupStatusResponse> {
  if (isTauri()) {
    try {
      await invoke('set_startup_status', { enabled: Boolean(enabled) });
      return {
        enabled: Boolean(enabled),
        platform: 'win32',
        message: 'Status startup Windows berhasil diperbarui',
      };
    } catch (e) {
      console.warn('[Bridge] Tauri set_startup_status error:', e);
    }
  }

  if (typeof window !== 'undefined') {
    const winAny = window as any;
    if (winAny.electronAPI?.isElectron && typeof winAny.electronAPI?.setStartupStatus === 'function') {
      try {
        const res = await winAny.electronAPI.setStartupStatus(enabled);
        if (res) return res;
      } catch (e) {
        console.warn('[Bridge] electronAPI.setStartupStatus error:', e);
      }
    }
  }

  try {
    const res = await fetch('/api/system/startup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[Bridge] POST /api/system/startup error:', err);
  }

  return { enabled, message: 'Status startup berhasil disimpan' };
}

export interface LaunchWindowsAppResponse {
  success: boolean;
  appName: string;
  matchedName?: string;
  protocolUri?: string;
  platform?: string;
  error?: string;
}

const WINDOWS_BROWSER_PROTOCOL_MAP: Record<string, string> = {
  spotify: 'spotify:',
  discord: 'discord:',
  vscode: 'vscode:',
  'vs code': 'vscode:',
  'visual studio code': 'vscode:',
  whatsapp: 'whatsapp:',
  wa: 'whatsapp:',
  telegram: 'tg:',
  steam: 'steam:',
  calculator: 'ms-calculator:',
  kalkulator: 'ms-calculator:',
  calc: 'ms-calculator:',
  settings: 'ms-settings:',
  pengaturan: 'ms-settings:',
  setting: 'ms-settings:',
  paint: 'ms-paint:',
  mspaint: 'ms-paint:',
  photos: 'ms-photos:',
  foto: 'ms-photos:',
  clock: 'ms-clock:',
  alarm: 'ms-clock:',
  todo: 'ms-todo:',
  weather: 'msnweather:',
  cuaca: 'msnweather:',
  store: 'ms-windows-store:',
  'microsoft store': 'ms-windows-store:',
  edge: 'microsoft-edge:',
  'microsoft edge': 'microsoft-edge:',
  figma: 'figma:',
  notion: 'notion:',
  slack: 'slack:',
  zoom: 'zoommtg:',
  postman: 'postman:',
  bluetooth: 'ms-settings:bluetooth',
  wifi: 'ms-settings:network-wifi',
  'wi-fi': 'ms-settings:network-wifi',
};

function triggerBrowserProtocolUri(uri: string): void {
  if (typeof document === 'undefined' || !uri) return;
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = uri;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch {
        // ignore
      }
    }, 3000);
  } catch {
    // ignore
  }
}

/**
 * Launches a Windows application across Tauri, Electron, Local Windows Server, or Browser URI Protocol.
 */
export async function launchWindowsApp(appName: string): Promise<LaunchWindowsAppResponse> {
  const clean = String(appName || '')
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\b(aplikasi|app|program|software)\b/gi, '')
    .trim();

  if (!clean) {
    return { success: false, appName: '', error: 'Nama aplikasi kosong' };
  }

  // 1. Native Tauri 2.0 Rust Command
  if (isTauri()) {
    try {
      const matched = await invoke<string>('launch_windows_app', { appName: clean });
      return {
        success: true,
        appName: clean,
        matchedName: matched || clean,
        platform: 'win32',
      };
    } catch (e: any) {
      console.warn('[Bridge] Tauri launch_windows_app error:', e);
    }
  }

  // 2. Native Electron IPC Main Process Handler
  if (typeof window !== 'undefined') {
    const winAny = window as any;
    if (winAny.electronAPI?.isElectron && typeof winAny.electronAPI?.launchApp === 'function') {
      try {
        const res = await winAny.electronAPI.launchApp(clean);
        if (res && res.success) return res;
      } catch (e) {
        console.warn('[Bridge] electronAPI.launchApp error:', e);
      }
    }
  }

  // 3. Backend Server Endpoint (/api/system/launch-app)
  const lowerKey = clean.toLowerCase();
  const knownProtocol = WINDOWS_BROWSER_PROTOCOL_MAP[lowerKey];

  try {
    const res = await fetch('/api/system/launch-app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName: clean }),
    });
    if (res.ok) {
      const data: LaunchWindowsAppResponse = await res.json();
      // If backend is running in cloud preview (non-win32), also trigger client-side Windows URI protocol if available
      if (data.platform !== 'win32') {
        const uriToOpen = data.protocolUri || knownProtocol;
        if (uriToOpen) {
          triggerBrowserProtocolUri(uriToOpen);
        }
      }
      return data;
    }
  } catch (err) {
    console.warn('[Bridge] POST /api/system/launch-app error:', err);
  }

  // 4. Fallback client-side URI protocol trigger
  if (knownProtocol) {
    triggerBrowserProtocolUri(knownProtocol);
    return { success: true, appName: clean, matchedName: clean, protocolUri: knownProtocol };
  }

  return { success: false, appName: clean, error: 'Gagal membuka aplikasi' };
}

/**
 * Triggers V8 garbage collection and native Win32 working-set trimming across
 * WinIsle and all WebView2 processes (WebView2 Manager, GPU Process, Renderer).
 */
export async function trimWebViewMemory(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      const winAny = window as any;
      if (typeof winAny.gc === 'function') {
        winAny.gc();
      }
    } catch {
      // ignore
    }
  }

  if (isTauri()) {
    try {
      await invoke('trim_webview_memory');
    } catch {
      // ignore
    }
  }
}

// ── Standard Bridge Export & window.electronAPI Fallback ──

export const tauriBridge = {
  isTauri,
  getHardwareStatus,
  setMasterVolume,
  setMasterMute,
  setBrightness,
  updateIslandBounds,
  setInteractiveLock,
  setClickThrough,
  setIgnoreMouseEvents: (ignore: boolean) => setClickThrough(ignore),
  getSystemScreenshot,
  getSystemMedia,
  sendSystemMediaCommand,
  askBynaraAiNative,
  fetchUrlText,
  getWindowsStartupStatus,
  setWindowsStartupStatus,
  launchWindowsApp,
  trimWebViewMemory,
  onVolumeChanged,
  onToggleAssistant,
  onSystemMediaChanged,
  onToggleCompact,
  onRequestAutoCompact,
};

/**
 * Sets up `window.electronAPI` alias for seamless backwards-compatibility.
 */
export function setupTauriBridgeGlobal(): void {
  if (typeof window === 'undefined') return;

  const bridgeObj = {
    isElectron: false,
    isTauri: true,
    setIgnoreMouseEvents: (ignore: boolean) => {
      void setClickThrough(ignore);
    },
    onToggleAssistant: (callback: () => void) => onToggleAssistant(callback),
    onToggleMiniCapsule: (callback: () => void) => onToggleCompact(callback),
    getHardwareStatus: () => getHardwareStatus(),
    setHardwareStatus: (patch: { volume?: number; muted?: boolean; brightness?: number }) => {
      if (typeof patch.volume === 'number') void setMasterVolume(patch.volume);
      if (typeof patch.muted === 'boolean') void setMasterMute(patch.muted);
      if (typeof patch.brightness === 'number') void setBrightness(patch.brightness * 10);
    },
    updateIslandBounds: (rect: IslandRect) => {
      void updateIslandBounds(rect);
    },
    setInteractiveLock: (locked: boolean) => {
      void setInteractiveLock(locked);
    },
    getSystemScreenshot: () => getSystemScreenshot(),
    trimMemory: () => {
      void trimWebViewMemory();
    },
    getStartupStatus: () => getWindowsStartupStatus(),
    setStartupStatus: (enable: boolean) => setWindowsStartupStatus(enable),
    launchApp: (appName: string) => launchWindowsApp(appName),
    getServerUrl: () => '',
  };

  if (!(window as any).electronAPI) {
    (window as any).electronAPI = bridgeObj;
  } else if (!(window as any).electronAPI.isElectron) {
    Object.assign((window as any).electronAPI, bridgeObj);
  }
}

// Automatically initialize global alias in browser window environment
setupTauriBridgeGlobal();

export default tauriBridge;
