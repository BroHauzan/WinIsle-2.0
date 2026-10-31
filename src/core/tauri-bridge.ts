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
    trimMemory: () => {},
    getServerUrl: () => '',
  };

  if (!(window as any).electronAPI) {
    (window as any).electronAPI = bridgeObj;
  } else {
    Object.assign((window as any).electronAPI, bridgeObj);
  }
}

// Automatically initialize global alias in browser window environment
setupTauriBridgeGlobal();

export default tauriBridge;
