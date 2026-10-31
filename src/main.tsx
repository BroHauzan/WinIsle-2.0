import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { getApiBaseUrl } from './utils/apiBase';
import {
  isTauri,
  setupTauriBridgeGlobal,
  getHardwareStatus,
  setMasterVolume,
  setMasterMute,
  setBrightness,
  getSystemMedia,
  sendSystemMediaCommand,
  getSystemScreenshot,
} from './core/tauri-bridge';
import { askGeminiAssistant } from './core/gemini';

setupTauriBridgeGlobal();

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function resolveTauriSong(
  origFetch: typeof window.fetch,
  query: string,
  useFlac = false
) {
  const cleanQ = query.trim();
  if (!cleanQ) return null;
  let title = cleanQ;
  let artist = 'Various Artists';
  let coverUrl = '';
  let durationMs = 210000;

  try {
    const itRes = await origFetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQ)}&media=music&entity=song&limit=5`
    );
    if (itRes.ok) {
      const itData = await itRes.json();
      const first = itData?.results?.[0];
      if (first) {
        title = first.trackName || title;
        artist = first.artistName || artist;
        coverUrl = String(first.artworkUrl100 || '').replace('100x100bb', '600x600bb');
        if (typeof first.trackTimeMillis === 'number' && first.trackTimeMillis > 45000) {
          durationMs = first.trackTimeMillis;
        }
      }
    }
  } catch {
    // ignore
  }

  let lrc = '';
  let provider = 'none';
  try {
    const lrcRes = await origFetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(`${title} ${artist}`.trim())}`
    );
    if (lrcRes.ok) {
      const list = await lrcRes.json();
      const match = Array.isArray(list)
        ? list.find((item: any) => typeof item?.syncedLyrics === 'string' && item.syncedLyrics.trim())
        : null;
      if (match) {
        lrc = match.syncedLyrics;
        provider = 'lrclib';
      }
    }
  } catch {
    // ignore
  }

  return {
    title,
    artist,
    coverUrl,
    audioUrl: '',
    isFlac: useFlac,
    durationMs,
    youtubeVideoId: '',
    lrc,
    syncType: 'LINE',
    provider,
  };
}

