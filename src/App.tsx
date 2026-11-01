import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BeatEqualizerBars } from './components/BeatEqualizerBars';
import { BotCanvas } from './components/BotCanvas';
import { IslandSurface } from './components/IslandSurface';
import {
  AlarmBellSvg,
  BackwardSkipSvg,
  BellOutlineSvg,
  BoltChargingSvg,
  CalendarGridSvg,
  CapsLockArrowSvg,
  CheckTickSvg,
  ChevronDownSvg,
  ChevronLeftSvg,
  ChevronRightSvg,
  CloseCrossSvg,
  CoffeeCupSvg,
  EditPencilSvg,
  FastLightningSvg,
  FileDocumentBadgeSvg,
  ForwardSkipSvg,
  GearSettingsSvg,
  GlobeTimezoneSvg,
  KeyboardSymbolicSvg,
  LyricsQuoteBubbleSvg,
  MailEnvelopeSvg,
  MessageBubbleSvg,
  MicSymbolicSvg,
  MoonFilledSvg,
  MusicNoteSvg,
  PauseFilledSvg,
  PlayFilledSvg,
  PlusSvg,
  RotateResetSvg,
  SendArrowSvg,
  ShelfTraySvg,
  SparkleFourPointSvg,
  SpeakerWaveSvg,
  StopSquareSvg,
  SunBrightnessSvg,
  TargetFocusSvg,
  TaskCheckBoxSvg,
  ThinkingBrainSvg,
  TimerStopwatchSvg,
  VideoCameraSvg,
} from './components/IsleIcons';
import { BotColorName, BotForm, BotShapeName, paletteFor } from './core/bot';
import { parseLrc, SAMPLE_TRACKS } from './core/lrc';
import { getWsBaseUrl } from './utils/apiBase';
import {
  initNotificationPruning,
  pruneStaleNotifications,
} from './utils/notificationCleaner';

type IslandPage =
  | 'music'
  | 'notifications'
  | 'pomodoro'
  | 'todolist'
  | 'shelf'
  | 'calendar'
  | 'weather';

const ISLAND_PAGES: { id: IslandPage; label: string }[] = [
  { id: 'music', label: 'Music' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'pomodoro', label: 'Focus' },
  { id: 'todolist', label: 'Tasks' },
  { id: 'shelf', label: 'Shelf' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'weather', label: 'Weather' },
];

interface ToDoItem {
  id: number;
  title: string;
  time?: string;
  done: boolean;
}

export type ShelfFileExt = 'pdf' | 'docx' | 'msi' | 'img' | 'other';

export interface ShelfFile {
  id: number;
  name: string;
  size: string;
  ext: ShelfFileExt;
  thumbnailUrl?: string;
  dataUrl?: string;
  filePath?: string;
  mimeType?: string;
  textContent?: string;
}

export interface ShelfClipItem {
  id: number;
  text: string;
  timeLabel?: string;
  time?: string;
}

function detectFileExt(filename: string, mimeType?: string): ShelfFileExt {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf';
  if (
    lower.endsWith('.doc') ||
    lower.endsWith('.docx') ||
    lower.endsWith('.rtf') ||
    mimeType?.includes('word')
  )
    return 'docx';
  if (
    lower.endsWith('.msi') ||
    lower.endsWith('.exe') ||
    lower.endsWith('.zip') ||
    lower.endsWith('.rar') ||
    lower.endsWith('.7z')
  )
    return 'msi';
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.bmp') ||
    mimeType?.startsWith('image/')
  )
    return 'img';
  return 'other';
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '24 KB';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function truncateMiddleFileName(name: string, maxChars = 11): string {
  if (name.length <= maxChars) return name;
  return `${name.slice(0, maxChars - 2)}..`;
}

interface NotificationItem {
  id: number;
  createdAt?: number;
  iconType: 'calendar' | 'download' | 'message';
  title: string;
  subtitle: string;
  timeAgo: string;
  unread: boolean;
}

interface CalendarEventItem {
  id: number;
  title: string;
  time: string;
  color: string;
}

type SystemAlertType =
  | 'volume'
  | 'mute'
  | 'brightness'
  | 'capslock'
  | 'charging'
  | 'lowbattery'
  | 'meeting'
  | 'permission'
  | 'notification'
  | 'alarm'
  | 'action_confirm';

export interface SmartAlarm {
  id: string;
  time: string; // "HH:mm" (24-hour format)
  title: string;
  enabled: boolean;
  createdAt: number;
}

export interface WeatherHourItem {
  time: string;
  temp: number;
  code: number;
  precipitationProb?: number;
}

export interface WeatherData {
  city: string;
  currentTemp: number;
  apparentTemp?: number;
  humidity?: number;
  windSpeed?: number;
  tempMax?: number;
  tempMin?: number;
  precipitationProb?: number;
  weatherCode: number;
  isDay: boolean;
  sunrise: string;
  sunset: string;
  timezone?: string;
  utcOffsetSeconds?: number;
  hourly: WeatherHourItem[];
}

interface ActiveAlert {
  id: number;
  type: SystemAlertType;
  value?: number;
  muted?: boolean;
  capsOn?: boolean;
  permissionState?: 'pending' | 'allowed' | 'denied';
  alarmId?: string;
  alarmTitle?: string;
  alarmTime?: string;
  confirmTitle?: string;
  confirmSubtitle?: string;
  confirmBadge?: string;
  confirmCategory?: 'task' | 'timer' | 'alarm' | 'weather' | 'music' | 'system';
  targetPageIdx?: number;
}

interface SearchSourceItem {
  title: string;
  uri: string;
}

interface FoundFileItem {
  name: string;
  path: string;
  size: string;
  ext: string;
}

interface CommandCardData {
  purpose: string;
  command: string;
  output?: string;
  uri?: string;
  riskLabel?: string;
  riskLevel?: 'amber' | 'green';
}

interface RealMediaTrack {
  title: string;
  artist: string;
  coverUrl?: string;
  audioUrl?: string;
  previewUrl?: string;
  isFlac?: boolean;
  durationMs: number;
  lrc: string;
  syncType?: 'WORD' | 'LINE';
  provider?: string;
  wordsByLine?: any[];
  lrclibId?: number;
  youtubeVideoId?: string;
  youtubeMusicUrl?: string;
  spotifyUrl?: string;
  sourceType?: 'internal' | 'external';
  externalApp?: string;
  tintRgb: [number, number, number];
}

interface PendingImageAttachment {
  dataUrl: string;
  base64: string;
  mimeType: string;
  name: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'command';
  text: string;
  imageUrl?: string;
  command?: string;
  commandStatus?: 'running' | 'done' | 'denied';
  timestamp?: string;
  searchSources?: SearchSourceItem[];
  commandCard?: CommandCardData;
  foundFiles?: FoundFileItem[];
}

interface GeminiAssistantResponse {
  reply: string;
  activeStepHeadline?: string;
  agentSteps?: string[];
  action?: string;
  actionParam?: string;
  searchSources?: SearchSourceItem[];
  commandCard?: CommandCardData;
  foundFiles?: FoundFileItem[];
  trackData?: {
    title: string;
    artist: string;
    coverUrl?: string;
    audioUrl?: string;
    previewUrl?: string;
    isFlac?: boolean;
    durationMs?: number;
    youtubeVideoId?: string;
    youtubeMusicUrl?: string;
    spotifyUrl?: string;
    lrc?: string;
    syncType?: 'WORD' | 'LINE';
    provider?: string;
    wordsByLine?: any[];
    lrclibId?: number;
  };
  source?: string;
  error?: string;
  code?: string;
}

// Convert Float32 microphone samples (-1..1) at 16kHz into Base64-encoded 16-bit little-endian PCM for gemini-3.8-live
function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Convert Base64-encoded 16-bit little-endian PCM (24kHz) from gemini-3.8-live into Float32Array for Web Audio playback
function pcm16Base64ToFloat32(base64: string): Float32Array {
  const binary = window.atob(base64);
  const byteLength = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

// Convert recorded Float32 audio chunks into valid 16kHz Mono WAV base64 string
function float32ToWavBase64(chunks: Float32Array[], sampleRate = 16000): string {
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  if (totalLen === 0) return '';
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  const buffer = new ArrayBuffer(44 + merged.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + merged.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, merged.length * 2, true);
  let idx = 44;
  for (let i = 0; i < merged.length; i++, idx += 2) {
    const s = Math.max(-1, Math.min(1, merged[i]));
    view.setInt16(idx, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Reusable Gemini-Style "Thinking" Animated Dots Component
const GeminiThinkingIndicator: React.FC<{ label?: string }> = ({ label = 'Thinking' }) => (
  <div className="inline-flex items-center gap-2 py-0.5">
    <span className="text-[12px] font-semibold gemini-thinking-shimmer tracking-tight">
      {label}
    </span>
    <span className="inline-flex items-center gap-1 pt-0.5">
      <span
        className="w-1.5 h-1.5 rounded-full bg-[#a5b4fc]"
        style={{ animation: 'geminiDotBounce 1.2s infinite ease-in-out 0ms' }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-[#60a5fa]"
        style={{ animation: 'geminiDotBounce 1.2s infinite ease-in-out 160ms' }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]"
        style={{ animation: 'geminiDotBounce 1.2s infinite ease-in-out 320ms' }}
      />
    </span>
  </div>
);

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: boolean;
      setIgnoreMouseEvents?: (ignore: boolean, options?: { forward?: boolean }) => void;
      getPathForFile?: (file: File) => string;
      copyFileToClipboard?: (payload: {
        filePath?: string;
        dataUrl?: string;
        name?: string;
      }) => Promise<boolean>;
      startFileDrag?: (
        payload:
          | {
              filePath?: string;
              dataUrl?: string;
              name?: string;
            }
          | string
      ) => void;
      onToggleAssistant?: (callback: () => void) => () => void;
      onToggleMiniCapsule?: (callback: () => void) => () => void;
      onCursorEnteredIsland?: (callback: () => void) => () => void;
      onCursorLeftIsland?: (callback: () => void) => () => void;
    };
  }
}

export default function App() {
  // ── Clock & Status (Optimized: State only updates when minute rolls over, eliminating 59/60 idle re-renders) ──
  const [nowDate, setNowDate] = useState(() => new Date());

  useEffect(() => {
    const checkMinute = () => {
      const d = new Date();
      setNowDate((prev) => {
        if (
          d.getMinutes() === prev.getMinutes() &&
          d.getHours() === prev.getHours() &&
          d.getDate() === prev.getDate()
        ) {
          return prev;
        }
        return d;
      });
    };
    const t = setInterval(checkMinute, 1000);
    return () => clearInterval(t);
  }, []);

  const headerDateStr = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = days[nowDate.getDay()];
    const date = String(nowDate.getDate()).padStart(2, '0');
    const m = SHORT_MONTHS[nowDate.getMonth()];
    return `${d} ${date} ${m}`;
  }, [nowDate]);

  const timeStr = useMemo(() => {
    const hh = String(nowDate.getHours()).padStart(2, '0');
    const mm = String(nowDate.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }, [nowDate]);

  const fullHeaderDateStr = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = days[nowDate.getDay()];
    const date = String(nowDate.getDate());
    const m = SHORT_MONTHS[nowDate.getMonth()];
    const y = nowDate.getFullYear();
    const hh = String(nowDate.getHours()).padStart(2, '0');
    const mm = String(nowDate.getMinutes()).padStart(2, '0');
    return `${d} ${date} ${m} ${y} ${hh}:${mm}`;
  }, [nowDate]);

  const worldClocks = useMemo(() => {
    const fmt = (offsetHours: number) => {
      const utc = nowDate.getTime() + nowDate.getTimezoneOffset() * 60000;
      const target = new Date(utc + offsetHours * 3600000);
      return `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;
    };
    return [
      { city: 'New York', time: fmt(-4) },
      { city: 'London', time: fmt(1) },
      { city: 'Tokyo', time: fmt(9) },
    ];
  }, [nowDate]);

  // ── Persistent Active Page State (Remembers Pomodoro / Calendar / Shelf when closed & reopened) ──
  // Default to Music Player (pageIndex 0) on startup per user request
  const [pageIndex, setPageIndex] = useState<number>(0);

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_active_page_index', String(pageIndex));
    } catch {
      // ignore storage errors
    }
  }, [pageIndex]);

  // ── Dual-Layer Simultaneous Carousel Slide State (Matches video 00:01-00:04) ──
  const [prevPageIndex, setPrevPageIndex] = useState<number | null>(null);
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('right');
  const [slideTick, setSlideTick] = useState(0);
  const pageTransTimerRef = useRef<number | null>(null);

  const navigateToPage = useCallback(
    (nextIdx: number, explicitDir?: 'left' | 'right') => {
      const normalized = ((nextIdx % ISLAND_PAGES.length) + ISLAND_PAGES.length) % ISLAND_PAGES.length;
      setPageIndex((currIdx) => {
        if (normalized === currIdx) return currIdx;
        const dir: 'left' | 'right' =
          explicitDir ?? (normalized > currIdx ? 'right' : 'left');
        setSlideDir(dir);
        setPrevPageIndex(currIdx);
        setSlideTick((t) => t + 1);

        if (pageTransTimerRef.current) {
          window.clearTimeout(pageTransTimerRef.current);
        }
        pageTransTimerRef.current = window.setTimeout(() => {
          setPrevPageIndex(null);
          pageTransTimerRef.current = null;
        }, 280);

        return normalized;
      });
    },
    []
  );

  const stepCarouselPage = useCallback((delta: -1 | 1) => {
    setPageIndex((currIdx) => {
      const normalized =
        (((currIdx + delta) % ISLAND_PAGES.length) + ISLAND_PAGES.length) %
        ISLAND_PAGES.length;
      if (normalized === currIdx) return currIdx;
      setSlideDir(delta > 0 ? 'right' : 'left');
      setPrevPageIndex(currIdx);
      setSlideTick((t) => t + 1);

      if (pageTransTimerRef.current) {
        window.clearTimeout(pageTransTimerRef.current);
      }
      pageTransTimerRef.current = window.setTimeout(() => {
        setPrevPageIndex(null);
        pageTransTimerRef.current = null;
      }, 280);

      return normalized;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (pageTransTimerRef.current) {
        window.clearTimeout(pageTransTimerRef.current);
      }
    };
  }, []);

  // ── Alt+Q Default Mode Preference ('conversation' = Auto-Focus Typing, 'voice-pill' = Voice Agent) ──
  const [defaultAltQMode, setDefaultAltQMode] = useState<'conversation' | 'voice-pill'>(() => {
    try {
      const saved = window.localStorage.getItem('isle_altq_mode');
      if (saved === 'voice-pill' || saved === 'conversation') return saved;
    } catch {
      // ignore
    }
    return 'conversation';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_altq_mode', defaultAltQMode);
    } catch {
      // ignore
    }
  }, [defaultAltQMode]);

  // ── Island Presentation State (starts collapsed as a compact notch) ──
  const [isHovered, setIsHovered] = useState(false);
  const [isPinnedOpen, setIsPinnedOpen] = useState(false);
  const [dragAutoOpened, setDragAutoOpened] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMode, setAssistantMode] = useState<'voice-pill' | 'conversation'>(defaultAltQMode);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nudgeCount, setNudgeCount] = useState(0);
  const hoverLeaveTimerRef = useRef<number | null>(null);

  // Customizable auto-close delay when mouse leaves dynamic island (persisted in localStorage)
  const [closeDelayMs, setCloseDelayMs] = useState<number>(() => {
    try {
      const saved = window.localStorage.getItem('isle_close_delay_ms');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 3000) return parsed;
      }
    } catch {
      // ignore
    }
    return 120; // default smooth 120ms
  });
  const closeDelayMsRef = useRef<number>(closeDelayMs);
  useEffect(() => {
    closeDelayMsRef.current = closeDelayMs;
    try {
      window.localStorage.setItem('isle_close_delay_ms', String(closeDelayMs));
    } catch {
      // ignore
    }
  }, [closeDelayMs]);

  // ── Mini Capsule Auto-Hide Mode (Alt + H: Shrinks to 2px click-through top lip so middle Chrome tabs are 100% clickable) ──
  const [miniCapsuleMode, setMiniCapsuleMode] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('isle_mini_capsule_mode') === 'true';
    } catch {
      return false;
    }
  });
  const [topEdgeHover, setTopEdgeHover] = useState<boolean>(false);
  const lastMiniCapsuleToggleRef = useRef<number>(0);

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_mini_capsule_mode', String(miniCapsuleMode));
    } catch {
      // ignore
    }
    if (miniCapsuleMode) {
      setTopEdgeHover(false);
      (window as any).electronAPI?.setInteractiveLock?.(false);
      (window as any).electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
    }
  }, [miniCapsuleMode]);

  // ── Bynara Router AI Key State & Model Preferences ──
  const HARDCODED_GEMINI_KEY = 'sk-nry-2f6-6P7a7WIv0g3go0dRtL4rpR4zaTFhIb3uEAeByRY';
  const [geminiApiKey] = useState<string>(HARDCODED_GEMINI_KEY);
  const [hasServerKey, setHasServerKey] = useState(true);
  const [serverMaskedKey, setServerMaskedKey] = useState<string>('sk-nry••••ByRY');

  // AI Model Selection: 'agnes-3.0-flash' (Fast / Kilat via Agnes AI) vs 'muse-spark-1.3-contributor' (Thinking / Mendalam via Bynara)
  const [assistantModel, setAssistantModel] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem('isle_ai_model');
      if (saved === 'agnes-3.0-flash' || saved === 'agnes-2.5-flash' || saved === 'muse-spark-1.3-contributor') return saved;
      if (saved === 'gemini-3.1-flash-lite' || saved === 'stepfun-3.7-flash') return 'agnes-3.0-flash';
    } catch {
      // ignore
    }
    return 'agnes-3.0-flash';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_ai_model', assistantModel);
    } catch {
      // ignore
    }
  }, [assistantModel]);

  useEffect(() => {
    fetch('/api/gemini/config')
      .then((r) => r.json())
      .then((data) => {
        if (data?.hasKey) {
          setHasServerKey(true);
          setServerMaskedKey(data.maskedKey || 'sk-nry••••ByRY');
        }
      })
      .catch(() => {});
  }, []);

  const [lyricsMode, setLyricsMode] = useState(false);

  // Input ref for immediate auto-focus when opening Assistant in Type mode (Alt+Q)
  const assistantInputRef = useRef<HTMLInputElement | null>(null);

  // ── Electron Frameless Overlay Click-Through Controller ──
  // Tracks whether transparent area outside the Dynamic Island should ignore mouse events
  const clickThroughStateRef = useRef<boolean | null>(null);
  const setDesktopClickThrough = useCallback((ignore: boolean) => {
    if (typeof window === 'undefined' || !window.electronAPI?.setIgnoreMouseEvents) return;
    if (clickThroughStateRef.current === ignore) return;
    clickThroughStateRef.current = ignore;
    if (ignore) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    } else {
      window.electronAPI.setIgnoreMouseEvents(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.setIgnoreMouseEvents) return;

    // Start with click-through enabled for transparent area, forwarding mousemove events
    setDesktopClickThrough(true);

    let rafId = 0;
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (rafId) return;
      const clientX = e.clientX;
      const clientY = e.clientY;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const surface = document.getElementById('dynamic-island-surface');
        if (!surface || surface.classList.contains('pointer-events-none')) {
          setDesktopClickThrough(true);
          return;
        }
        const rect = surface.getBoundingClientRect();
        if (rect.height <= 6) {
          setDesktopClickThrough(true);
          return;
        }
        const insideBounds =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= Math.max(0, rect.top) &&
          clientY <= rect.bottom;

        setDesktopClickThrough(!insideBounds);
        if (!insideBounds && !lyricsMode && !assistantOpen) {
          if (hoverLeaveTimerRef.current !== null) {
            window.clearTimeout(hoverLeaveTimerRef.current);
          }
          hoverLeaveTimerRef.current = window.setTimeout(() => {
            hoverLeaveTimerRef.current = null;
            setIsHovered(false);
            setIsPinnedOpen(false);
            setIsDragOver(false);
            setDragAutoOpened(false);
          }, Math.max(0, closeDelayMsRef.current));
        }
      });
    };

    window.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [setDesktopClickThrough, miniCapsuleMode, assistantOpen, lyricsMode]);

  // Subscribe to Electron main process cursor-left-island event for rock-solid auto-close
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.onCursorLeftIsland) return;
    const unbind = window.electronAPI.onCursorLeftIsland(() => {
      if (!lyricsMode && !assistantOpen) {
        setIsHovered(false);
        setIsPinnedOpen(false);
        setIsDragOver(false);
        setDragAutoOpened(false);
        setDesktopClickThrough(true);
      }
    });
    return unbind;
  }, [lyricsMode, assistantOpen, setDesktopClickThrough]);

  useEffect(() => {
    if (assistantOpen && assistantMode === 'conversation') {
      setDesktopClickThrough(false);
      const timer = window.setTimeout(() => {
        assistantInputRef.current?.focus();
      }, 40);
      return () => window.clearTimeout(timer);
    }
  }, [assistantOpen, assistantMode, setDesktopClickThrough]);

  // ── Real Laptop Battery Status API + Manual Test Override ──
  const [batteryLevel, setBatteryLevel] = useState<number>(82);
  const [isCharging, setIsCharging] = useState<boolean>(true);
  const [manualBatteryOverride, setManualBatteryOverride] = useState<boolean>(false);

  // ── System Hardware & Alert State (Volume: 0..100 step 2, Brightness: 0..10 step 1) ──
  // Persisted in localStorage and synced with Windows CoreAudio Master Volume when running locally on Windows
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = window.localStorage.getItem('isle_user_volume');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) return parsed;
      }
    } catch {
      // ignore
    }
    return 20;
  });
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('isle_user_muted') === 'true';
    } catch {
      return false;
    }
  });
  const [brightness, setBrightness] = useState<number>(() => {
    try {
      const saved = window.localStorage.getItem('isle_user_brightness');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 10) return parsed;
      }
    } catch {
      // ignore
    }
    return 7;
  });
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);
  const [alertHovered, setAlertHovered] = useState(false);
  const alertTimerRef = useRef<number | null>(null);
  const lastLocalHardwareChangeRef = useRef<number>(0);
  const osHardwareAvailableRef = useRef<boolean>(false);

  const syncHardwareToOs = useCallback(
    (nextPatch: { volume?: number; muted?: boolean; brightness?: number }) => {
      lastLocalHardwareChangeRef.current = Date.now();
      try {
        const winAny = window as any;
        if (typeof winAny.electronAPI?.setHardwareStatus === 'function') {
          winAny.electronAPI.setHardwareStatus(nextPatch);
        } else if (typeof winAny.chrome?.webview?.postMessage === 'function') {
          winAny.chrome.webview.postMessage({ type: 'hardwareControl', ...nextPatch });
        }
      } catch {
        // ignore
      }
      if (osHardwareAvailableRef.current) {
        fetch('/api/system/hardware-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextPatch),
        }).catch(() => {});
      }
    },
    []
  );

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_user_volume', String(volume));
    } catch {
      // ignore
    }
    syncHardwareToOs({ volume, muted });
  }, [volume, muted, syncHardwareToOs]);

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_user_muted', String(muted));
    } catch {
      // ignore
    }
  }, [muted]);

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_user_brightness', String(brightness));
    } catch {
      // ignore
    }
    syncHardwareToOs({ brightness });
  }, [brightness, syncHardwareToOs]);

  const triggerAlert = useCallback(
    (
      type: SystemAlertType,
      opts?: {
        value?: number;
        muted?: boolean;
        capsOn?: boolean;
        alarmId?: string;
        alarmTitle?: string;
        alarmTime?: string;
        confirmTitle?: string;
        confirmSubtitle?: string;
        confirmBadge?: string;
        confirmCategory?: 'task' | 'timer' | 'alarm' | 'weather' | 'music' | 'system';
        targetPageIdx?: number;
      }
    ) => {
      if (alertTimerRef.current) {
        window.clearTimeout(alertTimerRef.current);
      }
      // Collapse open island temporarily so top-edge HUD alert is shown cleanly (pageIndex is preserved!)
      setIsPinnedOpen(false);
      setIsHovered(false);
      setDragAutoOpened(false);
      setAssistantOpen(false);

      const newAlert: ActiveAlert = {
        id: Date.now(),
        type,
        value: opts?.value,
        muted: opts?.muted,
        capsOn: opts?.capsOn,
        permissionState: type === 'permission' ? 'pending' : undefined,
        alarmId: opts?.alarmId,
        alarmTitle: opts?.alarmTitle,
        alarmTime: opts?.alarmTime,
        confirmTitle: opts?.confirmTitle,
        confirmSubtitle: opts?.confirmSubtitle,
        confirmBadge: opts?.confirmBadge,
        confirmCategory: opts?.confirmCategory,
        targetPageIdx: opts?.targetPageIdx,
      };
      setActiveAlert(newAlert);

      const duration =
        type === 'volume' || type === 'mute' || type === 'brightness' || type === 'capslock'
          ? 2000
          : type === 'action_confirm'
          ? 2300
          : type === 'permission'
          ? 9000
          : type === 'alarm'
          ? 20000
          : 3600;

      alertTimerRef.current = window.setTimeout(() => {
        setActiveAlert((curr) => (curr && curr.id === newAlert.id ? null : curr));
        if (type === 'action_confirm' && typeof opts?.targetPageIdx === 'number') {
          navigateToPage(opts.targetPageIdx);
          setIsPinnedOpen(true);
        }
      }, duration);
    },
    [navigateToPage]
  );

  // Seamless fluid confirmation alert whenever AI executes a task, timer, alarm, weather, or system command
  const triggerActionConfirmation = useCallback(
    (
      confirmTitle: string,
      confirmSubtitle: string,
      confirmBadge: string,
      confirmCategory: 'task' | 'timer' | 'alarm' | 'weather' | 'music' | 'system',
      targetPageIdx?: number
    ) => {
      triggerAlert('action_confirm', {
        confirmTitle,
        confirmSubtitle,
        confirmBadge,
        confirmCategory,
        targetPageIdx,
      });
    },
    [triggerAlert]
  );

  // Real Windows / System Hardware Status Detection (Volume, Brightness, Battery Level & Charging)
  useEffect(() => {
    // 1. Poll system hardware status from backend OS probe (syncs Windows Master Volume when running on Windows)
    let pollId = 0;
    const fetchOsHardware = () => {
      // Avoid overwriting right while user is actively scrolling volume/brightness
      if (Date.now() - lastLocalHardwareChangeRef.current < 2200) return;
      fetch('/api/system/hardware-status')
        .then((r) => r.json())
        .then((data) => {
          if (data && data.osHardwareAvailable) {
            osHardwareAvailableRef.current = true;
            if (typeof data.batteryLevel === 'number') {
              setBatteryLevel((prev) => (prev !== data.batteryLevel ? data.batteryLevel : prev));
            }
            if (typeof data.isCharging === 'boolean') {
              setIsCharging((prev) => (prev !== data.isCharging ? data.isCharging : prev));
            }
            if (typeof data.volume === 'number') {
              setVolume((prev) => (prev !== data.volume ? data.volume : prev));
            }
            if (typeof data.muted === 'boolean') {
              setMuted((prev) => (prev !== data.muted ? data.muted : prev));
            }
            if (typeof data.brightness === 'number') {
              setBrightness((prev) => (prev !== data.brightness ? data.brightness : prev));
            }
          }
        })
        .catch(() => {});
    };

    fetchOsHardware();
    // Dynamic polling rate: 4s when active, 12s when hidden/backgrounded to preserve CPU
    const scheduleNextPoll = () => {
      const interval = document.hidden ? 12000 : 4000;
      pollId = window.setTimeout(() => {
        fetchOsHardware();
        scheduleNextPoll();
      }, interval);
    };
    scheduleNextPoll();

    // Listen to native desktop wrapper hardware events (Electron / WebView2) if present
    const onNativeHardwareMsg = (ev: MessageEvent) => {
      const payload = ev.data;
      if (payload && typeof payload === 'object' && payload.type === 'osHardwareStatus') {
        if (typeof payload.volume === 'number') setVolume(payload.volume);
        if (typeof payload.muted === 'boolean') setMuted(payload.muted);
        if (typeof payload.brightness === 'number') setBrightness(payload.brightness);
      }
    };
    window.addEventListener('message', onNativeHardwareMsg);

    // 2. Real Browser / OS Battery API integration (adjusts dynamically to charger events)
    let batteryObj: any = null;
    const syncBattery = () => {
      if (!batteryObj) return;
      if (typeof batteryObj.level === 'number') {
        setBatteryLevel(Math.round(batteryObj.level * 100));
      }
      if (typeof batteryObj.charging === 'boolean') {
        setIsCharging(batteryObj.charging);
      }
    };

    const onChargingChange = () => {
      if (!batteryObj) return;
      const lvl =
        typeof batteryObj.level === 'number' ? Math.round(batteryObj.level * 100) : batteryLevel;
      const chg = Boolean(batteryObj.charging);
      setBatteryLevel(lvl);
      setIsCharging(chg);
      triggerAlert(!chg && lvl <= 20 ? 'lowbattery' : 'charging', { value: lvl });
    };

    const onLevelChange = () => {
      if (!batteryObj) return;
      const lvl =
        typeof batteryObj.level === 'number' ? Math.round(batteryObj.level * 100) : batteryLevel;
      const chg = Boolean(batteryObj.charging);
      setBatteryLevel(lvl);
      setIsCharging(chg);
      if (!chg && (lvl === 20 || lvl === 15 || lvl === 10)) {
        triggerAlert('lowbattery', { value: lvl });
      }
    };

    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as any)
        .getBattery()
        .then((bat: any) => {
          batteryObj = bat;
          syncBattery();
          bat.addEventListener?.('levelchange', onLevelChange);
          bat.addEventListener?.('chargingchange', onChargingChange);
        })
        .catch(() => {
          // Fallback if unsupported by browser
        });
    }

    return () => {
      window.clearTimeout(pollId);
      window.removeEventListener('message', onNativeHardwareMsg);
      if (batteryObj) {
        batteryObj.removeEventListener?.('levelchange', onLevelChange);
        batteryObj.removeEventListener?.('chargingchange', onChargingChange);
      }
    };
  }, [triggerAlert]);

  // Hold alert open while pointer hovers over it
  useEffect(() => {
    if (!activeAlert) return;
    if (alertHovered) {
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    } else {
      alertTimerRef.current = window.setTimeout(() => {
        setActiveAlert(null);
      }, 1500);
    }
    return () => {
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    };
  }, [alertHovered, activeAlert]);

  // ── Page 5: Shelf State (Files Tray + Clipboard Tray) & Drag-and-Drop Auto-Expand Controller ──
  const [shelfSubTab, setShelfSubTab] = useState<'files' | 'clipboard'>('files');
  const [shelfFiles, setShelfFiles] = useState<ShelfFile[]>([]);
  const [shelfClips, setShelfClips] = useState<ShelfClipItem[]>(() => {
    try {
      const saved = window.localStorage.getItem('isle_shelf_clips_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.slice(0, 8);
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [copiedShelfId, setCopiedShelfId] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [shelfToast, setShelfToast] = useState<string | null>(null);
  const shelfFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastDropTimeRef = useRef<number>(0);
  const dragLeaveTimerRef = useRef<number | null>(null);
  const isInternalShelfDragRef = useRef<boolean>(false);

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_shelf_clips_v1', JSON.stringify(shelfClips.slice(0, 8)));
    } catch {
      // ignore
    }
  }, [shelfClips]);

  const activePage = ISLAND_PAGES[pageIndex].id;
  const isExpanded =
    ((!miniCapsuleMode && (isHovered || isPinnedOpen || dragAutoOpened || isDragOver || lyricsMode)) ||
      assistantOpen) &&
    !activeAlert;

  // Trigger lightweight native memory trimming and reset carousel slide tick whenever the island collapses back to compact notch
  useEffect(() => {
    if (!isExpanded) {
      if (pageTransTimerRef.current) {
        window.clearTimeout(pageTransTimerRef.current);
        pageTransTimerRef.current = null;
      }
      setPrevPageIndex(null);
      setSlideTick(0);
      const timer = window.setTimeout(() => {
        (window as any).electronAPI?.trimMemory?.();
      }, 400);
      return () => window.clearTimeout(timer);
    }
  }, [isExpanded]);

  // Helper to safely add files to Shelf (max 8 files, real image thumbnails, zero fake placeholders)
  const addFilesToShelf = useCallback(
    (
      incoming: {
        name: string;
        size: string;
        ext?: ShelfFileExt;
        thumbnailUrl?: string;
        dataUrl?: string;
        filePath?: string;
        mimeType?: string;
        textContent?: string;
      }[]
    ) => {
      if (!incoming || incoming.length === 0) return;

      const filteredIncoming = incoming.filter(
        (item) => item && item.name && !item.name.toLowerCase().includes('katalis+pendidikan')
      );
      if (filteredIncoming.length === 0) return;

      setShelfSubTab('files');
      setShelfFiles((prev) => {
        if (prev.length >= 8) {
          setShelfToast('Shelf full (max 8 files)');
          window.setTimeout(() => setShelfToast(null), 2200);
          return prev;
        }
        const now = Date.now();
        const availableSlots = 8 - prev.length;
        const added: ShelfFile[] = filteredIncoming.slice(0, availableSlots).map((item, idx) => {
          const cleanName =
            item.name
              .replace(/[\u0000-\u001F<>:"/\\|?*]/g, '')
              .trim()
              .slice(0, 64) || 'File';
          return {
            id: now + idx + Math.floor(Math.random() * 10000),
            name: cleanName,
            size: item.size || '24 KB',
            ext: item.ext || detectFileExt(cleanName, item.mimeType),
            thumbnailUrl: item.thumbnailUrl,
            dataUrl: item.dataUrl,
            filePath: item.filePath,
            mimeType: item.mimeType,
            textContent: item.textContent,
          };
        });
        return [...prev, ...added];
      });
    },
    []
  );

  // Read real OS File objects dropped from Windows Explorer / Finder or selected via file dialog
  const processDroppedOsFiles = useCallback(
    async (source: File[] | FileList | DataTransfer | null | undefined) => {
      const now = Date.now();
      if (now - lastDropTimeRef.current < 150) return;
      lastDropTimeRef.current = now;

      if (!source) return;
      let files: File[] = [];
      if (Array.isArray(source)) {
        files = source;
      } else if (source instanceof DataTransfer || ('files' in source && source.files)) {
        files = Array.from((source as DataTransfer | { files: FileList }).files || []);
      }
      const validFiles = files.filter((f) => f && f.name);
      if (validFiles.length === 0) return;

      const processed = await Promise.all(
        validFiles.slice(0, 8).map(async (f) => {
          const ext = detectFileExt(f.name, f.type);
          const nativePath =
            (typeof window !== 'undefined' && window.electronAPI?.getPathForFile?.(f)) ||
            (f as any).path ||
            '';
          let thumbnailUrl: string | undefined;
          let dataUrl: string | undefined;
          let textContent: string | undefined;

          if (ext === 'img' || f.type.startsWith('image/')) {
            try {
              thumbnailUrl = URL.createObjectURL(f);
            } catch {
              // ignore
            }
          }

          // Read dataUrl for images and files <= 8MB so they can be copied to clipboard or dragged out into any app
          if (f.size <= 8 * 1024 * 1024) {
            try {
              dataUrl = await new Promise<string | undefined>((resolve) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve(typeof reader.result === 'string' ? reader.result : undefined);
                reader.onerror = () => resolve(undefined);
                reader.readAsDataURL(f);
              });
              if (!thumbnailUrl && ext === 'img' && dataUrl) {
                thumbnailUrl = dataUrl;
              }
            } catch {
              // ignore
            }
          }

          if (
            f.size <= 512 * 1024 &&
            (f.type.startsWith('text/') ||
              /\.(txt|md|json|csv|js|ts|tsx|py|html|css|xml|yml|yaml|log)$/i.test(f.name))
          ) {
            try {
              textContent = await f.text();
            } catch {
              // ignore
            }
          }

          return {
            name: f.name,
            size: formatBytes(f.size),
            ext,
            thumbnailUrl,
            dataUrl,
            filePath: nativePath || undefined,
            mimeType: f.type || 'application/octet-stream',
            textContent,
          };
        })
      );

      addFilesToShelf(processed);
    },
    [addFilesToShelf]
  );

  // Copy a staged Shelf file to the system clipboard when clicked ("click to copy")
  const handleCopyShelfFile = useCallback(async (file: ShelfFile) => {
    let copiedOk = false;
    try {
      // 1. Try native Electron clipboard handler first (supports native image & file path copy on Windows)
      if (typeof window !== 'undefined' && window.electronAPI?.copyFileToClipboard) {
        copiedOk = await window.electronAPI.copyFileToClipboard({
          filePath: file.filePath,
          dataUrl: file.dataUrl,
          name: file.name,
        });
      }

      // 2. Web Clipboard API fallback (supports PNG image blobs & text/filename)
      if (!copiedOk && typeof navigator !== 'undefined' && navigator.clipboard) {
        if (file.ext === 'img' && (file.dataUrl || file.thumbnailUrl)) {
          try {
            const srcUrl = file.dataUrl || file.thumbnailUrl!;
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject();
              img.src = srcUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 256;
            canvas.height = img.naturalHeight || 256;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              const pngBlob = await new Promise<Blob | null>((res) =>
                canvas.toBlob((b) => res(b), 'image/png')
              );
              if (pngBlob && typeof ClipboardItem !== 'undefined') {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
                copiedOk = true;
              }
            }
          } catch {
            // fallback to text below
          }
        }
        if (!copiedOk) {
          const textToCopy = file.textContent || file.filePath || file.name;
          await navigator.clipboard.writeText(textToCopy);
          copiedOk = true;
        }
      }
    } catch {
      // ignore
    }

    setCopiedShelfId(file.id);
    setShelfToast(`Copied ${truncateMiddleFileName(file.name, 14)}`);
    window.setTimeout(() => {
      setCopiedShelfId((curr) => (curr === file.id ? null : curr));
      setShelfToast(null);
    }, 1600);
  }, []);

  // Copy or paste clipboard text in the Shelf Clipboard sub-tab
  const handleAddClipboardFromSystem = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = (text || '').trim();
      if (!trimmed) {
        setShelfToast('Clipboard is empty');
        window.setTimeout(() => setShelfToast(null), 1600);
        return;
      }
      setShelfClips((prev) => {
        const filtered = prev.filter((c) => c.text !== trimmed);
        return [
          { id: Date.now(), text: trimmed.slice(0, 600), time: timeStr || 'now' },
          ...filtered,
        ].slice(0, 8);
      });
      setShelfToast('Saved from clipboard');
      window.setTimeout(() => setShelfToast(null), 1500);
    } catch {
      setShelfToast('Press Ctrl+V to paste into Shelf');
      window.setTimeout(() => setShelfToast(null), 1800);
    }
  }, [timeStr]);

  // Expand Island to Shelf immediately on any external file drag event
  const expandIslandForFileDrag = useCallback(() => {
    if (isInternalShelfDragRef.current) return;
    setDesktopClickThrough(false);
    if (dragLeaveTimerRef.current) {
      window.clearTimeout(dragLeaveTimerRef.current);
      dragLeaveTimerRef.current = null;
    }
    if (hoverLeaveTimerRef.current) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    setActiveAlert(null);
    setAssistantOpen(false);
    setSettingsOpen(false);
    setLyricsMode(false);
    setDragAutoOpened(true);
    setIsHovered(true);
    setIsDragOver(true);
    setShelfSubTab('files');
    if (ISLAND_PAGES[pageIndex]?.id !== 'shelf') {
      navigateToPage(4, 'right');
    }
    // Auto-clear watchdog: if dragover stops firing for 380ms, automatically dismiss the overlay
    dragLeaveTimerRef.current = window.setTimeout(() => {
      setIsDragOver(false);
      setDragAutoOpened(false);
      dragLeaveTimerRef.current = null;
    }, 380);
  }, [navigateToPage, pageIndex, setDesktopClickThrough]);

  // Global Window & Native Tauri/Electron Drag-Over Detector:
  // Auto-opens closed Island to Shelf when dragging files from Windows Explorer toward the Dynamic Island
  useEffect(() => {
    const hasDragPayload = (e: DragEvent): boolean => {
      if (isInternalShelfDragRef.current) return false;
      if (!e.dataTransfer) return false;
      const types = Array.from(e.dataTransfer.types || []);
      if (types.length === 0) return false;
      return types.some((t) => {
        const low = t.toLowerCase();
        return (
          low === 'files' ||
          low.includes('file') ||
          low.includes('uri-list') ||
          low === 'text/plain'
        );
      });
    };

    const clearStaleDragState = () => {
      if (dragLeaveTimerRef.current) {
        window.clearTimeout(dragLeaveTimerRef.current);
        dragLeaveTimerRef.current = null;
      }
      isInternalShelfDragRef.current = false;
      setIsDragOver(false);
      setDragAutoOpened(false);
    };

    const handleWindowDragEnter = (e: DragEvent) => {
      if (!hasDragPayload(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      expandIslandForFileDrag();
    };

    const handleWindowDragOver = (e: DragEvent) => {
      if (!hasDragPayload(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      expandIslandForFileDrag();
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      if (
        e.clientY <= 0 ||
        e.clientX <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY > 330 ||
        (e as any).relatedTarget === null
      ) {
        if (dragLeaveTimerRef.current) window.clearTimeout(dragLeaveTimerRef.current);
        dragLeaveTimerRef.current = window.setTimeout(() => {
          setIsDragOver(false);
          setDragAutoOpened(false);
          dragLeaveTimerRef.current = null;
        }, 180);
      }
    };

    const handleWindowDragEnd = () => {
      clearStaleDragState();
    };

    // Normal mousemove or mousedown never fires during an active OS file drag;
    // use it to immediately clear any leftover drag-over state.
    const handleNormalMouseActivity = () => {
      if (isDragOver || dragAutoOpened) {
        clearStaleDragState();
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      if (isInternalShelfDragRef.current) {
        isInternalShelfDragRef.current = false;
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      clearStaleDragState();
      // Keep the island open on Shelf so the user sees their newly dropped files!
      setIsPinnedOpen(true);
      setIsHovered(true);
      setShelfSubTab('files');
      if (ISLAND_PAGES[pageIndex]?.id !== 'shelf') {
        navigateToPage(4, 'right');
      }

      const osFiles = Array.from(e.dataTransfer?.files || []);
      if (osFiles.length > 0) {
        processDroppedOsFiles(osFiles);
        return;
      }

      const plainText = e.dataTransfer?.getData('text/plain')?.trim();
      if (plainText) {
        setShelfClips((prev) =>
          [
            { id: Date.now(), text: plainText.slice(0, 600), time: 'now' },
            ...prev.filter((c) => c.text !== plainText),
          ].slice(0, 8)
        );
        setShelfSubTab('clipboard');
      }
    };

    // Listen to Ctrl+V when Shelf is open to quickly stash clipboard text/images
    const handleShelfPaste = (e: ClipboardEvent) => {
      if (!isExpanded || ISLAND_PAGES[pageIndex]?.id !== 'shelf') return;
      const activeTag = (document.activeElement as HTMLElement)?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const pastedFiles = Array.from(e.clipboardData?.files || []);
      if (pastedFiles.length > 0) {
        e.preventDefault();
        processDroppedOsFiles(pastedFiles);
        return;
      }
      const pastedText = e.clipboardData?.getData('text/plain')?.trim();
      if (pastedText) {
        e.preventDefault();
        setShelfClips((prev) =>
          [
            { id: Date.now(), text: pastedText.slice(0, 600), time: 'now' },
            ...prev.filter((c) => c.text !== pastedText),
          ].slice(0, 8)
        );
        setShelfSubTab('clipboard');
        setShelfToast('Added to Clipboard Shelf');
        window.setTimeout(() => setShelfToast(null), 1500);
      }
    };

    // Also subscribe to Tauri native file drag-and-drop events if running in Tauri Windows shell
    const unlisteners: Array<() => void> = [];
    const winAny = window as any;
    const tauriListen = winAny.__TAURI__?.event?.listen;
    if (typeof tauriListen === 'function') {
      tauriListen('tauri://drag-enter', () => {
        expandIslandForFileDrag();
      })
        .then((un: () => void) => unlisteners.push(un))
        .catch(() => {});

      tauriListen('tauri://drag-over', () => {
        expandIslandForFileDrag();
      })
        .then((un: () => void) => unlisteners.push(un))
        .catch(() => {});

      tauriListen('tauri://drag-leave', () => {
        if (dragLeaveTimerRef.current) window.clearTimeout(dragLeaveTimerRef.current);
        dragLeaveTimerRef.current = window.setTimeout(() => {
          setIsDragOver(false);
          setDragAutoOpened(false);
          dragLeaveTimerRef.current = null;
        }, 180);
      })
        .then((un: () => void) => unlisteners.push(un))
        .catch(() => {});

      tauriListen('tauri://drag-drop', (ev: any) => {
        clearStaleDragState();
        setIsPinnedOpen(true);
        setIsHovered(true);
        const paths: string[] = Array.isArray(ev?.payload?.paths)
          ? ev.payload.paths
          : Array.isArray(ev?.payload)
          ? ev.payload
          : [];
        if (paths.length > 0) {
          addFilesToShelf(
            paths.map((p) => {
              const name = String(p).split(/[\\/]/).pop() || String(p);
              return {
                name,
                size: 'File',
                ext: detectFileExt(name),
                filePath: String(p),
              };
            })
          );
        }
      })
        .then((un: () => void) => unlisteners.push(un))
        .catch(() => {});
    }

    window.addEventListener('dragenter', handleWindowDragEnter, true);
    window.addEventListener('dragover', handleWindowDragOver, true);
    window.addEventListener('dragleave', handleWindowDragLeave, true);
    window.addEventListener('dragend', handleWindowDragEnd, true);
    window.addEventListener('drop', handleWindowDrop, true);
    window.addEventListener('mousemove', handleNormalMouseActivity, true);
    window.addEventListener('mousedown', handleNormalMouseActivity, true);
    window.addEventListener('paste', handleShelfPaste);
    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter, true);
      window.removeEventListener('dragover', handleWindowDragOver, true);
      window.removeEventListener('dragleave', handleWindowDragLeave, true);
      window.removeEventListener('dragend', handleWindowDragEnd, true);
      window.removeEventListener('drop', handleWindowDrop, true);
      window.removeEventListener('mousemove', handleNormalMouseActivity, true);
      window.removeEventListener('mousedown', handleNormalMouseActivity, true);
      window.removeEventListener('paste', handleShelfPaste);
      unlisteners.forEach((u) => {
        try {
          u();
        } catch {
          // ignore
        }
      });
    };
  }, [
    addFilesToShelf,
    dragAutoOpened,
    expandIslandForFileDrag,
    isDragOver,
    isExpanded,
    navigateToPage,
    pageIndex,
    processDroppedOsFiles,
  ]);

  // ── Bot Look Customization ──
  const [botShape] = useState<BotShapeName>('squircle');
  const [botColor] = useState<BotColorName>('cloud');
  const botPalette = useMemo(() => paletteFor(botColor, 'classic'), [botColor]);

  // ── Page 1: Real Media Detection, Audio Stream, Song Queue, Smart Mood Shuffle & Synced Lyrics ──
  // Starts in clean idle "Media" state (zero fake songs!). Automatically detects playing music or plays requested songs.
  const [activeTrack, setActiveTrack] = useState<RealMediaTrack | null>(null);
  const [musicQueue, setMusicQueue] = useState<RealMediaTrack[]>([]);
  const [musicHistory, setMusicHistory] = useState<RealMediaTrack[]>([]);
  const [moodShuffleEnabled, setMoodShuffleEnabled] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('isle_mood_shuffle_enabled') === 'true';
    } catch {
      return false;
    }
  });
  // Tracks shuffle status of external apps (Spotify, YouTube Music, OS Media Session) separately from internal AI shuffle
  const [externalShuffleEnabled, setExternalShuffleEnabled] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(true);
  const [wifiEnabled, setWifiEnabled] = useState(true);
  const [flacEnabled, setFlacEnabled] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('isle_flac_enabled') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_flac_enabled', String(flacEnabled));
    } catch {
      // ignore
    }
  }, [flacEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_mood_shuffle_enabled', String(moodShuffleEnabled));
    } catch {
      // ignore
    }
  }, [moodShuffleEnabled]);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLyricLineRef = useRef<HTMLDivElement | null>(null);
  const lastPlayedSongQueryRef = useRef<string>('');
  const lastPlayedSongTimeRef = useRef<number>(0);
  const ytPlayerStateRef = useRef<number>(-1);
  const ytListeningAckRef = useRef<boolean>(false);
  const activeTrackRef = useRef<RealMediaTrack | null>(null);
  const musicQueueRef = useRef<RealMediaTrack[]>([]);
  const musicHistoryRef = useRef<RealMediaTrack[]>([]);
  const moodShuffleEnabledRef = useRef<boolean>(moodShuffleEnabled);
  const externalShuffleEnabledRef = useRef<boolean>(externalShuffleEnabled);
  const positionMsRef = useRef<number>(0);
  const lastManualSeekTimeRef = useRef<number>(0);
  const externalSeekOffsetRef = useRef<number>(0);
  const lastRawExternalPosRef = useRef<number>(0);
  const shuffleBufferRef = useRef<RealMediaTrack | null>(null);
  const shufflePrefetchingRef = useRef<boolean>(false);
  const handleTrackEndedRef = useRef<() => void>(() => {});
  const lastEndedTriggerRef = useRef<number>(0);

  useEffect(() => {
    activeTrackRef.current = activeTrack;
  }, [activeTrack]);
  useEffect(() => {
    musicQueueRef.current = musicQueue;
  }, [musicQueue]);
  useEffect(() => {
    musicHistoryRef.current = musicHistory;
  }, [musicHistory]);
  useEffect(() => {
    moodShuffleEnabledRef.current = moodShuffleEnabled;
  }, [moodShuffleEnabled]);
  useEffect(() => {
    externalShuffleEnabledRef.current = externalShuffleEnabled;
  }, [externalShuffleEnabled]);
  useEffect(() => {
    positionMsRef.current = positionMs;
  }, [positionMs]);

  // Extract dominant color from album cover for warm ambient wash in Lyrics Mode (matches video 00:04-00:10)
  useEffect(() => {
    const coverUrl = activeTrack?.coverUrl;
    if (!coverUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum > 24 && lum < 235) {
            rSum += r;
            gSum += g;
            bSum += b;
            count++;
          }
        }
        if (count > 0) {
          const nr = Math.min(1, Math.max(0.18, rSum / count / 255));
          const ng = Math.min(1, Math.max(0.15, gSum / count / 255));
          const nb = Math.min(1, Math.max(0.12, bSum / count / 255));
          setActiveTrack((prev) =>
            prev && prev.coverUrl === coverUrl ? { ...prev, tintRgb: [nr, ng, nb] } : prev
          );
        }
      } catch {
        // Keep default warm amber tint if CORS blocks pixel read
      }
    };
    img.src = coverUrl;
    return () => {
      cancelled = true;
    };
  }, [activeTrack?.coverUrl]);

  const currentTrack = useMemo<RealMediaTrack>(
    () =>
      activeTrack || {
        title: 'Media',
        artist: '',
        coverUrl: '',
        audioUrl: '',
        durationMs: 0,
        lrc: '',
        tintRgb: [0.54, 0.36, 0.16] as [number, number, number],
      },
    [activeTrack]
  );

  const parsedLyrics = useMemo(
    () => parseLrc(currentTrack.lrc || '', currentTrack.wordsByLine),
    [currentTrack.lrc, currentTrack.wordsByLine]
  );

  const activeLineIndex = useMemo(() => {
    if (!parsedLyrics || parsedLyrics.length === 0) return -1;
    let curr = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (positionMs >= parsedLyrics[i].timeMs) {
        curr = i;
      } else {
        break;
      }
    }
    return curr;
  }, [parsedLyrics, positionMs]);

  // Auto-scroll active lyric line smoothly to the vertical center of the lyrics container
  useEffect(() => {
    if (!lyricsMode) return;
    const container = lyricsContainerRef.current;
    const lineEl = activeLyricLineRef.current;
    if (container && lineEl) {
      const targetTop =
        lineEl.offsetTop - container.clientHeight / 2 + lineEl.clientHeight / 2;
      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth',
      });
    }
  }, [lyricsMode, activeLineIndex]);

  // ── Equalizer Visualizer is delegated to BeatEqualizerBars (Direct SVG DOM mutation with zero React re-renders) ──

  // Ensure active track always fetches synced lyrics from multi-provider chain if lrc is missing
  useEffect(() => {
    if (!activeTrack || activeTrack.lrc || !activeTrack.title || activeTrack.title === 'Media') {
      return;
    }
    let cancelled = false;
    const fetchMissingLyrics = async () => {
      try {
        const params = new URLSearchParams({
          track_name: activeTrack.title,
          artist_name: activeTrack.artist || '',
          q: `${activeTrack.title} ${activeTrack.artist || ''}`.trim(),
        });
        const res = await fetch(`/api/music/lyrics?${params.toString()}`);
        const data = await res.json();
        if (!cancelled && data?.lrc) {
          setActiveTrack((prev) =>
            prev && prev.title === activeTrack.title
              ? {
                  ...prev,
                  lrc: data.lrc,
                  syncType: data.syncType,
                  provider: data.provider,
                  wordsByLine: data.wordsByLine,
                  lrclibId: data.lrclibId,
                }
              : prev
          );
        }
      } catch {
        // ignore
      }
    };
    fetchMissingLyrics();
    return () => {
      cancelled = true;
    };
  }, [activeTrack?.title, activeTrack?.artist, activeTrack?.lrc]);

  // Track external song key dismissed by user via the Clear button so OS poller doesn't re-add the same song
  const clearedExternalKeyRef = useRef<string>('');
  const ytFallbackTimerRef = useRef<number | null>(null);

  // Client-side direct iTunes + LRCLIB resolver fallback (ensures music works 100% even in standalone Tauri Windows exe)
  const resolveSongClientSide = useCallback(async (queryStr: string) => {
    const cleanQ = queryStr.trim();
    if (!cleanQ) return null;
    try {
      const itRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQ)}&media=music&entity=song&limit=8`
      );
      if (!itRes.ok) return null;
      const itData = await itRes.json();
      const results: any[] = Array.isArray(itData?.results) ? itData.results : [];
      if (results.length === 0) return null;
      const best = results[0];
      const title = String(best.trackName || cleanQ).trim();
      const artist = String(best.artistName || 'Various Artists').trim();
      const coverUrl = String(best.artworkUrl100 || '').replace('100x100bb', '600x600bb');
      const previewUrl = String(best.previewUrl || '').trim();
      const durationMs =
        typeof best.trackTimeMillis === 'number' && best.trackTimeMillis > 40000
          ? best.trackTimeMillis
          : 210000;

      let lrc = '';
      try {
        const lrcRes = await fetch(
          `https://lrclib.net/api/search?q=${encodeURIComponent(`${title} ${artist}`)}`
        );
        if (lrcRes.ok) {
          const lrcList = await lrcRes.json();
          if (Array.isArray(lrcList) && lrcList.length > 0) {
            const withSynced = lrcList.find((item: any) => item?.syncedLyrics);
            lrc = String(withSynced?.syncedLyrics || lrcList[0]?.plainLyrics || '');
          }
        }
      } catch {
        // ignore lyrics error
      }

      return {
        title,
        artist,
        coverUrl,
        audioUrl: previewUrl,
        previewUrl,
        durationMs,
        lrc,
        syncType: 'LINE' as const,
        provider: 'iTunes AAC',
      };
    } catch {
      return null;
    }
  }, []);

  // Listen to postMessages from embedded YouTube IFrame for full song stream timing
  // Guards against premature playerState === 0 events during initial buffer so tracks never jump mid-song
  useEffect(() => {
    const canTriggerNaturalEnd = () => {
      const tr = activeTrackRef.current;
      if (!tr || tr.sourceType === 'external') return false;
      const elapsedSinceStart = Date.now() - lastPlayedSongTimeRef.current;
      const dur = tr.durationMs && tr.durationMs > 20000 ? tr.durationMs : 180000;
      const pos = positionMsRef.current;
      return elapsedSinceStart > 8000 && pos >= Math.max(20000, dur - 8000);
    };

    const fallbackToDirectPreviewAudio = () => {
      const tr = activeTrackRef.current;
      if (!tr || tr.sourceType === 'external' || tr.audioUrl || !tr.previewUrl) return;
      const nextWithAudio: RealMediaTrack = {
        ...tr,
        audioUrl: tr.previewUrl,
      };
      activeTrackRef.current = nextWithAudio;
      setActiveTrack(nextWithAudio);
      if (audioElRef.current) {
        audioElRef.current.src = tr.previewUrl;
        audioElRef.current.currentTime = 0;
        audioElRef.current.play().catch(() => {});
      }
    };

    const handleYtMessage = (event: MessageEvent) => {
      try {
        if (typeof event.data !== 'string') return;
        const data = JSON.parse(event.data);
        if (data.event) {
          ytListeningAckRef.current = true;
        }
        // If YouTube embed returns an error (e.g. Error 150 / 153 on Windows localhost), switch immediately to direct AAC audio stream
        if (data.event === 'onError') {
          fallbackToDirectPreviewAudio();
          return;
        }
        if ((data.event === 'infoDelivery' || data.event === 'initialDelivery') && data.info) {
          if (typeof data.info.currentTime === 'number' && data.info.currentTime > 0) {
            const nextPos = Math.round(data.info.currentTime * 1000);
            positionMsRef.current = nextPos;
            setPositionMs(nextPos);
          }
          if (typeof data.info.duration === 'number' && data.info.duration > 40) {
            const ytDurMs = Math.round(data.info.duration * 1000);
            setActiveTrack((prev) =>
              prev && prev.sourceType !== 'external' && Math.abs(prev.durationMs - ytDurMs) > 1000
                ? { ...prev, durationMs: ytDurMs }
                : prev
            );
          }
          if (typeof data.info.playerState === 'number') {
            ytPlayerStateRef.current = data.info.playerState;
            if (data.info.playerState === 1) {
              setIsPlaying(true);
            } else if (data.info.playerState === 2) {
              setIsPlaying(false);
            } else if (data.info.playerState === 0 && canTriggerNaturalEnd()) {
              handleTrackEndedRef.current();
            }
          }
        } else if (data.event === 'onStateChange' && typeof data.info === 'number') {
          ytPlayerStateRef.current = data.info;
          if (data.info === 1) {
            setIsPlaying(true);
          } else if (data.info === 2) {
            setIsPlaying(false);
          } else if (data.info === 0 && canTriggerNaturalEnd()) {
            handleTrackEndedRef.current();
          }
        }
      } catch {
        // ignore non-json messages
      }
    };
    window.addEventListener('message', handleYtMessage);
    return () => window.removeEventListener('message', handleYtMessage);
  }, []);

  // Ensure YouTube IFrame JS API handshake & autoplay succeed so full song audio always streams with sound
  useEffect(() => {
    if (!activeTrack?.youtubeVideoId || activeTrack?.audioUrl) return;
    ytListeningAckRef.current = false;
    ytPlayerStateRef.current = -1;

    const sendHandshake = () => {
      const cw = ytIframeRef.current?.contentWindow;
      if (!cw) return;
      try {
        cw.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
        cw.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'addEventListener',
            args: ['onStateChange'],
          }),
          '*'
        );
        cw.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'addEventListener',
            args: ['onError'],
          }),
          '*'
        );
        if (ytPlayerStateRef.current !== 1 && ytPlayerStateRef.current !== 2) {
          cw.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: '' }),
            '*'
          );
          cw.postMessage(
            JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: '' }),
            '*'
          );
          cw.postMessage(
            JSON.stringify({
              event: 'command',
              func: 'setVolume',
              args: [muted ? 0 : volume],
            }),
            '*'
          );
        }
      } catch {
        // ignore
      }
    };

    sendHandshake();
    const id = window.setInterval(() => {
      if (!ytListeningAckRef.current || (ytPlayerStateRef.current !== 1 && ytPlayerStateRef.current !== 2)) {
        sendHandshake();
      }
    }, 450);

    return () => window.clearInterval(id);
  }, [activeTrack?.youtubeVideoId, activeTrack?.audioUrl, muted, volume]);

  // Sync YouTube IFrame volume & mute state
  useEffect(() => {
    const cw = ytIframeRef.current?.contentWindow;
    if (!cw || !activeTrack?.youtubeVideoId) return;
    try {
      cw.postMessage(
        JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: '' }),
        '*'
      );
      cw.postMessage(
        JSON.stringify({
          event: 'command',
          func: 'setVolume',
          args: [muted ? 0 : volume],
        }),
        '*'
      );
    } catch {
      // ignore
    }
  }, [volume, muted, activeTrack?.youtubeVideoId]);

  // Sync HTML5 audio element volume & mute state
  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.volume = muted ? 0 : Math.min(1, Math.max(0, volume / 100));
    }
  }, [volume, muted]);

  // Send media transport, shuffle, or seek command to External App (Spotify, YouTube Music, or Windows GSMTC OS Media Session)
  const sendExternalMediaCommand = useCallback(
    async (
      action: 'play_pause' | 'play' | 'pause' | 'next' | 'prev' | 'shuffle' | 'seek',
      targetShuffle?: boolean,
      positionMs?: number
    ) => {
      try {
        // 1. Electron / WebView2 Native Bridge if running inside desktop shell
        const winAny = window as any;
        if (typeof winAny.electronAPI?.mediaControl === 'function') {
          winAny.electronAPI.mediaControl(action, targetShuffle, positionMs);
        } else if (typeof winAny.chrome?.webview?.postMessage === 'function') {
          winAny.chrome.webview.postMessage({
            type: 'mediaControl',
            action,
            targetShuffle,
            positionMs,
            sourceApp: activeTrackRef.current?.externalApp,
          });
        }

        // 2. Server-side Windows GSMTC / OS Media Controller endpoint
        const res = await fetch('/api/music/os-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            targetShuffle,
            positionMs,
            sourceApp: activeTrackRef.current?.externalApp,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data?.shuffleActive === 'boolean') {
            setExternalShuffleEnabled(data.shuffleActive);
          }
        }
      } catch {
        // ignore
      }
    },
    []
  );

  // Load & play a track (Internal AI Player or External OS Media Session)
  const loadAndPlayRealTrack = useCallback(
    (trackInfo: {
      title: string;
      artist: string;
      coverUrl?: string;
      audioUrl?: string;
      previewUrl?: string;
      isFlac?: boolean;
      durationMs?: number;
      youtubeVideoId?: string;
      youtubeMusicUrl?: string;
      spotifyUrl?: string;
      lrc?: string;
      syncType?: 'WORD' | 'LINE';
      provider?: string;
      wordsByLine?: any[];
      lrclibId?: number;
      sourceType?: 'internal' | 'external';
      externalApp?: string;
    }) => {
      if (ytFallbackTimerRef.current) {
        window.clearTimeout(ytFallbackTimerRef.current);
        ytFallbackTimerRef.current = null;
      }
      const isExternal = trackInfo.sourceType === 'external';
      const isTauriEnv =
        typeof window !== 'undefined' &&
        (Boolean((window as any).__TAURI_INTERNALS__) ||
          window.location.hostname.includes('tauri'));

      const rawAudioUrl = (trackInfo.audioUrl || '').trim();
      const rawPreviewUrl = (trackInfo.previewUrl || '').trim();

      // In Tauri Windows WebView2 (or when no YouTube videoId is available), immediately use direct audioUrl or previewUrl
      // so audio plays natively through HTML5 <audio> without YouTube localhost embed restrictions!
      const effectiveAudioUrl =
        rawAudioUrl ||
        ((isTauriEnv || !trackInfo.youtubeVideoId) && rawPreviewUrl ? rawPreviewUrl : '');

      const useHtmlAudio =
        !isExternal &&
        Boolean(
          effectiveAudioUrl &&
            (effectiveAudioUrl.startsWith('http:') ||
              effectiveAudioUrl.startsWith('https:') ||
              effectiveAudioUrl.startsWith('blob:'))
        );
      const safeDurationMs =
        typeof trackInfo.durationMs === 'number' && trackInfo.durationMs > 25000
          ? trackInfo.durationMs
          : 210000;

      const nextTrack: RealMediaTrack = {
        title: trackInfo.title || 'Media',
        artist: trackInfo.artist || '',
        coverUrl: trackInfo.coverUrl || '',
        audioUrl: useHtmlAudio ? effectiveAudioUrl : '',
        previewUrl: rawPreviewUrl || rawAudioUrl || undefined,
        isFlac: Boolean(trackInfo.isFlac || flacEnabled),
        durationMs: safeDurationMs,
        youtubeVideoId:
          isExternal || effectiveAudioUrl.startsWith('blob:')
            ? undefined
            : trackInfo.youtubeVideoId,
        youtubeMusicUrl: trackInfo.youtubeMusicUrl,
        spotifyUrl: trackInfo.spotifyUrl,
        lrc: trackInfo.lrc || '',
        syncType: trackInfo.syncType,
        provider: trackInfo.provider,
        wordsByLine: trackInfo.wordsByLine,
        lrclibId: trackInfo.lrclibId,
        sourceType: isExternal ? 'external' : 'internal',
        externalApp: trackInfo.externalApp,
        tintRgb: [0.54, 0.36, 0.16],
      };
      ytPlayerStateRef.current = -1;
      ytListeningAckRef.current = false;
      activeTrackRef.current = nextTrack;
      setActiveTrack(nextTrack);
      positionMsRef.current = 0;
      setPositionMs(0);
      setIsPlaying(true);
      lastPlayedSongQueryRef.current = (nextTrack.title || '').toLowerCase();
      lastPlayedSongTimeRef.current = Date.now();

      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.currentTime = 0;
        if (useHtmlAudio && nextTrack.audioUrl) {
          audioElRef.current.src = nextTrack.audioUrl;
          audioElRef.current.volume = muted ? 0 : Math.min(1, Math.max(0, volume / 100));
          audioElRef.current
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => {
              // If primary direct stream fails, try previewUrl or fall back to YouTube iframe
              if (rawPreviewUrl && nextTrack.audioUrl !== rawPreviewUrl && audioElRef.current) {
                audioElRef.current.src = rawPreviewUrl;
                audioElRef.current
                  .play()
                  .then(() => {
                    setActiveTrack((prev) =>
                      prev ? { ...prev, audioUrl: rawPreviewUrl } : prev
                    );
                    setIsPlaying(true);
                  })
                  .catch(() => {
                    setActiveTrack((prev) => (prev ? { ...prev, audioUrl: '' } : prev));
                    setIsPlaying(true);
                  });
              } else {
                setActiveTrack((prev) => (prev ? { ...prev, audioUrl: '' } : prev));
                setIsPlaying(true);
              }
            });
        } else {
          audioElRef.current.removeAttribute('src');
          audioElRef.current.load();
          // Watchdog: if YouTube iframe doesn't start playing within 2.3s on Windows, automatically fall back to direct AAC previewUrl!
          if (!isExternal && nextTrack.youtubeVideoId && rawPreviewUrl) {
            ytFallbackTimerRef.current = window.setTimeout(() => {
              ytFallbackTimerRef.current = null;
              const curr = activeTrackRef.current;
              if (
                curr &&
                curr.youtubeVideoId === nextTrack.youtubeVideoId &&
                !curr.audioUrl &&
                ytPlayerStateRef.current !== 1 &&
                ytPlayerStateRef.current !== 2 &&
                ytPlayerStateRef.current !== 3
              ) {
                const updated: RealMediaTrack = { ...curr, audioUrl: rawPreviewUrl };
                activeTrackRef.current = updated;
                setActiveTrack(updated);
                if (audioElRef.current) {
                  audioElRef.current.src = rawPreviewUrl;
                  audioElRef.current.volume = muted ? 0 : Math.min(1, Math.max(0, volume / 100));
                  audioElRef.current.play().catch(() => {});
                }
              }
            }, 2300);
          }
        }
      }
    },
    [flacEnabled, muted, volume]
  );

  // Clear / Reset Active Track back to Default Idle "Media" State
  const handleClearActiveTrack = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (ytFallbackTimerRef.current) {
        window.clearTimeout(ytFallbackTimerRef.current);
        ytFallbackTimerRef.current = null;
      }
      const curr = activeTrackRef.current;
      if (curr?.sourceType === 'external') {
        clearedExternalKeyRef.current = `${curr.title.toLowerCase()}::${curr.artist.toLowerCase()}`;
        sendExternalMediaCommand('pause');
      }
      if (audioElRef.current) {
        try {
          audioElRef.current.pause();
          audioElRef.current.currentTime = 0;
          audioElRef.current.removeAttribute('src');
          audioElRef.current.load();
        } catch {
          // ignore
        }
      }
      if (ytIframeRef.current?.contentWindow) {
        try {
          ytIframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'stopVideo', args: '' }),
            '*'
          );
        } catch {
          // ignore
        }
      }
      ytPlayerStateRef.current = -1;
      ytListeningAckRef.current = false;
      activeTrackRef.current = null;
      setActiveTrack(null);
      setIsPlaying(false);
      positionMsRef.current = 0;
      setPositionMs(0);
      setLyricsMode(false);
      setMusicQueue([]);
      shuffleBufferRef.current = null;
    },
    [sendExternalMediaCommand]
  );

  // Source-Aware Play / Pause Toggle:
  // - If playing from External App (Spotify, YouTube Music, OS Media), sends play_pause to external session
  // - If playing from Internal AI Player, controls internal YouTube / HTML5 audio stream
  const handleTogglePlay = useCallback(() => {
    if (activeTrackRef.current?.sourceType === 'external') {
      setIsPlaying((curr) => !curr);
      sendExternalMediaCommand('play_pause');
      return;
    }

    setIsPlaying((currPlaying) => {
      const nextPlaying = !currPlaying;
      ytPlayerStateRef.current = nextPlaying ? 1 : 2;
      if (activeTrack?.youtubeVideoId && !activeTrack?.audioUrl && ytIframeRef.current?.contentWindow) {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: nextPlaying ? 'playVideo' : 'pauseVideo',
            args: '',
          }),
          '*'
        );
      }
      if (audioElRef.current && activeTrack?.audioUrl) {
        if (nextPlaying) {
          audioElRef.current.play().catch(() => {});
        } else {
          audioElRef.current.pause();
        }
      }
      return nextPlaying;
    });
  }, [activeTrack?.audioUrl, activeTrack?.youtubeVideoId, sendExternalMediaCommand]);

  const handleSeek = useCallback(
    (nextMs: number) => {
      const clampedMs = Math.max(0, Math.round(nextMs));
      lastManualSeekTimeRef.current = Date.now();
      positionMsRef.current = clampedMs;
      setPositionMs(clampedMs);

      if (activeTrackRef.current?.sourceType === 'external') {
        externalSeekOffsetRef.current = clampedMs - lastRawExternalPosRef.current;
        sendExternalMediaCommand('seek', undefined, clampedMs);
        return;
      }

      if (activeTrack?.youtubeVideoId && !activeTrack?.audioUrl && ytIframeRef.current?.contentWindow) {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [clampedMs / 1000, true] }),
          '*'
        );
      }
      if (audioElRef.current && activeTrack?.audioUrl) {
        audioElRef.current.currentTime = clampedMs / 1000;
      }
    },
    [activeTrack?.audioUrl, activeTrack?.youtubeVideoId, sendExternalMediaCommand]
  );

  // Build exclusion params (both titles & videoIds) so Shuffle never repeats the current or recent songs
  const buildShuffleExclusionParams = useCallback((base?: RealMediaTrack | null) => {
    const refTrack = base || activeTrackRef.current;
    const excludedTitles = [
      refTrack?.title || '',
      shuffleBufferRef.current?.title || '',
      ...musicHistoryRef.current.slice(0, 10).map((t) => t.title),
      ...musicQueueRef.current.slice(0, 6).map((t) => t.title),
    ]
      .filter(Boolean)
      .join('|');

    const excludedVideoIds = [
      refTrack?.youtubeVideoId || '',
      shuffleBufferRef.current?.youtubeVideoId || '',
      ...musicHistoryRef.current.slice(0, 10).map((t) => t.youtubeVideoId || ''),
      ...musicQueueRef.current.slice(0, 6).map((t) => t.youtubeVideoId || ''),
    ]
      .filter(Boolean)
      .join('|');

    return { excludedTitles, excludedVideoIds };
  }, []);

  // Background pre-fetcher for Internal AI Mood Shuffle so clicking Next (>>) switches tracks instantaneously
  const prefetchNextShuffleTrack = useCallback(
    async (seed?: RealMediaTrack | null) => {
      const base = seed || activeTrackRef.current;
      if (!base || base.sourceType === 'external') return;
      if (shufflePrefetchingRef.current || shuffleBufferRef.current) return;

      shufflePrefetchingRef.current = true;
      try {
        const { excludedTitles, excludedVideoIds } = buildShuffleExclusionParams(base);
        const params = new URLSearchParams({
          title: base.title || '',
          artist: base.artist || '',
          exclude: excludedTitles,
          excludeVideoIds: excludedVideoIds,
          flac: flacEnabled ? 'true' : 'false',
        });
        const res = await fetch(`/api/music/mood-shuffle?${params.toString()}`);
        const data = await res.json();
        if (data?.found && data?.track) {
          const t = data.track;
          const isSameAsActive =
            activeTrackRef.current &&
            ((t.youtubeVideoId && t.youtubeVideoId === activeTrackRef.current.youtubeVideoId) ||
              t.title?.toLowerCase() === activeTrackRef.current.title?.toLowerCase());
          if (!isSameAsActive) {
            shuffleBufferRef.current = {
              ...t,
              sourceType: 'internal',
              tintRgb: [0.54, 0.36, 0.16],
            };
          }
        }
      } catch {
        // ignore
      } finally {
        shufflePrefetchingRef.current = false;
      }
    },
    [buildShuffleExclusionParams, flacEnabled]
  );

  // Whenever an internal track is playing and Mood Shuffle is enabled, pre-buffer the next mood track in the background
  // IMPORTANT: Toggling moodShuffleEnabled ON never interrupts the currently playing track!
  useEffect(() => {
    if (moodShuffleEnabled && activeTrack && activeTrack.sourceType !== 'external') {
      prefetchNextShuffleTrack(activeTrack);
    }
  }, [moodShuffleEnabled, activeTrack?.title, activeTrack?.youtubeVideoId, prefetchNextShuffleTrack]);

  // Search song & synced lyrics via /api/music/search (Internal AI Player) with client-side fallback
  const handleSearchAndPlayMedia = useCallback(
    async (queryStr: string) => {
      const q = queryStr.trim();
      if (!q) return;
      lastPlayedSongQueryRef.current = q.toLowerCase();
      lastPlayedSongTimeRef.current = Date.now();
      setMediaLoading(true);
      try {
        let trackFound: any = null;
        try {
          const res = await fetch(
            `/api/music/search?q=${encodeURIComponent(q)}&flac=${flacEnabled ? 'true' : 'false'}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data?.found && data?.track) {
              trackFound = data.track;
            }
          }
        } catch {
          // fallback to client-side resolver below
        }

        if (!trackFound) {
          trackFound = await resolveSongClientSide(q);
        }

        if (trackFound) {
          if (activeTrackRef.current && activeTrackRef.current.sourceType !== 'external') {
            setMusicHistory((prev) => [activeTrackRef.current!, ...prev.slice(0, 19)]);
          }
          shuffleBufferRef.current = null;
          loadAndPlayRealTrack({ ...trackFound, sourceType: 'internal' });
        }
      } catch {
        // ignore
      } finally {
        setMediaLoading(false);
      }
    },
    [flacEnabled, loadAndPlayRealTrack, resolveSongClientSide]
  );

  // Enqueue a resolved track (plays immediately if nothing is playing right now)
  const enqueueResolvedTrack = useCallback(
    (trackInfo: any) => {
      if (!trackInfo) return;
      const safeDurationMs =
        typeof trackInfo.durationMs === 'number' && trackInfo.durationMs > 25000
          ? trackInfo.durationMs
          : 210000;
      const queuedItem: RealMediaTrack = {
        title: trackInfo.title || 'Media',
        artist: trackInfo.artist || '',
        coverUrl: trackInfo.coverUrl || '',
        audioUrl: trackInfo.audioUrl || '',
        previewUrl: trackInfo.previewUrl || trackInfo.audioUrl || '',
        isFlac: Boolean(trackInfo.isFlac || flacEnabled),
        durationMs: safeDurationMs,
        youtubeVideoId: trackInfo.youtubeVideoId,
        youtubeMusicUrl: trackInfo.youtubeMusicUrl,
        spotifyUrl: trackInfo.spotifyUrl,
        lrc: trackInfo.lrc || '',
        syncType: trackInfo.syncType,
        provider: trackInfo.provider,
        wordsByLine: trackInfo.wordsByLine,
        lrclibId: trackInfo.lrclibId,
        sourceType: 'internal',
        tintRgb: [0.54, 0.36, 0.16],
      };

      if (!activeTrackRef.current || activeTrackRef.current.sourceType === 'external') {
        loadAndPlayRealTrack(queuedItem);
        return;
      }

      setMusicQueue((prev) => [...prev, queuedItem]);
    },
    [flacEnabled, loadAndPlayRealTrack]
  );

  // Search song & add to Music Queue (Antrian Lagu)
  const handleQueueSongMedia = useCallback(
    async (queryStr: string) => {
      const q = queryStr.trim();
      if (!q) return;
      if (!activeTrackRef.current || activeTrackRef.current.sourceType === 'external') {
        handleSearchAndPlayMedia(q);
        return;
      }
      try {
        const res = await fetch(
          `/api/music/search?q=${encodeURIComponent(q)}&flac=${flacEnabled ? 'true' : 'false'}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.found && data?.track) {
            enqueueResolvedTrack(data.track);
            return;
          }
        }
      } catch {
        // fallback below
      }
      const fallbackTrack = await resolveSongClientSide(q);
      if (fallbackTrack) {
        enqueueResolvedTrack(fallbackTrack);
      }
    },
    [enqueueResolvedTrack, flacEnabled, handleSearchAndPlayMedia, resolveSongClientSide]
  );

  // Smart Mood Shuffle (Internal AI Player): Play pre-buffered shuffle track immediately or fetch a new mood-matched song
  const triggerSmartMoodShuffle = useCallback(
    async (seedTrack?: RealMediaTrack | null) => {
      const base = seedTrack || activeTrackRef.current;

      // 1. If we already pre-buffered a distinct next shuffle track, play it immediately with zero wait!
      const buffered = shuffleBufferRef.current;
      if (
        buffered &&
        (!base ||
          ((!buffered.youtubeVideoId || buffered.youtubeVideoId !== base.youtubeVideoId) &&
            buffered.title.toLowerCase() !== base.title.toLowerCase()))
      ) {
        shuffleBufferRef.current = null;
        if (activeTrackRef.current && activeTrackRef.current.sourceType !== 'external') {
          setMusicHistory((prev) => [activeTrackRef.current!, ...prev.slice(0, 19)]);
        }
        loadAndPlayRealTrack({ ...buffered, sourceType: 'internal' });
        window.setTimeout(() => prefetchNextShuffleTrack(buffered), 400);
        return;
      }

      // 2. Otherwise fetch live from /api/music/mood-shuffle with strict title & videoId exclusion
      const { excludedTitles, excludedVideoIds } = buildShuffleExclusionParams(base);
      setMediaLoading(true);
      try {
        let nextTrack: any = null;
        try {
          const params = new URLSearchParams({
            title: base?.title || '',
            artist: base?.artist || '',
            exclude: excludedTitles,
            excludeVideoIds: excludedVideoIds,
            flac: flacEnabled ? 'true' : 'false',
          });
          const res = await fetch(`/api/music/mood-shuffle?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.found && data?.track) {
              nextTrack = data.track;
            }
          }
        } catch {
          // fallback below
        }

        if (!nextTrack) {
          const moodSeeds = [
            base?.artist ? `${base.artist}` : '',
            'Hindia Evaluasi',
            'Laufey From The Start',
            'Daniel Caesar Best Part',
            'Tulus Hati-Hati di Jalan',
            'Clairo Sofia',
            'NIKI Every Summertime',
          ].filter(Boolean);
          const pickSeed = moodSeeds[Math.floor(Math.random() * moodSeeds.length)];
          nextTrack = await resolveSongClientSide(pickSeed);
        }

        if (nextTrack) {
          if (activeTrackRef.current && activeTrackRef.current.sourceType !== 'external') {
            setMusicHistory((prev) => [activeTrackRef.current!, ...prev.slice(0, 19)]);
          }
          shuffleBufferRef.current = null;
          loadAndPlayRealTrack({ ...nextTrack, sourceType: 'internal' });
        }
      } catch {
        // ignore
      } finally {
        setMediaLoading(false);
      }
    },
    [
      buildShuffleExclusionParams,
      flacEnabled,
      loadAndPlayRealTrack,
      prefetchNextShuffleTrack,
      resolveSongClientSide,
    ]
  );

  // Source-Aware Shuffle Toggle:
  // - If music is from External App (Spotify / YouTube Music / OS Media), toggles the external app's native shuffle
  // - If music is from Internal AI Player (or idle), toggles Internal AI Mood Shuffle, shuffles any queued tracks,
  //   and if idle (no track currently loaded), immediately starts playing a shuffled track!
  const handleToggleShuffle = useCallback(() => {
    if (activeTrackRef.current?.sourceType === 'external') {
      const nextExternalShuffle = !externalShuffleEnabledRef.current;
      externalShuffleEnabledRef.current = nextExternalShuffle;
      setExternalShuffleEnabled(nextExternalShuffle);
      sendExternalMediaCommand('shuffle', nextExternalShuffle);
      return;
    }

    const nextShuffle = !moodShuffleEnabledRef.current;
    moodShuffleEnabledRef.current = nextShuffle;
    setMoodShuffleEnabled(nextShuffle);

    if (nextShuffle) {
      // Shuffle existing queue if > 1 items
      setMusicQueue((prev) => {
        if (prev.length <= 1) return prev;
        const copy = [...prev];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      });

      // If no song is currently active, immediately start playing a shuffled song!
      if (!activeTrackRef.current) {
        triggerSmartMoodShuffle(null);
      } else {
        prefetchNextShuffleTrack(activeTrackRef.current);
      }
    }
  }, [prefetchNextShuffleTrack, sendExternalMediaCommand, triggerSmartMoodShuffle]);

  // Automatically advance to next queued song OR trigger Smart Mood Shuffle ONLY when an internal track genuinely finishes
  const handleTrackEnded = useCallback(() => {
    if (activeTrackRef.current?.sourceType === 'external') return;
    const now = Date.now();
    if (now - lastEndedTriggerRef.current < 2500) return;
    lastEndedTriggerRef.current = now;

    const currentQ = musicQueueRef.current;
    if (currentQ.length > 0) {
      const [nextTrack, ...restQueue] = currentQ;
      setMusicQueue(restQueue);
      if (activeTrackRef.current) {
        setMusicHistory((prev) => [activeTrackRef.current!, ...prev.slice(0, 19)]);
      }
      loadAndPlayRealTrack({ ...nextTrack, sourceType: 'internal' });
      return;
    }

    if (moodShuffleEnabledRef.current && activeTrackRef.current) {
      triggerSmartMoodShuffle(activeTrackRef.current);
      return;
    }

    setIsPlaying(false);
    positionMsRef.current = 0;
    setPositionMs(0);
  }, [loadAndPlayRealTrack, triggerSmartMoodShuffle]);

  useEffect(() => {
    handleTrackEndedRef.current = handleTrackEnded;
  }, [handleTrackEnded]);

  // Poll OS Media Session (/api/music/os-now-playing) to detect External Apps (Spotify, YouTube Music)
  // and synchronize external shuffle state
  const refreshExternalOsMedia = useCallback(async () => {
    try {
      const res = await fetch('/api/music/os-now-playing');
      const data = await res.json();
      if (typeof data?.shuffleActive === 'boolean') {
        setExternalShuffleEnabled(data.shuffleActive);
      }
      const curr = activeTrackRef.current;
      if (!data?.playing || !data?.track) {
        if (curr && curr.sourceType === 'external') {
          activeTrackRef.current = null;
          setActiveTrack(null);
          setIsPlaying(false);
          positionMsRef.current = 0;
          setPositionMs(0);
        }
        return;
      }
      // Only take over activeTrack if no internal AI track is currently active (or if activeTrack is already external)
      if (!curr || curr.sourceType === 'external') {
        const cleanTitle = String(data.track.title || '')
          .replace(/\s*(?:-|\|)\s*(?:YouTube Music|YouTube|Google Chrome|Microsoft Edge|Spotify).*$/i, '')
          .trim();
        const cleanArtist = String(data.track.artist || '')
          .replace(/\s*-\s*Topic$/i, '')
          .replace(/^(?:Google Chrome|Microsoft Edge|Brave|Firefox|Various Artists|Unknown Artist)$/i, '')
          .trim();
        if (!cleanTitle) return;

        // If user explicitly cleared this external track via the Clear button, don't re-populate it until a different song plays
        const extKey = `${cleanTitle.toLowerCase()}::${cleanArtist.toLowerCase()}`;
        if (clearedExternalKeyRef.current && clearedExternalKeyRef.current === extKey) {
          return;
        }
        if (clearedExternalKeyRef.current && clearedExternalKeyRef.current !== extKey) {
          clearedExternalKeyRef.current = '';
        }

        const extTrack: RealMediaTrack = {
          ...data.track,
          title: cleanTitle,
          artist: cleanArtist,
          sourceType: 'external',
          externalApp: data.sourceApp || data.track.externalApp || 'Music',
          youtubeVideoId: undefined,
          audioUrl: '',
          tintRgb: curr?.tintRgb || [0.54, 0.36, 0.16],
        };
        const isDifferentSong =
          !curr ||
          curr.title.toLowerCase() !== extTrack.title.toLowerCase() ||
          curr.artist.toLowerCase() !== extTrack.artist.toLowerCase();
        if (isDifferentSong) {
          activeTrackRef.current = extTrack;
          setActiveTrack(extTrack);
          externalSeekOffsetRef.current = 0;
          const initPos = typeof data.positionMs === 'number' ? data.positionMs : 0;
          lastRawExternalPosRef.current = initPos;
          positionMsRef.current = initPos;
          setPositionMs(initPos);
        } else if (typeof data.positionMs === 'number') {
          lastRawExternalPosRef.current = data.positionMs;
          const timeSinceManualSeek = Date.now() - lastManualSeekTimeRef.current;
          // If the OS session natively accepted our seek (within 2.5s of our position), clear offset
          if (Math.abs(positionMsRef.current - data.positionMs) <= 2500) {
            externalSeekOffsetRef.current = 0;
          } else if (timeSinceManualSeek > 10000 && externalSeekOffsetRef.current === 0) {
            // Only snap to OS position if user hasn't manually seeked lyrics in this session
            positionMsRef.current = data.positionMs;
            setPositionMs(data.positionMs);
          }
        }
        setIsPlaying(!data.isPaused);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshExternalOsMedia();
    const id = window.setInterval(refreshExternalOsMedia, 3500);
    return () => window.clearInterval(id);
  }, [refreshExternalOsMedia]);

  // Next Track button (>>):
  // - External App (Spotify / YouTube Music / OS Media): sends 'next' directly to external app
  // - Internal AI Player: plays next queued song OR next mood-shuffle track immediately
  const handleNextTrack = useCallback(() => {
    if (activeTrackRef.current?.sourceType === 'external') {
      sendExternalMediaCommand('next');
      positionMsRef.current = 0;
      setPositionMs(0);
      window.setTimeout(() => refreshExternalOsMedia(), 650);
      return;
    }

    const currentQ = musicQueueRef.current;
    if (currentQ.length > 0) {
      const [nextTrack, ...restQueue] = currentQ;
      setMusicQueue(restQueue);
      if (activeTrackRef.current) {
        setMusicHistory((prev) => [activeTrackRef.current!, ...prev.slice(0, 19)]);
      }
      loadAndPlayRealTrack({ ...nextTrack, sourceType: 'internal' });
      return;
    }

    if (activeTrackRef.current) {
      triggerSmartMoodShuffle(activeTrackRef.current);
      return;
    }
    handleSeek(0);
  }, [
    handleSeek,
    loadAndPlayRealTrack,
    refreshExternalOsMedia,
    sendExternalMediaCommand,
    triggerSmartMoodShuffle,
  ]);

  // Previous Track button (<<):
  // - External App (Spotify / YouTube Music / OS Media): sends 'prev' directly to external app
  // - Internal AI Player: returns to previous song in history (or rewinds to 0:00 if no history)
  const handlePrevTrack = useCallback(() => {
    if (activeTrackRef.current?.sourceType === 'external') {
      sendExternalMediaCommand('prev');
      positionMsRef.current = 0;
      setPositionMs(0);
      window.setTimeout(() => refreshExternalOsMedia(), 650);
      return;
    }

    if (musicHistoryRef.current.length > 0 && (positionMsRef.current < 5000 || moodShuffleEnabledRef.current)) {
      const [prevTrack, ...restHistory] = musicHistoryRef.current;
      setMusicHistory(restHistory);
      if (activeTrackRef.current) {
        setMusicQueue((q) => [activeTrackRef.current!, ...q]);
      }
      loadAndPlayRealTrack({ ...prevTrack, sourceType: 'internal' });
      return;
    }
    handleSeek(0);
  }, [handleSeek, loadAndPlayRealTrack, refreshExternalOsMedia, sendExternalMediaCommand]);

  // Handle local audio file (.mp3, .wav, .flac, .m4a) + automatic LRCLIB lyrics fetch
  const handleLocalAudioFile = useCallback(
    async (file: File) => {
      const objectUrl = URL.createObjectURL(file);
      const rawName = file.name.replace(/\.[^/.]+$/, '').replace(/[_]+/g, ' ').trim();
      const parts = rawName.split(' - ');
      const artistGuess = parts.length > 1 ? parts[0].trim() : '';
      const titleGuess = parts.length > 1 ? parts.slice(1).join(' - ').trim() : rawName;

      loadAndPlayRealTrack({
        title: titleGuess || rawName,
        artist: artistGuess || 'Local Audio',
        audioUrl: objectUrl,
        durationMs: 180000,
        lrc: '',
        sourceType: 'internal',
      });

      // Automatically fetch synced lyrics from multi-provider chain
      try {
        const params = new URLSearchParams({
          track_name: titleGuess,
          artist_name: artistGuess,
          q: rawName,
        });
        const res = await fetch(`/api/music/lyrics?${params.toString()}`);
        const data = await res.json();
        if (data?.lrc) {
          setActiveTrack((prev) =>
            prev
              ? {
                  ...prev,
                  title: data.title || prev.title,
                  artist: data.artist || prev.artist,
                  lrc: data.lrc,
                  syncType: data.syncType,
                  provider: data.provider,
                  wordsByLine: data.wordsByLine,
                  lrclibId: data.lrclibId,
                }
              : prev
          );
        }
      } catch {
        // ignore
      }
    },
    [loadAndPlayRealTrack]
  );

  // Sync HTMLAudioElement volume with Dynamic Island volume & mute state
  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.volume = muted ? 0 : Math.min(1, Math.max(0, volume / 100));
    }
  }, [volume, muted]);

  // High-precision playback & lyrics sync clock with context-aware throttled React state updates
  useEffect(() => {
    if (!isPlaying || !activeTrack) return;

    let lastWallMs = performance.now();
    let lastReactSync = 0;

    const interval = window.setInterval(() => {
      const nowWallMs = performance.now();
      const dtMs = Math.min(250, Math.max(0, Math.round(nowWallMs - lastWallMs)));
      lastWallMs = nowWallMs;

      // When document is hidden (background / minimized), track position accurately via ref without UI renders
      if (document.hidden) {
        const dur =
          activeTrack.durationMs && activeTrack.durationMs > 5000
            ? activeTrack.durationMs
            : 210000;
        const nextVal = positionMsRef.current + dtMs;
        if (nextVal >= dur) {
          if (activeTrack.sourceType !== 'external') {
            window.setTimeout(() => handleTrackEndedRef.current(), 0);
          } else {
            window.setTimeout(() => refreshExternalOsMedia(), 300);
          }
          positionMsRef.current = 0;
        } else {
          positionMsRef.current = nextVal;
        }
        return;
      }

      // 1. If HTML5 <audio> is actively playing a local blob or HTTP FLAC stream, read its exact hardware currentTime
      const audioEl = audioElRef.current;
      if (audioEl && activeTrack.audioUrl && !audioEl.paused && audioEl.currentTime > 0) {
        const nextPos = Math.round(audioEl.currentTime * 1000);
        positionMsRef.current = nextPos;

        // Context-aware React state throttle:
        // - lyricsMode: 80ms (karaoke word sync)
        // - expanded: 250ms (fluid progress bar + clock)
        // - collapsed notch: 1000ms (1 render/sec)
        const syncThreshold = lyricsMode ? 80 : isExpanded ? 250 : 1000;
        if (nowWallMs - lastReactSync >= syncThreshold) {
          lastReactSync = nowWallMs;
          setPositionMs(nextPos);
        }
        return;
      }

      // 2. If backed by YouTube stream, only pause advancement if YouTube explicitly reports paused (2) or buffering (3),
      //    or during the initial 750ms iframe warmup when ytPlayerStateRef is still -1
      if (activeTrack.youtubeVideoId && activeTrack.sourceType !== 'external') {
        if (ytPlayerStateRef.current === 2 || ytPlayerStateRef.current === 3) {
          return;
        }
        if (
          ytPlayerStateRef.current === -1 &&
          Date.now() - lastPlayedSongTimeRef.current < 750
        ) {
          return;
        }
      }

      // 3. Advance positionMs smoothly using real wall-clock delta
      const dur =
        activeTrack.durationMs && activeTrack.durationMs > 5000
          ? activeTrack.durationMs
          : 210000;
      const prev = positionMsRef.current;
      if (prev + dtMs >= dur) {
        if (activeTrack.sourceType !== 'external') {
          window.setTimeout(() => handleTrackEndedRef.current(), 0);
        } else {
          window.setTimeout(() => refreshExternalOsMedia(), 300);
        }
        positionMsRef.current = 0;
        setPositionMs(0);
        return;
      }
      const nextVal = prev + dtMs;
      positionMsRef.current = nextVal;

      const syncThreshold = lyricsMode ? 80 : isExpanded ? 250 : 1000;
      if (nowWallMs - lastReactSync >= syncThreshold) {
        lastReactSync = nowWallMs;
        setPositionMs(nextVal);
      }
    }, 60);

    return () => window.clearInterval(interval);
  }, [isPlaying, activeTrack, refreshExternalOsMedia, isExpanded, lyricsMode]);

  // Immediate sync when opening/expanding Island so progress & lyrics are accurate on the exact frame
  useEffect(() => {
    if (isExpanded && isPlaying) {
      setPositionMs(positionMsRef.current);
    }
  }, [isExpanded, isPlaying]);

  const formatTrackTime = (ms: number, remaining = false) => {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${remaining ? '-' : ''}${m}:${s}`;
  };

  // ── Page 2: Real Notifications & Do Not Disturb State (Persisted, Zero Fake Placeholders) ──
  const [dndEnabled, setDndEnabled] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const saved = window.localStorage.getItem('isle_notifications_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return pruneStaleNotifications(parsed);
      }
    } catch {
      // ignore
    }
    const nowTs = Date.now();
    return [
      {
        id: nowTs - 2000,
        createdAt: nowTs - 2000,
        iconType: 'calendar',
        title: 'Lunch with Maya',
        subtitle: 'Today at 12:30 · Kopi Kenangan',
        timeAgo: 'now',
        unread: true,
      },
      {
        id: nowTs - 1000,
        createdAt: nowTs - 1000,
        iconType: 'message',
        title: 'Raka',
        subtitle: 'The new island looks amazing 🔥',
        timeAgo: 'now',
        unread: true,
      },
    ];
  });
  const [newNotifInput, setNewNotifInput] = useState('');
  const [replyingNotifId, setReplyingNotifId] = useState<number | null>(null);
  const [replyNotifText, setReplyNotifText] = useState('');
  const [browserNotifPerm, setBrowserNotifPerm] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_notifications_v2', JSON.stringify(notifications.slice(0, 30)));
    } catch {
      // ignore
    }
  }, [notifications]);

  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => n.unread).length,
    [notifications]
  );

  const pushRealNotification = useCallback(
    (title: string, subtitle: string, iconType: 'calendar' | 'download' | 'message' = 'message') => {
      const cleanTitle = title.trim().slice(0, 80);
      const cleanSub = subtitle.trim().slice(0, 140);
      if (!cleanTitle) return;

      const now = new Date();
      const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const createdAt = now.getTime();

      setNotifications((prev) => [
        {
          id: createdAt + Math.floor(Math.random() * 1000),
          createdAt,
          iconType,
          title: cleanTitle,
          subtitle: cleanSub || 'Isle System Notification',
          timeAgo: stamp,
          unread: true,
        },
        ...prev.slice(0, 24),
      ]);

      if (!dndEnabled) {
        triggerAlert('notification', {
          confirmTitle: cleanTitle,
          confirmSubtitle: cleanSub,
          confirmCategory: 'system',
        });
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(cleanTitle, { body: cleanSub });
          } catch {
            // ignore
          }
        }
      }
    },
    [dndEnabled, triggerAlert]
  );

  // Automatically clear expired/stale notifications (> 7 days) from localStorage & memory
  useEffect(() => {
    const unbind = initNotificationPruning({
      onPruned: () => {
        setNotifications((prev) => pruneStaleNotifications(prev));
      },
    });
    return unbind;
  }, []);

  // ── Page 3: Focus / Pomodoro State ──
  const [pomoMode, setPomoMode] = useState<'focus' | 'break'>('focus');
  const [pomoTotalSeconds, setPomoTotalSeconds] = useState(25 * 60);
  const [pomoRemainingSeconds, setPomoRemainingSeconds] = useState(25 * 60);
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoSessionsCompleted, setPomoSessionsCompleted] = useState<number>(() => {
    try {
      const saved = window.localStorage.getItem('isle_pomo_sessions_v2');
      return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_pomo_sessions_v2', String(pomoSessionsCompleted));
    } catch {
      // ignore
    }
  }, [pomoSessionsCompleted]);

  useEffect(() => {
    if (!pomoRunning) return;
    let lastSec = Math.floor(Date.now() / 1000);
    const t = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      const elapsed = Math.max(1, nowSec - lastSec);
      lastSec = nowSec;
      setPomoRemainingSeconds((prev) => {
        if (prev <= elapsed) {
          setPomoRunning(false);
          // Play subtle, pleasing finish chime so user hears it even if looking away
          try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
              const ctx = new AudioCtx();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(587.33, ctx.currentTime);
              osc.frequency.setValueAtTime(880, ctx.currentTime + 0.14);
              gain.gain.setValueAtTime(0.22, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start();
              osc.stop(ctx.currentTime + 0.75);
            }
          } catch {
            // ignore audio error
          }

          if (pomoMode === 'focus') {
            setPomoSessionsCompleted((s) => s + 1);
            triggerActionConfirmation(
              'Focus Session Selesai!',
              'Waktu fokus selesai — istirahat sejenak',
              '00:00',
              'timer',
              2
            );
            pushRealNotification(
              'Focus Session Selesai!',
              'Waktu fokus selesai — saatnya istirahat sejenak.',
              'calendar'
            );
          } else {
            triggerActionConfirmation(
              'Waktu Break Selesai!',
              'Siap kembali lanjut fokus?',
              '00:00',
              'timer',
              2
            );
            pushRealNotification(
              'Waktu Break Selesai!',
              'Siap kembali lanjut fokus?',
              'calendar'
            );
          }
          return 0;
        }
        return prev - elapsed;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pomoRunning, pomoMode, pushRealNotification, triggerActionConfirmation]);

  const formatPomoTime = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Page 4: Real Tasks / ToDoList State (Persisted, Zero Fake Placeholders) ──
  const [tasks, setTasks] = useState<ToDoItem[]>(() => {
    try {
      const saved = window.localStorage.getItem('isle_tasks_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskInput, setNewTaskInput] = useState('');
  const [newTaskTime, setNewTaskTime] = useState<string>(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [editingTaskTimeId, setEditingTaskTimeId] = useState<number | null>(null);
  const completedCount = useMemo(() => tasks.filter((t) => t.done).length, [tasks]);

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_tasks_v2', JSON.stringify(tasks.slice(0, 40)));
    } catch {
      // ignore
    }
  }, [tasks]);

  // ── Page 6: Real Calendar State (Synced to Live System Clock & Persisted in localStorage) ──
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDate());
  const [newEventInput, setNewEventInput] = useState('');
  const [showWorldClocks, setShowWorldClocks] = useState(false);
  const [eventsByDate, setEventsByDate] = useState<Record<string, CalendarEventItem[]>>(() => {
    try {
      const saved = window.localStorage.getItem('isle_calendar_events_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }
    return {};
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_calendar_events_v2', JSON.stringify(eventsByDate));
    } catch {
      // ignore
    }
  }, [eventsByDate]);

  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calYear, calMonth]);

  const currentDateKey = `${calYear}-${calMonth}-${selectedDay}`;
  const selectedDayEvents = eventsByDate[currentDateKey] || [];

  const handleAddCalendarEvent = useCallback(
    (rawText: string) => {
      const trimmed = rawText.trim().slice(0, 100);
      if (!trimmed) return;
      const match = trimmed.match(/^(.*?)\s+(\d{1,2}[:.]\d{2})$/);
      const title = match ? match[1].trim() : trimmed;
      const time = match ? match[2].replace('.', ':') : timeStr;

      setEventsByDate((prev) => {
        const existing = prev[currentDateKey] || [];
        if (existing.length >= 25) return prev; // Chaos cap
        return {
          ...prev,
          [currentDateKey]: [
            ...existing,
            { id: Date.now() + Math.floor(Math.random() * 1000), title, time, color: '#ff9f0a' },
          ],
        };
      });
      pushRealNotification(
        `Jadwal: ${title}`,
        `${selectedDay} ${SHORT_MONTHS[calMonth]} ${calYear} · ${time}`,
        'calendar'
      );
      setNewEventInput('');
    },
    [calMonth, calYear, currentDateKey, pushRealNotification, selectedDay, timeStr]
  );

  // ── Smart Alarms (Persisted in localStorage & triggered via Island notch) ──
  const [smartAlarms, setSmartAlarms] = useState<SmartAlarm[]>(() => {
    try {
      const saved = window.localStorage.getItem('isle_smart_alarms');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [
      {
        id: 'alarm-default-1',
        time: '09:00',
        title: 'Morning Standup',
        enabled: true,
        createdAt: Date.now(),
      },
    ];
  });

  const [calendarSubTab, setCalendarSubTab] = useState<'events' | 'alarms'>('events');
  const [newAlarmTime, setNewAlarmTime] = useState('09:30');
  const [newAlarmTitle, setNewAlarmTitle] = useState('');
  const lastTriggeredMinuteRef = useRef<string>('');

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_smart_alarms', JSON.stringify(smartAlarms));
    } catch {
      // ignore
    }
  }, [smartAlarms]);

  // Tick checker: Trigger Dynamic Island Reminder Alert when an enabled Smart Alarm OR a scheduled Task matches HH:mm
  useEffect(() => {
    if (!timeStr) return;
    const currentMinKey = `${nowDate.toDateString()}-${timeStr}`;
    if (lastTriggeredMinuteRef.current === currentMinKey) return;

    const matchedAlarm = smartAlarms.find((a) => a.enabled && a.time === timeStr);
    if (matchedAlarm) {
      lastTriggeredMinuteRef.current = currentMinKey;
      triggerAlert('alarm', {
        alarmId: matchedAlarm.id,
        alarmTitle: matchedAlarm.title,
        alarmTime: matchedAlarm.time,
      });
      pushRealNotification(
        `Alarm: ${matchedAlarm.title}`,
        `Waktu alarm tercapai pukul ${matchedAlarm.time}`,
        'calendar'
      );
      return;
    }

    const matchedTask = tasks.find((t) => !t.done && t.time && t.time === timeStr);
    if (matchedTask) {
      lastTriggeredMinuteRef.current = currentMinKey;
      triggerAlert('alarm', {
        alarmId: `task-${matchedTask.id}`,
        alarmTitle: `Task: ${matchedTask.title}`,
        alarmTime: matchedTask.time,
      });
      pushRealNotification(
        `Pengingat Task: ${matchedTask.title}`,
        `Jadwal task pukul ${matchedTask.time} telah tiba`,
        'calendar'
      );
    }
  }, [timeStr, smartAlarms, tasks, nowDate, triggerAlert, pushRealNotification]);

  const handleToggleAlarm = useCallback((id: string) => {
    setSmartAlarms((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
  }, []);

  const handleDeleteAlarm = useCallback((id: string) => {
    setSmartAlarms((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleAddSmartAlarm = useCallback(
    (time: string, rawTitle: string) => {
      const cleanTitle = rawTitle.trim() || `Alarm ${time}`;
      const newAlarm: SmartAlarm = {
        id: `alarm-${Date.now()}`,
        time: time || '09:00',
        title: cleanTitle,
        enabled: true,
        createdAt: Date.now(),
      };
      setSmartAlarms((prev) => [newAlarm, ...prev.slice(0, 19)]);
      setNewAlarmTitle('');
      pushRealNotification('Smart Alarm Dibuat', `${cleanTitle} pada ${time}`, 'calendar');
    },
    [pushRealNotification]
  );

  const handleSnoozeAlarm = useCallback(
    (alarmId?: string) => {
      setActiveAlert(null);
      const snoozeDate = new Date(Date.now() + 5 * 60 * 1000);
      const shh = String(snoozeDate.getHours()).padStart(2, '0');
      const smm = String(snoozeDate.getMinutes()).padStart(2, '0');
      const snoozeTime = `${shh}:${smm}`;

      if (alarmId && alarmId.startsWith('task-')) {
        const taskIdNum = parseInt(alarmId.replace('task-', ''), 10);
        setTasks((prev) =>
          prev.map((t) => (t.id === taskIdNum ? { ...t, time: snoozeTime } : t))
        );
      } else if (alarmId) {
        setSmartAlarms((prev) =>
          prev.map((a) => (a.id === alarmId ? { ...a, time: snoozeTime, enabled: true } : a))
        );
      }
      pushRealNotification(
        'Pengingat Ditunda 5 Menit',
        `Akan muncul kembali di Dynamic Island pukul ${snoozeTime}`,
        'calendar'
      );
    },
    [pushRealNotification]
  );

  // ── Page 7: Real-Time Weather & Solar Arc State (Auto Location + Manual City Override via Open-Meteo) ──
  const [weatherData, setWeatherData] = useState<WeatherData>(() => {
    const h = new Date().getHours();
    let savedCity = 'Jakarta';
    try {
      const fromStorage = window.localStorage.getItem('isle_weather_city');
      if (fromStorage && fromStorage.trim()) savedCity = fromStorage.trim();
    } catch {
      // ignore
    }
    return {
      city: savedCity,
      currentTemp: 28,
      apparentTemp: 31,
      humidity: 70,
      windSpeed: 10,
      tempMax: 32,
      tempMin: 24,
      precipitationProb: 20,
      weatherCode: 2,
      isDay: h >= 6 && h < 18,
      sunrise: '5:49',
      sunset: '17:52',
      timezone: 'Asia/Jakarta',
      hourly: Array.from({ length: 7 }, (_, i) => ({
        time: `${String((h + i) % 24).padStart(2, '0')}:00`,
        temp: 28 - (i % 3),
        code: i < 3 ? 2 : 3,
        precipitationProb: 15,
      })),
    };
  });
  const [editingWeatherCity, setEditingWeatherCity] = useState(false);
  const [weatherCityInput, setWeatherCityInput] = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherTransitioning, setWeatherTransitioning] = useState(false);
  const [weatherAnimTick, setWeatherAnimTick] = useState(0);
  const [animatedSunT, setAnimatedSunT] = useState<number>(0.48);
  const animatedSunTRef = useRef<number>(0.48);

  // Compute target solar progress (0.08 .. 0.92) from the location's sunrise, sunset, and timezone offset
  const { targetSunT, isWeatherNight } = useMemo(() => {
    const parseClockMin = (str: string, defMin: number) => {
      const m = str.match(/(\d{1,2}):(\d{2})/);
      if (!m) return defMin;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    const sunriseMin = parseClockMin(weatherData.sunrise, 5 * 60 + 49);
    const sunsetMin = parseClockMin(weatherData.sunset, 17 * 60 + 52);
    let cityNowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
    if (typeof weatherData.utcOffsetSeconds === 'number') {
      const cityDate = new Date(nowDate.getTime() + weatherData.utcOffsetSeconds * 1000);
      cityNowMin = cityDate.getUTCHours() * 60 + cityDate.getUTCMinutes();
    }

    const isDayWindow =
      sunsetMin > sunriseMin && cityNowMin >= sunriseMin && cityNowMin < sunsetMin;

    if (isDayWindow) {
      const dayDuration = Math.max(1, sunsetMin - sunriseMin);
      const rawDayProgress = (cityNowMin - sunriseMin) / dayDuration;
      return {
        targetSunT: Math.min(0.92, Math.max(0.08, rawDayProgress)),
        isWeatherNight: false,
      };
    }

    const nightDuration = Math.max(1, 1440 - sunsetMin + sunriseMin);
    const elapsedNight =
      cityNowMin >= sunsetMin
        ? cityNowMin - sunsetMin
        : cityNowMin + 1440 - sunsetMin;
    const rawNightProgress = elapsedNight / nightDuration;
    return {
      targetSunT: Math.min(0.92, Math.max(0.08, rawNightProgress)),
      isWeatherNight: true,
    };
  }, [weatherData.sunrise, weatherData.sunset, weatherData.utcOffsetSeconds, nowDate]);

  // Smoothly animate the sun & active horizon arc along the quadratic Bezier curve whenever location or sunrise/sunset updates
  useEffect(() => {
    const currentT = animatedSunTRef.current;
    const startT =
      Math.abs(targetSunT - currentT) < 0.025 && weatherAnimTick > 0
        ? Math.max(0.08, targetSunT - 0.16)
        : currentT;
    const deltaT = targetSunT - startT;
    if (Math.abs(deltaT) < 0.001) {
      animatedSunTRef.current = targetSunT;
      setAnimatedSunT(targetSunT);
      return;
    }

    let rafId = 0;
    const durationMs = 640;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const p = Math.min(1, Math.max(0, elapsed / durationMs));
      const eased = 1 - Math.pow(1 - p, 3);
      const nextVal = startT + deltaT * eased;
      animatedSunTRef.current = nextVal;
      setAnimatedSunT(nextVal);
      if (p < 1) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [targetSunT, weatherAnimTick]);

  const fetchWeatherData = useCallback(async (customCity?: string) => {
    setWeatherLoading(true);
    if (customCity !== undefined) {
      setWeatherTransitioning(true);
    }
    const targetCity =
      customCity !== undefined
        ? customCity.trim()
        : (() => {
            try {
              return window.localStorage.getItem('isle_weather_city') || '';
            } catch {
              return '';
            }
          })();

    const saveCityPreference = (cityVal: string) => {
      if (customCity === undefined) return;
      try {
        if (cityVal.trim()) {
          window.localStorage.setItem('isle_weather_city', cityVal.trim());
        } else {
          window.localStorage.removeItem('isle_weather_city');
        }
      } catch {
        // ignore
      }
    };

    try {
      // 1. Try Direct Open-Meteo Geocoding + Accurate Forecast
      let resolvedCity = targetCity || 'Jakarta';
      let lat = -6.2088;
      let lon = 106.8456;
      let coordsFound = false;

      if (targetCity) {
        try {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
              targetCity
            )}&count=5&format=json`
          );
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const results: any[] = Array.isArray(geoData?.results) ? geoData.results : [];
            if (results.length > 0) {
              const idMatch = results.find((r) => r.country_code?.toUpperCase() === 'ID');
              const best =
                idMatch ||
                [...results].sort((a, b) => (b.population || 0) - (a.population || 0))[0] ||
                results[0];
              resolvedCity = best.name || targetCity;
              lat = typeof best.latitude === 'number' ? best.latitude : lat;
              lon = typeof best.longitude === 'number' ? best.longitude : lon;
              coordsFound = true;
            }
          }
        } catch {
          // fallback to /api/weather below
        }
      } else {
        // Auto-detect: First attempt HTML5 device GPS if available and fast
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          try {
            const gpsCoords = await new Promise<{ lat: number; lon: number } | null>((res) => {
              const tm = setTimeout(() => res(null), 2000);
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  clearTimeout(tm);
                  res({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                },
                () => {
                  clearTimeout(tm);
                  res(null);
                },
                { timeout: 1900, maximumAge: 300000, enableHighAccuracy: false }
              );
            });
            if (gpsCoords) {
              lat = gpsCoords.lat;
              lon = gpsCoords.lon;
              coordsFound = true;
              // Try reverse geocoding with OpenStreetMap Nominatim for clean city name
              try {
                const revRes = await fetch(
                  `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
                  { headers: { 'Accept-Language': 'id' } }
                );
                if (revRes.ok) {
                  const revData = await revRes.json();
                  const addr = revData?.address || {};
                  const foundCity =
                    addr.city || addr.town || addr.city_district || addr.county || addr.state;
                  if (foundCity) {
                    resolvedCity = String(foundCity).replace(/^(Kota|Kabupaten)\s+/i, '');
                  }
                }
              } catch {
                // keep resolvedCity
              }
            }
          } catch {
            // ignore GPS error
          }
        }

        if (!coordsFound) {
          try {
            const ipRes = await fetch('https://ipwho.is/');
            if (ipRes.ok) {
              const ipData = await ipRes.json();
              if (ipData?.success && typeof ipData.latitude === 'number' && typeof ipData.longitude === 'number') {
                resolvedCity = ipData.city || resolvedCity;
                lat = ipData.latitude;
                lon = ipData.longitude;
                coordsFound = true;
              }
            }
          } catch {
            // fallback below
          }
        }
      }

      if (coordsFound) {
        const wRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=3`
        );
        if (wRes.ok) {
          const wData = await wRes.json();
          const currentTemp = Math.round(Number(wData?.current?.temperature_2m ?? 28));
          const apparentTemp = Math.round(Number(wData?.current?.apparent_temperature ?? currentTemp));
          const humidity = Math.round(Number(wData?.current?.relative_humidity_2m ?? 70));
          const windSpeed = Math.round(Number(wData?.current?.wind_speed_10m ?? 10));
          const weatherCode = Number(wData?.current?.weather_code ?? 1);
          const isDay = Number(wData?.current?.is_day ?? 1) === 1;

          const tempMax = Math.round(Number(wData?.daily?.temperature_2m_max?.[0] ?? currentTemp + 2));
          const tempMin = Math.round(Number(wData?.daily?.temperature_2m_min?.[0] ?? currentTemp - 4));
          const precipitationProb = Math.round(Number(wData?.daily?.precipitation_probability_max?.[0] ?? 0));

          const utcOffsetSeconds =
            typeof wData?.utc_offset_seconds === 'number' ? wData.utc_offset_seconds : undefined;
          const fmtClock = (iso: string, fallback: string) => {
            const part = String(iso || '').split('T')[1];
            if (!part) return fallback;
            const [hh, mm] = part.split(':');
            return `${parseInt(hh, 10)}:${mm || '00'}`;
          };
          const sunrise = fmtClock(wData?.daily?.sunrise?.[0] || '', '5:49');
          const sunset = fmtClock(wData?.daily?.sunset?.[0] || '', '17:52');
          const times: string[] = Array.isArray(wData?.hourly?.time) ? wData.hourly.time : [];
          const temps: number[] = Array.isArray(wData?.hourly?.temperature_2m) ? wData.hourly.temperature_2m : [];
          const codes: number[] = Array.isArray(wData?.hourly?.weather_code) ? wData.hourly.weather_code : [];
          const precipProbs: number[] = Array.isArray(wData?.hourly?.precipitation_probability) ? wData.hourly.precipitation_probability : [];

          // Exact current hour match using Open-Meteo's current timestamp
          const currentIso = String(wData?.current?.time || '');
          let startIdx = times.findIndex((t) => currentIso && t.slice(0, 13) === currentIso.slice(0, 13));
          if (startIdx < 0) {
            let localHour = new Date().getHours();
            if (typeof utcOffsetSeconds === 'number') {
              localHour = new Date(Date.now() + utcOffsetSeconds * 1000).getUTCHours();
            }
            const nowHourStr = String(localHour).padStart(2, '0') + ':00';
            startIdx = times.findIndex((t) => t.endsWith(`T${nowHourStr}`));
            if (startIdx < 0) startIdx = Math.max(0, localHour);
          }

          const hourly = Array.from({ length: 7 }, (_, i) => {
            const idx = startIdx + i;
            const tIso = times[idx] || '';
            return {
              time: tIso.includes('T')
                ? tIso.split('T')[1].slice(0, 5)
                : `${String((startIdx + i) % 24).padStart(2, '0')}:00`,
              temp: typeof temps[idx] === 'number' ? Math.round(temps[idx]) : currentTemp,
              code: typeof codes[idx] === 'number' ? codes[idx] : weatherCode,
              precipitationProb: typeof precipProbs[idx] === 'number' ? Math.round(precipProbs[idx]) : 0,
            };
          });

          setWeatherData({
            city: resolvedCity,
            currentTemp,
            apparentTemp,
            humidity,
            windSpeed,
            tempMax,
            tempMin,
            precipitationProb,
            weatherCode,
            isDay,
            sunrise,
            sunset,
            timezone: wData?.timezone || 'Asia/Jakarta',
            utcOffsetSeconds,
            hourly,
          });
          setWeatherAnimTick((t) => t + 1);
          saveCityPreference(targetCity ? resolvedCity : '');
          return;
        }
      }

      // 2. Fallback to backend /api/weather endpoint
      let url = '/api/weather';
      if (targetCity) {
        url = `/api/weather?city=${encodeURIComponent(targetCity)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data?.ok) {
          setWeatherData((prev) => ({
            city: data.city || targetCity || 'Jakarta',
            currentTemp: typeof data.currentTemp === 'number' ? data.currentTemp : 28,
            apparentTemp: typeof data.apparentTemp === 'number' ? data.apparentTemp : prev.apparentTemp,
            humidity: typeof data.humidity === 'number' ? data.humidity : prev.humidity,
            windSpeed: typeof data.windSpeed === 'number' ? data.windSpeed : prev.windSpeed,
            tempMax: typeof data.tempMax === 'number' ? data.tempMax : prev.tempMax,
            tempMin: typeof data.tempMin === 'number' ? data.tempMin : prev.tempMin,
            precipitationProb: typeof data.precipitationProb === 'number' ? data.precipitationProb : prev.precipitationProb,
            weatherCode: typeof data.weatherCode === 'number' ? data.weatherCode : 2,
            isDay: Boolean(data.isDay ?? true),
            sunrise: data.sunrise || '5:49',
            sunset: data.sunset || '17:52',
            timezone: data.timezone || prev.timezone,
            utcOffsetSeconds:
              typeof data.utcOffsetSeconds === 'number' ? data.utcOffsetSeconds : undefined,
            hourly:
              Array.isArray(data.hourly) && data.hourly.length > 0
                ? data.hourly.slice(0, 7)
                : prev.hourly,
          }));
          setWeatherAnimTick((t) => t + 1);
          saveCityPreference(targetCity);
        }
      }
    } catch {
      // ignore
    } finally {
      setWeatherLoading(false);
      window.setTimeout(() => setWeatherTransitioning(false), 160);
    }
  }, []);

  useEffect(() => {
    fetchWeatherData();
    const id = window.setInterval(() => fetchWeatherData(), 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [fetchWeatherData]);

  // ── Unified Command Executor for Voice & Chat AI (Tasks, Timers, Smart Alarms, Weather, Lyrics Seek, Volume, Brightness, Music) ──
  const executeIslandCommand = useCallback(
    (raw: string): { handled: boolean; reply?: string } => {
      const p = raw.trim().toLowerCase();
      if (!p) return { handled: false };

      const INDO_NUMS: Record<string, number> = {
        satu: 1, se: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6,
        tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11,
        duabelas: 12, limabelas: 15, duapuluh: 20, tigapuluh: 30, setengah: 0.5,
      };

      const parseNum = (str: string): number => {
        const clean = str.trim().toLowerCase();
        if (INDO_NUMS[clean] !== undefined) return INDO_NUMS[clean];
        const n = parseFloat(clean);
        return Number.isFinite(n) ? n : 1;
      };

      // 0. Dynamic Windows App Launch ("buka discord", "tolong buka spotify", "open chrome", "jalankan whatsapp")
      const appLaunchMatch = raw.match(
        /\b(?:tolong\s+)?(?:buka(?:kan|in)?|jalankan|run|open|launch|start)\s+(?:aplikasi|app|program|software)?\s*([a-zA-Z0-9_\-\.\s]{2,40})/i
      );
      if (appLaunchMatch && appLaunchMatch[1]) {
        const rawTarget = appLaunchMatch[1].trim();
        const isInternalTrigger =
          /\b(terminal|cmd|powershell|cuaca|weather|shelf|notifikasi|notification|tugas|task|todo|kalender|calendar|pomodoro|timer|lirik|lyrics|lagu|musik|bluetooth|wifi|wi-fi|kecerahan|brightness|volume|mini capsule|kapsul mini)\b/i.test(
            rawTarget
          );
        if (!isInternalTrigger) {
          const cleanAppName = rawTarget
            .replace(/\b(sekarang|dong|ya|bro|please|plis)\b/gi, '')
            .trim();
          if (cleanAppName.length >= 2) {
            fetch('/api/system/launch-app', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ appName: cleanAppName }),
            })
              .then((r) => r.json())
              .then((res) => {
                if (res?.success) {
                  const resolvedName = res.matchedName || cleanAppName;
                  triggerActionConfirmation(
                    `Membuka ${resolvedName}`,
                    `“Buka ${resolvedName}”`,
                    'OPEN',
                    'system'
                  );
                }
              })
              .catch(() => {});

            triggerActionConfirmation(
              `Membuka ${cleanAppName}`,
              `“Buka ${cleanAppName}”`,
              'OPEN',
              'system'
            );
            pushRealNotification(
              'Membuka Aplikasi',
              `Meluncurkan ${cleanAppName} di Windows...`,
              'message'
            );
            return {
              handled: true,
              reply: `Membuka ${cleanAppName}...`,
            };
          }
        }
      }

      // 0a. Scheduled Task / To-Do ("tambahin task olahraga di jam 5 pagi", "tambahkan tugas untuk besok", "buat task meeting jam 14:30")
      const todoCmdMatch = raw.match(
        /\b(?:tambah(?:in|kan)?|buat(?:in|kan)?|bikin(?:in|kan)?|catat(?:kan)?|jadwalkan|masukin|masukkan|add|create|set)\s+(?:jadwal\s+)?(?:task|tugas|todo|to-do|kerjaan|agenda)\s+(.+)/i
      );
      if (todoCmdMatch && todoCmdMatch[1]) {
        let rawTask = todoCmdMatch[1].trim();
        const isTomorrow = /\bbesok\b/i.test(rawTask);
        let taskTime = isTomorrow ? '09:00' : timeStr;
        const todTimeMatch = rawTask.match(
          /^(.*?)\s*(?:di\s+|pada\s+)?(?:jam|pukul|at)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(pagi|siang|sore|malam|am|pm)?\b(.*)$/i
        );
        if (todTimeMatch) {
          let hh = parseInt(todTimeMatch[2], 10);
          const mm = todTimeMatch[3] ? parseInt(todTimeMatch[3], 10) : 0;
          const period = (todTimeMatch[4] || '').toLowerCase();
          if ((period === 'sore' || period === 'malam' || period === 'pm') && hh < 12) hh += 12;
          if (period === 'siang' && hh >= 1 && hh <= 4) hh += 12;
          if ((period === 'pagi' || period === 'am') && hh === 12) hh = 0;
          taskTime = `${String(Math.min(23, Math.max(0, hh))).padStart(2, '0')}:${String(
            Math.min(59, Math.max(0, mm))
          ).padStart(2, '0')}`;
          rawTask = `${todTimeMatch[1] || ''} ${todTimeMatch[5] || ''}`.replace(/\s+/g, ' ').trim();
        }
        const strippedTitle = rawTask
          .replace(/^(?:baru|untuk|buat|yaitu|di)\s+/i, '')
          .replace(/\s+(?:di|pada)$/i, '')
          .trim();
        const cleanTitle =
          !strippedTitle || /^besok$/i.test(strippedTitle)
            ? 'Tugas Besok'
            : strippedTitle;

        setTasks((prev) => [
          ...prev.slice(-29),
          {
            id: Date.now(),
            title: cleanTitle,
            time: taskTime,
            done: false,
          },
        ]);
        pushRealNotification(
          `Task Dijadwalkan: ${cleanTitle}`,
          `Pengingat aktif pukul ${taskTime}`,
          'calendar'
        );
        triggerActionConfirmation('Task Dijadwalkan', cleanTitle, taskTime, 'task', 3);
        return {
          handled: true,
          reply: `Siap! Task "${cleanTitle}" sudah ditambahkan untuk pukul ${taskTime}.`,
        };
      }

      // 0b. Custom Timer / Pomodoro Duration ("set timer 15 menit", "atur timer 10 menit", "timer 20 menit")
      const timerCmdMatch =
        raw.match(
          /\b(?:set|atur|buat|pasang|mulai|start|nyalain|nyalakan)\s+(?:waktu\s+)?(?:timer|fokus|pomodoro|hitung mundur)\s*(?:selama|untuk)?\s*(satu|dua|tiga|empat|lima|sepuluh|limabelas|duapuluh|tigapuluh|\d{1,3})\s*(menit|detik|jam|min|m|s)\b/i
        ) ||
        raw.match(
          /\b(?:timer|pomodoro)\s+(satu|dua|tiga|empat|lima|sepuluh|limabelas|duapuluh|tigapuluh|\d{1,3})\s*(menit|detik|jam|min|m|s)\b/i
        );
      if (timerCmdMatch && timerCmdMatch[1]) {
        const val = parseNum(timerCmdMatch[1]);
        const unit = (timerCmdMatch[2] || 'menit').toLowerCase();
        const totalSec =
          unit === 'detik' || unit === 's'
            ? Math.max(5, Math.round(val))
            : unit === 'jam'
            ? Math.round(val * 3600)
            : Math.max(60, Math.round(val * 60));
        setPomoMode('focus');
        setPomoTotalSeconds(totalSec);
        setPomoRemainingSeconds(totalSec);
        setPomoRunning(true);
        const badgeStr = formatPomoTime(totalSec);
        pushRealNotification('Timer Fokus Dimulai', `Durasi diatur ke ${badgeStr}`, 'calendar');
        triggerActionConfirmation('Timer Fokus Aktif', 'Hitung mundur berjalan', badgeStr, 'timer', 2);
        return {
          handled: true,
          reply: `Timer fokus selama ${badgeStr} sudah dimulai di Dynamic Island.`,
        };
      }

      // 1. Reminder & Smart Alarm System ("dalam satu menit ingetin aku manasin motor", "pasang alarm jam 5 pagi", etc.)
      const relMatch1 = raw.match(
        /(?:dalam|setelah)?\s*(satu|se|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|\d+)\s*(menit|jam)\s*(?:lagi)?\s*(?:ingetin|ingatkan|remind me to|remind me|alarm|pengingat)?\s*(?:aku|saya)?\s*(.*)/i
      );
      const relMatch2 = raw.match(
        /(?:ingetin|ingatkan|remind me to|remind me|buatkan pengingat|pasang alarm|alarm)\s*(?:aku|saya)?\s*(.*?)\s*(?:dalam|setelah)\s*(satu|se|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|\d+)\s*(menit|jam)/i
      );
      const relMatch3 = raw.match(
        /(?:ingetin|ingatkan|remind me)\s*(?:aku|saya)?\s*(satu|se|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|\d+)\s*(menit|jam)\s*(?:lagi)?\s*(?:untuk|buat)?\s*(.*)/i
      );

      let minutesToAdd: number | null = null;
      let extractedTitle = '';

      if (relMatch1 && (p.includes('inget') || p.includes('alarm') || p.includes('remind') || p.includes('pengingat'))) {
        const numVal = parseNum(relMatch1[1]);
        const unit = relMatch1[2].toLowerCase();
        minutesToAdd = unit === 'jam' ? numVal * 60 : numVal;
        extractedTitle = relMatch1[3]?.trim() || '';
      } else if (relMatch2) {
        const numVal = parseNum(relMatch2[3]);
        const unit = relMatch2[4].toLowerCase();
        minutesToAdd = unit === 'jam' ? numVal * 60 : numVal;
        extractedTitle = relMatch2[1]?.trim() || '';
      } else if (relMatch3) {
        const numVal = parseNum(relMatch3[1]);
        const unit = relMatch3[2].toLowerCase();
        minutesToAdd = unit === 'jam' ? numVal * 60 : numVal;
        extractedTitle = relMatch3[3]?.trim() || '';
      }

      // Absolute time matching: "ingatkan jam 18:30 meeting", "pasang alarm jam 5 pagi lari"
      const absMatch = raw.match(
        /(?:ingetin|ingatkan|remind me|alarm|pasang alarm|set alarm|buat alarm)\s*(?:aku|saya)?\s*(?:di\s+|pada\s+)?(?:jam|pukul)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(pagi|siang|sore|malam|am|pm)?\s*(?:buat|untuk)?\s*(.*)/i
      );
      let targetTimeStr = '';

      if (minutesToAdd !== null && minutesToAdd > 0) {
        const targetDate = new Date(Date.now() + Math.round(minutesToAdd * 60 * 1000));
        const th = String(targetDate.getHours()).padStart(2, '0');
        const tm = String(targetDate.getMinutes()).padStart(2, '0');
        targetTimeStr = `${th}:${tm}`;
      } else if (absMatch) {
        let hh = parseInt(absMatch[1], 10);
        const mm = absMatch[2] ? parseInt(absMatch[2], 10) : 0;
        const period = (absMatch[3] || '').toLowerCase();
        if ((period === 'sore' || period === 'malam' || period === 'pm') && hh < 12) hh += 12;
        if (period === 'siang' && hh >= 1 && hh <= 4) hh += 12;
        if ((period === 'pagi' || period === 'am') && hh === 12) hh = 0;
        targetTimeStr = `${String(Math.min(23, Math.max(0, hh))).padStart(2, '0')}:${String(
          Math.min(59, Math.max(0, mm))
        ).padStart(2, '0')}`;
        extractedTitle = absMatch[4]?.trim() || '';
      }

      if (targetTimeStr) {
        let cleanTitle = extractedTitle
          .replace(/^(?:untuk|buat|tentang|soal)\s+/i, '')
          .replace(/\b(?:dalam|setelah|lagi|ingetin|ingatkan|aku|saya)\b/gi, '')
          .trim();
        if (!cleanTitle) cleanTitle = 'Pengingat';

        // Add to Smart Alarms
        const newAlarm: SmartAlarm = {
          id: `alarm-${Date.now()}`,
          time: targetTimeStr,
          title: cleanTitle,
          enabled: true,
          createdAt: Date.now(),
        };
        setSmartAlarms((prev) => [newAlarm, ...prev.slice(0, 19)]);

        // Add to Todo List
        setTasks((prev) => [
          ...prev.slice(-29),
          {
            id: Date.now(),
            title: cleanTitle,
            time: targetTimeStr,
            done: false,
          },
        ]);

        // Push desktop notification & seamless Island confirmation alert
        pushRealNotification(
          'Smart Alarm & Pengingat Diset',
          `"${cleanTitle}" diset pukul ${targetTimeStr}`,
          'calendar'
        );
        setCalendarSubTab('alarms');
        triggerActionConfirmation('Smart Alarm Aktif', cleanTitle, targetTimeStr, 'alarm', 5);

        return {
          handled: true,
          reply: `Siap! Pengingat "${cleanTitle}" sudah dipasang pukul ${targetTimeStr} di Smart Alarm dan Tasks.`,
        };
      }

      // 1b. Weather & City Lookup ("cek cuaca", "cuaca di Bandung", "buka weather")
      const weatherCityMatch = raw.match(
        /\b(?:cek\s+cuaca|lihat\s+cuaca|info\s+cuaca|cuaca|weather|prakiraan\s+cuaca)\s+(?:di\s+|untuk\s+|kota\s+|in\s+)([a-zA-Z\s]{2,30})$/i
      );
      if (weatherCityMatch && weatherCityMatch[1]) {
        const city = weatherCityMatch[1]
          .replace(/\b(sekarang|hari ini|besok|dong|ya|bro|saat ini)\b/gi, '')
          .trim();
        if (city) {
          fetchWeatherData(city);
          triggerActionConfirmation('Cuaca Diperbarui', `Lokasi: ${city}`, `${weatherData.currentTemp}°`, 'weather', 6);
          return {
            handled: true,
            reply: `Menampilkan cuaca terkini dan kurva matahari untuk ${city}.`,
          };
        }
      }
      if (
        /\b(buka cuaca|buka menu cuaca|buka weather|open weather|cek cuaca|lihat cuaca|info cuaca|cuaca hari ini|cuaca sekarang)\b/i.test(
          p
        )
      ) {
        fetchWeatherData();
        triggerActionConfirmation(
          'Menu Weather',
          weatherData.city,
          `${weatherData.currentTemp}°`,
          'weather',
          6
        );
        return {
          handled: true,
          reply: `Membuka menu Weather untuk ${weatherData.city} (${weatherData.currentTemp}°C).`,
        };
      }

      // 1c. Mini Capsule Auto-Hide Mode (Alt + H) — Instant hide/restore with zero alert popup
      if (/\b(mini capsule|kapsul mini|sembunyikan pulau|auto hide|mode sembunyi|alt\s*\+\s*h)\b/i.test(p)) {
        const nextMini = !miniCapsuleMode;
        setActiveAlert(null);
        setMiniCapsuleMode(nextMini);
        if (nextMini) {
          setIsPinnedOpen(false);
          setIsHovered(false);
          setAssistantOpen(false);
          setLyricsMode(false);
          setSettingsOpen(false);
          setTopEdgeHover(false);
        }
        return {
          handled: true,
          reply: nextMini
            ? 'Mode Mini Capsule aktif.'
            : 'Mode normal aktif.',
        };
      }

      // 2. Brightness controls
      if (
        /\b(naikin|tambah|tambahin|tingkatin|lebih terang|terangin|cerahkan)\b.*\b(kecerahan|layar|brightness)\b|\b(kecerahan|layar|brightness)\b.*\b(naik|tambah|up)\b/.test(
          p
        )
      ) {
        setBrightness((curr) => {
          const next = Math.min(10, curr + 2);
          triggerAlert('brightness', { value: next });
          return next;
        });
        return { handled: true, reply: 'Kecerahan layar telah dinaikkan.' };
      }
      if (
        /\b(turunin|kurangi|kurangin|lebih gelap|gelapin|redupkan|turunkan)\b.*\b(kecerahan|layar|brightness)\b|\b(kecerahan|layar|brightness)\b.*\b(turun|kurang|down)\b/.test(
          p
        )
      ) {
        setBrightness((curr) => {
          const next = Math.max(1, curr - 2);
          triggerAlert('brightness', { value: next });
          return next;
        });
        return { handled: true, reply: 'Kecerahan layar telah diturunkan.' };
      }
      const briNumMatch = p.match(/\b(?:brightness|kecerahan)\b.*?(\d{1,3})/);
      if (briNumMatch) {
        const rawNum = parseInt(briNumMatch[1], 10);
        const val = Math.min(10, Math.max(1, rawNum > 10 ? Math.round(rawNum / 10) : rawNum));
        setBrightness(val);
        triggerAlert('brightness', { value: val });
        return { handled: true, reply: `Kecerahan diatur ke tingkat ${val}.` };
      }

      // 3. Volume controls
      if (
        /\b(naikin|gedein|tambah|tambahin|kerasin|perbesar|tinggikan)\b.*\b(volume|suara)\b|\b(volume|suara)\b.*\b(naik|up|tambah)\b/.test(
          p
        )
      ) {
        setMuted(false);
        setVolume((curr) => {
          const next = Math.min(100, curr + 15);
          triggerAlert('volume', { value: next });
          return next;
        });
        return { handled: true, reply: 'Volume dinaikkan.' };
      }
      if (
        /\b(turunin|kecilin|kurangi|kurangin|pelanin|rendahkan|kecilkan)\b.*\b(volume|suara)\b|\b(volume|suara)\b.*\b(turun|down|kecil)\b/.test(
          p
        )
      ) {
        setVolume((curr) => {
          const next = Math.max(0, curr - 15);
          triggerAlert('volume', { value: next });
          return next;
        });
        return { handled: true, reply: 'Volume diturunkan.' };
      }
      if (/\b(mute|bisukan|senyapkan|matikan suara)\b/.test(p)) {
        setMuted(true);
        triggerAlert('mute', { muted: true });
        return { handled: true, reply: 'Volume dibisukan (Muted).' };
      }
      if (/\b(unmute|bunyikan|nyalakan suara|suara on)\b/.test(p)) {
        setMuted(false);
        triggerAlert('volume', { value: volume });
        return { handled: true, reply: 'Suara dinyalakan kembali.' };
      }
      const volNumMatch = p.match(/\bvolume\b.*?(\d{1,3})/);
      if (volNumMatch) {
        const v = Math.min(100, Math.max(0, parseInt(volNumMatch[1], 10)));
        setMuted(v === 0);
        setVolume(v);
        triggerAlert('volume', { value: v });
        return { handled: true, reply: `Volume diatur ke ${v}%.` };
      }

      // 4. Music & Lyrics Seek Controls ("loncat ke menit 1:30", "buka lirik", Queue, Mood Shuffle, Play, Pause, Skip)
      const seekMinSecMatch = raw.match(
        /\b(?:loncat|lompat|skip|majukan|mundurkan|seek|geser)\s+(?:lagu|musik|lirik)?\s*(?:ke\s+)?(?:menit\s+|waktu\s+|detik\s+)?(\d{1,2})[:.](\d{2})\b/i
      );
      if (seekMinSecMatch) {
        const targetMs =
          (parseInt(seekMinSecMatch[1], 10) * 60 + parseInt(seekMinSecMatch[2], 10)) * 1000;
        handleSeek(targetMs);
        navigateToPage(0);
        setLyricsMode(true);
        const stamp = formatTrackTime(targetMs);
        triggerActionConfirmation('Loncat Lirik & Musik', activeTrack?.title || 'Media', stamp, 'music', 0);
        return {
          handled: true,
          reply: `Melompat ke posisi lirik ${stamp}.`,
        };
      }
      const seekSecMatch = raw.match(
        /\b(?:loncat|lompat|skip|seek|geser)\s+(?:lagu|musik|lirik)?\s*(?:ke\s+)?detik\s+(\d{1,3})\b/i
      );
      if (seekSecMatch) {
        const targetMs = parseInt(seekSecMatch[1], 10) * 1000;
        handleSeek(targetMs);
        navigateToPage(0);
        setLyricsMode(true);
        const stamp = formatTrackTime(targetMs);
        triggerActionConfirmation('Loncat Lirik & Musik', activeTrack?.title || 'Media', stamp, 'music', 0);
        return {
          handled: true,
          reply: `Melompat ke posisi lirik ${stamp}.`,
        };
      }
      if (/\b(buka lirik|tampilkan lirik|lihat lirik|show lyrics|open lyrics)\b/i.test(p)) {
        navigateToPage(0);
        setLyricsMode(true);
        setIsPinnedOpen(true);
        triggerActionConfirmation('Lyrics Mode', activeTrack?.title || 'Sinkronisasi Lirik', 'ON', 'music', 0);
        return { handled: true, reply: 'Membuka tampilan lirik lagu.' };
      }

      const queueSongMatch =
        raw.match(
          /\b(?:setelah ini|habis ini|habis lagu ini|abis ini|abis lagu ini|selanjutnya|nanti)\s+(?:tolong\s+)?(?:putar lagu|stel lagu|setel musik|setel lagu|mainkan lagu|putar musik|setel|putar|play|stel)\s+(.+)/i
        ) ||
        raw.match(
          /\b(?:masukin ke antrian|masukkan ke antrian|tambah ke antrian|tambahin ke antrian|antriin lagu|antrikan lagu|antri lagu|add to queue|queue song|queue track|play next)\s+(?:lagu\s+)?(.+)/i
        );
      if (queueSongMatch && queueSongMatch[1]) {
        const songQuery = queueSongMatch[1].trim();
        const willPlayNow = !activeTrackRef.current;
        handleQueueSongMedia(songQuery);
        navigateToPage(0);
        triggerActionConfirmation(
          willPlayNow ? 'Memutar Musik' : 'Ditambahkan ke Antrian',
          songQuery,
          willPlayNow ? 'PLAY' : '+QUEUE',
          'music',
          0
        );
        return {
          handled: true,
          reply: willPlayNow
            ? `Karena belum ada lagu yang diputar, langsung memutar "${songQuery}" sekarang.`
            : `Siap! Lagu "${songQuery}" sudah dimasukkan ke antrian dan akan otomatis diputar setelah lagu ini selesai.`,
        };
      }

      if (/\b(hapus antrian|kosongkan antrian|bersihkan antrian|clear queue)\b/i.test(p)) {
        setMusicQueue([]);
        triggerActionConfirmation('Antrian Musik', 'Antrian lagu dikosongkan', '0', 'music', 0);
        return { handled: true, reply: 'Antrian lagu telah dikosongkan.' };
      }

      if (
        /\b(matiin|matikan|nonaktifkan|stop|turn off|disable)\b.*\b(shuffle|auto\s*play|mood)\b|\bshuffle\b.*\b(mati|off)\b/i.test(
          p
        )
      ) {
        if (activeTrackRef.current?.sourceType === 'external') {
          setExternalShuffleEnabled(false);
          sendExternalMediaCommand('shuffle', false);
          triggerActionConfirmation('Shuffle Musik', activeTrackRef.current.externalApp || 'External', 'OFF', 'music', 0);
          return {
            handled: true,
            reply: `Shuffle pada ${activeTrackRef.current.externalApp || 'aplikasi musik eksternal'} telah dinonaktifkan.`,
          };
        }
        setMoodShuffleEnabled(false);
        triggerActionConfirmation('Mood Shuffle', 'Auto-shuffle dinonaktifkan', 'OFF', 'music', 0);
        return {
          handled: true,
          reply: 'Fitur Mood Shuffle internal telah dinonaktifkan.',
        };
      }

      if (
        /\b(nyalain|nyalakan|aktifkan|hidupkan|mulai|turn on|enable)\b.*\b(shuffle|mood)\b|\b(shuffle lagu|shuffle musik|shuffle mood|mood shuffle|shuffle sesuai mood|acak lagu sesuai mood|shuffle on)\b/i.test(
          p
        )
      ) {
        if (activeTrackRef.current?.sourceType === 'external') {
          setExternalShuffleEnabled(true);
          sendExternalMediaCommand('shuffle', true);
          triggerActionConfirmation('Shuffle Musik', activeTrackRef.current.externalApp || 'External', 'ON', 'music', 0);
          return {
            handled: true,
            reply: `Shuffle pada ${activeTrackRef.current.externalApp || 'aplikasi musik eksternal'} telah diaktifkan.`,
          };
        }
        setMoodShuffleEnabled(true);
        navigateToPage(0);
        triggerActionConfirmation('Mood Shuffle Aktif', 'Mix otomatis sesuai mood lagu', 'AUTO', 'music', 0);
        if (!activeTrackRef.current) {
          triggerSmartMoodShuffle(null);
          return {
            handled: true,
            reply: 'Mood Shuffle diaktifkan! Memutar lagu otomatis sesuai mood.',
          };
        }
        return {
          handled: true,
          reply: `Mood Shuffle diaktifkan! Setelah "${activeTrackRef.current.title}" selesai, lagu dengan mood serupa akan diputar otomatis.`,
        };
      }

      const playSongMatch = raw.match(
        /\b(?:putar lagu|stel lagu|setel musik|setel lagu|mainkan lagu|play song|play music|putar musik)\s+(.+)/i
      );
      if (playSongMatch && playSongMatch[1]) {
        const songQuery = playSongMatch[1].trim();
        handleSearchAndPlayMedia(songQuery);
        navigateToPage(0);
        triggerActionConfirmation('Memutar Lagu', songQuery, 'PLAY', 'music', 0);
        return { handled: true, reply: `Mencari dan memutar "${songQuery}" di Dynamic Island.` };
      }
      if (/\b(jeda musik|pause musik|stop musik|pause lagu|hentikan musik)\b/.test(p)) {
        if (isPlaying) handleTogglePlay();
        triggerActionConfirmation('Kontrol Musik', activeTrack?.title || 'Media', 'PAUSED', 'music', 0);
        return { handled: true, reply: 'Musik dijeda.' };
      }
      if (/\b(putar musik|lanjutkan musik|play music|lanjut musik|play lagu)\b/.test(p)) {
        if (!isPlaying) handleTogglePlay();
        navigateToPage(0);
        triggerActionConfirmation('Kontrol Musik', activeTrack?.title || 'Media', 'PLAYING', 'music', 0);
        return { handled: true, reply: 'Musik diputar.' };
      }
      if (/\b(skip lagu|lagu selanjutnya|next track|next song)\b/.test(p)) {
        handleNextTrack();
        triggerActionConfirmation('Lagu Selanjutnya', 'Beralih ke trek berikutnya', 'NEXT', 'music', 0);
        return { handled: true, reply: 'Beralih ke lagu selanjutnya.' };
      }
      if (/\b(lagu sebelumnya|prev track|previous track|previous song)\b/.test(p)) {
        handlePrevTrack();
        triggerActionConfirmation('Lagu Sebelumnya', 'Kembali ke trek sebelumnya', 'PREV', 'music', 0);
        return { handled: true, reply: 'Kembali ke lagu sebelumnya.' };
      }

      // 5. Connectivity & System
      if (
        /\b(matiin|matikan|nonaktifkan|turn off)\b.*\bbluetooth\b|\bbluetooth\b.*\b(mati|off)\b/.test(
          p
        )
      ) {
        setBluetoothEnabled(false);
        pushRealNotification(
          'Bluetooth Dimatikan',
          'Radio Bluetooth laptop dinonaktifkan.',
          'message'
        );
        triggerActionConfirmation('Bluetooth', 'Radio Bluetooth laptop dinonaktifkan', 'OFF', 'system');
        return { handled: true, reply: 'Bluetooth dinonaktifkan.' };
      }
      if (
        /\b(nyalain|nyalakan|aktifkan|turn on)\b.*\bbluetooth\b|\bbluetooth\b.*\b(nyala|on)\b/.test(
          p
        )
      ) {
        setBluetoothEnabled(true);
        pushRealNotification(
          'Bluetooth Diaktifkan',
          'Radio Bluetooth laptop aktif.',
          'message'
        );
        triggerActionConfirmation('Bluetooth', 'Radio Bluetooth laptop aktif', 'ON', 'system');
        return { handled: true, reply: 'Bluetooth diaktifkan.' };
      }
      if (/\b(matiin|matikan|nonaktifkan)\b.*\b(wifi|wi-fi)\b/.test(p)) {
        setWifiEnabled(false);
        pushRealNotification('Wi-Fi Dimatikan', 'Adaptor Wi-Fi dinonaktifkan.', 'message');
        triggerActionConfirmation('Wi-Fi', 'Adaptor Wi-Fi dinonaktifkan', 'OFF', 'system');
        return { handled: true, reply: 'Wi-Fi dinonaktifkan.' };
      }
      if (/\b(nyalain|nyalakan|aktifkan)\b.*\b(wifi|wi-fi)\b/.test(p)) {
        setWifiEnabled(true);
        pushRealNotification('Wi-Fi Diaktifkan', 'Adaptor Wi-Fi terhubung.', 'message');
        triggerActionConfirmation('Wi-Fi', 'Adaptor Wi-Fi terhubung', 'ON', 'system');
        return { handled: true, reply: 'Wi-Fi diaktifkan.' };
      }

      // 6. Pomodoro & DND
      if (/\b(mulai pomodoro|start pomodoro|mulai fokus)\b/.test(p)) {
        setPomoRunning(true);
        triggerActionConfirmation(
          'Pomodoro Dimulai',
          'Sesi fokus sedang berjalan',
          formatPomoTime(pomoRemainingSeconds),
          'timer',
          2
        );
        return { handled: true, reply: 'Timer Pomodoro dimulai.' };
      }
      if (/\b(jeda pomodoro|stop pomodoro|pause pomodoro)\b/.test(p)) {
        setPomoRunning(false);
        triggerActionConfirmation(
          'Pomodoro Dijeda',
          'Timer fokus dihentikan sementara',
          formatPomoTime(pomoRemainingSeconds),
          'timer',
          2
        );
        return { handled: true, reply: 'Timer Pomodoro dijeda.' };
      }
      if (/\b(reset pomodoro|reset timer|ulang pomodoro)\b/.test(p)) {
        setPomoRunning(false);
        setPomoRemainingSeconds(pomoTotalSeconds);
        triggerActionConfirmation(
          'Pomodoro Direset',
          'Waktu dikembalikan ke awal',
          formatPomoTime(pomoTotalSeconds),
          'timer',
          2
        );
        return { handled: true, reply: 'Timer Pomodoro telah direset.' };
      }
      if (/\b(jangan ganggu|do not disturb|dnd|mode fokus)\b/.test(p)) {
        const nextDnd = !dndEnabled;
        setDndEnabled(nextDnd);
        triggerActionConfirmation(
          'Do Not Disturb',
          nextDnd ? 'Notifikasi disenyapkan' : 'Notifikasi diaktifkan kembali',
          nextDnd ? 'ON' : 'OFF',
          'system'
        );
        return { handled: true, reply: 'Status Jangan Ganggu (DND) diubah.' };
      }

      return { handled: false };
    },
    [
      activeTrack?.title,
      dndEnabled,
      fetchWeatherData,
      handleNextTrack,
      handlePrevTrack,
      handleQueueSongMedia,
      handleSearchAndPlayMedia,
      handleSeek,
      handleTogglePlay,
      isPlaying,
      miniCapsuleMode,
      navigateToPage,
      pomoRemainingSeconds,
      pomoTotalSeconds,
      pushRealNotification,
      sendExternalMediaCommand,
      timeStr,
      triggerActionConfirmation,
      triggerAlert,
      triggerSmartMoodShuffle,
      volume,
      weatherData.city,
      weatherData.currentTemp,
    ]
  );

  // ── Voice Assistant (gemini-3.8-live Live API) & Multimodal AI Conversation (gemini-3.8-flash + Vision + Google Search) ──
  const [voiceListening, setVoiceListening] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const voiceEnergyRef = useRef<number>(0);
  const [voiceLang, setVoiceLang] = useState<'id-ID' | 'en-US'>('id-ID');
  const [voiceStatusHint, setVoiceStatusHint] = useState<string | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [botForm, setBotForm] = useState<BotForm>('listening');
  const [assistantInput, setAssistantInput] = useState('');
  const [pendingImage, setPendingImage] = useState<PendingImageAttachment | null>(null);
  const [newChatToast, setNewChatToast] = useState(false);
  const [spamNotice, setSpamNotice] = useState<string | null>(null);
  const [showAllChatHistory, setShowAllChatHistory] = useState(false);
  const [latestSearchSources, setLatestSearchSources] = useState<SearchSourceItem[]>([]);
  const [animatingMsgId, setAnimatingMsgId] = useState<number | null>(null);
  const [revealedChars, setRevealedChars] = useState<number>(0);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastAskTimeRef = useRef<number>(0);
  const speechRecRef = useRef<any>(null);
  const voiceSilenceTimerRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveWsRef = useRef<WebSocket | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeAudioNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const liveInputAccRef = useRef<string>('');
  const liveOutputAccRef = useRef<string>('');
  const handleAskGeminiRef = useRef<(promptText: string, optionalAudioB64?: string) => void>(() => {});
  const recordedVoiceChunksRef = useRef<Float32Array[]>([]);
  const hasDetectedSpeechRef = useRef<boolean>(false);
  const lastSpeechDetectedTimeRef = useRef<number>(0);

  // Real Voice Agent State (No fake transcripts!)
  const [agentTranscript, setAgentTranscript] = useState('');
  const [agentHeadline, setAgentHeadline] = useState('');

  // Real Multi-turn Conversation History (Persisted in localStorage, Zero Fake Initial Chat!)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = window.localStorage.getItem('isle_chat_messages_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (m: any) =>
              typeof m?.text === 'string' &&
              !m.text.includes('Maaf, gagal memproses respon AI') &&
              !m.text.includes('experiencing high demand')
          );
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  // Latest AI Assistant Message (for clean single-answer display)
  const latestAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i];
    }
    return null;
  }, [messages]);

  // Smooth Typewriter / Streaming Text Reveal Effect when AI answers (Throttled to ~20fps to prevent CPU spikes)
  useEffect(() => {
    if (!animatingMsgId || !latestAssistantMessage || latestAssistantMessage.id !== animatingMsgId) {
      return;
    }
    const fullLen = latestAssistantMessage.text.length;
    if (revealedChars >= fullLen) {
      setAnimatingMsgId(null);
      return;
    }
    const step = Math.max(6, Math.ceil(fullLen / 22));
    const timer = window.setTimeout(() => {
      setRevealedChars((c) => Math.min(fullLen, c + step));
    }, 48);
    return () => window.clearTimeout(timer);
  }, [animatingMsgId, latestAssistantMessage, revealedChars]);

  useEffect(() => {
    try {
      window.localStorage.setItem('isle_chat_messages_v2', JSON.stringify(messages.slice(-40)));
    } catch {
      // ignore
    }
  }, [messages]);

  // Elegant Zero-Dependency Markdown Renderer for Isle Assistant:
  // Cleans raw syntax (###, **, -) and formats headers, bold emphasis, bullets, and linebreaks
  const renderAssistantFormattedText = useCallback((rawText: string) => {
    if (!rawText) return null;

    let cleaned = rawText.trim();
    // Strip outer quotes if entire text is enclosed in quotes
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith('“') && cleaned.endsWith('”'))
    ) {
      cleaned = cleaned.slice(1, -1).trim();
    }

    // Convert inline markdown headings (e.g. "...di Mobile Legends. ### Efek: - Ling...") into distinct lines
    cleaned = cleaned.replace(/\s*###\s+/g, '\n\n### ');
    // Convert inline bullets (e.g. "Efek: - Ling... - Setelah...") into newlines
    cleaned = cleaned.replace(/\s+-\s+([A-Za-z0-9])/g, '\n- $1');

    const lines = cleaned.split('\n');

    const formatInline = (str: string, keyPrefix: string) => {
      const parts = str.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
      return parts.map((part, i) => {
        const k = `${keyPrefix}-${i}`;
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code
              key={k}
              className="px-1 py-0.2 rounded bg-white/12 font-mono text-[10px] text-amber-300"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <strong key={k} className="font-bold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return (
            <em key={k} className="italic text-white/90">
              {part.slice(1, -1)}
            </em>
          );
        }
        return <span key={k}>{part}</span>;
      });
    };

    return (
      <div className="space-y-1.5 leading-relaxed">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return null;

          // Heading line (### Title, ## Title, # Title)
          const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
          if (headingMatch) {
            const title = headingMatch[1].replace(/[:]+$/, '');
            return (
              <div
                key={`h-${idx}`}
                className="text-[11px] font-bold text-amber-300 tracking-tight pt-1 flex items-center gap-1.5"
              >
                <span className="w-1 h-3 rounded-full bg-amber-400 shrink-0" />
                <span>{title}</span>
              </div>
            );
          }

          // Bullet item (- Item, * Item, • Item, 1. Item)
          const bulletMatch = trimmed.match(/^(?:[-*•]|\d+\.)\s+(.+)$/);
          if (bulletMatch) {
            return (
              <div key={`b-${idx}`} className="flex items-start gap-1.5 pl-0.5 my-0.5">
                <span className="text-amber-400 font-bold text-[9px] mt-0.5 shrink-0">•</span>
                <div className="flex-1 min-w-0 text-white/92">
                  {formatInline(bulletMatch[1], `b-${idx}`)}
                </div>
              </div>
            );
          }

          return (
            <p key={`p-${idx}`} className="text-white/92">
              {formatInline(trimmed, `p-${idx}`)}
            </p>
          );
        })}
      </div>
    );
  }, []);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (assistantMode === 'conversation' && chatScrollRef.current) {
      if (showAllChatHistory || animatingMsgId !== null) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      } else {
        chatScrollRef.current.scrollTop = 0;
      }
    }
  }, [messages, assistantLoading, assistantMode, assistantOpen, showAllChatHistory, revealedChars, animatingMsgId]);

  // Stop Gemini Live WebSocket, 16kHz mic capture, 24kHz audio playback, & Web Speech API cleanly
  const stopVoiceRecognition = useCallback(() => {
    if (voiceSilenceTimerRef.current) {
      window.clearTimeout(voiceSilenceTimerRef.current);
      voiceSilenceTimerRef.current = null;
    }
    if (speechRecRef.current) {
      try {
        speechRecRef.current.onresult = null;
        speechRecRef.current.onerror = null;
        speechRecRef.current.onend = null;
        speechRecRef.current.stop();
      } catch {
        // ignore
      }
      speechRecRef.current = null;
    }
    if (liveWsRef.current) {
      try {
        liveWsRef.current.onclose = null;
        liveWsRef.current.close();
      } catch {
        // ignore
      }
      liveWsRef.current = null;
    }
    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current.onaudioprocess = null;
      } catch {
        // ignore
      }
      scriptProcessorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    for (const node of activeAudioNodesRef.current) {
      try {
        node.stop();
      } catch {
        // ignore
      }
    }
    activeAudioNodesRef.current = [];
    nextStartTimeRef.current = 0;
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }
    recordedVoiceChunksRef.current = [];
    hasDetectedSpeechRef.current = false;
    lastSpeechDetectedTimeRef.current = 0;
    setVoiceListening(false);
    setLiveConnected(false);
  }, []);

  // Cleanly close Assistant AND collapse the entire Dynamic Island back to the compact notch
  const closeAssistantAndCollapse = useCallback(() => {
    stopVoiceRecognition();
    setAssistantOpen(false);
    setIsPinnedOpen(false);
    setIsHovered(false);
    setDragAutoOpened(false);
    setSettingsOpen(false);
    setShowAllChatHistory(false);
  }, [stopVoiceRecognition]);

  // Animate voice energy fallback while loading (if real PCM audio stream isn't driving it)
  useEffect(() => {
    if (!voiceListening && !assistantLoading) {
      voiceEnergyRef.current = 0;
      return;
    }
    const id = setInterval(() => {
      if (document.hidden) return;
      if (!micStreamRef.current) {
        voiceEnergyRef.current = 0.25 + Math.random() * 0.55;
      }
    }, 110);
    return () => clearInterval(id);
  }, [voiceListening, assistantLoading]);

  const cancelInFlightGemini = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopVoiceRecognition();
    setAssistantLoading(false);
    setBotForm('listening');
  }, [stopVoiceRecognition]);

  // Convert an uploaded / pasted / dropped image File into a compressed base64 PendingImageAttachment
  const attachImageFile = useCallback((file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      if (!rawDataUrl) return;
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1280;
          let w = img.width || 800;
          let h = img.height || 600;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
            const compressedDataUrl = canvas.toDataURL(outMime, 0.86);
            const b64 = compressedDataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
            setPendingImage({
              dataUrl: compressedDataUrl,
              base64: b64,
              mimeType: outMime,
              name: file.name || 'image.jpg',
            });
            return;
          }
        } catch {
          // fallback to rawDataUrl below
        }
        const b64 = rawDataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
        setPendingImage({
          dataUrl: rawDataUrl,
          base64: b64,
          mimeType: file.type || 'image/png',
          name: file.name || 'image.png',
        });
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  // Automatic Screen Capture for "ambil screenshot" / "tangkap layar" / "lihat layarku sekarang" commands
  const captureCurrentScreenAuto = useCallback(async (): Promise<PendingImageAttachment | null> => {
    // 1. Try native OS screenshot via /api/system/screenshot (works on Windows host via PowerShell CopyFromScreen)
    try {
      const osRes = await fetch('/api/system/screenshot');
      if (osRes.ok) {
        const osData = await osRes.json();
        if (osData?.captured && osData?.data) {
          const mime = osData.mimeType || 'image/jpeg';
          return {
            dataUrl: `data:${mime};base64,${osData.data}`,
            base64: osData.data,
            mimeType: mime,
            name: `screenshot-${Date.now()}.jpg`,
          };
        }
      }
    } catch {
      // Fallback to client-side viewport compositor
    }

    // 2. Client-side Automatic Viewport & Dynamic Island Visual Compositor (Zero permission popup!)
    try {
      const canvas = document.createElement('canvas');
      const w = 1280;
      const h = 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Render desktop background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, w, h);
      bgGrad.addColorStop(0, '#0f172a');
      bgGrad.addColorStop(0.5, '#1e1b4b');
      bgGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Draw Dynamic Island card in top center
      const islandW = 540;
      const islandH = 210;
      const islandX = Math.round((w - islandW) / 2);
      const islandY = 28;
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.roundRect(islandX, islandY, islandW, islandH, 34);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Header inside Island
      ctx.fillStyle = '#30d158';
      ctx.beginPath();
      ctx.arc(islandX + 160, islandY + 28, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e5e5ea';
      ctx.font = '600 15px Inter, system-ui, sans-serif';
      ctx.fillText(
        `Battery ${batteryLevel}% · ${headerDateStr} ${nowDate.getFullYear()} · ${timeStr}`,
        islandX + 176,
        islandY + 33
      );

      // Active Track / Media info inside Island
      const trackLabel = activeTrack
        ? `${activeTrack.title} - ${activeTrack.artist || 'Artist'}`
        : 'Tidak ada media yang sedang diputar';
      const sourceLabel = activeTrack
        ? activeTrack.sourceType === 'external'
          ? `Sumber: ${activeTrack.externalApp || 'Aplikasi Eksternal'} (Shuffle: ${
              externalShuffleEnabled ? 'ON' : 'OFF'
            })`
          : `Sumber: Internal AI Player (Mood Shuffle: ${moodShuffleEnabled ? 'ON' : 'OFF'}, Antrian: ${
              musicQueue.length
            })`
        : 'Status: Idle / Standby';

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px Inter, system-ui, sans-serif';
      ctx.fillText(trackLabel.slice(0, 44), islandX + 36, islandY + 82);

      ctx.fillStyle = '#a1a1aa';
      ctx.font = '500 14px Inter, system-ui, sans-serif';
      ctx.fillText(sourceLabel, islandX + 36, islandY + 108);

      // Active Lyric Line if available
      if (activeTrack && parsedLyrics.length > 0) {
        const curLine =
          parsedLyrics[Math.max(0, activeLineIndex)]?.text || parsedLyrics[0]?.text || '';
        if (curLine) {
          ctx.fillStyle = '#fde047';
          ctx.font = '600 15px Inter, system-ui, sans-serif';
          ctx.fillText(`♪ "${curLine.slice(0, 52)}"`, islandX + 36, islandY + 140);
        }
      }

      // Progress bar inside Island
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(islandX + 36, islandY + 162, islandW - 72, 6);
      if (activeTrack && activeTrack.durationMs > 0) {
        const ratio = Math.min(1, Math.max(0, positionMs / activeTrack.durationMs));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(islandX + 36, islandY + 162, Math.round((islandW - 72) * ratio), 6);
      }

      // Workspace Status Panel on screen
      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      ctx.beginPath();
      ctx.roundRect(120, 275, w - 240, 360, 24);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px Inter, system-ui, sans-serif';
      ctx.fillText('Isle Desktop Workspace — Live Screen Capture', 156, 322);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '500 16px Inter, system-ui, sans-serif';
      const statusLines = [
        `• Menu Aktif Dynamic Island: ${activePage.toUpperCase()}${lyricsMode ? ' (Lyrics Mode Terbuka)' : ''}`,
        `• Musik Sekarang: ${trackLabel} (${formatTrackTime(positionMs)} / ${formatTrackTime(
          activeTrack?.durationMs || 0
        )})`,
        `• Sistem: Volume ${volume}% ${muted ? '(Muted)' : ''} · Brightness ${brightness}/10 · Wi-Fi ${
          wifiEnabled ? 'ON' : 'OFF'
        } · Bluetooth ${bluetoothEnabled ? 'ON' : 'OFF'}`,
        `• Focus Pomodoro: ${formatPomoTime(pomoRemainingSeconds)} (${
          pomoRunning ? 'Berjalan' : 'Dijeda'
        }) · Sesi Selesai: ${pomoSessionsCompleted}`,
        `• To-Do Tasks (${tasks.length}): ${
          tasks.slice(0, 3).map((t) => `${t.done ? '[✓]' : '[ ]'} ${t.title}`).join(' | ') ||
          'Belum ada task'
        }`,
        `• Shelf Files (${shelfFiles.length}): ${
          shelfFiles.map((f) => f.name).join(', ') || 'Kosong'
        }`,
        `• Smart Alarms: ${
          smartAlarms.map((a) => `${a.title} (${a.time})`).join(', ') || 'Tidak ada alarm'
        }`,
      ];
      statusLines.forEach((line, idx) => {
        ctx.fillText(line.slice(0, 92), 156, 364 + idx * 36);
      });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      const base64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
      return {
        dataUrl,
        base64,
        mimeType: 'image/jpeg',
        name: `tangkap-layar-${Date.now()}.jpg`,
      };
    } catch {
      return null;
    }
  }, [
    activeLineIndex,
    activePage,
    activeTrack,
    batteryLevel,
    bluetoothEnabled,
    brightness,
    externalShuffleEnabled,
    headerDateStr,
    lyricsMode,
    moodShuffleEnabled,
    musicQueue.length,
    muted,
    nowDate,
    parsedLyrics,
    pomoRemainingSeconds,
    pomoRunning,
    pomoSessionsCompleted,
    positionMs,
    shelfFiles,
    smartAlarms,
    tasks,
    timeStr,
    volume,
    wifiEnabled,
  ]);

  const handleAskGemini = async (promptText: string, optionalAudioB64?: string) => {
    const rawQ = promptText.trim().slice(0, 1000);
    // Detect auto-screenshot intent ("ambil screenshot", "tangkap layar", "lihat layarku sekarang", etc.)
    const isAutoScreenshotIntent =
      /\b(ambil\s+screenshot|tangkap\s+layar|lihat\s+layarku|lihat\s+layar\s+saya|cek\s+layarku|cek\s+layar\s+saya|apa\s+yang\s+ada\s+di\s+layarku|analisis\s+layarku|baca\s+layarku|screenshot\s+layar|screenshot\s+sekarang|take\s+a?\s*screenshot|capture\s+screen|look\s+at\s+my\s+screen|what\s+is\s+on\s+my\s+screen)\b/i.test(
        rawQ
      );

    if (!rawQ && !pendingImage && !isAutoScreenshotIntent && !optionalAudioB64) return;

    // Chaos Guard: Block duplicate rapid-fire Enter spam while a request is already in-flight
    const now = Date.now();
    if (assistantLoading || now - lastAskTimeRef.current < 350) {
      setSpamNotice('Please wait — Isle Assistant is still responding...');
      window.setTimeout(() => setSpamNotice(null), 1800);
      return;
    }
    lastAskTimeRef.current = now;
    setSpamNotice(null);

    let imageToSend: PendingImageAttachment | null = pendingImage;
    setPendingImage(null);
    setAssistantInput('');
    setShowAllChatHistory(false);
    const effectivePrompt =
      rawQ || (optionalAudioB64 ? 'Pesan suara' : 'Tolong analisis dan jelaskan apa yang ada pada gambar ini secara ringkas.');
    setAgentTranscript(effectivePrompt);
    setAssistantLoading(true);
    setBotForm('thinking');

    // If user typed a screenshot command ("ambil screenshot", "lihat layarku sekarang", etc.) and didn't attach an image manually,
    // automatically capture the screen and attach it directly to the chat!
    if (!imageToSend && isAutoScreenshotIntent) {
      setAgentHeadline('Menangkap layar saat ini (Auto-Screenshot)...');
      imageToSend = await captureCurrentScreenAuto();
    }

    // Only execute local non-vision shortcut commands if there is no image/screenshot to analyze
    const localCmd = !imageToSend && !optionalAudioB64 ? executeIslandCommand(effectivePrompt) : { handled: false };
    setAgentHeadline(
      localCmd.reply ||
        (optionalAudioB64
          ? 'Memproses pesan suara dengan Gemini AI...'
          : imageToSend
          ? 'Menganalisis gambar dengan Vision AI...'
          : 'Isle Assistant thinking...')
    );

    const userMsgId = now;
    const historySnapshot = messages.slice(-8).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((prev) => [
      ...prev.slice(-58),
      {
        id: userMsgId,
        role: 'user',
        text: effectivePrompt,
        imageUrl: imageToSend?.dataUrl,
        timestamp: timeStr,
      },
    ]);

    // If local command (e.g. play song, set alarm, volume, brightness) was already handled, return immediately to prevent double execution!
    if (localCmd.handled) {
      const botMsgId = now + 1;
      const replyStr = localCmd.reply || 'Perintah telah dijalankan.';
      setAnimatingMsgId(botMsgId);
      setRevealedChars(0);
      setMessages((prev) => [
        ...prev,
        { id: botMsgId, role: 'assistant', text: replyStr, timestamp: timeStr },
      ]);
      setBotForm('reply');
      setAssistantLoading(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/gemini/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': geminiApiKey || '',
        },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: effectivePrompt,
          model: assistantModel,
          audio: optionalAudioB64
            ? {
                data: optionalAudioB64,
                mimeType: 'audio/wav',
              }
            : undefined,
          image: imageToSend
            ? {
                data: imageToSend.base64,
                mimeType: imageToSend.mimeType,
              }
            : undefined,
          history: historySnapshot,
          currentState: {
            activePage,
            isPlaying,
            flacEnabled,
            moodShuffleEnabled:
              activeTrack?.sourceType === 'external' ? externalShuffleEnabled : moodShuffleEnabled,
            queueCount: musicQueue.length,
            trackTitle: activeTrack ? `${activeTrack.title} - ${activeTrack.artist}` : 'Idle',
            volume,
            brightness,
            bluetoothEnabled,
            wifiEnabled,
            muted,
            batteryLevel,
            isCharging,
            pomoRunning,
            pomoRemaining: formatPomoTime(pomoRemainingSeconds),
            shelfCount: shelfFiles.length,
            notificationsCount: unreadNotifCount,
            pendingTasksCount: tasks.length - completedCount,
          },
        }),
      });

      const data: GeminiAssistantResponse = await res.json();

      if (res.status === 429) {
        setSpamNotice(data.error || 'Rate limit reached. Slow down a bit!');
        window.setTimeout(() => setSpamNotice(null), 3000);
      }

      const replyText = data.reply || data.error || 'Done.';
      setAgentHeadline(replyText);
      const sources = Array.isArray(data.searchSources) ? data.searchSources : [];
      setLatestSearchSources(sources);

      // Cancel any ongoing speech synthesis if any
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }

      const newReplyId = Date.now() + 2;
      const initialChars = Math.min(replyText.length, Math.max(8, Math.ceil(replyText.length / 18)));
      setRevealedChars(initialChars);
      setAnimatingMsgId(newReplyId);

      setMessages((prev) => {
        const next = [...prev.slice(-58)];
        next.push({
          id: newReplyId,
          role: 'assistant',
          text: replyText,
          imageUrl: imageToSend?.dataUrl,
          timestamp: timeStr,
          searchSources: sources.length > 0 ? sources : undefined,
          commandCard: data.commandCard,
          foundFiles: data.foundFiles,
        });
        return next;
      });

      setBotForm(res.ok ? 'reply' : 'error');

      // Execute island & laptop actions if returned by Gemini
      if (data.action === 'play_song' && data.trackData) {
        const queryTitle = (data.trackData.title || '').toLowerCase();
        const recentlyPlayed =
          Date.now() - lastPlayedSongTimeRef.current < 6000 &&
          (queryTitle.includes(lastPlayedSongQueryRef.current) ||
            lastPlayedSongQueryRef.current.includes(queryTitle));
        if (!recentlyPlayed) {
          if (activeTrackRef.current && activeTrackRef.current.sourceType !== 'external') {
            setMusicHistory((prev) => [activeTrackRef.current!, ...prev.slice(0, 19)]);
          }
          shuffleBufferRef.current = null;
          loadAndPlayRealTrack({ ...data.trackData, sourceType: 'internal' });
          navigateToPage(0);
        }
      } else if (data.action === 'queue_song') {
        if (data.trackData) {
          enqueueResolvedTrack(data.trackData);
        } else if (data.actionParam) {
          handleQueueSongMedia(data.actionParam);
        }
        navigateToPage(0);
      } else if (data.action === 'clear_queue') {
        setMusicQueue([]);
      } else if (data.action === 'shuffle_on') {
        if (activeTrackRef.current?.sourceType === 'external') {
          setExternalShuffleEnabled(true);
          sendExternalMediaCommand('shuffle', true);
        } else {
          setMoodShuffleEnabled(true);
          if (!activeTrackRef.current) {
            triggerSmartMoodShuffle(null);
          }
        }
        navigateToPage(0);
      } else if (data.action === 'shuffle_off') {
        if (activeTrackRef.current?.sourceType === 'external') {
          setExternalShuffleEnabled(false);
          sendExternalMediaCommand('shuffle', false);
        } else {
          setMoodShuffleEnabled(false);
        }
      } else if (data.action === 'bluetooth_off') {
        setBluetoothEnabled(false);
        pushRealNotification('Bluetooth Dimatikan', 'Radio Bluetooth laptop dinonaktifkan.', 'message');
      } else if (data.action === 'bluetooth_on') {
        setBluetoothEnabled(true);
        pushRealNotification('Bluetooth Diaktifkan', 'Radio Bluetooth laptop aktif.', 'message');
      } else if (data.action === 'wifi_off') {
        setWifiEnabled(false);
        pushRealNotification('Wi-Fi Dimatikan', 'Adaptor Wi-Fi dinonaktifkan.', 'message');
      } else if (data.action === 'wifi_on') {
        setWifiEnabled(true);
        pushRealNotification('Wi-Fi Diaktifkan', 'Adaptor Wi-Fi terhubung.', 'message');
      } else if (data.action === 'set_volume' && data.actionParam) {
        const v = Math.min(100, Math.max(0, Number(data.actionParam) || 50));
        setMuted(v === 0);
        setVolume(v);
      } else if (data.action === 'set_brightness' && data.actionParam) {
        const b = Math.min(10, Math.max(0, Number(data.actionParam) || 7));
        setBrightness(b);
      } else if (data.action === 'play_music') {
        if (activeTrack) {
          audioElRef.current?.play().catch(() => {});
          setIsPlaying(true);
        }
        navigateToPage(0);
      } else if (data.action === 'pause_music') {
        audioElRef.current?.pause();
        setIsPlaying(false);
      } else if (data.action === 'next_track') {
        handleNextTrack();
      } else if (data.action === 'prev_track') {
        handlePrevTrack();
      } else if (data.action === 'set_volume_30') {
        setMuted(false);
        setVolume(30);
      } else if (data.action === 'mute_volume') {
        setMuted(true);
      } else if (data.action === 'unmute_volume') {
        setMuted(false);
      } else if (data.action === 'toggle_lyrics') {
        navigateToPage(0);
        setLyricsMode(true);
        triggerActionConfirmation('Lyrics Mode', activeTrack?.title || 'Sinkronisasi Lirik', 'ON', 'music', 0);
      } else if (data.action === 'seek_music' && data.actionParam) {
        const sec = Math.max(0, Number(data.actionParam) || 0);
        const ms = Math.round(sec * 1000);
        handleSeek(ms);
        navigateToPage(0);
        setLyricsMode(true);
        triggerActionConfirmation('Loncat Lirik & Musik', activeTrack?.title || 'Media', formatTrackTime(ms), 'music', 0);
      } else if (data.action === 'set_timer' && data.actionParam) {
        const mins = Math.max(1, Math.min(180, Number(data.actionParam) || 25));
        const totalSec = mins * 60;
        setPomoMode('focus');
        setPomoTotalSeconds(totalSec);
        setPomoRemainingSeconds(totalSec);
        setPomoRunning(true);
        const badge = formatPomoTime(totalSec);
        pushRealNotification('Timer Fokus Dimulai', `Durasi diatur ke ${badge}`, 'calendar');
        triggerActionConfirmation('Timer Fokus Aktif', `${mins} menit hitung mundur`, badge, 'timer', 2);
      } else if (data.action === 'start_pomodoro') {
        setPomoRunning(true);
        triggerActionConfirmation(
          'Pomodoro Dimulai',
          'Sesi fokus sedang berjalan',
          formatPomoTime(pomoRemainingSeconds),
          'timer',
          2
        );
      } else if (data.action === 'pause_pomodoro') {
        setPomoRunning(false);
        triggerActionConfirmation(
          'Pomodoro Dijeda',
          'Timer fokus dihentikan sementara',
          formatPomoTime(pomoRemainingSeconds),
          'timer',
          2
        );
      } else if (data.action === 'reset_pomodoro') {
        setPomoRunning(false);
        setPomoRemainingSeconds(pomoTotalSeconds);
        triggerActionConfirmation(
          'Pomodoro Direset',
          'Waktu dikembalikan ke awal',
          formatPomoTime(pomoTotalSeconds),
          'timer',
          2
        );
      } else if (data.action === 'open_tasks') {
        navigateToPage(3);
      } else if (data.action === 'open_shelf') {
        navigateToPage(4);
      } else if (data.action === 'clear_shelf') {
        setShelfFiles([]);
        triggerActionConfirmation('Shelf Dibersihkan', 'Semua file telah dihapus', '0', 'system', 4);
      } else if (data.action === 'open_calendar' || data.action === 'add_calendar_event') {
        if (data.actionParam) {
          handleAddCalendarEvent(data.actionParam);
          triggerActionConfirmation('Jadwal Kalender', data.actionParam, timeStr, 'alarm', 5);
        } else {
          navigateToPage(5);
        }
      } else if (data.action === 'open_weather') {
        const requestedCity = data.actionParam?.trim();
        if (requestedCity) {
          fetchWeatherData(requestedCity);
        } else {
          fetchWeatherData();
        }
        triggerActionConfirmation(
          'Cuaca & Matahari',
          requestedCity || weatherData.city,
          `${weatherData.currentTemp}°`,
          'weather',
          6
        );
      } else if (data.action === 'toggle_mini_capsule') {
        const nextMini = !miniCapsuleMode;
        setActiveAlert(null);
        setMiniCapsuleMode(nextMini);
        if (nextMini) {
          setIsPinnedOpen(false);
          setIsHovered(false);
          setAssistantOpen(false);
          setLyricsMode(false);
          setSettingsOpen(false);
          setTopEdgeHover(false);
        }
      } else if (data.action === 'open_notifications') {
        navigateToPage(1);
      } else if (data.action === 'toggle_dnd') {
        const nextDnd = !dndEnabled;
        setDndEnabled(nextDnd);
        triggerActionConfirmation(
          'Do Not Disturb',
          nextDnd ? 'Notifikasi disenyapkan' : 'Notifikasi aktif',
          nextDnd ? 'ON' : 'OFF',
          'system'
        );
      } else if (data.action === 'add_todo' && data.actionParam) {
        const parts = data.actionParam.split('|');
        const rawTitle = (parts[0] || data.actionParam).trim().slice(0, 80);
        const explicitTime = parts[1]?.trim();
        let finalTitle = rawTitle;
        let finalTime = explicitTime || timeStr;

        if (!explicitTime) {
          const todTimeMatch = rawTitle.match(
            /^(.*?)\s*(?:di\s+|pada\s+)?(?:jam|pukul|at)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(pagi|siang|sore|malam|am|pm)?\b(.*)$/i
          );
          if (todTimeMatch) {
            let hh = parseInt(todTimeMatch[2], 10);
            const mm = todTimeMatch[3] ? parseInt(todTimeMatch[3], 10) : 0;
            const period = (todTimeMatch[4] || '').toLowerCase();
            if ((period === 'sore' || period === 'malam' || period === 'pm') && hh < 12) hh += 12;
            if (period === 'siang' && hh >= 1 && hh <= 4) hh += 12;
            if ((period === 'pagi' || period === 'am') && hh === 12) hh = 0;
            finalTime = `${String(Math.min(23, Math.max(0, hh))).padStart(2, '0')}:${String(
              Math.min(59, Math.max(0, mm))
            ).padStart(2, '0')}`;
            finalTitle = `${todTimeMatch[1] || ''} ${todTimeMatch[5] || ''}`.replace(/\s+/g, ' ').trim() || rawTitle;
          }
        }

        setTasks((prev) => [
          ...prev.slice(-29),
          {
            id: Date.now(),
            title: finalTitle,
            time: finalTime,
            done: false,
          },
        ]);
        pushRealNotification('Task Dijadwalkan', `${finalTitle} · ${finalTime}`, 'calendar');
        triggerActionConfirmation('Task Dijadwalkan', finalTitle, finalTime, 'task', 3);
      } else if (data.action === 'set_alarm_and_reminder' && data.actionParam) {
        executeIslandCommand(data.actionParam);
      } else if (data.action === 'volume_up') {
        setMuted(false);
        setVolume((curr) => {
          const next = Math.min(100, curr + 15);
          triggerAlert('volume', { value: next });
          return next;
        });
      } else if (data.action === 'volume_down') {
        setVolume((curr) => {
          const next = Math.max(0, curr - 15);
          triggerAlert('volume', { value: next });
          return next;
        });
      } else if (data.action === 'brightness_up') {
        setBrightness((curr) => {
          const next = Math.min(10, curr + 2);
          triggerAlert('brightness', { value: next });
          return next;
        });
      } else if (data.action === 'launch_app' && data.actionParam) {
        const appTarget = data.actionParam.trim();
        fetch('/api/system/launch-app', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appName: appTarget }),
        })
          .then((r) => r.json())
          .then((res) => {
            const resolved = res?.matchedName || appTarget;
            triggerActionConfirmation(
              `Membuka ${resolved}`,
              `“Buka ${resolved}”`,
              'OPEN',
              'system'
            );
          })
          .catch(() => {});
        triggerActionConfirmation(
          `Membuka ${appTarget}`,
          `“Buka ${appTarget}”`,
          'OPEN',
          'system'
        );
        pushRealNotification(
          'Membuka Aplikasi',
          `Meluncurkan ${appTarget} di Windows...`,
          'message'
        );
      } else if (data.action === 'brightness_down') {
        setBrightness((curr) => {
          const next = Math.max(1, curr - 2);
          triggerAlert('brightness', { value: next });
          return next;
        });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setAgentHeadline('Permintaan dibatalkan');
        return;
      }
      console.error(err);
      const errMsg = err?.message || 'Koneksi ke server terputus.';
      setAgentHeadline('Gagal terhubung ke AI');
      setBotForm('error');
      const errReplyId = Date.now() + 1;
      setMessages((prev) => [
        ...prev.slice(-58),
        {
          id: errReplyId,
          role: 'assistant',
          text: `Maaf, AI belum merespons (${errMsg}). Silakan coba tanyakan kembali.`,
          timestamp: timeStr,
        },
      ]);
    } finally {
      abortControllerRef.current = null;
      setAssistantLoading(false);
      if (assistantMode === 'conversation') {
        setTimeout(() => assistantInputRef.current?.focus(), 30);
      }
    }
  };

  // Keep latest handleAskGemini in ref so Voice Recognition never uses a stale closure
  handleAskGeminiRef.current = handleAskGemini;

  // Real-time two-way voice conversation via Gemini 3.8 Live API WebSocket + Web Speech API
  const startBrowserVoiceRecognition = useCallback(
    (forceStart = false) => {
      if (voiceListening && !forceStart) {
        stopVoiceRecognition();
        setAgentHeadline('Sesi suara dihentikan');
        return;
      }

      stopVoiceRecognition();
      setVoiceStatusHint(null);
      setVoiceListening(true);
      setBotForm('listening');
      setAgentTranscript('');
      setAgentHeadline('Menghubungkan Isle Assistant...');
      liveInputAccRef.current = '';
      liveOutputAccRef.current = '';

      // 1. Connect to Server-Side Gemini 3.8 Live API WebSocket (/api/gemini/live)
      const wsBase = getWsBaseUrl();
      const wsUrl = `${wsBase}/api/gemini/live?lang=${encodeURIComponent(voiceLang)}${
        geminiApiKey ? `&key=${encodeURIComponent(geminiApiKey)}` : ''
      }`;

      let wsConnected = false;
      try {
        const ws = new WebSocket(wsUrl);
        liveWsRef.current = ws;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          outputAudioCtxRef.current = new AudioCtx({ sampleRate: 24000 });
          nextStartTimeRef.current = 0;
        }

        ws.onopen = () => {
          wsConnected = true;
          setLiveConnected(true);
          setAgentHeadline('Isle Assistant aktif — silakan bicara sekarang');
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'connected') {
              setLiveConnected(true);
              setAgentHeadline('Isle Assistant terhubung · Silakan bicara');
            } else if (msg.type === 'inputTranscription' && msg.text) {
              liveInputAccRef.current = (liveInputAccRef.current + ' ' + msg.text).trim();
              setAgentTranscript(liveInputAccRef.current);
              setAssistantInput(liveInputAccRef.current);
            } else if (msg.type === 'outputTranscription' && msg.text) {
              liveOutputAccRef.current = (liveOutputAccRef.current + msg.text).trim();
              setAgentHeadline(liveOutputAccRef.current);
              setBotForm('reply');
            } else if (msg.type === 'modelText' && msg.text) {
              liveOutputAccRef.current = (liveOutputAccRef.current + msg.text).trim();
              setAgentHeadline(liveOutputAccRef.current);
            } else if (msg.type === 'audio' && msg.audio && outputAudioCtxRef.current) {
              // Play 24kHz PCM audio chunk gaplessly
              const outCtx = outputAudioCtxRef.current;
              if (outCtx.state === 'suspended') {
                outCtx.resume().catch(() => {});
              }
              const float32 = pcm16Base64ToFloat32(msg.audio);
              if (float32.length > 0) {
                // Compute output voice energy for BotCanvas animation
                let sum = 0;
                for (let i = 0; i < float32.length; i += 8) {
                  sum += Math.abs(float32[i]);
                }
                const avg = sum / (float32.length / 8);
                voiceEnergyRef.current = Math.min(1, Math.max(0.25, avg * 4.5));

                const audioBuffer = outCtx.createBuffer(1, float32.length, 24000);
                audioBuffer.getChannelData(0).set(float32);
                const sourceNode = outCtx.createBufferSource();
                sourceNode.buffer = audioBuffer;
                sourceNode.connect(outCtx.destination);

                const startTime = Math.max(outCtx.currentTime, nextStartTimeRef.current);
                sourceNode.start(startTime);
                nextStartTimeRef.current = startTime + audioBuffer.duration;
                activeAudioNodesRef.current.push(sourceNode);
                sourceNode.onended = () => {
                  activeAudioNodesRef.current = activeAudioNodesRef.current.filter(
                    (n) => n !== sourceNode
                  );
                };
              }
            } else if (msg.type === 'interrupted') {
              for (const node of activeAudioNodesRef.current) {
                try {
                  node.stop();
                } catch {
                  // ignore
                }
              }
              activeAudioNodesRef.current = [];
              nextStartTimeRef.current = 0;
            } else if (msg.type === 'turnComplete') {
              const userSpoken = liveInputAccRef.current.trim();
              const modelSpoken = liveOutputAccRef.current.trim();
              if (userSpoken) {
                executeIslandCommand(userSpoken);
              }
              if (userSpoken || modelSpoken) {
                const stamp = `${String(new Date().getHours()).padStart(2, '0')}:${String(
                  new Date().getMinutes()
                ).padStart(2, '0')}`;
                setMessages((prev) => {
                  const next = [...prev.slice(-56)];
                  if (userSpoken) {
                    next.push({
                      id: Date.now() + 1,
                      role: 'user',
                      text: userSpoken,
                      timestamp: stamp,
                    });
                  }
                  if (modelSpoken) {
                    next.push({
                      id: Date.now() + 2,
                      role: 'assistant',
                      text: modelSpoken,
                      timestamp: stamp,
                    });
                  }
                  return next;
                });
                liveInputAccRef.current = '';
                liveOutputAccRef.current = '';
              }
            } else if (msg.type === 'error' && msg.error) {
              setVoiceStatusHint(msg.error);
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onerror = () => {
          setLiveConnected(false);
        };

        ws.onclose = () => {
          setLiveConnected(false);
        };
      } catch {
        // Fallback to SpeechRecognition if WS fails
      }

      // 2. State & Handlers for Speech Recognition and Audio Multimodal Fallback
      recordedVoiceChunksRef.current = [];
      hasDetectedSpeechRef.current = false;
      lastSpeechDetectedTimeRef.current = 0;
      let latestCombinedTranscript = '';
      let submitted = false;

      const submitFallbackIfLiveSilent = (textToSubmit: string) => {
        if (submitted) return;
        const cleaned = textToSubmit.trim();
        if (!cleaned) return;
        // If Gemini 3.8 Live already responded with audio/transcription, execute local command only
        if (wsConnected && liveOutputAccRef.current.trim().length > 0) {
          executeIslandCommand(cleaned);
          return;
        }
        submitted = true;
        stopVoiceRecognition();
        handleAskGeminiRef.current(cleaned);
      };

      const submitAudioFallbackIfLiveSilent = () => {
        if (submitted) return;
        if (wsConnected && liveOutputAccRef.current.trim().length > 0) {
          return;
        }
        if (latestCombinedTranscript.trim().length > 0) {
          submitFallbackIfLiveSilent(latestCombinedTranscript);
          return;
        }
        if (recordedVoiceChunksRef.current.length < 5) return;
        submitted = true;
        const wavB64 = float32ToWavBase64(recordedVoiceChunksRef.current, 16000);
        stopVoiceRecognition();
        setAgentHeadline('Memproses pesan suara...');
        handleAskGeminiRef.current('Pesan suara', wavB64);
      };

      // 3. Capture 16kHz Microphone Audio Stream & Stream PCM chunks to Gemini 3.8 Live WS + Record WAV Buffer
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({
            audio: {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
            },
          })
          .then((stream) => {
            micStreamRef.current = stream;
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            const inCtx = new AudioCtx({ sampleRate: 16000 });
            inputAudioCtxRef.current = inCtx;
            const source = inCtx.createMediaStreamSource(stream);
            const processor = inCtx.createScriptProcessor(2048, 1, 1);
            scriptProcessorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // Save raw audio chunk for multimodal audio fallback (cap at ~250 chunks ~32s)
              recordedVoiceChunksRef.current.push(new Float32Array(inputData));
              if (recordedVoiceChunksRef.current.length > 250) {
                recordedVoiceChunksRef.current.shift();
              }

              // Update real-time microphone RMS energy for BotCanvas
              let sum = 0;
              for (let i = 0; i < inputData.length; i += 4) {
                sum += inputData[i] * inputData[i];
              }
              const rms = Math.sqrt(sum / (inputData.length / 4));
              voiceEnergyRef.current = Math.min(1, Math.max(0.12, rms * 6.5));

              if (rms > 0.012) {
                hasDetectedSpeechRef.current = true;
                lastSpeechDetectedTimeRef.current = Date.now();
              }

              if (liveWsRef.current && liveWsRef.current.readyState === WebSocket.OPEN) {
                const base64Pcm = float32ToPcm16Base64(inputData);
                liveWsRef.current.send(JSON.stringify({ audio: base64Pcm }));
              }

              // VAD Silence Detection Fallback: if user spoke and then fell silent for > 1200ms
              if (
                hasDetectedSpeechRef.current &&
                lastSpeechDetectedTimeRef.current > 0 &&
                Date.now() - lastSpeechDetectedTimeRef.current > 1200 &&
                !submitted &&
                liveOutputAccRef.current.trim().length === 0
              ) {
                submitAudioFallbackIfLiveSilent();
              }
            };

            source.connect(processor);
            processor.connect(inCtx.destination);
          })
          .catch(() => {
            setVoiceStatusHint('Mikrofon belum diizinkan di browser — izinkan akses mikrofon atau ketik langsung.');
          });
      }

      // 4. Parallel Browser SpeechRecognition for live local transcript & Search-Grounded action fallback
      const SpeechRec =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          speechRecRef.current = rec;
          rec.lang = voiceLang;
          rec.interimResults = true;
          rec.continuous = true;
          rec.maxAlternatives = 1;

          rec.onresult = (event: any) => {
            let finalPart = '';
            let interimPart = '';
            for (let i = 0; i < event.results.length; i++) {
              const res = event.results[i];
              const t = res?.[0]?.transcript || '';
              if (res.isFinal) {
                finalPart += t + ' ';
              } else {
                interimPart += t;
              }
            }
            const combined = (finalPart + interimPart).trim();
            if (combined) {
              latestCombinedTranscript = combined;
              hasDetectedSpeechRef.current = true;
              lastSpeechDetectedTimeRef.current = Date.now();
              setAgentTranscript(combined);
              setAssistantInput(combined);

              if (voiceSilenceTimerRef.current) {
                window.clearTimeout(voiceSilenceTimerRef.current);
              }
              voiceSilenceTimerRef.current = window.setTimeout(() => {
                submitFallbackIfLiveSilent(latestCombinedTranscript);
              }, 1250);
            }
          };

          rec.onerror = (errEvent: any) => {
            const errCode = errEvent?.error || '';
            if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
              setVoiceStatusHint('Izin mikrofon diblokir browser — izinkan akses mikrofon di pengaturan situs.');
            }
          };

          rec.start();
        } catch {
          // ignore
        }
      }
    },
    [stopVoiceRecognition, voiceLang, voiceListening]
  );

  // Clean up voice recognition on unmount
  useEffect(() => {
    return () => stopVoiceRecognition();
  }, [stopVoiceRecognition]);

  // ── Global Keyboard Shortcuts (Alt+Q / Alt+I for AI Assistant Toggle + Full Collapse + Auto-Focus Game Capture) ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // Alt + H: Toggle Mini Capsule Auto-Hide Mode Instantly (No alert/notification popup)
      if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        const nowToggle = Date.now();
        if (nowToggle - lastMiniCapsuleToggleRef.current < 250) return;
        lastMiniCapsuleToggleRef.current = nowToggle;
        if (alertTimerRef.current) {
          window.clearTimeout(alertTimerRef.current);
          alertTimerRef.current = null;
        }
        setActiveAlert(null);
        setMiniCapsuleMode((prev) => {
          const next = !prev;
          if (next) {
            setIsPinnedOpen(false);
            setIsHovered(false);
            setDragAutoOpened(false);
            setAssistantOpen(false);
            setLyricsMode(false);
            setSettingsOpen(false);
            setTopEdgeHover(false);
            setDesktopClickThrough(true);
          }
          return next;
        });
        return;
      }

      // Alt + Q (or Alt + I): Open AI Assistant OR Collapse entire Dynamic Island back to compact notch
      if ((e.altKey || e.metaKey) && (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'i')) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return; // Chaos Guard: Holding Alt+Q won't flicker the Assistant
        setActiveAlert(null);
        setSettingsOpen(false);

        if (assistantOpen) {
          // Pressing Alt+Q while AI is already open collapses the ENTIRE Dynamic Island back to compact notch!
          closeAssistantAndCollapse();
        } else {
          setShowAllChatHistory(false);
          setAssistantOpen(true);
          setAssistantMode(defaultAltQMode);
          setIsPinnedOpen(true);
          if (defaultAltQMode === 'conversation') {
            stopVoiceRecognition();
            setTimeout(() => assistantInputRef.current?.focus(), 40);
          } else {
            setTimeout(() => startBrowserVoiceRecognition(true), 30);
          }
        }
        return;
      }

      if (e.key === 'Escape') {
        if (assistantLoading) {
          cancelInFlightGemini();
          return;
        }
        if (activeAlert) {
          setActiveAlert(null);
        } else if (assistantOpen) {
          closeAssistantAndCollapse();
        } else {
          setIsPinnedOpen(false);
          setIsHovered(false);
          setDragAutoOpened(false);
          setLyricsMode(false);
          setSettingsOpen(false);
        }
        return;
      }

      // AUTO-FOCUS GAME GUARD: When Assistant is open, any printable keystroke automatically
      // focuses the AI input box so the user never types into a background game!
      if (
        assistantOpen &&
        !inInput &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        stopVoiceRecognition();
        if (assistantMode !== 'conversation') {
          setAssistantMode('conversation');
        }
        setBotForm('typing');
        setAssistantInput((prev) => (prev + e.key).slice(0, 1000));
        setTimeout(() => assistantInputRef.current?.focus(), 10);
        return;
      }

      if (e.key === 'CapsLock') {
        if (e.repeat) return;
        const nextCaps = !capsLockOn;
        setCapsLockOn(nextCaps);
        triggerAlert('capslock', { capsOn: nextCaps });
        return;
      }

      if (e.key === 'AudioVolumeMute' || (!inInput && !assistantOpen && e.key.toLowerCase() === 'm')) {
        if (e.repeat) return;
        e.preventDefault();
        const nextMuted = !muted;
        setMuted(nextMuted);
        triggerAlert('mute', { value: nextMuted ? 0 : volume, muted: nextMuted });
        return;
      }

      // Windows Native Volume Step: +2 per click/press, max 100
      if (e.key === 'AudioVolumeUp' || (!inInput && !assistantOpen && e.key === ']')) {
        e.preventDefault();
        setMuted(false);
        setVolume((v) => {
          const next = Math.min(100, v + 2);
          if (v === 100) setNudgeCount((c) => c + 1);
          triggerAlert('volume', { value: next, muted: false });
          return next;
        });
        return;
      }

      // Windows Native Volume Step: -2 per click/press, min 0
      if (e.key === 'AudioVolumeDown' || (!inInput && !assistantOpen && e.key === '[')) {
        e.preventDefault();
        setVolume((v) => {
          const next = Math.max(0, v - 2);
          if (v === 0) setNudgeCount((c) => c + 1);
          setMuted(next === 0);
          triggerAlert('volume', { value: next, muted: next === 0 });
          return next;
        });
        return;
      }

      // Laptop Brightness Up: +1 per press, max 10 (Supports BrightnessUp key, F2/F7, Alt+ArrowUp, or B)
      if (
        e.key === 'BrightnessUp' ||
        e.code === 'BrightnessUp' ||
        (e as any).keyCode === 253 ||
        (!inInput &&
          !assistantOpen &&
          (e.key === 'F2' ||
            e.key === 'F7' ||
            e.key.toLowerCase() === 'b' ||
            (e.altKey && e.key === 'ArrowUp')))
      ) {
        e.preventDefault();
        setBrightness((b) => {
          const next = Math.min(10, b + 1);
          if (b === 10) setNudgeCount((c) => c + 1);
          triggerAlert('brightness', { value: next });
          return next;
        });
        return;
      }

      // Laptop Brightness Down: -1 per press, min 0 (Supports BrightnessDown key, F1/F6, Alt+ArrowDown, or V)
      if (
        e.key === 'BrightnessDown' ||
        e.code === 'BrightnessDown' ||
        (e as any).keyCode === 252 ||
        (!inInput &&
          !assistantOpen &&
          (e.key === 'F1' ||
            e.key === 'F6' ||
            e.key.toLowerCase() === 'v' ||
            (e.altKey && e.key === 'ArrowDown')))
      ) {
        e.preventDefault();
        setBrightness((b) => {
          const next = Math.max(0, b - 1);
          if (b === 0) setNudgeCount((c) => c + 1);
          triggerAlert('brightness', { value: next });
          return next;
        });
        return;
      }
    };

    const onGlobalMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('#dynamic-island-surface')) return;
      if (lyricsMode) return;
      if (isExpanded && !assistantOpen) {
        setIsPinnedOpen(false);
        setIsHovered(false);
        setDragAutoOpened(false);
        setIsDragOver(false);
        setSettingsOpen(false);
      }
    };

    const unsubscribeElectronShortcut = window.electronAPI?.onToggleAssistant?.(() => {
      setActiveAlert(null);
      setSettingsOpen(false);
      if (assistantOpen) {
        closeAssistantAndCollapse();
        setDesktopClickThrough(true);
      } else {
        setDesktopClickThrough(false);
        setShowAllChatHistory(false);
        setAssistantOpen(true);
        setAssistantMode(defaultAltQMode);
        setIsPinnedOpen(true);
        if (defaultAltQMode === 'conversation') {
          stopVoiceRecognition();
          setTimeout(() => assistantInputRef.current?.focus(), 40);
        } else {
          setTimeout(() => startBrowserVoiceRecognition(true), 30);
        }
      }
    });

    const unsubscribeMiniCapsuleShortcut = window.electronAPI?.onToggleMiniCapsule?.(() => {
      const nowToggle = Date.now();
      if (nowToggle - lastMiniCapsuleToggleRef.current < 250) return;
      lastMiniCapsuleToggleRef.current = nowToggle;
      if (alertTimerRef.current) {
        window.clearTimeout(alertTimerRef.current);
        alertTimerRef.current = null;
      }
      setActiveAlert(null);
      setMiniCapsuleMode((prev) => {
        const next = !prev;
        if (next) {
          setIsPinnedOpen(false);
          setIsHovered(false);
          setDragAutoOpened(false);
          setAssistantOpen(false);
          setLyricsMode(false);
          setSettingsOpen(false);
          setTopEdgeHover(false);
          setDesktopClickThrough(true);
        }
        return next;
      });
    });

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onGlobalMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onGlobalMouseDown);
      unsubscribeElectronShortcut?.();
      unsubscribeMiniCapsuleShortcut?.();
    };
  }, [
    activeAlert,
    assistantLoading,
    assistantMode,
    assistantOpen,
    cancelInFlightGemini,
    capsLockOn,
    closeAssistantAndCollapse,
    defaultAltQMode,
    isExpanded,
    lyricsMode,
    muted,
    setDesktopClickThrough,
    startBrowserVoiceRecognition,
    stopVoiceRecognition,
    triggerActionConfirmation,
    triggerAlert,
    volume,
  ]);

  // ── Carousel Navigation Handlers (Trigger Dual-Layer Simultaneous Slide) ──
  const goPrevPage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
    setDragAutoOpened(false);
    setLyricsMode(false);
    stepCarouselPage(-1);
  };

  const goNextPage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
    setDragAutoOpened(false);
    setLyricsMode(false);
    stepCarouselPage(1);
  };

  const selectTabPage = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
    setDragAutoOpened(false);
    if (idx === pageIndex) return;
    setLyricsMode(false);
    navigateToPage(idx, idx > pageIndex ? 'right' : 'left');
  };

  // ── Tightened Island Target Dimensions ──
  const { targetW, targetH, targetR, targetS, tintStyle, tintRgb } = useMemo(() => {
    if (activeAlert) {
      if (
        activeAlert.type === 'volume' ||
        activeAlert.type === 'mute' ||
        activeAlert.type === 'brightness'
      ) {
        return {
          targetW: 310,
          targetH: 36,
          targetR: 15,
          targetS: 10,
          tintStyle: 'none' as const,
          tintRgb: [0.2, 0.5, 0.95] as [number, number, number],
        };
      }
      if (activeAlert.type === 'capslock') {
        return {
          targetW: 246,
          targetH: 36,
          targetR: 15,
          targetS: 10,
          tintStyle: 'none' as const,
          tintRgb: [0.2, 0.5, 0.95] as [number, number, number],
        };
      }
      if (activeAlert.type === 'charging' || activeAlert.type === 'lowbattery') {
        return {
          targetW: 320,
          targetH: 54,
          targetR: 22,
          targetS: 12,
          tintStyle: 'none' as const,
          tintRgb: [0.19, 0.82, 0.35] as [number, number, number],
        };
      }
      if (activeAlert.type === 'permission') {
        return {
          targetW: 396,
          targetH: 104,
          targetR: 26,
          targetS: 15,
          tintStyle: 'glow' as const,
          tintRgb: [0.85, 0.55, 0.18] as [number, number, number],
        };
      }
      if (activeAlert.type === 'alarm') {
        return {
          targetW: 420,
          targetH: 64,
          targetR: 24,
          targetS: 14,
          tintStyle: 'glow' as const,
          tintRgb: [1, 0.6, 0.1] as [number, number, number],
        };
      }
      if (activeAlert.type === 'action_confirm' || activeAlert.type === 'notification') {
        return {
          targetW: 468,
          targetH: 62,
          targetR: 24,
          targetS: 14,
          tintStyle: 'glow' as const,
          tintRgb: [0.18, 0.72, 0.96] as [number, number, number],
        };
      }
      return {
        targetW: 416,
        targetH: 56,
        targetR: 22,
        targetS: 13,
        tintStyle: 'glow' as const,
        tintRgb: [0.18, 0.72, 0.96] as [number, number, number],
      };
    }

    if (!isExpanded) {
      // Mini Capsule Auto-Hide Mode (Alt + H): shrinks to an unobtrusive 2px top lip until cursor touches the top edge
      if (miniCapsuleMode && !topEdgeHover) {
        return {
          targetW: 112,
          targetH: 2,
          targetR: 1,
          targetS: 2,
          tintStyle: 'none' as const,
          tintRgb: [0.2, 0.5, 0.95] as [number, number, number],
        };
      }
      return {
        targetW: 156,
        targetH: 32,
        targetR: 14,
        targetS: 9,
        tintStyle: 'none' as const,
        tintRgb: [0.2, 0.5, 0.95] as [number, number, number],
      };
    }

    if (assistantOpen) {
      if (assistantMode === 'voice-pill') {
        return {
          targetW: 410,
          targetH: 100,
          targetR: 24,
          targetS: 14,
          tintStyle: 'aura' as const,
          tintRgb: [0.56, 0.4, 1] as [number, number, number],
        };
      }
      // Sleek AI Width (418px) + Generous Auto-Fitting Height so New Chat and Responses Never Cut Off
      let dynamicAiHeight = pendingImage ? 190 : 172;
      if (showAllChatHistory) {
        dynamicAiHeight = 244;
      } else if (assistantLoading) {
        dynamicAiHeight = pendingImage ? 190 : 172;
      } else if (latestAssistantMessage) {
        const estLines = Math.max(1, Math.ceil(latestAssistantMessage.text.length / 42));
        const hasSources = Boolean(
          latestAssistantMessage.searchSources && latestAssistantMessage.searchSources.length > 0
        );
        const hasCmdOrFiles = Boolean(
          latestAssistantMessage.commandCard ||
            (latestAssistantMessage.foundFiles && latestAssistantMessage.foundFiles.length > 0)
        );
        const hasImg = Boolean(latestAssistantMessage.imageUrl || pendingImage);
        dynamicAiHeight = Math.min(
          270,
          Math.max(
            172,
            100 +
              estLines * 18 +
              (hasSources ? 20 : 0) +
              (hasCmdOrFiles ? 36 : 0) +
              (hasImg ? 40 : 0)
          )
        );
      }
      return {
        targetW: 418,
        targetH: dynamicAiHeight,
        targetR: 24,
        targetS: 14,
        tintStyle: 'aura' as const,
        tintRgb: [0.56, 0.4, 1] as [number, number, number],
      };
    }

    // Unified 440x178 base across standard menus so < and > nav buttons never shift under the cursor,
    // while Lyrics Mode expands ONLY horizontally (width 440 -> 520) keeping height fixed at 178px
    if (activePage === 'music' && lyricsMode && !settingsOpen) {
      return {
        targetW: 520,
        targetH: 178,
        targetR: 34,
        targetS: 16,
        tintStyle: activeTrack ? ('wash' as const) : ('none' as const),
        tintRgb: currentTrack.tintRgb,
      };
    }

    return {
      targetW: 440,
      targetH: 178,
      targetR: 34,
      targetS: 16,
      tintStyle: activeTrack ? ('wash' as const) : ('none' as const),
      tintRgb: currentTrack.tintRgb,
    };
  }, [
    activeAlert,
    isExpanded,
    miniCapsuleMode,
    topEdgeHover,
    assistantOpen,
    assistantMode,
    settingsOpen,
    activePage,
    lyricsMode,
    activeTrack,
    currentTrack.tintRgb,
    showAllChatHistory,
    assistantLoading,
    latestAssistantMessage,
    pendingImage,
  ]);

  // ── Live Battery Ring Indicator (Reflects Real Battery % and Charging State — Matches HTML .battery-icon) ──
  const renderBatteryRing = (size = 15, stroke = 2.2) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0.05, Math.min(1, batteryLevel / 100));
    const ringColor =
      batteryLevel < 15 && !isCharging
        ? '#ff453a'
        : batteryLevel <= 25 && !isCharging
        ? '#ff9f0a'
        : '#1ed760';
    const trackColor =
      batteryLevel < 15 && !isCharging
        ? 'rgba(255, 69, 58, 0.25)'
        : batteryLevel <= 25 && !isCharging
        ? 'rgba(255, 159, 10, 0.25)'
        : 'rgba(30, 215, 96, 0.26)';
    const boltSize = size >= 20 ? 10 : Math.max(7, size - 7);

    return (
      <div
        title={`Battery: ${batteryLevel}% · ${isCharging ? 'Charging' : 'On Battery'}`}
        className="relative inline-flex items-center justify-center shrink-0"
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={trackColor}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
        {isCharging && (
          <span className="absolute inset-0 flex items-center justify-center">
            <svg width={boltSize} height={boltSize} viewBox="0 0 24 24" fill="#ffffff">
              <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" />
            </svg>
          </span>
        )}
      </div>
    );
  };

  // ── Reusable Page Renderer (Enables Simultaneous Outgoing + Incoming Carousel Slide Animation) ──
  const renderPageContent = (pageId: IslandPage, isOutgoing = false) => {
    switch (pageId) {
      case 'music': {
        const isExternalSource = Boolean(activeTrack && activeTrack.sourceType === 'external');
        const activeShuffleState = isExternalSource ? externalShuffleEnabled : moodShuffleEnabled;
        const displayHeadline = activeTrack
          ? activeTrack.title
          : mediaLoading
          ? 'Memuat lagu...'
          : 'Tidak ada media';
        const displaySub = mediaLoading
          ? 'Menyiapkan Official Studio Audio & Synced Lyrics...'
          : activeTrack
          ? activeTrack.artist || ''
          : '';
        const displayLyricsLines = activeTrack ? parsedLyrics : [];
        const controlsActive = Boolean(activeTrack);

        return (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full h-full flex flex-col justify-between select-none transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              lyricsMode ? 'px-[26px] py-[16px]' : 'px-[42px] pt-[12px] pb-[10px]'
            }`}
          >
            {/* Header Waktu & Baterai (.top-bar — Smoothly fades & collapses when entering Lyrics Mode) */}
            <div
              className={`isle-stagger-1 flex items-center justify-center gap-[7px] text-[13px] pl-[30px] whitespace-nowrap transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isOutgoing
                  ? 'opacity-0 pointer-events-none max-h-[24px] mb-[2px]'
                  : lyricsMode
                  ? 'max-h-0 opacity-0 -translate-y-2 scale-95 blur-[3px] mb-0 pointer-events-none overflow-hidden'
                  : 'max-h-[24px] opacity-100 translate-y-0 scale-100 blur-0 mb-[2px]'
              }`}
            >
              {renderBatteryRing(20, 2.5)}
              <span className="text-[#d1d1d6] font-medium">
                {headerDateStr} {nowDate.getFullYear()}
              </span>
              <span className="text-white font-bold tabular-nums">{timeStr}</span>
            </div>

            {/* Optional Top-Right Waveform / Queue / FLAC when playing (Fades out smoothly in Lyrics Mode) */}
            {(activeTrack || flacEnabled || musicQueue.length > 0) && (
              <div
                className={`isle-stagger-1 absolute top-[13px] right-[26px] flex items-center gap-1.5 z-10 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  lyricsMode
                    ? 'opacity-0 scale-90 blur-[2px] pointer-events-none'
                    : 'opacity-100 scale-100 blur-0'
                }`}
              >
                {musicQueue.length > 0 && (
                  <button
                    onClick={handleNextTrack}
                    title={`Antrian Lagu (${musicQueue.length}):\n${musicQueue
                      .map((t, i) => `${i + 1}. ${t.title}${t.artist ? ` - ${t.artist}` : ''}`)
                      .join('\n')}\n(Klik untuk langsung putar lagu berikutnya)`}
                    className="px-1.5 py-0.5 rounded bg-white/15 hover:bg-white/25 border border-white/20 text-white text-[8.5px] font-bold tracking-tight cursor-pointer transition tabular-nums"
                  >
                    +{musicQueue.length} Antrian
                  </button>
                )}
                {(flacEnabled || activeTrack?.isFlac) && (
                  <span
                    onClick={() => setSettingsOpen(true)}
                    title="FLAC Lossless Audio Active (Click to configure in Settings)"
                    className="px-1.5 py-0.5 rounded bg-amber-400/20 border border-amber-400/40 text-[#ffd60a] text-[8px] font-bold tracking-wider cursor-pointer hover:bg-amber-400/30 transition"
                  >
                    FLAC
                  </span>
                )}
                {activeTrack && (
                  <button
                    onClick={handleTogglePlay}
                    title={isPlaying ? 'Pause music' : 'Play music'}
                    className="text-white/95 hover:text-white transition"
                  >
                    <BeatEqualizerBars
                      size={14}
                      playing={isPlaying && !muted && volume > 0}
                      activeTrackTitle={activeTrack?.title}
                      activeTrackArtist={activeTrack?.artist}
                      hasAudioUrl={Boolean(activeTrack?.audioUrl)}
                      audioEl={audioElRef.current}
                      positionMsRef={positionMsRef}
                      parsedLyricsCount={parsedLyrics.length}
                      activeLineIndex={activeLineIndex}
                    />
                  </button>
                )}
              </div>
            )}

            {/* Unified Main Row: Left Music Controls Column + Elastic Right Lyrics Panel */}
            <div className="flex items-center w-full flex-1 min-h-0">
              {/* Left Column: Morphs smoothly from 100% width in normal mode to 222px in Lyrics Mode */}
              <div
                className={`flex flex-col justify-between transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  lyricsMode ? 'w-[222px] shrink-0 h-full py-1' : 'w-full'
                }`}
              >
                {/* Album Art & Teks (.media-info) */}
                <div
                  className={`isle-stagger-2 flex items-center w-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    lyricsMode ? 'gap-[14px] mt-0 mb-[10px]' : 'gap-[18px] -mt-[10px] mb-[12px]'
                  }`}
                >
                  {activeTrack?.coverUrl ? (
                    <img
                      src={activeTrack.coverUrl}
                      alt={activeTrack.title}
                      className={`object-cover shrink-0 shadow-md transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        lyricsMode
                          ? 'w-[56px] h-[56px] rounded-[13px]'
                          : 'w-[66px] h-[66px] rounded-[14px]'
                      }`}
                    />
                  ) : (
                    <div
                      className={`bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        lyricsMode
                          ? 'w-[56px] h-[56px] rounded-[13px]'
                          : 'w-[66px] h-[66px] rounded-[14px]'
                      }`}
                    >
                      <svg
                        width={lyricsMode ? 26 : 32}
                        height={lyricsMode ? 26 : 32}
                        viewBox="0 0 24 24"
                        fill="#8e8e93"
                        className="transition-all duration-500"
                      >
                        <path d="M20 3L9 5v10.55c-.59-.34-1.27-.55-2-.55-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V9.82l8-1.6v5.33c-.59-.34-1.27-.55-2-.55-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V3z" />
                      </svg>
                    </div>
                  )}

                  {activeTrack ? (
                    <div
                      className={`min-w-0 flex-1 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        lyricsMode ? 'mt-0' : 'mt-[8px]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div
                          className={`font-bold text-white tracking-[-0.2px] truncate leading-snug transition-all duration-500 ${
                            lyricsMode ? 'text-[15px]' : 'text-[16px]'
                          }`}
                        >
                          {displayHeadline}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearActiveTrack(e);
                          }}
                          title="Hapus lagu & kembalikan Music Player ke default"
                          aria-label="Clear active track"
                          className="w-[17px] h-[17px] rounded-full bg-white/[0.08] hover:bg-white/[0.2] border border-white/[0.08] text-white/55 hover:text-white flex items-center justify-center shrink-0 transition active:scale-90 cursor-pointer"
                        >
                          <CloseCrossSvg size={8.5} />
                        </button>
                      </div>
                      <div
                        className={`text-[#8e8e93] font-medium truncate leading-tight mt-0.5 transition-all duration-500 ${
                          lyricsMode ? 'text-[12px] text-white/60' : 'text-[12px]'
                        }`}
                      >
                        {displaySub}
                      </div>
                    </div>
                  ) : (
                    <div
                      title="Tekan Alt + Q untuk meminta AI memutar musik"
                      className={`font-bold text-white tracking-[-0.2px] truncate transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        lyricsMode ? 'text-[15px] mt-0' : 'text-[16px] mt-[8px]'
                      }`}
                    >
                      {displayHeadline}
                    </div>
                  )}
                </div>

                {/* Progress Bar (.progress-row — Smoothly morphs width with Left Column) */}
                <div
                  className={`isle-stagger-3 flex items-center w-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    lyricsMode ? 'gap-[10px] mb-[8px]' : 'gap-[12px] mb-[10px]'
                  }`}
                >
                  <span
                    className={`font-medium tracking-[-0.3px] tabular-nums shrink-0 transition-all duration-300 ${
                      lyricsMode ? 'text-[13px]' : 'text-[14px]'
                    } ${controlsActive ? 'text-white' : 'text-white/45'}`}
                  >
                    {formatTrackTime(activeTrack ? positionMs : 0)}
                  </span>
                  <div
                    onClick={(e) => {
                      if (!activeTrack || !activeTrack.durationMs) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      const nextMs = Math.floor(ratio * activeTrack.durationMs);
                      handleSeek(nextMs);
                    }}
                    className={`flex-1 h-[5px] rounded-[3px] relative cursor-pointer flex items-center overflow-hidden transition-colors duration-300 ${
                      controlsActive ? 'bg-white/25' : 'bg-white/15'
                    }`}
                  >
                    {activeTrack && activeTrack.durationMs > 0 && (
                      <div
                        className="h-full bg-white rounded-[3px] transition-[width] duration-75 ease-linear"
                        style={{
                          width: `${Math.min(100, (positionMs / activeTrack.durationMs) * 100)}%`,
                        }}
                      />
                    )}
                  </div>
                  <span
                    className={`font-medium tracking-[-0.3px] tabular-nums shrink-0 transition-all duration-300 ${
                      lyricsMode ? 'text-[13px]' : 'text-[14px]'
                    } ${controlsActive ? 'text-white' : 'text-white/45'}`}
                  >
                    {activeTrack
                      ? formatTrackTime(Math.max(0, activeTrack.durationMs - positionMs), true)
                      : '-00:00'}
                  </span>
                </div>

                {/* Tombol Kontrol (.controls-row — Glides smoothly with Left Column) */}
                <div
                  className={`isle-stagger-4 relative flex items-center justify-center w-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    lyricsMode ? 'h-[28px] mb-0' : 'h-[26px] mb-[8px]'
                  }`}
                >
                  <button
                    onClick={() => {
                      setIsPinnedOpen(true);
                      setLyricsMode((prev) => !prev);
                    }}
                    className={`absolute flex items-center justify-center cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-90 active:scale-90 ${
                      lyricsMode ? 'left-[4px] text-white' : 'left-[24px]'
                    }`}
                    title={lyricsMode ? 'Close Lyrics View' : 'Lyrics'}
                    aria-label="Lyrics"
                  >
                    {lyricsMode ? (
                      <LyricsQuoteBubbleSvg size={19} active />
                    ) : (
                      <svg
                        width={20}
                        height={20}
                        viewBox="0 0 24 24"
                        fill={activeTrack ? '#ffffff' : '#555558'}
                        className="transition-colors duration-300"
                      >
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h3v4l4-4h9c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14h-9.83L8 18.17V16H4V4h16v12z" />
                        <path d="M9.5 8.5h2v2.5L10.3 13H8.8l1.1-2H9.5V8.5zm4 0h2v2.5L14.3 13h-1.5l1.1-2h-.4V8.5z" />
                      </svg>
                    )}
                  </button>

                  <div
                    className={`flex items-center transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      lyricsMode ? 'gap-[22px] px-[24px]' : 'gap-[28px] pl-0'
                    }`}
                  >
                    <button
                      onClick={handlePrevTrack}
                      className="flex items-center justify-center cursor-pointer transition hover:opacity-85 active:scale-90"
                      title="Previous / Rewind"
                      aria-label="Rewind"
                    >
                      <svg
                        width={lyricsMode ? 21 : 22}
                        height={lyricsMode ? 21 : 22}
                        viewBox="0 0 24 24"
                        fill={controlsActive ? '#ffffff' : '#555558'}
                        className="transition-all duration-300"
                      >
                        <path d="M11.5 12l8.5 6V6l-8.5 6zm-9 0l8.5 6V6l-8.5 6z" />
                      </svg>
                    </button>
                    <button
                      onClick={handleTogglePlay}
                      className="flex items-center justify-center cursor-pointer transition hover:opacity-85 active:scale-95"
                      title={isPlaying ? 'Pause' : 'Play'}
                      aria-label="Play"
                    >
                      {isPlaying ? (
                        <svg
                          width={20}
                          height={20}
                          viewBox="0 0 24 24"
                          fill={controlsActive ? '#ffffff' : '#555558'}
                          className="transition-all duration-300"
                        >
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                      ) : (
                        <svg
                          width={20}
                          height={20}
                          viewBox="0 0 24 24"
                          fill={controlsActive ? '#ffffff' : '#555558'}
                          className="transition-all duration-300"
                        >
                          <path d="M6 4l15 8-15 8V4z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={handleNextTrack}
                      className="flex items-center justify-center cursor-pointer transition hover:opacity-85 active:scale-90"
                      title={
                        isExternalSource
                          ? `Next Track (${activeTrack?.externalApp || 'External Player'})`
                          : musicQueue.length > 0
                          ? `Next in Queue: ${musicQueue[0].title} - ${musicQueue[0].artist}`
                          : moodShuffleEnabled
                          ? 'Next (Mood Shuffle Auto-Pick)'
                          : 'Next / Skip Track'
                      }
                      aria-label="Fast Forward"
                    >
                      <svg
                        width={lyricsMode ? 21 : 22}
                        height={lyricsMode ? 21 : 22}
                        viewBox="0 0 24 24"
                        fill={controlsActive || musicQueue.length > 0 ? '#ffffff' : '#555558'}
                        className="transition-all duration-300"
                      >
                        <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
                      </svg>
                    </button>
                  </div>

                  {/* Source-Aware Shuffle Toggle Button (Controls External App Shuffle OR Internal AI Mood Shuffle) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleShuffle();
                    }}
                    className={`absolute flex flex-col items-center justify-center cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-95 active:scale-90 ${
                      lyricsMode ? 'right-[4px]' : 'right-[24px]'
                    }`}
                    title={
                      isExternalSource
                        ? `${activeTrack?.externalApp || 'External'} Shuffle: ${
                            activeShuffleState ? 'ON' : 'OFF'
                          } (Klik untuk toggle shuffle di ${
                            activeTrack?.externalApp || 'aplikasi eksternal'
                          })`
                        : activeShuffleState
                        ? 'Shuffle Musik: ON (Otomatis acak antrian & putar lagu sesuai mood · Klik untuk matikan)'
                        : 'Shuffle Musik: OFF (Klik untuk aktifkan shuffle musik)'
                    }
                    aria-label="Toggle Shuffle"
                  >
                    <svg
                      width={lyricsMode ? 17 : 18}
                      height={lyricsMode ? 17 : 18}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={activeShuffleState ? '#ffffff' : '#555558'}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-colors duration-300"
                    >
                      <polyline points="16 3 21 3 21 8" />
                      <line x1="4" y1="20" x2="21" y2="3" />
                      <polyline points="21 16 21 21 16 21" />
                      <line x1="15" y1="15" x2="21" y2="21" />
                      <line x1="4" y1="4" x2="9" y2="9" />
                    </svg>
                    {activeShuffleState && (
                      <span className="w-1 h-1 rounded-full bg-white mt-[2px] shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
                    )}
                  </button>
                </div>
              </div>

              {/* Right Column: Divider + Synced Lyrics Panel (Smoothly slides, scales & unblurs on toggle) */}
              <div
                className={`flex items-center h-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  lyricsMode
                    ? 'flex-1 opacity-100 translate-x-0 scale-100 blur-0 ml-[18px] pointer-events-auto'
                    : 'w-0 opacity-0 translate-x-7 scale-95 blur-[6px] ml-0 pointer-events-none overflow-hidden'
                }`}
              >
                <div className="w-[1px] h-[86%] bg-white/15 shrink-0 mr-[18px]" />

                <div
                  ref={lyricsContainerRef}
                  style={{
                    WebkitMaskImage:
                      'linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%)',
                    maskImage:
                      'linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%)',
                  }}
                  className="flex-1 h-[146px] overflow-y-auto no-scrollbar scroll-smooth space-y-3 pr-1 py-8 flex flex-col justify-start min-w-[215px]"
                >
                  {mediaLoading ? (
                    <div className="text-white/55 text-[13px] font-medium my-auto text-center animate-pulse">
                      Memuat lirik...
                    </div>
                  ) : !activeTrack ? (
                    <div className="my-auto flex flex-col items-center justify-center text-center px-2 select-none">
                      <span className="text-white/45 text-[13px] font-semibold tracking-tight">
                        Belum ada musik diputar
                      </span>
                      <span className="text-white/25 text-[11px] font-medium mt-1">
                        Tekan Alt + Q untuk memutar lagu
                      </span>
                    </div>
                  ) : displayLyricsLines.length === 0 ? (
                    <div className="text-white/40 text-[12.5px] font-medium my-auto text-center px-2">
                      Lirik belum tersedia
                    </div>
                  ) : (
                    displayLyricsLines.map((line, idx) => {
                      const effectiveActiveIdx =
                        activeLineIndex >= 0 ? activeLineIndex : 0;
                      const isCurrent = idx === effectiveActiveIdx;
                      const distance = Math.abs(idx - effectiveActiveIdx);

                      return (
                        <div
                          key={idx}
                          ref={isCurrent ? activeLyricLineRef : null}
                          onClick={() => handleSeek(line.timeMs)}
                          className={`cursor-pointer transition-all duration-300 ease-out origin-left select-none leading-snug ${
                            isCurrent
                              ? 'text-[15px] font-bold text-white opacity-100 scale-[1.02] translate-x-0.5 py-0.5'
                              : distance === 1
                              ? 'text-white/45 text-[13.5px] font-semibold hover:text-white/75'
                              : 'text-white/25 text-[12.5px] font-medium hover:text-white/50'
                          }`}
                          title="Klik untuk melompat ke baris lirik ini"
                        >
                          {isCurrent && line.words && line.words.length > 0 ? (
                            <span className="inline-flex flex-wrap gap-x-1">
                              {line.words.map((w, wIdx) => {
                                const isWordSung = positionMs >= w.startMs;
                                return (
                                  <span
                                    key={wIdx}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSeek(w.startMs);
                                    }}
                                    className={`transition-all duration-150 cursor-pointer ${
                                      isWordSung
                                        ? 'text-white translate-y-[-0.5px]'
                                        : 'text-white/40'
                                    }`}
                                  >
                                    {w.word}
                                  </span>
                                );
                              })}
                            </span>
                          ) : (
                            <span>{line.text}</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Indikator Slide (.pagination — Smoothly fades & collapses in Lyrics Mode) */}
            <div
              className={`flex items-center justify-center gap-[5px] w-full transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isOutgoing
                  ? 'opacity-0 pointer-events-none max-h-[10px]'
                  : lyricsMode
                  ? 'max-h-0 opacity-0 translate-y-2 pointer-events-none overflow-hidden'
                  : 'max-h-[10px] opacity-100 translate-y-0'
              }`}
            >
              {ISLAND_PAGES.map((p, idx) => {
                const isActive = idx === pageIndex;
                return (
                  <button
                    key={p.id}
                    onClick={(e) => selectTabPage(idx, e)}
                    className={`h-[4px] transition-all duration-300 ${
                      isActive
                        ? 'w-[17px] bg-white rounded-[3px]'
                        : 'w-[4px] bg-[#555558] rounded-full hover:bg-white/60'
                    }`}
                    title={p.label}
                  />
                );
              })}
            </div>
          </div>
        );
      }

      case 'notifications':
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full flex flex-col justify-between px-8 py-0.5 overflow-hidden select-none"
          >
            {/* Clean Reference Header Row: "Notifications" on Left + Bell DND Toggle & "Clear" Pill on Right */}
            <div className="isle-stagger-1 flex items-center justify-between shrink-0 mb-1">
              <span className="text-[12.5px] font-medium text-[#8e8e93] tracking-tight">
                Notifications
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDndEnabled((d) => !d)}
                  title={dndEnabled ? 'Do Not Disturb: ON (Klik untuk matikan)' : 'Do Not Disturb: OFF (Klik untuk aktifkan)'}
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition cursor-pointer ${
                    dndEnabled
                      ? 'bg-[#5e5ce6] text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  {dndEnabled ? <MoonFilledSvg size={12} /> : <BellOutlineSvg size={12} />}
                </button>
                <button
                  type="button"
                  onClick={() => setNotifications([])}
                  disabled={notifications.length === 0}
                  className={`px-3 py-0.5 rounded-full text-[11px] font-semibold shrink-0 transition cursor-pointer ${
                    notifications.length > 0
                      ? 'bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white'
                      : 'bg-white/[0.06] text-white/35 cursor-default'
                  }`}
                >
                  Clear
                </button>
              </div>
            </div>

            {notifications.length === 0 ? (
              <div className="isle-stagger-2 flex-1 min-h-0 flex items-center justify-center gap-2 text-white/40 text-[11.5px]">
                <BellOutlineSvg size={13} />
                <span className="truncate">
                  {dndEnabled ? 'Do Not Disturb aktif · ' : ''}Tidak ada notifikasi baru
                </span>
              </div>
            ) : (
              <div className="isle-stagger-2 flex-1 min-h-0 flex flex-col justify-start space-y-1.5 overflow-y-auto no-scrollbar pt-0.5">
                {notifications.map((n, idx) => {
                  const diffSec = Math.max(0, Math.floor((Date.now() - (n.createdAt || 0)) / 1000));
                  const displayTime =
                    n.timeAgo === 'now' || diffSec < 90
                      ? 'now'
                      : diffSec < 3600
                      ? `${Math.floor(diffSec / 60)}m`
                      : n.timeAgo;

                  return (
                    <div
                      key={n.id}
                      style={{
                        animation: 'isleMenuItemIn 360ms cubic-bezier(0.22, 1, 0.36, 1) both',
                        animationDelay: `${Math.min(220, 30 + idx * 40)}ms`,
                      }}
                      className="group flex items-center justify-between gap-2.5 px-3 py-[7px] rounded-[11px] bg-[#161618] hover:bg-[#1f1f22] border border-white/[0.04] transition shrink-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Left Colored Squircle App Icon Badge matching reference screenshot */}
                        <div
                          className={`w-[22px] h-[22px] rounded-[6px] text-white flex items-center justify-center shrink-0 shadow-sm ${
                            n.iconType === 'calendar'
                              ? 'bg-gradient-to-b from-[#ff7b54] to-[#ff453a]'
                              : n.iconType === 'download'
                              ? 'bg-gradient-to-b from-[#38bdf8] to-[#0284c7]'
                              : 'bg-gradient-to-b from-[#6e6aff] to-[#4f46e5]'
                          }`}
                        >
                          {n.iconType === 'calendar' && <CalendarGridSvg size={11} />}
                          {n.iconType === 'download' && <ShelfTraySvg size={11} />}
                          {n.iconType === 'message' && <MessageBubbleSvg size={11} />}
                        </div>

                        {/* Inline Title + Subtitle */}
                        <div className="flex items-baseline gap-2 min-w-0 flex-1">
                          <span className="text-[12px] font-bold text-white shrink-0 tracking-[-0.1px]">
                            {n.title}
                          </span>
                          <span className="text-[11.5px] font-normal text-[#8e8e93] truncate flex-1">
                            {n.subtitle}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className="text-[11px] font-normal text-[#8e8e93] tabular-nums">
                          {displayTime}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setNotifications((prev) => prev.filter((item) => item.id !== n.id))
                          }
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-white/45 hover:text-white transition cursor-pointer"
                          title="Dismiss notification"
                        >
                          <CloseCrossSvg size={9} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'pomodoro': {
        const isFocus = pomoMode === 'focus';

        return (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full flex flex-col justify-center items-center gap-3 px-6 py-2"
          >
            {/* Center Section: Centered Left Glowing Red Badge, Big Timer & Reset, Subtitle */}
            <div className="isle-stagger-1 flex items-center justify-center gap-6 px-1 w-full">
              {/* Left Glowing Red Circular Stopwatch Badge */}
              <div
                onClick={() => setPomoRunning((r) => !r)}
                title={pomoRunning ? 'Pause' : 'Start'}
                className="relative w-14 h-14 rounded-full border-[3px] border-[#ff453a] shadow-[0_0_22px_rgba(255,69,58,0.7)] bg-[#1d0e12] flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition"
              >
                <TimerStopwatchSvg size={28} className="text-white drop-shadow-sm" />
              </div>

              {/* Big Digital Countdown + Reset Reload Button + Subtitle */}
              <div className="flex flex-col items-start justify-center">
                <div className="flex items-center gap-2.5">
                  <span className="text-[36px] font-bold text-white tabular-nums tracking-tight leading-none">
                    {formatPomoTime(pomoRemainingSeconds)}
                  </span>
                  <button
                    onClick={() => {
                      setPomoRunning(false);
                      setPomoRemainingSeconds(pomoTotalSeconds);
                    }}
                    title="Reset Timer"
                    className="text-white/65 hover:text-white transition active:rotate-180 duration-300"
                  >
                    <RotateResetSvg size={17} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[12px] text-white/50 font-normal">
                    {isFocus ? 'Focus time' : 'Break time'}
                  </span>
                  {pomoSessionsCompleted > 0 && (
                    <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                      Sesi: {pomoSessionsCompleted}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Row: [ Short Break ], [ ▶ ] Red Pill, [ Focus Time ] */}
            <div className="isle-stagger-2 flex items-center justify-center gap-3 pt-1">
              <button
                onClick={() => {
                  setPomoRunning(false);
                  setPomoMode('break');
                  setPomoTotalSeconds(5 * 60);
                  setPomoRemainingSeconds(5 * 60);
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11.5px] font-medium border transition ${
                  pomoMode === 'break'
                    ? 'bg-white/20 border-white/40 text-white shadow-sm'
                    : 'bg-white/[0.08] hover:bg-white/14 border-white/[0.06] text-white/80 hover:text-white'
                }`}
              >
                <CoffeeCupSvg size={13} className="text-white/85" />
                <span>Short Break</span>
              </button>

              <button
                onClick={() => setPomoRunning((r) => !r)}
                className="w-14 h-8 rounded-full bg-[#ff4d4f] hover:bg-[#ff383b] text-white flex items-center justify-center shadow-lg shadow-rose-500/35 transition active:scale-95 shrink-0"
                title={pomoRunning ? 'Pause' : 'Start'}
              >
                {pomoRunning ? <PauseFilledSvg size={16} /> : <PlayFilledSvg size={16} />}
              </button>

              <button
                onClick={() => {
                  setPomoRunning(false);
                  setPomoMode('focus');
                  setPomoTotalSeconds(25 * 60);
                  setPomoRemainingSeconds(25 * 60);
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11.5px] font-medium border transition ${
                  pomoMode === 'focus'
                    ? 'bg-white/20 border-white/40 text-white shadow-sm'
                    : 'bg-white/[0.08] hover:bg-white/14 border-white/[0.06] text-white/80 hover:text-white'
                }`}
              >
                <TargetFocusSvg size={13} className="text-white/85" />
                <span>Focus Time</span>
              </button>
            </div>
          </div>
        );
      }

      case 'todolist':
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full flex items-center justify-between px-10 py-1 gap-5"
          >
            <div className="isle-stagger-1 flex flex-col justify-between h-full py-1">
              <div>
                <div className="text-[28px] font-bold tracking-tight text-white leading-none tabular-nums">
                  {completedCount}/{tasks.length}
                </div>
                <div className="text-[11px] text-white/45 font-medium mt-1">
                  Tasks Completed
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    if (!addingTask) {
                      const next30 = new Date(Date.now() + 30 * 60 * 1000);
                      setNewTaskTime(
                        `${String(next30.getHours()).padStart(2, '0')}:${String(
                          next30.getMinutes()
                        ).padStart(2, '0')}`
                      );
                    }
                    setAddingTask((a) => !a);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/12 hover:bg-white/20 text-white text-[11px] font-medium transition"
                >
                  <PlusSvg size={11} />
                  Add Task
                </button>
                {tasks.some((t) => t.done) && (
                  <button
                    onClick={() => setTasks((prev) => prev.filter((t) => !t.done))}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/18 text-white/80 text-[11px] font-medium transition"
                  >
                    Clear Done
                  </button>
                )}
              </div>
            </div>

            <div className="isle-stagger-2 w-[260px] h-[104px] rounded-2xl bg-white/[0.04] backdrop-blur-md border border-white/[0.08] p-2.5 overflow-y-auto no-scrollbar flex flex-col justify-between">
              <div className="space-y-1.5">
                {tasks.length === 0 && !addingTask ? (
                  <div className="text-[11px] text-white/40 py-2 text-center">
                    Belum ada task · Klik + Add Task untuk atur pengingat
                  </div>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() =>
                        setTasks((prev) =>
                          prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t))
                        )
                      }
                      className="flex items-center justify-between gap-2 cursor-pointer group"
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div
                          className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition ${
                            task.done
                              ? 'bg-white border-white text-black'
                              : 'border-white/40 group-hover:border-white/75'
                          }`}
                        >
                          {task.done && <CheckTickSvg size={9} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-[12px] font-semibold leading-tight truncate ${
                              task.done ? 'line-through text-white/35' : 'text-white'
                            }`}
                          >
                            {task.title}
                          </div>
                          {editingTaskTimeId === task.id ? (
                            <div
                              onClick={(ev) => ev.stopPropagation()}
                              className="mt-0.5 flex items-center gap-1"
                            >
                              <input
                                type="time"
                                autoFocus
                                value={task.time || '09:00'}
                                onChange={(ev) => {
                                  const nextTime = ev.target.value;
                                  setTasks((prev) =>
                                    prev.map((t) =>
                                      t.id === task.id ? { ...t, time: nextTime } : t
                                    )
                                  );
                                }}
                                onBlur={() => setEditingTaskTimeId(null)}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter' || ev.key === 'Escape') {
                                    setEditingTaskTimeId(null);
                                  }
                                }}
                                style={{ colorScheme: 'dark' }}
                                className="bg-white/12 border border-white/20 rounded px-1 py-0.2 text-[10px] text-white tabular-nums focus:outline-none"
                              />
                            </div>
                          ) : (
                            <div
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setEditingTaskTimeId(task.id);
                              }}
                              title="Klik untuk ubah jam pengingat task ini"
                              className="text-[10px] text-white/45 hover:text-white/80 font-medium mt-0.5 tabular-nums inline-flex items-center gap-1 transition"
                            >
                              <span>{task.time || 'Atur jam'}</span>
                              {!task.done && task.time && (
                                <span className="text-[8.5px] text-white/30">· Pengingat aktif</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setTasks((prev) => prev.filter((t) => t.id !== task.id));
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-white/40 hover:text-white transition"
                        title="Delete task"
                      >
                        <CloseCrossSvg size={10} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {addingTask && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const raw = newTaskInput.trim().slice(0, 80);
                    if (!raw) return;
                    // Support inline time typing (e.g. "Meeting klien 19:30") OR the explicit time picker value
                    const inlineTimeMatch = raw.match(/^(.*?)\s+(?:jam|pukul|at)?\s*(\d{1,2}[:.]\d{2})$/i);
                    let finalTitle = raw;
                    let finalTime = newTaskTime.trim();
                    if (inlineTimeMatch && inlineTimeMatch[1].trim()) {
                      finalTitle = inlineTimeMatch[1].trim();
                      const parts = inlineTimeMatch[2].replace('.', ':').split(':');
                      finalTime = `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
                    }
                    setTasks((prev) => [
                      ...prev.slice(-29),
                      {
                        id: Date.now(),
                        title: finalTitle,
                        time: finalTime,
                        done: false,
                      },
                    ]);
                    if (finalTime) {
                      pushRealNotification(
                        `Task Dijadwalkan: ${finalTitle}`,
                        `Dynamic Island akan mengingatkan pukul ${finalTime}`,
                        'calendar'
                      );
                    }
                    setNewTaskInput('');
                    setAddingTask(false);
                  }}
                  className="mt-1 flex items-center gap-1"
                >
                  <input
                    type="text"
                    autoFocus
                    value={newTaskInput}
                    onChange={(e) => setNewTaskInput(e.target.value)}
                    placeholder="Nama task..."
                    className="flex-1 min-w-0 bg-white/10 rounded px-2 py-0.5 text-[11px] text-white placeholder-white/35 focus:outline-none"
                  />
                  <input
                    type="time"
                    value={newTaskTime}
                    onChange={(e) => setNewTaskTime(e.target.value)}
                    title="Atur jam pengingat di Dynamic Island"
                    style={{ colorScheme: 'dark' }}
                    className="w-[68px] shrink-0 bg-white/10 border border-white/15 rounded px-1 py-0.5 text-[10px] text-white tabular-nums focus:outline-none focus:border-white/40"
                  />
                  <button
                    type="submit"
                    className="px-2 py-0.5 rounded bg-white text-black text-[10px] font-semibold shrink-0"
                  >
                    Add
                  </button>
                </form>
              )}
            </div>
          </div>
        );

      case 'shelf':
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              if (
                e.clientX <= rect.left ||
                e.clientX >= rect.right ||
                e.clientY <= rect.top ||
                e.clientY >= rect.bottom
              ) {
                setIsDragOver(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(false);
              setDragAutoOpened(false);
              processDroppedOsFiles(e.dataTransfer);
            }}
            className="relative w-full h-full flex flex-col justify-between px-8 py-0.5 select-none overflow-hidden"
          >
            {/* Sub-Header Row: Segmented [Clipboard | Files] Pill on Left + Status / Hint on Right */}
            <div className="isle-stagger-1 flex items-center justify-between gap-2 shrink-0">
              <div className="inline-flex items-center rounded-full bg-[#1c1c1e] border border-white/[0.06] p-0.5">
                <button
                  type="button"
                  onClick={() => setShelfSubTab('clipboard')}
                  className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold transition cursor-pointer ${
                    shelfSubTab === 'clipboard'
                      ? 'bg-[#3a3a3c] text-white shadow-sm'
                      : 'text-[#8e8e93] hover:text-white/80'
                  }`}
                >
                  Clipboard
                </button>
                <button
                  type="button"
                  onClick={() => setShelfSubTab('files')}
                  className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold transition cursor-pointer ${
                    shelfSubTab === 'files'
                      ? 'bg-[#3a3a3c] text-white shadow-sm'
                      : 'text-[#8e8e93] hover:text-white/80'
                  }`}
                >
                  Files
                </button>
              </div>

              <div className="text-[10.5px] font-medium text-[#8e8e93] tracking-tight truncate">
                {shelfToast ? (
                  <span className="text-white font-semibold">{shelfToast}</span>
                ) : shelfSubTab === 'files' ? (
                  `${shelfFiles.length} of 8 · click to copy, or drag into any app`
                ) : (
                  `${shelfClips.length} of 8 · click to copy, or press Ctrl+V`
                )}
              </div>
            </div>

            {/* Main Shelf Content Area: Files Tray OR Clipboard Tray */}
            {shelfSubTab === 'files' ? (
              shelfFiles.length === 0 && !isDragOver ? (
                <div
                  onClick={() => shelfFileInputRef.current?.click()}
                  className="isle-stagger-2 w-full flex-1 my-1 rounded-xl border border-dashed border-white/20 bg-white/[0.02] hover:border-white/40 hover:bg-white/[0.04] transition-all flex items-center justify-center gap-3 cursor-pointer"
                  title="Drag & drop file dari Windows Explorer ke Dynamic Island, atau klik untuk memilih file"
                >
                  <div className="text-white/80">
                    <ShelfTraySvg size={20} />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[12px] font-semibold text-white leading-tight">
                      Drop files here or click to browse
                    </span>
                    <span className="text-[10px] text-white/45 leading-tight mt-0.5">
                      Files wait here with thumbnails until you drag them out or click to copy
                    </span>
                  </div>
                </div>
              ) : (
                <div className="isle-stagger-2 w-full flex-1 flex items-center justify-start gap-3.5 px-1 overflow-x-auto no-scrollbar">
                  {shelfFiles.map((file, idx) => {
                    const isCopied = copiedShelfId === file.id;
                    return (
                      <div
                        key={file.id}
                        draggable
                        onClick={() => handleCopyShelfFile(file)}
                        onDragStart={(ev) => {
                          isInternalShelfDragRef.current = true;
                          setIsDragOver(false);
                          ev.dataTransfer.effectAllowed = 'copyMove';
                          if (file.filePath && window.electronAPI?.startFileDrag) {
                            ev.preventDefault();
                            window.electronAPI.startFileDrag({
                              filePath: file.filePath,
                              name: file.name,
                              dataUrl: file.dataUrl,
                            });
                            return;
                          }
                          if (file.dataUrl) {
                            const mime = file.mimeType || 'application/octet-stream';
                            ev.dataTransfer.setData(
                              'DownloadURL',
                              `${mime}:${file.name}:${file.dataUrl}`
                            );
                          }
                          ev.dataTransfer.setData(
                            'text/plain',
                            file.textContent || file.filePath || file.name
                          );
                        }}
                        onDragEnd={() => {
                          isInternalShelfDragRef.current = false;
                          setIsDragOver(false);
                        }}
                        style={{
                          animation: 'shelfFilePopIn 320ms cubic-bezier(0.22, 1.35, 0.36, 1) both',
                          animationDelay: `${25 + idx * 40}ms`,
                        }}
                        className="relative group flex flex-col items-center w-[58px] shrink-0 cursor-pointer active:cursor-grabbing py-0.5 select-none"
                        title={`${file.name} (${file.size}) — Klik untuk copy, atau drag keluar ke aplikasi lain`}
                      >
                        <div className="relative w-[46px] h-[46px] rounded-[11px] flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                          {file.thumbnailUrl ? (
                            <img
                              src={file.thumbnailUrl}
                              alt={file.name}
                              draggable={false}
                              className="w-[46px] h-[46px] rounded-[11px] object-cover shadow-md border border-white/10"
                            />
                          ) : (
                            <div className="w-[46px] h-[46px] rounded-[11px] bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shadow-md">
                              <FileDocumentBadgeSvg ext={file.ext} size={36} />
                            </div>
                          )}

                          {/* Top-Right Remove (×) Badge matching reference screenshot */}
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setShelfFiles((prev) => prev.filter((f) => f.id !== file.id));
                            }}
                            className="absolute -top-1.5 -right-1.5 w-[16px] h-[16px] rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] border border-white/20 flex items-center justify-center text-white/80 hover:text-white shadow-md transition z-10 cursor-pointer"
                            title="Hapus dari Shelf"
                          >
                            <CloseCrossSvg size={8} />
                          </button>

                          {isCopied && (
                            <div className="absolute inset-0 rounded-[11px] bg-black/65 backdrop-blur-[1px] flex items-center justify-center text-[#30d158]">
                              <CheckTickSvg size={18} />
                            </div>
                          )}
                        </div>

                        <span className="text-[10.5px] font-medium text-white/85 group-hover:text-white truncate w-full text-center mt-1.5 leading-tight">
                          {isCopied ? 'Copied!' : truncateMiddleFileName(file.name, 11)}
                        </span>
                      </div>
                    );
                  })}

                  {shelfFiles.length < 8 && (
                    <button
                      type="button"
                      onClick={() => shelfFileInputRef.current?.click()}
                      title="Tambah file dari komputer"
                      className="w-[46px] h-[46px] rounded-[11px] border border-dashed border-white/15 hover:border-white/35 bg-white/[0.02] hover:bg-white/[0.06] text-white/45 hover:text-white/85 flex items-center justify-center shrink-0 transition cursor-pointer mb-3.5"
                    >
                      <PlusSvg size={15} />
                    </button>
                  )}
                </div>
              )
            ) : shelfClips.length === 0 ? (
              <div
                onClick={handleAddClipboardFromSystem}
                className="isle-stagger-2 w-full flex-1 my-1 rounded-xl border border-dashed border-white/20 bg-white/[0.02] hover:border-white/40 hover:bg-white/[0.04] transition-all flex items-center justify-center gap-3 cursor-pointer"
                title="Klik atau tekan Ctrl+V untuk menyimpan teks dari Clipboard"
              >
                <PlusSvg size={16} className="text-white/75" />
                <div className="flex flex-col items-start">
                  <span className="text-[12px] font-semibold text-white leading-tight">
                    Paste from Clipboard
                  </span>
                  <span className="text-[10px] text-white/45 leading-tight mt-0.5">
                    Click here or press Ctrl+V to pin clipboard text
                  </span>
                </div>
              </div>
            ) : (
              <div className="isle-stagger-2 w-full flex-1 flex items-center justify-start gap-2.5 px-1 overflow-x-auto no-scrollbar">
                {shelfClips.map((clip) => {
                  const isCopied = copiedShelfId === clip.id;
                  return (
                    <div
                      key={clip.id}
                      draggable
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(clip.text);
                          setCopiedShelfId(clip.id);
                          setShelfToast('Copied!');
                          setTimeout(() => {
                            setCopiedShelfId((prev) => (prev === clip.id ? null : prev));
                            setShelfToast(null);
                          }, 1300);
                        } catch {
                          // ignore
                        }
                      }}
                      onDragStart={(ev) => {
                        isInternalShelfDragRef.current = true;
                        setIsDragOver(false);
                        ev.dataTransfer.setData('text/plain', clip.text);
                        ev.dataTransfer.effectAllowed = 'copy';
                      }}
                      onDragEnd={() => {
                        isInternalShelfDragRef.current = false;
                        setIsDragOver(false);
                      }}
                      className="relative group w-[112px] h-[68px] rounded-[11px] bg-[#161618] hover:bg-[#1f1f22] border border-white/[0.07] p-2 flex flex-col justify-between shrink-0 cursor-pointer transition"
                      title="Klik untuk copy teks, atau drag ke aplikasi lain"
                    >
                      <p className="text-[10px] text-white/85 line-clamp-3 leading-snug break-words">
                        {clip.text}
                      </p>
                      <span className="text-[9px] text-white/40 tabular-nums">
                        {isCopied ? 'Copied!' : clip.timeLabel}
                      </span>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setShelfClips((prev) => prev.filter((c) => c.id !== clip.id));
                        }}
                        className="absolute -top-1.5 -right-1.5 w-[16px] h-[16px] rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] border border-white/20 flex items-center justify-center text-white/80 hover:text-white shadow-md transition z-10 cursor-pointer"
                        title="Hapus clip"
                      >
                        <CloseCrossSvg size={8} />
                      </button>
                    </div>
                  );
                })}
                {shelfClips.length < 8 && (
                  <button
                    type="button"
                    onClick={handleAddClipboardFromSystem}
                    title="Tempel teks dari Clipboard saat ini"
                    className="w-[46px] h-[46px] rounded-[11px] border border-dashed border-white/15 hover:border-white/35 bg-white/[0.02] hover:bg-white/[0.06] text-white/45 hover:text-white/85 flex items-center justify-center shrink-0 transition cursor-pointer"
                  >
                    <PlusSvg size={15} />
                  </button>
                )}
              </div>
            )}

            {/* Active Drag-Over Overlay ("Release to add") */}
            {isDragOver && (
              <div className="absolute inset-x-8 inset-y-1 z-20 rounded-xl border-[1.5px] border-dashed border-white/65 bg-black/80 backdrop-blur-[2px] flex flex-col items-center justify-center pointer-events-none animate-[isleFadeIn_140ms_ease-out]">
                <div
                  className="text-white mb-1"
                  style={{ animation: 'shelfTrayBounce 0.9s ease-in-out infinite' }}
                >
                  <ShelfTraySvg size={22} />
                </div>
                <div className="text-[12.5px] font-semibold text-white tracking-tight">
                  Release to add to Shelf
                </div>
              </div>
            )}
          </div>
        );

      case 'calendar':
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full flex items-stretch justify-between px-9 py-0.5 gap-4 overflow-hidden"
          >
            {/* Compact Left Calendar Grid (Fits 6 weeks cleanly inside 170px uniform island height with zero clipping) */}
            <div className="isle-stagger-1 w-[162px] shrink-0 flex flex-col justify-between py-0.5">
              <div className="flex items-center justify-between leading-none">
                <div
                  onClick={() => {
                    setCalYear(nowDate.getFullYear());
                    setCalMonth(nowDate.getMonth());
                    setSelectedDay(nowDate.getDate());
                  }}
                  title="Jump to Today"
                  className="text-[10px] font-bold tracking-wider cursor-pointer"
                >
                  <span className="text-[#ff453a]">{MONTH_NAMES[calMonth]}</span>{' '}
                  <span className="text-white/50 font-semibold">{calYear}</span>
                </div>
                <div className="flex items-center gap-1 text-white/60">
                  <button
                    onClick={() => {
                      if (calMonth === 0) {
                        setCalMonth(11);
                        setCalYear((y) => y - 1);
                      } else {
                        setCalMonth((m) => m - 1);
                      }
                    }}
                    className="hover:text-white transition p-0.5"
                  >
                    <ChevronLeftSvg size={10} />
                  </button>
                  <button
                    onClick={() => {
                      if (calMonth === 11) {
                        setCalMonth(0);
                        setCalYear((y) => y + 1);
                      } else {
                        setCalMonth((m) => m + 1);
                      }
                    }}
                    className="hover:text-white transition p-0.5"
                  >
                    <ChevronRightSvg size={10} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 text-center text-[8.5px] font-semibold text-white/40 leading-none my-0.5">
                <span>S</span>
                <span>M</span>
                <span>T</span>
                <span>W</span>
                <span>T</span>
                <span>F</span>
                <span>S</span>
              </div>

              <div className="grid grid-cols-7 gap-y-[1px] text-center tabular-nums">
                {calendarCells.map((day, idx) => {
                  if (!day) return <div key={idx} className="h-[14.5px]" />;
                  const isToday =
                    calYear === nowDate.getFullYear() &&
                    calMonth === nowDate.getMonth() &&
                    day === nowDate.getDate();
                  const isSelected = day === selectedDay;
                  const hasEvents =
                    (eventsByDate[`${calYear}-${calMonth}-${day}`]?.length || 0) > 0;
                  const isWeekend = idx % 7 === 0 || idx % 7 === 6;

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDay(day)}
                      className={`relative h-[14.5px] w-[14.5px] mx-auto rounded-full flex flex-col items-center justify-center text-[9px] font-semibold transition ${
                        isToday
                          ? 'bg-[#ff453a] text-white font-bold'
                          : isSelected
                          ? 'bg-white/20 text-white'
                          : isWeekend
                          ? 'text-white/40 hover:text-white'
                          : 'text-white/85 hover:bg-white/10'
                      }`}
                    >
                      <span className="leading-none">{day}</span>
                      {hasEvents && (
                        <span
                          className={`w-1 h-1 rounded-full absolute bottom-0 ${
                            isToday ? 'bg-white' : 'bg-[#ff9f0a]'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Events, Smart Alarms & World Clocks */}
            <div className="isle-stagger-2 flex-1 min-w-0 flex flex-col justify-between py-0.5 overflow-hidden">
              <div className="flex items-center justify-between gap-1.5 shrink-0 whitespace-nowrap leading-none">
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setCalendarSubTab('events')}
                    className={`text-[11px] font-bold tracking-tight transition whitespace-nowrap ${
                      calendarSubTab === 'events'
                        ? 'text-white'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    Events ({selectedDayEvents.length})
                  </button>
                  <span className="text-white/20 select-none text-[10px]">|</span>
                  <button
                    onClick={() => setCalendarSubTab('alarms')}
                    className={`flex items-center gap-1 text-[11px] font-bold tracking-tight transition whitespace-nowrap ${
                      calendarSubTab === 'alarms'
                        ? 'text-[#ff9f0a]'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    <AlarmBellSvg size={10} />
                    <span>Alarms ({smartAlarms.length})</span>
                  </button>
                </div>

                <button
                  onClick={() => setShowWorldClocks((w) => !w)}
                  title={showWorldClocks ? 'Sembunyikan Jam Dunia' : 'Tampilkan Jam Dunia'}
                  className={`p-0.5 rounded transition shrink-0 ${
                    showWorldClocks
                      ? 'bg-white/15 text-white'
                      : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  <GlobeTimezoneSvg size={12} />
                </button>
              </div>

              {calendarSubTab === 'events' ? (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddCalendarEvent(newEventInput);
                    }}
                    className="isle-stagger-3 flex items-center gap-1.5 bg-white/[0.06] border border-white/[0.08] rounded-full px-2.5 py-0.5 my-1 shrink-0"
                  >
                    <span className="text-white/45">
                      <PlusSvg size={10} />
                    </span>
                    <input
                      type="text"
                      value={newEventInput}
                      onChange={(e) => setNewEventInput(e.target.value)}
                      placeholder="Add event · e.g. Dinner 20:00"
                      className="flex-1 min-w-0 bg-transparent text-[10.5px] text-white placeholder-white/35 focus:outline-none"
                    />
                  </form>

                  <div className="isle-stagger-3 flex-1 min-h-0 space-y-1 overflow-y-auto no-scrollbar">
                    {selectedDayEvents.length === 0 ? (
                      <div className="text-[10.5px] text-white/35 py-0.5 truncate">
                        No events scheduled for this day
                      </div>
                    ) : (
                      selectedDayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="group flex items-center justify-between bg-[#2b1e0e] hover:bg-[#352512] rounded-lg px-2 py-0.5 transition"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-[2.5px] h-3 rounded-full bg-[#ff9f0a] shrink-0" />
                            <span className="text-[10.5px] font-bold text-white truncate">
                              {ev.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-white/65 tabular-nums">{ev.time}</span>
                            <button
                              onClick={() =>
                                setEventsByDate((prev) => ({
                                  ...prev,
                                  [currentDateKey]: (prev[currentDateKey] || []).filter(
                                    (item) => item.id !== ev.id
                                  ),
                                }))
                              }
                              className="hidden group-hover:inline-flex text-white/45 hover:text-white"
                            >
                              <CloseCrossSvg size={9} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddSmartAlarm(newAlarmTime, newAlarmTitle);
                    }}
                    className="flex items-center gap-1 bg-[#1c1c21] border border-white/[0.08] rounded-full px-2 py-0.5 my-1 shrink-0"
                  >
                    <input
                      type="time"
                      value={newAlarmTime}
                      onChange={(e) => setNewAlarmTime(e.target.value)}
                      className="bg-white/10 text-white text-[10px] font-mono font-semibold rounded px-1 py-0.2 focus:outline-none shrink-0"
                      title="Waktu alarm (HH:mm)"
                    />
                    <input
                      type="text"
                      value={newAlarmTitle}
                      onChange={(e) => setNewAlarmTitle(e.target.value)}
                      placeholder="Nama alarm..."
                      className="flex-1 min-w-0 bg-transparent text-[10.5px] text-white placeholder-white/35 focus:outline-none px-1"
                    />
                    <button
                      type="submit"
                      className="px-2 py-0.5 rounded-full bg-[#ff9f0a] hover:bg-[#ff9000] text-black text-[9.5px] font-bold transition shrink-0"
                    >
                      + Set
                    </button>
                  </form>

                  <div className="flex-1 min-h-0 space-y-1 overflow-y-auto no-scrollbar">
                    {smartAlarms.length === 0 ? (
                      <div className="text-[10.5px] text-white/35 py-0.5 flex items-center gap-1">
                        <AlarmBellSvg size={11} />
                        <span className="truncate">Belum ada alarm aktif</span>
                      </div>
                    ) : (
                      smartAlarms.map((a) => (
                        <div
                          key={a.id}
                          className={`group flex items-center justify-between rounded-lg px-2 py-0.5 transition ${
                            a.enabled
                              ? 'bg-[#2b1e0e] hover:bg-[#352512]'
                              : 'bg-white/[0.03] hover:bg-white/[0.06] opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span
                              className={`w-[2.5px] h-3 rounded-full shrink-0 ${
                                a.enabled ? 'bg-[#ff9f0a]' : 'bg-white/30'
                              }`}
                            />
                            <span className="text-[10.5px] font-bold text-white tabular-nums shrink-0">
                              {a.time}
                            </span>
                            <span className="text-[10px] text-white/70 truncate flex-1">
                              {a.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleToggleAlarm(a.id)}
                              className={`w-5 h-3 rounded-full p-0.5 transition ${
                                a.enabled ? 'bg-[#ff9f0a]' : 'bg-white/20'
                              }`}
                            >
                              <div
                                className={`w-2 h-2 rounded-full bg-white transition-transform ${
                                  a.enabled ? 'translate-x-2' : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <button
                              onClick={() => handleDeleteAlarm(a.id)}
                              className="text-white/40 hover:text-white transition"
                            >
                              <CloseCrossSvg size={9} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {showWorldClocks && (
                <div className="pt-0.5 mt-0.5 border-t border-white/10 flex items-center justify-between text-[9.5px] tabular-nums shrink-0">
                  {worldClocks.map((wc) => (
                    <div key={wc.city} className="flex items-center gap-1">
                      <span className="text-white/45">{wc.city}</span>
                      <span className="text-white font-bold">{wc.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'weather': {
        // Elevated quadratic Bezier solar arc from (46, 70) via (200, -18) to (354, 70)
        // Gives a higher arch (apex at y=26) so the center temperature text below has generous breathing room
        const sunT = animatedSunT;
        const p0x = 46;
        const p0y = 70;
        const p1x = 200;
        const p1y = -18;
        const p2x = 354;
        const p2y = 70;
        const oneMinusT = 1 - sunT;
        const sunX = oneMinusT * oneMinusT * p0x + 2 * oneMinusT * sunT * p1x + sunT * sunT * p2x;
        const sunY = oneMinusT * oneMinusT * p0y + 2 * oneMinusT * sunT * p1y + sunT * sunT * p2y;
        // De Casteljau control point for the traversed portion of the solar arc from sunrise to current sun position
        const activeCtrlX = p0x + sunT * (p1x - p0x);
        const activeCtrlY = p0y + sunT * (p1y - p0y);

        const getWeatherConditionLabel = (code: number, isDayTime: boolean): string => {
          if (code === 0) return isDayTime ? 'Cerah' : 'Malam Cerah';
          if (code === 1) return isDayTime ? 'Cerah Sebagian' : 'Sebagian Cerah';
          if (code === 2) return 'Cerah Berawan';
          if (code === 3) return 'Berawan';
          if (code === 45) return 'Berkabut';
          if (code === 48) return 'Kabut Tebal';
          if (code >= 51 && code <= 55) return 'Gerimis';
          if (code >= 56 && code <= 57) return 'Gerimis Dingin';
          if (code >= 61 && code <= 67) return 'Hujan';
          if (code >= 71 && code <= 77) return 'Bersalju';
          if (code >= 80 && code <= 82) return 'Hujan Deras';
          if (code >= 95) return 'Hujan Petir';
          return isDayTime ? 'Cerah Berawan' : 'Berawan';
        };

        const weatherConditionText = getWeatherConditionLabel(
          weatherData.weatherCode,
          weatherData.isDay
        );

        const renderHourlyWeatherIcon = (code: number, timeStr: string) => {
          const hourNum = parseInt(String(timeStr || '12:00').split(':')[0], 10);
          const isNightHour = !Number.isNaN(hourNum) && (hourNum < 6 || hourNum >= 18);

          // 0: Clear Sky (Sun by day, Crescent Moon + Star by night)
          if (code === 0) {
            if (isNightHour) {
              return (
                <svg width={24} height={18} viewBox="0 0 28 22" className="shrink-0">
                  <path
                    d="M17.2 4.5a6.2 6.2 0 1 0 5.3 9.4 5.2 5.2 0 0 1-5.3-9.4z"
                    fill="#facc15"
                  />
                  <circle cx={9.5} cy={7.5} r={1} fill="#fde047" opacity={0.85} />
                </svg>
              );
            }
            return (
              <svg width={24} height={18} viewBox="0 0 28 22" className="shrink-0">
                <circle cx={14} cy={11} r={4.8} fill="#facc15" />
                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                  const rad = (deg * Math.PI) / 180;
                  return (
                    <circle
                      key={deg}
                      cx={14 + Math.cos(rad) * 7.4}
                      cy={11 + Math.sin(rad) * 7.4}
                      r={1}
                      fill="#fde047"
                    />
                  );
                })}
              </svg>
            );
          }

          // 95+: Thunderstorm (Dark Storm Cloud + Lightning Bolt)
          if (code >= 95) {
            return (
              <svg width={24} height={18} viewBox="0 0 28 22" className="shrink-0">
                <path
                  d="M8.5 15.8h10.2c2.4 0 4.3-1.8 4.3-4.1 0-2.1-1.6-3.9-3.7-4.1-.7-2.4-2.8-4.1-5.5-4.1-3.1 0-5.6 2.5-5.6 5.5 0 .3 0 .5.1.8-1.5.5-2.6 1.8-2.6 3.5 0 1.4 1.5 2.5 2.8 2.5z"
                  fill="#525866"
                />
                <path
                  d="M14.6 12.2l-2.3 3.9h2l-.8 3.6 3.4-4.4h-2.1l.8-3.1z"
                  fill="#facc15"
                />
              </svg>
            );
          }

          // 51..82: Drizzle / Rain / Showers (Cloud + Blue Raindrops)
          if (code >= 51 && code <= 82) {
            return (
              <svg width={24} height={18} viewBox="0 0 28 22" className="shrink-0">
                <path
                  d="M8.5 15.5h10.2c2.4 0 4.3-1.8 4.3-4.1 0-2.1-1.6-3.9-3.7-4.1-.7-2.4-2.8-4.1-5.5-4.1-3.1 0-5.6 2.5-5.6 5.5 0 .3 0 .5.1.8-1.5.5-2.6 1.8-2.6 3.5 0 1.4 1.5 2.5 2.8 2.5z"
                  fill="#64748b"
                />
                <line x1={10.5} y1={17.2} x2={9.6} y2={20} stroke="#60a5fa" strokeWidth={1.5} strokeLinecap="round" />
                <line x1={14.2} y1={17.2} x2={13.3} y2={20} stroke="#60a5fa" strokeWidth={1.5} strokeLinecap="round" />
                <line x1={17.9} y1={17.2} x2={17} y2={20} stroke="#60a5fa" strokeWidth={1.5} strokeLinecap="round" />
              </svg>
            );
          }

          // 3, 45, 48: Overcast / Fog (Clean Minimalist Luxury Cloud — No dark circle behind)
          if (code === 3 || code === 45 || code === 48) {
            return (
              <svg width={24} height={18} viewBox="0 0 28 22" className="shrink-0">
                <path
                  d="M8.5 18.2h10.4c2.5 0 4.5-1.9 4.5-4.3 0-2.2-1.6-4-3.8-4.3-.7-2.5-3-4.3-5.7-4.3-3.2 0-5.8 2.6-5.8 5.8 0 .3 0 .6.1.8-1.5.5-2.7 1.9-2.7 3.6 0 1.5 1.5 2.7 3 2.7z"
                  fill="rgba(226, 232, 240, 0.88)"
                />
              </svg>
            );
          }

          // 1, 2 (Default): Partly Cloudy (Warm Sun Accent by Day, Clean Sculpted Cloud by Night without dark blob)
          return (
            <svg width={24} height={18} viewBox="0 0 28 22" className="shrink-0">
              {!isNightHour && (
                <circle
                  cx={19.2}
                  cy={8.2}
                  r={3.6}
                  fill="#fbbf24"
                  opacity={0.95}
                />
              )}
              <path
                d="M8.5 18.2h10.4c2.5 0 4.5-1.9 4.5-4.3 0-2.2-1.6-4-3.8-4.3-.7-2.5-3-4.3-5.7-4.3-3.2 0-5.8 2.6-5.8 5.8 0 .3 0 .6.1.8-1.5.5-2.7 1.9-2.7 3.6 0 1.5 1.5 2.7 3 2.7z"
                fill={isNightHour ? 'rgba(203, 213, 225, 0.85)' : 'rgba(241, 245, 249, 0.95)'}
              />
            </svg>
          );
        };

        const isSwitchingCity = weatherTransitioning;

        return (
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full h-full flex flex-col justify-between overflow-hidden rounded-b-[32px] select-none pt-0.5 pb-0.5"
          >
            {/* Center Current Conditions (Day Solar / Night Lunar Horizon Curve + Sunrise/Sunset + Minimalist Center Temp) */}
            <div className="isle-stagger-1 relative w-full h-[68px] flex items-center justify-center shrink-0 -mt-1">
              <div
                className={`relative w-full h-full flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isSwitchingCity
                    ? 'opacity-70 scale-[0.98] translate-y-0.5'
                    : 'opacity-100 scale-100 translate-y-0 blur-0'
                }`}
              >
                <svg
                  width={392}
                  height={72}
                  viewBox="0 0 400 84"
                  className="overflow-visible pointer-events-none"
                >
                  <defs>
                    {/* Day Solar Gradients */}
                    <linearGradient id="isleSolarArcBaseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#eab308" stopOpacity="0.08" />
                      <stop offset="25%" stopColor="#facc15" stopOpacity="0.32" />
                      <stop offset="50%" stopColor="#fde047" stopOpacity="0.42" />
                      <stop offset="75%" stopColor="#eab308" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#ca8a04" stopOpacity="0.08" />
                    </linearGradient>
                    <linearGradient id="isleSolarArcActiveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#eab308" stopOpacity="0.25" />
                      <stop offset="50%" stopColor="#facc15" stopOpacity="0.95" />
                      <stop offset="100%" stopColor="#fde047" stopOpacity="1" />
                    </linearGradient>
                    <radialGradient id="isleSunGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#fde047" stopOpacity="0.48" />
                      <stop offset="55%" stopColor="#eab308" stopOpacity="0.16" />
                      <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
                    </radialGradient>

                    {/* Night Lunar Dark Blue Gradients */}
                    <linearGradient id="isleLunarArcBaseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.12" />
                      <stop offset="25%" stopColor="#1d4ed8" stopOpacity="0.38" />
                      <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.48" />
                      <stop offset="75%" stopColor="#1d4ed8" stopOpacity="0.38" />
                      <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.12" />
                    </linearGradient>
                    <linearGradient id="isleLunarArcActiveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.35" />
                      <stop offset="50%" stopColor="#2563eb" stopOpacity="0.92" />
                      <stop offset="100%" stopColor="#60a5fa" stopOpacity="1" />
                    </linearGradient>
                    <radialGradient id="isleMoonGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.44" />
                      <stop offset="55%" stopColor="#1d4ed8" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  {/* Full Horizon Base Track (Smoothly cross-fades between Day Gold and Night Dark Blue) */}
                  <path
                    d={`M ${p0x} ${p0y} Q ${p1x} ${p1y} ${p2x} ${p2y}`}
                    fill="none"
                    stroke="url(#isleSolarArcBaseGrad)"
                    strokeWidth={3.6}
                    strokeLinecap="round"
                    style={{
                      opacity: isWeatherNight ? 0 : 1,
                      transition: 'opacity 500ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  />
                  <path
                    d={`M ${p0x} ${p0y} Q ${p1x} ${p1y} ${p2x} ${p2y}`}
                    fill="none"
                    stroke="url(#isleLunarArcBaseGrad)"
                    strokeWidth={3.6}
                    strokeLinecap="round"
                    style={{
                      opacity: isWeatherNight ? 1 : 0,
                      transition: 'opacity 500ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  />

                  {/* Smoothly Animated Traversed Arc up to Current Sun / Moon Position */}
                  <path
                    d={`M ${p0x} ${p0y} Q ${activeCtrlX} ${activeCtrlY} ${sunX} ${sunY}`}
                    fill="none"
                    stroke="url(#isleSolarArcActiveGrad)"
                    strokeWidth={4}
                    strokeLinecap="round"
                    style={{
                      opacity: isWeatherNight ? 0 : 1,
                      transition: 'opacity 500ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  />
                  <path
                    d={`M ${p0x} ${p0y} Q ${activeCtrlX} ${activeCtrlY} ${sunX} ${sunY}`}
                    fill="none"
                    stroke="url(#isleLunarArcActiveGrad)"
                    strokeWidth={4}
                    strokeLinecap="round"
                    style={{
                      opacity: isWeatherNight ? 1 : 0,
                      transition: 'opacity 500ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  />

                  {/* Ambient Glow Behind Celestial Body */}
                  <circle
                    cx={sunX}
                    cy={sunY}
                    r={30}
                    fill={isWeatherNight ? 'url(#isleMoonGlow)' : 'url(#isleSunGlow)'}
                  />

                  {/* Celestial Body: Sun Core + Rays by Day, Crescent Moon + Star Accents by Night */}
                  <g transform={`translate(${sunX}, ${sunY})`}>
                    {/* Day Sun Element */}
                    <g
                      style={{
                        opacity: isWeatherNight ? 0 : 1,
                        transform: isWeatherNight ? 'scale(0.65) rotate(-25deg)' : 'scale(1) rotate(0deg)',
                        transition: 'opacity 450ms ease, transform 500ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    >
                      <circle cx={0} cy={0} r={10.5} fill="#f7d648" />
                      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                        const rad = (deg * Math.PI) / 180;
                        const rx = Math.cos(rad) * 16.5;
                        const ry = Math.sin(rad) * 16.5;
                        return <circle key={deg} cx={rx} cy={ry} r={1.6} fill="#f7d648" />;
                      })}
                    </g>

                    {/* Night Crescent Moon Element */}
                    <g
                      style={{
                        opacity: isWeatherNight ? 1 : 0,
                        transform: isWeatherNight ? 'scale(1) rotate(0deg)' : 'scale(0.65) rotate(25deg)',
                        transition: 'opacity 450ms ease, transform 500ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    >
                      <circle cx={0} cy={0} r={12.5} fill="#0f172a" opacity={0.55} />
                      <path
                        d="M2.2 -9.8A10.2 10.2 0 1 0 10.2 5.4A8.2 8.2 0 0 1 2.2 -9.8Z"
                        fill="#e2e8f0"
                      />
                      <circle cx={-12} cy={-7} r={1.15} fill="#93c5fd" opacity={0.9} />
                      <circle cx={11} cy={-8.5} r={0.95} fill="#bfdbfe" opacity={0.75} />
                    </g>
                  </g>
                </svg>

                {/* Left Sunrise Label */}
                <div
                  className={`isle-stagger-2 absolute left-9 bottom-0.5 flex flex-col items-center leading-tight transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isSwitchingCity
                      ? 'opacity-60 scale-95 translate-y-0.5'
                      : 'opacity-100 scale-100 translate-y-0'
                  }`}
                >
                  <span className="text-[9.5px] font-medium text-white/65">Sunrise</span>
                  <span className="text-[10.5px] font-semibold text-white tabular-nums">
                    {weatherData.sunrise}
                  </span>
                </div>

                {/* Center Temperature & Condition Readout (Minimalist & Clean) */}
                <div
                  className={`isle-stagger-2 absolute inset-x-0 -bottom-0.5 flex flex-col items-center justify-center pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isSwitchingCity
                      ? 'opacity-60 scale-95 translate-y-0.5'
                      : 'opacity-100 scale-100 translate-y-0'
                  }`}
                >
                  <span className="text-[20px] font-bold text-white tracking-tight tabular-nums leading-none">
                    {weatherData.currentTemp}°C
                  </span>
                  <span
                    className={`mt-0.5 text-[9.5px] font-medium tracking-tight transition-colors duration-500 ${
                      isWeatherNight ? 'text-sky-300/90' : 'text-[#f7d648]/90'
                    }`}
                  >
                    {weatherConditionText}
                  </span>
                </div>

                {/* Right Sunset Label */}
                <div
                  className={`isle-stagger-2 absolute right-9 bottom-0.5 flex flex-col items-center leading-tight transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isSwitchingCity
                      ? 'opacity-60 scale-95 translate-y-0.5'
                      : 'opacity-100 scale-100 translate-y-0'
                  }`}
                >
                  <span className="text-[9.5px] font-medium text-white/65">Sunset</span>
                  <span className="text-[10.5px] font-semibold text-white tabular-nums">
                    {weatherData.sunset}
                  </span>
                </div>
              </div>
            </div>

            {/* Clean Luxury Minimalist 7-Hour Forecast Strip (No weird wave shape behind icons) */}
            <div className="isle-stagger-3 relative w-full pt-1.5 pb-1 px-7 z-10 shrink-0">
              <div className="mx-auto w-full border-t border-white/[0.06] pt-1.5">
                <div
                  className={`relative z-10 grid grid-cols-7 gap-1 items-center justify-items-center transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isSwitchingCity
                      ? 'opacity-65 scale-[0.98] translate-y-0.5'
                      : 'opacity-100 scale-100 translate-y-0 blur-0'
                  }`}
                >
                  {weatherData.hourly.slice(0, 7).map((item, idx) => (
                    <div
                      key={`${item.time}-${idx}`}
                      style={{
                        animation: 'isleMenuItemIn 360ms cubic-bezier(0.22, 1, 0.36, 1) both',
                        animationDelay: `${45 + idx * 28}ms`,
                      }}
                      className="flex flex-col items-center gap-0.5"
                    >
                      <span className="text-[9px] font-medium text-white/55 tabular-nums">
                        {item.time}
                      </span>
                      <div className="my-0.5">{renderHourlyWeatherIcon(item.code, item.time)}</div>
                      <span className="text-[10.5px] font-semibold text-white tabular-nums leading-none">
                        {item.temp}°
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div
      className="relative w-screen h-screen bg-transparent overflow-hidden select-none font-sans pointer-events-none"
    >
      {/* ── Top-Center Dynamic Island Anchor (Flush at top: 0, horizontally centered) ── */}
      <div className="relative z-40 w-full flex justify-center items-start pt-0 pointer-events-none">
        <IslandSurface
          width={targetW}
          height={targetH}
          radius={targetR}
          shoulder={targetS}
          topInset={0}
          isExpanded={isExpanded || Boolean(activeAlert && targetH > 40)}
          hidden={miniCapsuleMode && !assistantOpen && !activeAlert}
          tintStyle={tintStyle}
          tintRgb={tintRgb}
          auraColors={botPalette.glow}
          voiceLevelRef={voiceEnergyRef}
          nudgeTrigger={nudgeCount}
          onMouseEnter={() => {
            if (miniCapsuleMode && !assistantOpen && !activeAlert) {
              setDesktopClickThrough(true);
              return;
            }
            if (hoverLeaveTimerRef.current !== null) {
              window.clearTimeout(hoverLeaveTimerRef.current);
              hoverLeaveTimerRef.current = null;
            }
            setDesktopClickThrough(false);
            if (activeAlert) {
              setAlertHovered(true);
            } else {
              setIsHovered(true);
            }
          }}
          onMouseLeave={() => {
            if (hoverLeaveTimerRef.current !== null) {
              window.clearTimeout(hoverLeaveTimerRef.current);
            }
            // Immediately re-enable click-through the instant the cursor leaves the island surface
            setDesktopClickThrough(true);
            hoverLeaveTimerRef.current = window.setTimeout(() => {
              hoverLeaveTimerRef.current = null;
              if (activeAlert) {
                setAlertHovered(false);
              } else {
                if (lyricsMode || assistantOpen) {
                  return;
                }
                setIsHovered(false);
                setIsPinnedOpen(false); // Clean auto-close on mouse leave with user-configured speed
                setIsDragOver(false);
                if (dragAutoOpened) {
                  setDragAutoOpened(false);
                }
              }
            }, Math.max(0, closeDelayMsRef.current));
          }}
          onDragEnter={(e) => {
            if (isInternalShelfDragRef.current) return;
            const types = Array.from(e.dataTransfer?.types || []);
            if (types.length === 0) return;
            e.preventDefault();
            e.stopPropagation();
            expandIslandForFileDrag();
          }}
          onDragOver={(e) => {
            if (isInternalShelfDragRef.current) return;
            const types = Array.from(e.dataTransfer?.types || []);
            if (types.length === 0) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            expandIslandForFileDrag();
          }}
          onDrop={(e) => {
            if (isInternalShelfDragRef.current) {
              isInternalShelfDragRef.current = false;
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            setDragAutoOpened(false);
            setIsPinnedOpen(true);
            setIsHovered(true);
            if (pageIndex !== 4) {
              navigateToPage(4);
            }
            processDroppedOsFiles(e.dataTransfer);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (activeAlert) {
              if (activeAlert.type === 'meeting') {
                setActiveAlert(null);
                navigateToPage(5);
                setIsPinnedOpen(true);
              } else if (activeAlert.type === 'notification') {
                setActiveAlert(null);
                navigateToPage(1);
                setIsPinnedOpen(true);
              }
              return;
            }
            if (!isPinnedOpen) setIsPinnedOpen(true);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (activeAlert) {
              setActiveAlert(null);
            } else if (!lyricsMode) {
              setIsPinnedOpen((p) => !p);
              setIsHovered(false);
              setDragAutoOpened(false);
            }
          }}
        >
          {/* =========================================================
              1. SYSTEM ALERTS (Slim Hardware HUD & Rich Peek Alerts)
             ========================================================= */}
          {activeAlert && (
            <div className="w-full h-full flex items-center justify-between px-4 animate-[ isleFadeIn_160ms_ease-out ]">
              {(activeAlert.type === 'volume' ||
                activeAlert.type === 'mute' ||
                activeAlert.type === 'brightness') && (
                <div
                  onWheel={(e) => {
                    e.stopPropagation();
                    if (activeAlert.type === 'brightness') {
                      setBrightness((b) => {
                        const next =
                          e.deltaY < 0 ? Math.min(10, b + 1) : Math.max(0, b - 1);
                        triggerAlert('brightness', { value: next });
                        return next;
                      });
                    } else {
                      setVolume((v) => {
                        const next =
                          e.deltaY < 0 ? Math.min(100, v + 2) : Math.max(0, v - 2);
                        setMuted(next === 0);
                        triggerAlert('volume', { value: next, muted: next === 0 });
                        return next;
                      });
                    }
                  }}
                  className="w-full flex items-center gap-3 px-1"
                >
                  <div className="text-white shrink-0 flex items-center justify-center">
                    {activeAlert.type === 'brightness' ? (
                      <SunBrightnessSvg size={17} />
                    ) : (
                      <SpeakerWaveSvg
                        size={17}
                        level={activeAlert.value ?? volume}
                        muted={activeAlert.muted ?? muted}
                      />
                    )}
                  </div>
                  <div className="flex-1 h-[5.5px] bg-[#3a3a3e] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all duration-100 ease-out"
                      style={{
                        width: `${
                          activeAlert.type === 'brightness'
                            ? Math.min(100, Math.max(0, ((activeAlert.value ?? brightness) / 10) * 100))
                            : activeAlert.muted
                            ? 0
                            : Math.min(100, Math.max(0, activeAlert.value ?? volume))
                        }%`,
                      }}
                    />
                  </div>
                  <span className="text-[11.5px] font-bold text-white/90 tabular-nums w-6 text-right shrink-0">
                    {activeAlert.type === 'brightness'
                      ? activeAlert.value ?? brightness
                      : activeAlert.muted
                      ? 0
                      : activeAlert.value ?? volume}
                  </span>
                </div>
              )}

              {activeAlert.type === 'capslock' && (
                <div className="w-full flex items-center justify-between px-1">
                  <div className="flex items-center gap-2.5 text-white">
                    <CapsLockArrowSvg size={16} />
                    <span className="text-[12.5px] font-semibold tracking-tight text-white">
                      Caps Lock {activeAlert.capsOn ? 'On' : 'Off'}
                    </span>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      activeAlert.capsOn ? 'bg-[#30d158]' : 'bg-white/25'
                    }`}
                  />
                </div>
              )}

              {(activeAlert.type === 'charging' || activeAlert.type === 'lowbattery') && (
                <div className="w-full flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="relative w-8 h-8 flex items-center justify-center">
                      <svg width={32} height={32} className="-rotate-90">
                        <circle
                          cx={16}
                          cy={16}
                          r={13}
                          fill="none"
                          stroke={
                            (activeAlert.value ?? batteryLevel) <= 20 && !isCharging
                              ? 'rgba(255,69,58,0.22)'
                              : 'rgba(48,209,88,0.22)'
                          }
                          strokeWidth={2.6}
                        />
                        <circle
                          cx={16}
                          cy={16}
                          r={13}
                          fill="none"
                          stroke={
                            (activeAlert.value ?? batteryLevel) <= 20 && !isCharging
                              ? '#ff453a'
                              : '#30d158'
                          }
                          strokeWidth={2.6}
                          strokeDasharray={2 * Math.PI * 13}
                          strokeDashoffset={
                            2 * Math.PI * 13 * (1 - (activeAlert.value ?? batteryLevel) / 100)
                          }
                          strokeLinecap="round"
                        />
                      </svg>
                      <span
                        className={`absolute ${
                          (activeAlert.value ?? batteryLevel) <= 20 && !isCharging
                            ? 'text-[#ff453a]'
                            : 'text-[#30d158]'
                        }`}
                      >
                        <BoltChargingSvg size={13} />
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-semibold text-white leading-tight">
                        {isCharging
                          ? 'Charging'
                          : (activeAlert.value ?? batteryLevel) <= 20
                          ? 'Low Battery'
                          : 'On Battery'}
                      </span>
                      <span className="text-[10px] text-white/50 leading-tight">
                        {isCharging
                          ? 'Plugged into AC power'
                          : (activeAlert.value ?? batteryLevel) <= 20
                          ? 'Plug in charger soon'
                          : 'Laptop battery active'}
                      </span>
                    </div>
                  </div>

                  {/* Real Laptop Battery Progress Bar + Percentage */}
                  <div className="flex-1 flex items-center gap-2.5 min-w-[90px]">
                    <div className="flex-1 h-[6px] bg-white/15 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, activeAlert.value ?? batteryLevel))}%`,
                          backgroundColor:
                            (activeAlert.value ?? batteryLevel) <= 15 && !isCharging
                              ? '#ff453a'
                              : (activeAlert.value ?? batteryLevel) <= 30 && !isCharging
                              ? '#ff9f0a'
                              : '#30d158',
                        }}
                      />
                    </div>
                    <span className="text-[13.5px] font-bold text-white tabular-nums shrink-0">
                      {activeAlert.value ?? batteryLevel}%
                    </span>
                  </div>
                </div>
              )}

              {activeAlert.type === 'meeting' && (
                <div className="w-full flex items-center justify-between px-0.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#0a84ff]/20 text-[#389bff] flex items-center justify-center shrink-0">
                      <VideoCameraSvg size={15} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12.5px] font-semibold text-white truncate leading-tight">
                        Weekly sync in 5 min
                      </span>
                      <span className="text-[11px] text-white/50 truncate leading-tight tabular-nums">
                        01:53 – 02:23 · Google Meet
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveAlert(null);
                      navigateToPage(5);
                      setIsPinnedOpen(true);
                    }}
                    className="px-3.5 py-1 rounded-full bg-[#1a73e8] hover:bg-[#2580f5] text-white text-[12px] font-semibold transition shrink-0"
                  >
                    Join
                  </button>
                </div>
              )}

              {activeAlert.type === 'notification' && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveAlert(null);
                    navigateToPage(1);
                    setIsPinnedOpen(true);
                  }}
                  className="relative w-full h-full flex items-center justify-between px-3 cursor-pointer select-none animate-[isleFadeIn_180ms_ease-out]"
                >
                  {/* Subtle Glowing Neon Bottom Rim Accent (Matches reference screenshot) */}
                  <div className="absolute inset-x-2 -bottom-[1px] h-[2px] bg-gradient-to-r from-transparent via-cyan-400/90 to-transparent blur-[0.6px] shadow-[0_0_14px_rgba(56,189,248,0.9)] pointer-events-none" />

                  {/* Left: White Avatar Badge with Two Vertical Eyes */}
                  <div className="relative w-8 h-8 rounded-full bg-white shadow-[0_0_14px_rgba(255,255,255,0.4)] flex items-center justify-center shrink-0">
                    <div className="flex items-center gap-[4px]">
                      <span className="w-1.5 h-3 rounded-full bg-[#0a0a0f]" />
                      <span className="w-1.5 h-3 rounded-full bg-[#0a0a0f]" />
                    </div>
                  </div>

                  {/* Center: Two-Line Typography */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center px-3">
                    <span className="text-[11px] font-normal text-white/55 italic tracking-tight truncate leading-tight">
                      {`“${activeAlert.confirmSubtitle || 'New Notification'}”`}
                    </span>
                    <span className="text-[13.5px] font-semibold text-white tracking-tight truncate leading-tight mt-0.5">
                      {activeAlert.confirmTitle || 'Notification received'}
                    </span>
                  </div>

                  {/* Right: Dark Circular Button with Centered White Square */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveAlert(null);
                    }}
                    title="Dismiss"
                    className="w-7 h-7 rounded-full bg-white/[0.14] hover:bg-white/[0.25] active:scale-95 flex items-center justify-center transition cursor-pointer shrink-0"
                  >
                    <span className="w-2.5 h-2.5 rounded-[2px] bg-white shadow-sm" />
                  </button>
                </div>
              )}

              {activeAlert.type === 'permission' && (
                <div className="w-full h-full flex items-center gap-3.5 py-2.5 px-1">
                  <div className="relative shrink-0">
                    <BotCanvas
                      size={40}
                      shape={botShape}
                      color={botColor}
                      form={
                        activeAlert.permissionState === 'allowed'
                          ? 'success'
                          : activeAlert.permissionState === 'denied'
                          ? 'error'
                          : 'asking'
                      }
                      voiceLevel={0}
                    />
                    <span
                      className={`absolute -top-0.5 -left-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        activeAlert.permissionState === 'allowed'
                          ? 'bg-[#30d158] text-black'
                          : activeAlert.permissionState === 'denied'
                          ? 'bg-[#ff453a] text-white'
                          : 'bg-[#ff9f0a] text-black'
                      }`}
                    >
                      {activeAlert.permissionState === 'allowed' ? (
                        <CheckTickSvg size={10} />
                      ) : activeAlert.permissionState === 'denied' ? (
                        <CloseCrossSvg size={10} />
                      ) : (
                        '!'
                      )}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
                    <div>
                      <div className="text-[12.5px] font-semibold text-white leading-tight">
                        shop needs permission
                      </div>
                      <div className="text-[10.5px] text-white/45 leading-tight">
                        Isle Assistant · Windows
                      </div>
                    </div>

                    <div className="inline-flex items-center px-2 py-0.5 rounded bg-white/[0.08] font-mono text-[11px] text-white/90 w-fit">
                      git push origin main
                    </div>

                    <div className="flex items-center gap-1.5 pt-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveAlert((a) => (a ? { ...a, permissionState: 'denied' } : null));
                          setTimeout(() => setActiveAlert(null), 700);
                        }}
                        className="px-3 py-0.5 rounded-full bg-white/10 hover:bg-white/16 text-white/85 text-[11px] font-medium transition"
                      >
                        Deny
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveAlert((a) => (a ? { ...a, permissionState: 'allowed' } : null));
                          setTimeout(() => setActiveAlert(null), 700);
                        }}
                        className="px-3 py-0.5 rounded-full bg-white/12 hover:bg-white/20 text-white text-[11px] font-medium transition"
                      >
                        Allow
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveAlert((a) => (a ? { ...a, permissionState: 'allowed' } : null));
                          setTimeout(() => setActiveAlert(null), 700);
                        }}
                        className="px-3.5 py-0.5 rounded-full bg-white text-black hover:bg-white/90 text-[11px] font-semibold transition"
                      >
                        Always
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Smart Alarm Trigger Alert (Full-width notch alert with Snooze & Dismiss) ── */}
              {activeAlert.type === 'alarm' && (
                <div className="w-full flex items-center justify-between px-1">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#ff9f0a]/20 text-[#ff9f0a] flex items-center justify-center shrink-0 animate-bounce">
                      <AlarmBellSvg size={16} />
                    </div>
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-[12.5px] font-bold text-white truncate leading-tight">
                        {activeAlert.alarmTitle || 'Smart Alarm'}
                      </span>
                      <span className="text-[10.5px] text-[#ffb340] font-medium leading-tight tabular-nums flex items-center gap-1.5 mt-0.5">
                        <span>{activeAlert.alarmTime || timeStr}</span>
                        <span className="text-white/40">•</span>
                        <span>Waktunya telah tiba</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSnoozeAlarm(activeAlert.alarmId);
                      }}
                      className="px-3 py-1 rounded-full bg-white/12 hover:bg-white/20 text-white text-[11px] font-medium transition"
                      title="Tunda 5 Menit"
                    >
                      Snooze (+5m)
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activeAlert.alarmId?.startsWith('task-')) {
                          const taskIdNum = parseInt(activeAlert.alarmId.replace('task-', ''), 10);
                          setTasks((prev) =>
                            prev.map((t) => (t.id === taskIdNum ? { ...t, done: true } : t))
                          );
                        }
                        setActiveAlert(null);
                      }}
                      className="px-3 py-1 rounded-full bg-white text-black hover:bg-white/90 text-[11px] font-semibold transition"
                      title={
                        activeAlert.alarmId?.startsWith('task-')
                          ? 'Tandai Task Selesai'
                          : 'Matikan Alarm'
                      }
                    >
                      {activeAlert.alarmId?.startsWith('task-') ? 'Done' : 'Dismiss'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Seamless Fluid Modern Action Confirmation Alert (Matches user's reference image!) ── */}
              {activeAlert.type === 'action_confirm' && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    const targetIdx = activeAlert.targetPageIdx;
                    setActiveAlert(null);
                    if (typeof targetIdx === 'number') {
                      navigateToPage(targetIdx);
                      setIsPinnedOpen(true);
                    }
                  }}
                  className="relative w-full h-full flex items-center justify-between px-3 cursor-pointer select-none animate-[isleFadeIn_180ms_ease-out]"
                >
                  {/* Subtle Glowing Neon Bottom Rim Accent (Matches reference screenshot) */}
                  <div className="absolute inset-x-2 -bottom-[1px] h-[2px] bg-gradient-to-r from-transparent via-cyan-400/90 to-transparent blur-[0.6px] shadow-[0_0_14px_rgba(56,189,248,0.9)] pointer-events-none" />

                  {/* Left: White Avatar Badge with Two Vertical Eyes */}
                  <div className="relative w-8 h-8 rounded-full bg-white shadow-[0_0_14px_rgba(255,255,255,0.4)] flex items-center justify-center shrink-0">
                    <div className="flex items-center gap-[4px]">
                      <span className="w-1.5 h-3 rounded-full bg-[#0a0a0f]" />
                      <span className="w-1.5 h-3 rounded-full bg-[#0a0a0f]" />
                    </div>
                  </div>

                  {/* Center: Two-Line Minimalist Typography */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center px-3">
                    <span className="text-[11px] font-normal text-white/55 italic tracking-tight truncate leading-tight">
                      {activeAlert.confirmSubtitle
                        ? `“${activeAlert.confirmSubtitle}”`
                        : '“Voice Command”'}
                    </span>
                    <span className="text-[13.5px] font-semibold text-white tracking-tight truncate leading-tight mt-0.5">
                      {activeAlert.confirmTitle || 'Finding jazz on Spotify'}
                    </span>
                  </div>

                  {/* Right: Modern Dark Circular Button with Centered White Square */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveAlert(null);
                    }}
                    title="Dismiss"
                    className="w-7 h-7 rounded-full bg-white/[0.14] hover:bg-white/[0.25] active:scale-95 flex items-center justify-center transition cursor-pointer shrink-0"
                  >
                    <span className="w-2.5 h-2.5 rounded-[2px] bg-white shadow-sm" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              2. COMPACT NOTCH STATE ([Battery Ring] 10:54 — Cross-morphs smoothly with Expanded Island)
             ========================================================= */}
          {!activeAlert && (
            <div
              className={`absolute inset-x-0 top-0 h-[32px] w-full max-w-[164px] mx-auto flex items-center justify-between px-3.5 text-white transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                !isExpanded && !(miniCapsuleMode && !topEdgeHover)
                  ? 'opacity-100 scale-100 blur-0 pointer-events-auto z-20'
                  : 'opacity-0 scale-90 blur-[4px] pointer-events-none z-0'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {renderBatteryRing(15, 2.2)}
                {dndEnabled && (
                  <span className="text-[#8e8eff]">
                    <MoonFilledSvg size={11} />
                  </span>
                )}
              </div>
              <span className="text-[13px] font-bold tracking-tight text-white tabular-nums">
                {timeStr}
              </span>
            </div>
          )}

          {/* =========================================================
              3. UNIFIED LIQUID GLASS ISLE ASSISTANT (Minimalist Capsule & Clean Reading Area)
             ========================================================= */}
          {!activeAlert && isExpanded && assistantOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const droppedFiles = Array.from(e.dataTransfer?.files || []) as File[];
                const imgFile = droppedFiles.find((f) => f.type.startsWith('image/'));
                if (imgFile) {
                  attachImageFile(imgFile);
                }
              }}
              className="w-full h-full flex flex-col justify-between px-4 py-2.5 text-white animate-[isleFadeIn_200ms_ease-out]"
            >
              {/* Minimalist Clean Header (Zero Pill / Zero Ball AI Slop) */}
              <div className="isle-stagger-1 flex items-center justify-between shrink-0 pb-1 border-b border-white/[0.07]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[12.5px] font-semibold tracking-tight text-white">
                    Isle Assistant
                  </span>
                  <span className="text-white/25 text-[11px] select-none font-light">/</span>
                  <button
                    type="button"
                    onClick={() =>
                      setAssistantModel((m) =>
                        m === 'agnes-3.0-flash' || m === 'agnes-2.5-flash'
                          ? 'muse-spark-1.3-contributor'
                          : 'agnes-3.0-flash'
                      )
                    }
                    title="Klik untuk beralih mode model: Agnes (Fast + Web) / Muse Spark (Deep Think)"
                    className="text-[11.5px] text-white/50 hover:text-white transition tracking-tight font-normal cursor-pointer select-none"
                  >
                    {assistantModel === 'agnes-3.0-flash' || assistantModel === 'agnes-2.5-flash'
                      ? 'Agnes Fast'
                      : 'Muse Spark'}
                  </button>

                  {voiceListening && (
                    <span className="text-[10px] text-[#30d158] font-normal animate-pulse truncate ml-1 select-none">
                      mendengarkan...
                    </span>
                  )}
                  {spamNotice && (
                    <span className="text-[10px] text-[#ff9f0a] font-normal truncate select-none">
                      · {spamNotice}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      setMessages([]);
                      setLatestSearchSources([]);
                      setPendingImage(null);
                      setShowAllChatHistory(false);
                      setAnimatingMsgId(null);
                      assistantInputRef.current?.focus();
                    }}
                    title="Mulai obrolan baru (+)"
                    className="w-6 h-6 rounded-full bg-white/[0.06] hover:bg-white/16 flex items-center justify-center text-white/60 hover:text-white transition"
                  >
                    <PlusSvg size={10} />
                  </button>
                  <button
                    onClick={closeAssistantAndCollapse}
                    title="Tutup Isle Assistant (Esc)"
                    className="w-6 h-6 rounded-full bg-white/[0.06] hover:bg-white/16 flex items-center justify-center text-white/60 hover:text-white transition"
                  >
                    <CloseCrossSvg size={10} />
                  </button>
                </div>
              </div>

              {/* Clean, Airy Response Area */}
              <div
                ref={chatScrollRef}
                className="isle-stagger-2 flex-1 min-h-0 overflow-y-auto no-scrollbar pr-0.5 my-1.5 flex flex-col justify-center"
              >
                {assistantLoading ? (
                  <div className="my-auto flex items-center gap-2.5 py-2 pl-0.5 animate-[isleFadeIn_180ms_ease-out]">
                    <div className="shrink-0">
                      <BotCanvas
                        size={20}
                        shape={botShape}
                        color={botColor}
                        form="thinking"
                        voiceLevelRef={voiceEnergyRef}
                      />
                    </div>
                    <GeminiThinkingIndicator
                      label={
                        agentHeadline ||
                        (assistantModel === 'agnes-3.0-flash' || assistantModel === 'agnes-2.5-flash'
                          ? 'Agnes sedang mencari informasi & merespons...'
                          : 'Muse Spark sedang berpikir mendalam...')
                      }
                    />
                  </div>
                ) : voiceListening && agentTranscript ? (
                  <div className="my-auto flex items-center gap-2.5 py-1.5 px-2 rounded-xl bg-white/[0.04] border border-white/10 animate-[isleFadeIn_150ms_ease-out]">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ff453a] animate-ping shrink-0" />
                    <span className="text-[12px] text-white/95 italic font-medium">
                      “{agentTranscript}”
                    </span>
                  </div>
                ) : latestAssistantMessage ? (
                  <div
                    key={latestAssistantMessage.id}
                    className="my-auto flex flex-col gap-1.5 py-0.5 animate-[isleFadeIn_240ms_ease-out]"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="shrink-0 mt-0.5">
                        <BotCanvas
                          size={18}
                          shape={botShape}
                          color={botColor}
                          form="reply"
                          voiceLevel={0}
                        />
                      </div>
                      {latestAssistantMessage.imageUrl && (
                        <img
                          src={latestAssistantMessage.imageUrl}
                          alt="Visual context"
                          className="w-10 h-10 rounded-lg border border-white/20 object-cover shrink-0 mt-0.5"
                          title="Gambar / Screenshot yang dianalisis"
                        />
                      )}
                      <div className="text-[12px] text-white/95 leading-relaxed select-text break-words flex-1 min-w-0 font-normal">
                        {renderAssistantFormattedText(
                          animatingMsgId === latestAssistantMessage.id
                            ? latestAssistantMessage.text.slice(0, revealedChars)
                            : latestAssistantMessage.text
                        )}
                        {animatingMsgId === latestAssistantMessage.id && (
                          <span className="inline-block w-1.5 h-3 ml-0.5 align-middle bg-white/70 animate-pulse rounded-xs" />
                        )}
                      </div>
                    </div>

                    {/* Compact PC System Control / Terminal Card */}
                    {latestAssistantMessage.commandCard &&
                      animatingMsgId !== latestAssistantMessage.id && (
                        <div className="pl-7 pt-0.5 animate-[isleFadeIn_180ms_ease-out]">
                          <div
                            onClick={() => {
                              const card = latestAssistantMessage.commandCard;
                              if (!card) return;
                              if (card.uri) {
                                window.location.href = card.uri;
                              } else if (card.command) {
                                navigator.clipboard?.writeText(card.command);
                              }
                            }}
                            title={
                              latestAssistantMessage.commandCard.uri
                                ? `Buka di Windows (${latestAssistantMessage.commandCard.uri})`
                                : 'Salin perintah'
                            }
                            className="flex flex-col gap-0.5 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 font-mono text-[10px] cursor-pointer transition"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate text-white/80">
                                <span className="text-white/40 mr-1">$</span>
                                {latestAssistantMessage.commandCard.command}
                              </div>
                              <span className="flex items-center gap-1 text-[#30d158] font-sans font-semibold text-[9.5px] shrink-0">
                                <CheckTickSvg size={9} />
                                {latestAssistantMessage.commandCard.purpose}
                              </span>
                            </div>
                            {latestAssistantMessage.commandCard.output && (
                              <div className="text-[9.5px] text-white/50 truncate">
                                {latestAssistantMessage.commandCard.output}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                    {/* Found Files Strip */}
                    {latestAssistantMessage.foundFiles &&
                      latestAssistantMessage.foundFiles.length > 0 &&
                      animatingMsgId !== latestAssistantMessage.id && (
                        <div className="flex items-center gap-1.5 pl-7 pt-0.5 overflow-x-auto no-scrollbar animate-[isleFadeIn_180ms_ease-out]">
                          {latestAssistantMessage.foundFiles.map((f, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                addFilesToShelf([
                                  {
                                    name: f.name,
                                    size: f.size,
                                    ext: detectFileExt(f.name),
                                  },
                                ]);
                                closeAssistantAndCollapse();
                                setIsPinnedOpen(true);
                                navigateToPage(4, 'right');
                              }}
                              title={`${f.path} (${f.size}) · Kirim ke Shelf`}
                              className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.06] hover:bg-white/14 border border-white/10 text-[9.5px] text-white/85 whitespace-nowrap transition shrink-0"
                            >
                              <FileDocumentBadgeSvg ext={detectFileExt(f.name)} size={12} />
                              <span className="truncate max-w-[110px]">{f.name}</span>
                              <span className="text-white/40">{f.size}</span>
                            </button>
                          ))}
                        </div>
                      )}

                    {/* Subtle Live Web Search Sources Citations */}
                    {latestAssistantMessage.searchSources &&
                      latestAssistantMessage.searchSources.length > 0 &&
                      animatingMsgId !== latestAssistantMessage.id && (
                        <div className="flex items-center gap-1.5 pl-7 pt-0.5 text-[9.5px] text-white/45 animate-[isleFadeIn_180ms_ease-out]">
                          <span className="text-white/30">🌐</span>
                          <span className="font-medium text-white/50">Sumber Web:</span>
                          {latestAssistantMessage.searchSources.slice(0, 3).map((src, idx) => {
                            let label = src.title;
                            try {
                              label = new URL(src.uri).hostname.replace('www.', '');
                            } catch {
                              label = src.title.slice(0, 18);
                            }
                            return (
                              <a
                                key={idx}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/15 text-white/70 hover:text-white transition"
                                title={src.title}
                              >
                                {label}
                              </a>
                            );
                          })}
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="my-auto flex items-start gap-2.5 py-1 pl-0.5 animate-[isleFadeIn_180ms_ease-out]">
                    <div className="shrink-0 mt-0.5">
                      <BotCanvas
                        size={16}
                        shape={botShape}
                        color={botColor}
                        form="reply"
                        voiceLevel={0}
                      />
                    </div>
                    <div className="text-[12px] text-white/90 font-normal leading-relaxed select-none">
                      Halo! Mau tanya informasi terkini, ngobrol santai, atau perintahkan laptop kamu?
                    </div>
                  </div>
                )}
              </div>

              {/* Pending Image Attachment Preview Chip */}
              {pendingImage && (
                <div className="flex items-center justify-between gap-2 px-2.5 py-1 mb-1.5 rounded-xl bg-white/[0.08] border border-white/15 shrink-0 animate-[isleFadeIn_150ms_ease-out]">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={pendingImage.dataUrl}
                      alt={pendingImage.name}
                      className="w-7 h-7 rounded-lg object-cover border border-white/20 shrink-0"
                    />
                    <span className="text-[10px] text-white/90 truncate font-medium">
                      {pendingImage.name}
                    </span>
                    <span className="text-[9px] text-white/50 font-medium shrink-0">
                      · Vision
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingImage(null)}
                    className="w-4 h-4 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white/70 hover:text-white transition shrink-0"
                    title="Hapus lampiran"
                  >
                    <CloseCrossSvg size={8} />
                  </button>
                </div>
              )}

              {/* Minimalist Liquid Glass Capsule Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  stopVoiceRecognition();
                  handleAskGemini(assistantInput);
                }}
                className="isle-stagger-3 relative shrink-0 flex items-center"
              >
                {/* Hidden File Input for Vision / Image Attachment */}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) attachImageFile(f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                <div className="w-full flex items-center bg-white/[0.08] hover:bg-white/[0.10] focus-within:bg-white/[0.12] border border-white/15 focus-within:border-white/30 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.35)] rounded-full pl-2 pr-1.5 py-1 gap-1.5 transition duration-200">
                  {/* Left Interactive Bot Avatar */}
                  <div
                    onClick={() => startBrowserVoiceRecognition()}
                    title={
                      voiceListening
                        ? 'Mendengarkan suara · Klik untuk hentikan'
                        : 'Klik untuk bicara dengan suara'
                    }
                    className="shrink-0 cursor-pointer p-0.5 hover:scale-105 active:scale-95 transition"
                  >
                    <BotCanvas
                      size={22}
                      shape={botShape}
                      color={botColor}
                      form={voiceListening ? 'listening' : assistantLoading ? 'thinking' : botForm}
                      voiceLevelRef={voiceEnergyRef}
                    />
                  </div>

                  {/* Image Upload / Attachment Icon */}
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    title="Unggah gambar (atau Paste Ctrl+V / ketik 'ambil screenshot')"
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition shrink-0 ${
                      pendingImage
                        ? 'bg-white text-black'
                        : 'text-white/50 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <svg
                      width={13}
                      height={13}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </button>

                  {/* Clean Text Input */}
                  <input
                    ref={assistantInputRef}
                    type="text"
                    autoFocus
                    maxLength={1000}
                    value={assistantInput}
                    onChange={(e) => {
                      setAssistantInput(e.target.value);
                      setBotForm(e.target.value ? 'typing' : 'listening');
                    }}
                    onPaste={(e) => {
                      const items = Array.from(e.clipboardData?.items || []) as DataTransferItem[];
                      const imgItem = items.find((item) => item.type.startsWith('image/'));
                      if (imgItem) {
                        const file = imgItem.getAsFile();
                        if (file) {
                          e.preventDefault();
                          attachImageFile(file);
                        }
                      }
                    }}
                    placeholder={
                      voiceListening
                        ? 'Mendengarkan ucapanmu...'
                        : pendingImage
                        ? 'Tanya tentang gambar ini... (Enter)'
                        : assistantModel === 'agnes-3.0-flash' || assistantModel === 'agnes-2.5-flash'
                        ? 'Tanya info terkini atau perintahkan laptop... (Enter)'
                        : 'Mulai analisis mendalam bersama Muse Spark... (Enter)'
                    }
                    className="flex-1 bg-transparent text-[12px] text-white placeholder-white/40 focus:outline-none min-w-0 font-normal px-1"
                  />

                  {/* Right Action: Stop / Send / Mic Button */}
                  {assistantLoading ? (
                    <button
                      type="button"
                      onClick={cancelInFlightGemini}
                      title="Hentikan respons"
                      className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition shrink-0"
                    >
                      <StopSquareSvg size={8} />
                    </button>
                  ) : assistantInput.trim() || pendingImage ? (
                    <button
                      type="submit"
                      className="w-6 h-6 rounded-full bg-white text-black hover:bg-white/90 flex items-center justify-center transition shrink-0 shadow-sm"
                    >
                      <SendArrowSvg size={11} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startBrowserVoiceRecognition()}
                      title={voiceListening ? 'Hentikan rekaman' : 'Mulai bicara'}
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition shrink-0 ${
                        voiceListening
                          ? 'bg-[#ff453a] text-white shadow-[0_0_10px_rgba(255,69,58,0.6)] animate-pulse'
                          : 'bg-white/12 hover:bg-white/20 text-white/85'
                      }`}
                    >
                      <MicSymbolicSvg size={11} />
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* =========================================================
              4. EXPANDED ISLAND (6 Pages + Simultaneous Dual-Layer Slide + Seamless Cross-Morph)
             ========================================================= */}
          {!activeAlert && !assistantOpen && (
            <div
              onWheel={(e) => {
                if (isExpanded && Math.abs(e.deltaX) > 18 && !prevPageIndex) {
                  if (e.deltaX > 0) navigateToPage(pageIndex + 1, 'right');
                  else navigateToPage(pageIndex - 1, 'left');
                }
              }}
              className={`relative w-full h-full flex flex-col justify-between text-white origin-top transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isExpanded
                  ? 'opacity-100 scale-100 translate-y-0 blur-0 pointer-events-auto'
                  : 'opacity-0 scale-[0.84] -translate-y-3 blur-[6px] pointer-events-none'
              }`}
            >
              {/* ── Top Header Row on Non-Music Pages (Clean Title / Weather City Search on Left + Battery, Date & Clock on Right) ── */}
              {activePage !== 'music' && (
                <div
                  key={`hdr-${isExpanded ? 'open' : 'closed'}`}
                  className={`${
                    slideTick === 0 ? 'isle-stagger-1 ' : ''
                  }w-full flex items-center justify-between px-6 pt-2.5 pb-1 z-20 shrink-0`}
                >
                  {/* Left: Page Title OR Interactive Weather City & Manual Search Input */}
                  <div
                    key={`hdr-title-${activePage}`}
                    className="flex items-center gap-2 min-w-0 animate-[isleFadeIn_180ms_ease-out]"
                  >
                    {activePage === 'weather' ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="relative flex items-center h-[20px] min-w-[140px]"
                      >
                        {/* Minimalist Inline Search Input (Fluidly morphs in when editingWeatherCity is true) */}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const trimmed = weatherCityInput.trim();
                            setEditingWeatherCity(false);
                            if (trimmed) {
                              fetchWeatherData(trimmed);
                            }
                          }}
                          className={`absolute left-0 flex items-center gap-1 bg-white/[0.08] border border-white/15 focus-within:border-white/40 rounded-md px-2 py-0.5 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] origin-left ${
                            editingWeatherCity
                              ? 'opacity-100 scale-100 translate-x-0 pointer-events-auto w-[148px]'
                              : 'opacity-0 scale-90 -translate-x-1 pointer-events-none w-[95px]'
                          }`}
                        >
                          <svg
                            width={10}
                            height={10}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="shrink-0 text-white/60"
                          >
                            <circle cx={11} cy={11} r={7} />
                            <line x1={21} y1={21} x2={16.65} y2={16.65} />
                          </svg>
                          <input
                            type="text"
                            ref={(el) => {
                              if (editingWeatherCity && el) {
                                window.requestAnimationFrame(() => el.focus());
                              }
                            }}
                            value={weatherCityInput}
                            onChange={(e) => setWeatherCityInput(e.target.value)}
                            onBlur={() => {
                              setEditingWeatherCity(false);
                            }}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Escape') {
                                setEditingWeatherCity(false);
                              }
                            }}
                            placeholder="Ketik kota..."
                            className="w-full bg-transparent text-[10.5px] font-medium text-white placeholder-white/40 focus:outline-none"
                          />
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditingWeatherCity(false);
                              fetchWeatherData('');
                            }}
                            title="Deteksi lokasi otomatis (GPS/IP)"
                            className="text-white/45 hover:text-white transition-colors cursor-pointer shrink-0"
                          >
                            <svg
                              width={10}
                              height={10}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2.2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx={12} cy={12} r={3} />
                              <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                            </svg>
                          </button>
                        </form>

                        {/* Clean Minimalist Monochrome City Trigger */}
                        <button
                          type="button"
                          onClick={() => {
                            setWeatherCityInput('');
                            setEditingWeatherCity(true);
                          }}
                          title="Klik untuk cari kota lain"
                          className={`inline-flex items-center gap-1.5 text-left group cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] origin-left ${
                            editingWeatherCity
                              ? 'opacity-0 scale-90 translate-x-1 pointer-events-none'
                              : 'opacity-100 scale-100 translate-x-0 pointer-events-auto'
                          }`}
                        >
                          <svg
                            width={11}
                            height={11}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.9}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`shrink-0 text-white/75 group-hover:text-white transition-colors duration-200 ${
                              weatherLoading ? 'animate-pulse' : ''
                            }`}
                          >
                            <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z" />
                            <circle cx={12} cy={11} r={2} />
                          </svg>
                          <span className="text-[12px] font-bold text-white/95 group-hover:text-white tracking-tight truncate max-w-[130px] transition-colors">
                            {weatherData.city}
                          </span>
                          <svg
                            width={9.5}
                            height={9.5}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-white/35 group-hover:text-white/75 transition-colors shrink-0"
                          >
                            <circle cx={11} cy={11} r={7} />
                            <line x1={21} y1={21} x2={16.65} y2={16.65} />
                          </svg>
                        </button>
                      </div>
                    ) : activePage === 'notifications' ? (
                      <span className="text-[11px] font-medium text-white/35 tracking-tight">
                        Isle Center
                      </span>
                    ) : (
                      <>
                        <span className="text-[12.5px] font-bold text-white tracking-tight">
                          {ISLAND_PAGES.find((p) => p.id === activePage)?.label || activePage}
                        </span>
                        {activePage === 'shelf' &&
                          (shelfSubTab === 'files' ? shelfFiles.length > 0 : shelfClips.length > 0) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (shelfSubTab === 'files') setShelfFiles([]);
                                else setShelfClips([]);
                              }}
                              className="px-2.5 py-0.5 rounded-full bg-white/12 hover:bg-white/22 text-[10px] font-semibold text-white/90 transition animate-[isleFadeIn_160ms_ease-out] cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                      </>
                    )}
                  </div>

                  {/* Right: Equalizer + Isle Assistant + Battery Ring + Date + Time + Settings */}
                  <div className="flex items-center gap-2.5 text-white/85">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsPlaying((p) => !p);
                      }}
                      title={isPlaying ? 'Pause music' : 'Play music'}
                      className="text-white/80 hover:text-white transition"
                    >
                      <BeatEqualizerBars
                        size={14}
                        playing={isPlaying && !muted && volume > 0}
                        activeTrackTitle={activeTrack?.title}
                        activeTrackArtist={activeTrack?.artist}
                        hasAudioUrl={Boolean(activeTrack?.audioUrl)}
                        audioEl={audioElRef.current}
                        positionMsRef={positionMsRef}
                        parsedLyricsCount={parsedLyrics.length}
                        activeLineIndex={activeLineIndex}
                      />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAllChatHistory(false);
                        setAssistantOpen(true);
                        setAssistantMode(defaultAltQMode);
                        if (defaultAltQMode === 'voice-pill') {
                          setTimeout(() => startBrowserVoiceRecognition(true), 30);
                        } else {
                          setTimeout(() => assistantInputRef.current?.focus(), 40);
                        }
                      }}
                      title="Open Isle Assistant (Alt+Q)"
                      className="text-white/75 hover:text-white transition"
                    >
                      <SparkleFourPointSvg size={14} />
                    </button>

                    <div className="flex items-center gap-1.5 text-[11.5px] tracking-tight whitespace-nowrap">
                      {renderBatteryRing(14, 2)}
                      <span className="text-white/75 font-medium">{headerDateStr}</span>
                      <span className="text-white font-bold tabular-nums">{timeStr}</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSettingsOpen((s) => !s);
                      }}
                      title="Settings"
                      className={`transition ${
                        settingsOpen ? 'text-white' : 'text-white/65 hover:text-white'
                      }`}
                    >
                      <GearSettingsSvg size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── Side Left / Right Carousel Chevron Buttons (.nav-btn — Smoothly fades & scales in Lyrics/Settings mode) ── */}
              <button
                onClick={goPrevPage}
                className={`absolute left-[10px] top-[48%] -translate-y-1/2 z-30 w-[21px] h-[21px] rounded-full bg-[#3a3a3c] hover:bg-[#48484a] flex items-center justify-center cursor-pointer transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-90 ${
                  (activePage === 'music' && lyricsMode) || settingsOpen
                    ? 'opacity-0 scale-75 -translate-x-2 blur-[2px] pointer-events-none'
                    : 'opacity-100 scale-100 translate-x-0 blur-0 pointer-events-auto'
                }`}
                title="Previous Slide"
                aria-label="Previous Slide"
              >
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#dcdce0"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                onClick={goNextPage}
                className={`absolute right-[10px] top-[48%] -translate-y-1/2 z-30 w-[21px] h-[21px] rounded-full bg-[#3a3a3c] hover:bg-[#48484a] flex items-center justify-center cursor-pointer transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-90 ${
                  (activePage === 'music' && lyricsMode) || settingsOpen
                    ? 'opacity-0 scale-75 translate-x-2 blur-[2px] pointer-events-none'
                    : 'opacity-100 scale-100 translate-x-0 blur-0 pointer-events-auto'
                }`}
                title="Next Slide"
                aria-label="Next Slide"
              >
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#dcdce0"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* ── Quick Settings Overlay (Alt+Q Mode + Auto-Close Speed + FLAC Lossless + Mood Shuffle + Done) ── */}
              {settingsOpen ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 flex flex-col justify-center gap-1.5 px-7 py-1 animate-[isleFadeIn_180ms_ease-out]"
                >
                  {/* Row 1: Shortcut Alt + Q */}
                  <div className="isle-stagger-1 flex items-center justify-between bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1.5">
                    <div className="flex flex-col">
                      <span className="text-[10.5px] font-semibold text-white tracking-tight leading-tight">
                        Shortcut Alt + Q
                      </span>
                      <span className="text-[9px] text-white/45 leading-tight">
                        Mode saat buka Isle Assistant
                      </span>
                    </div>
                    <div className="flex items-center bg-black/60 border border-white/10 rounded-[4px] p-0.5 text-[9.5px]">
                      <button
                        onClick={() => setDefaultAltQMode('conversation')}
                        className={`px-2.5 py-0.5 rounded-[3px] font-medium transition cursor-pointer ${
                          defaultAltQMode === 'conversation'
                            ? 'bg-white text-black'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Type
                      </button>
                      <button
                        onClick={() => setDefaultAltQMode('voice-pill')}
                        className={`px-2.5 py-0.5 rounded-[3px] font-medium transition cursor-pointer ${
                          defaultAltQMode === 'voice-pill'
                            ? 'bg-white text-black'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Voice
                      </button>
                    </div>
                  </div>

                  {/* Row 2: Customizable Auto-Close Speed when Mouse Leaves Dynamic Island */}
                  <div className="isle-stagger-2 flex items-center justify-between bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1.5">
                    <div className="flex flex-col">
                      <span className="text-[10.5px] font-semibold text-white tracking-tight leading-tight">
                        Kecepatan Tutup Island
                      </span>
                      <span className="text-[9px] text-white/45 leading-tight">
                        Jeda setelah mouse pergi
                      </span>
                    </div>
                    <div className="flex items-center bg-black/60 border border-white/10 rounded-[4px] p-0.5 text-[9.5px] gap-0.5">
                      {[
                        { label: 'Instan', ms: 0 },
                        { label: '0.1s', ms: 120 },
                        { label: '0.3s', ms: 300 },
                        { label: '0.6s', ms: 600 },
                        { label: '1.2s', ms: 1200 },
                      ].map((opt) => {
                        const active = closeDelayMs === opt.ms;
                        return (
                          <button
                            key={opt.ms}
                            type="button"
                            onClick={() => setCloseDelayMs(opt.ms)}
                            className={`px-2 py-0.5 rounded-[3px] font-medium transition cursor-pointer tabular-nums ${
                              active
                                ? 'bg-white text-black font-semibold'
                                : 'text-white/60 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Row 3: Audio & Playback Options (FLAC Lossless + Smart Mood Shuffle + Done) */}
                  <div className="isle-stagger-3 flex items-center justify-between gap-2">
                    <div
                      onClick={() => {
                        const nextFlac = !flacEnabled;
                        setFlacEnabled(nextFlac);
                        setActiveTrack((prev) => (prev ? { ...prev, isFlac: nextFlac } : prev));
                      }}
                      className="flex-1 flex items-center justify-between bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-md px-2.5 py-1.5 cursor-pointer transition select-none"
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white text-[10px] leading-tight">
                            FLAC Lossless
                          </span>
                          <span className="text-[7px] font-mono tracking-wider text-white/50 border border-white/10 px-1 rounded-[2px]">
                            HI-RES
                          </span>
                        </div>
                        <span className="text-[8.5px] text-white/40 leading-tight">Studio Audio</span>
                      </div>
                      <div
                        className={`w-6 h-3 rounded-[3px] p-0.5 transition shrink-0 border ${
                          flacEnabled ? 'bg-white border-white' : 'bg-black/50 border-white/20'
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-[1.5px] transition-transform ${
                            flacEnabled ? 'translate-x-3 bg-black' : 'translate-x-0 bg-white/40'
                          }`}
                        />
                      </div>
                    </div>

                    <div
                      onClick={() => setMoodShuffleEnabled((prev) => !prev)}
                      className="flex-1 flex items-center justify-between bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-md px-2.5 py-1.5 cursor-pointer transition select-none"
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white text-[10px] leading-tight">
                            Mood Shuffle
                          </span>
                          <span className="text-[7px] font-mono tracking-wider text-white/50 border border-white/10 px-1 rounded-[2px]">
                            AUTO
                          </span>
                        </div>
                        <span className="text-[8.5px] text-white/40 leading-tight">Mix Sesuai Mood</span>
                      </div>
                      <div
                        className={`w-6 h-3 rounded-[3px] p-0.5 transition shrink-0 border ${
                          moodShuffleEnabled ? 'bg-white border-white' : 'bg-black/50 border-white/20'
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-[1.5px] transition-transform ${
                            moodShuffleEnabled ? 'translate-x-3 bg-black' : 'translate-x-0 bg-white/40'
                          }`}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => setSettingsOpen(false)}
                      className="px-3.5 py-1.5 rounded-md bg-white text-black hover:bg-neutral-200 text-[10px] font-semibold shrink-0 transition cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Dual-Layer Simultaneous Carousel Viewport (Outgoing + Incoming Pages Slide Together Smoothly) ── */
                <div className="relative flex-1 overflow-hidden">
                  {/* Outgoing Page Layer (Animates out over 280ms when switching pages) */}
                  {prevPageIndex !== null && prevPageIndex !== pageIndex && (
                    <div
                      key={`out-${prevPageIndex}-${slideTick}`}
                      style={{
                        animation:
                          slideDir === 'right'
                            ? 'islePageOutLeft 280ms cubic-bezier(0.22, 1, 0.36, 1) forwards'
                            : 'islePageOutRight 280ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
                      }}
                      className="isle-outgoing-page absolute inset-0 flex flex-col justify-center pointer-events-none"
                    >
                      {renderPageContent(ISLAND_PAGES[prevPageIndex].id, true)}
                    </div>
                  )}

                  {/* Incoming / Active Page Layer (Persists .isle-carousel-page when slideTick > 0 so clearing prevPageIndex never restarts child animations) */}
                  <div
                    key={`in-${pageIndex}-${slideTick}-${isExpanded ? 'open' : 'closed'}`}
                    style={
                      slideTick > 0
                        ? {
                            animation:
                              slideDir === 'right'
                                ? 'islePageInRight 280ms cubic-bezier(0.22, 1, 0.36, 1) forwards'
                                : 'islePageInLeft 280ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
                          }
                        : undefined
                    }
                    className={`relative w-full h-full flex flex-col justify-center ${
                      slideTick > 0 ? 'isle-carousel-page' : ''
                    }`}
                  >
                    {renderPageContent(activePage, false)}
                  </div>
                </div>
              )}

              {/* ── Bottom Page Indicator Dots (Rendered inline inside Music Player on Music tab) ── */}
              {activePage !== 'music' && !settingsOpen && (
                <div
                  className="w-full flex items-center justify-center gap-[5px] pb-[10px] z-20 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {ISLAND_PAGES.map((p, idx) => {
                    const isActive = idx === pageIndex;
                    return (
                      <button
                        key={p.id}
                        onClick={(e) => selectTabPage(idx, e)}
                        className={`h-[4px] transition-all duration-300 ${
                          isActive
                            ? 'w-[17px] bg-white rounded-[3px]'
                            : 'w-[4px] bg-[#555558] rounded-full hover:bg-white/60'
                        }`}
                        title={p.label}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </IslandSurface>
      </div>

      {/* Hidden Real HTML5 Audio Player (Supports Both Local MP3/WAV Files & Direct FLAC/HTTP Audio Streams) */}
      <audio
        ref={audioElRef}
        onTimeUpdate={(e) => {
          if (!activeTrack?.audioUrl) return;
          const el = e.currentTarget;
          setPositionMs(Math.floor(el.currentTime * 1000));
        }}
        onLoadedMetadata={(e) => {
          if (!activeTrack?.audioUrl) return;
          const el = e.currentTarget;
          // Only update duration if it is a full-length song (> 60s), never overwrite with a 30s snippet
          if (Number.isFinite(el.duration) && el.duration > 60) {
            const durMs = Math.floor(el.duration * 1000);
            setActiveTrack((prev) => (prev ? { ...prev, durationMs: durMs } : prev));
          }
        }}
        onEnded={() => {
          if (!activeTrack?.audioUrl || activeTrack?.sourceType === 'external') return;
          if (Date.now() - lastPlayedSongTimeRef.current < 5000) return;
          handleTrackEndedRef.current();
        }}
        className="hidden"
      />
      {/* Full-Song YouTube Music Iframe Audio Player (Powered by sigma67/ytmusicapi filter="songs" videoId) */}
      {!activeTrack?.audioUrl && activeTrack?.youtubeVideoId && activeTrack?.sourceType !== 'external' && (
        <iframe
          ref={ytIframeRef}
          key={activeTrack.youtubeVideoId}
          src={`https://www.youtube.com/embed/${activeTrack.youtubeVideoId}?enablejsapi=1&autoplay=1&playsinline=1&controls=0&rel=0&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`}
          style={{
            position: 'fixed',
            bottom: '4px',
            right: '4px',
            width: '240px',
            height: '135px',
            opacity: 0.002,
            pointerEvents: 'none',
            zIndex: -10,
          }}
          allow="autoplay *; encrypted-media *; fullscreen"
          title="YouTube Full Audio Stream"
          onLoad={(e) => {
            try {
              const cw = e.currentTarget.contentWindow;
              if (cw) {
                cw.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
                cw.postMessage(
                  JSON.stringify({
                    event: 'command',
                    func: 'addEventListener',
                    args: ['onStateChange'],
                  }),
                  '*'
                );
                cw.postMessage(
                  JSON.stringify({ event: 'command', func: 'playVideo', args: '' }),
                  '*'
                );
                cw.postMessage(
                  JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: '' }),
                  '*'
                );
                cw.postMessage(
                  JSON.stringify({
                    event: 'command',
                    func: 'setVolume',
                    args: [muted ? 0 : volume],
                  }),
                  '*'
                );
              }
            } catch {
              // ignore
            }
          }}
        />
      )}
      <input
        ref={audioFileInputRef}
        type="file"
        accept="audio/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleLocalAudioFile(f);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={shelfFileInputRef}
        type="file"
        multiple
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            const items = await Promise.all(
              files.map(async (f) => {
                const ext = detectFileExt(f.name);
                const filePath = window.electronAPI?.getPathForFile
                  ? window.electronAPI.getPathForFile(f)
                  : (f as any).path || '';
                const isImg =
                  f.type.startsWith('image/') ||
                  ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'SVG', 'BMP'].includes(ext);
                let thumbnailUrl: string | undefined;
                let dataUrl: string | undefined;
                if (isImg) {
                  thumbnailUrl = URL.createObjectURL(f);
                  if (f.size <= 8 * 1024 * 1024) {
                    dataUrl = await new Promise<string | undefined>((resolve) => {
                      const reader = new FileReader();
                      reader.onload = () =>
                        resolve(typeof reader.result === 'string' ? reader.result : undefined);
                      reader.onerror = () => resolve(undefined);
                      reader.readAsDataURL(f);
                    });
                  }
                }
                return {
                  name: f.name,
                  size: formatBytes(f.size),
                  ext,
                  thumbnailUrl,
                  dataUrl,
                  filePath: filePath || undefined,
                  mimeType: f.type || undefined,
                };
              })
            );
            addFilesToShelf(items);
          }
          e.target.value = '';
        }}
        className="hidden"
      />
    </div>
  );
}