if (typeof window !== 'undefined') {
  const origFetch = window.fetch.bind(window);

  if (isTauri()) {
    const tauriFetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!urlStr.startsWith('/api/')) {
        return origFetch(input, init);
      }

      const [pathname, rawSearch = ''] = urlStr.split('?');
      const params = new URLSearchParams(rawSearch);
      const bodyObj = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};

      if (pathname === '/api/gemini/config') {
        return jsonResponse({ hasKey: true, maskedKey: 'AQ.Ab8••••46ng', isPermanent: true });
      }
      if (pathname === '/api/system/hardware-status') {
        const hw = await getHardwareStatus();
        return jsonResponse({
          osHardwareAvailable: true,
          platform: 'win32',
          volume: hw.volume,
          muted: hw.muted,
          brightness: Math.round((hw.brightness || 70) / 10),
          batteryLevel: hw.battery?.percentage ?? 85,
          isCharging: hw.battery?.is_charging ?? true,
        });
      }
      if (pathname === '/api/system/hardware-control') {
        if (typeof bodyObj?.volume === 'number') await setMasterVolume(bodyObj.volume);
        if (typeof bodyObj?.muted === 'boolean') await setMasterMute(bodyObj.muted);
        if (typeof bodyObj?.brightness === 'number') await setBrightness(bodyObj.brightness * 10);
        return jsonResponse({ ok: true, osHardwareAvailable: true });
      }
      if (pathname === '/api/system/screenshot') {
        try {
          const b64 = await getSystemScreenshot();
          return jsonResponse({ ok: true, captured: Boolean(b64), mimeType: 'image/png', data: b64 });
        } catch {
          return jsonResponse({ ok: true, captured: false });
        }
      }
      if (pathname === '/api/music/os-now-playing') {
        const media = await getSystemMedia();
        if (!media || !media.title) {
          return jsonResponse({ playing: false, shuffleActive: false });
        }
        const resolved = await resolveTauriSong(origFetch, `${media.title} ${media.artist || ''}`);
        return jsonResponse({
          playing: true,
          isPaused: !media.is_playing,
          shuffleActive: media.shuffle_active,
          sourceApp: media.source_app || 'System Media',
          positionMs: media.position_ms,
          track: {
            ...(resolved || {}),
            title: media.title,
            artist: media.artist || resolved?.artist || 'Unknown Artist',
            coverUrl: media.cover_url || resolved?.coverUrl || '',
            durationMs: media.duration_ms || resolved?.durationMs || 210000,
            sourceType: 'external',
            externalApp: media.source_app || 'System Media',
            audioUrl: '',
            youtubeVideoId: undefined,
          },
        });
      }
      if (pathname === '/api/music/os-control') {
        await sendSystemMediaCommand(String(bodyObj?.action || 'play_pause'), bodyObj?.targetShuffle);
        return jsonResponse({ ok: true, action: bodyObj?.action });
      }
      if (pathname === '/api/music/search') {
        const track = await resolveTauriSong(origFetch, params.get('q') || '', params.get('flac') === 'true');
        return track ? jsonResponse({ found: true, track }) : jsonResponse({ found: false }, 404);
      }
      if (pathname === '/api/music/mood-shuffle') {
        const artist = params.get('artist') || 'Laufey';
        const track = await resolveTauriSong(origFetch, `${artist} From The Start`, false);
        return track ? jsonResponse({ found: true, track }) : jsonResponse({ found: false }, 404);
      }
      if (pathname === '/api/music/lyrics') {
        const q = params.get('q') || `${params.get('track_name') || ''} ${params.get('artist_name') || ''}`.trim();
        const track = await resolveTauriSong(origFetch, q, false);
        return jsonResponse({
          ok: true,
          lrc: track?.lrc || '',
          syncType: 'LINE',
          provider: track?.provider || 'lrclib',
          title: track?.title || q,
          artist: track?.artist || '',
        });
      }
      if (pathname === '/api/weather') {
        let city = (params.get('city') || '').trim() || 'Jakarta';
        let lat = Number(params.get('lat')) || -6.2088;
        let lon = Number(params.get('lon')) || 106.8456;
        try {
          if (params.get('city')) {
            const gRes = await origFetch(
              `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=id&format=json`
            );
            if (gRes.ok) {
              const gData = await gRes.json();
              const first = gData?.results?.[0];
              if (first) {
                city = first.name || city;
                lat = first.latitude ?? lat;
                lon = first.longitude ?? lon;
              }
            }
          }
          const wRes = await origFetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code&daily=sunrise,sunset&timezone=auto&forecast_days=2`
          );
          if (wRes.ok) {
            const wData = await wRes.json();
            const currentTemp = Math.round(Number(wData?.current?.temperature_2m ?? 28));
            const weatherCode = Number(wData?.current?.weather_code ?? 2);
            const isDay = Number(wData?.current?.is_day ?? 1) === 1;
            const times: string[] = wData?.hourly?.time || [];
            const temps: number[] = wData?.hourly?.temperature_2m || [];
            const codes: number[] = wData?.hourly?.weather_code || [];
            const startIdx = Math.max(0, new Date().getHours());
            const hourly = Array.from({ length: 7 }, (_, i) => {
              const idx = startIdx + i;
              const tIso = times[idx] || '';
              return {
                time: tIso.includes('T') ? tIso.split('T')[1].slice(0, 5) : `${String((startIdx + i) % 24).padStart(2, '0')}:00`,
                temp: typeof temps[idx] === 'number' ? Math.round(temps[idx]) : currentTemp,
                code: typeof codes[idx] === 'number' ? codes[idx] : weatherCode,
              };
            });
            return jsonResponse({
              ok: true,
              city,
              lat,
              lon,
              currentTemp,
              weatherCode,
              isDay,
              sunrise: '5:49',
              sunset: '17:52',
              hourly,
            });
          }
        } catch {
          // fallback below
        }
        return jsonResponse({
          ok: true,
          city,
          lat,
          lon,
          currentTemp: 28,
          weatherCode: 2,
          isDay: true,
          sunrise: '5:49',
          sunset: '17:52',
          hourly: [],
        });
      }
      if (pathname === '/api/gemini/assistant') {
        const res = await askGeminiAssistant({
          prompt: bodyObj?.prompt || '',
          apiKey: bodyObj?.apiKey,
          image: bodyObj?.image,
          history: bodyObj?.history,
          currentState: bodyObj?.currentState,
        });
        let replyText = res.reply || 'Selesai.';
        let detectedAction = 'none';
        let detectedParam: string | undefined;
        const actionMatch = replyText.match(/\[ACTION:([a-z0-9_]+)(?:\|([^\]]*))?\]/i);
        if (actionMatch) {
          detectedAction = actionMatch[1].toLowerCase();
          detectedParam = actionMatch[2]?.trim() || undefined;
          replyText = replyText.replace(actionMatch[0], '').trim();
        }
        let trackData: any;
        if ((detectedAction === 'play_song' || detectedAction === 'queue_song') && detectedParam) {
          trackData = await resolveTauriSong(origFetch, detectedParam, false);
        }
        return jsonResponse({
          reply: replyText,
          activeStepHeadline: replyText.slice(0, 72),
          agentSteps: ['Understanding request', 'Executing action', 'Done'],
          action: detectedAction,
          actionParam: detectedParam,
          trackData,
          searchSources: res.searchSources?.map((s) => ({ title: s.title, uri: s.url })),
          source: 'gemini-3.1-flash-lite',
        });
      }

      return jsonResponse({ ok: true });
    };

    try {
      window.fetch = tauriFetch as typeof window.fetch;
    } catch {
      Object.defineProperty(window, 'fetch', {
        value: tauriFetch,
        writable: true,
        configurable: true,
      });
    }
  } else if (window.location.protocol === 'file:') {
    try {
      const customFetch = function (input: RequestInfo | URL, init?: RequestInit) {
        if (typeof input === 'string' && input.startsWith('/api/')) {
          const base = getApiBaseUrl();
          if (base) {
            return origFetch(`${base}${input}`, init);
          }
        }
        return origFetch(input, init);
      };
      window.fetch = customFetch;
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


