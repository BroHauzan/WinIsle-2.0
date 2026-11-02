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
  fetchUrlText,
} from './core/tauri-bridge';
import { askGeminiAssistant } from './core/gemini';
import { parseMusicQuery } from './utils/musicQuery';

setupTauriBridgeGlobal();

const DEFAULT_POPULAR_TRACKS = [
  'Hindia Evaluasi',
  'Laufey From The Start',
  'Tulus Hati-Hati di Jalan',
  'Bernadya Satu Bulan',
  'Niki Every Summertime',
  'Juicy Luicy Lantas',
  'Pamungkas To The Bone',
  'Mahalini Sial',
];

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isBlockedNonMusicText(title: string, artist: string): boolean {
  const combined = `${title} ${artist}`.toLowerCase();
  const blocked = [
    'google ai studio',
    'ai studio',
    'aistudio',
    'winisle',
    'github',
    'whatsapp',
    'discord',
    'telegram',
    'bandicam',
    'obs studio',
    'localhost',
    '127.0.0.1',
    '.mp4',
    '.webm',
    '.mov',
    '.mkv',
    'new tab',
    'untitled',
    'google chrome',
    'microsoft edge',
    'chatgpt',
    'claude',
    'gemini',
    'facebook',
    'instagram',
    'twitter',
    'x.com',
    'tiktok',
  ];
  return blocked.some((kw) => combined.includes(kw));
}

function cleanExternalSongAndArtist(rawTitle: string, rawArtist: string): { title: string; artist: string } {
  let title = (rawTitle || '')
    .replace(/\s*(?:-|\|)\s*(?:YouTube Music|YouTube|Google Chrome|Microsoft Edge|Brave|Mozilla Firefox|Spotify).*$/i, '')
    .trim();
  let artist = (rawArtist || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/^(?:Google Chrome|Microsoft Edge|Brave|Firefox|Various Artists|Unknown Artist)$/i, '')
    .trim();

  if (!artist && title.includes(' - ')) {
    const parts = title.split(' - ');
    const left = parts[0]?.trim() || '';
    const right = parts.slice(1).join(' - ').trim();
    if (left && right) {
      artist = left;
      title = right;
    }
  }
  return { title, artist };
}

async function resolveFullLengthAudioStreamTauri(title: string, artist: string): Promise<string> {
  const searchQ = `${title} ${artist}`.trim();
  if (!searchQ) return '';
  try {
    const searchUrl = `https://music-api.gdstudio.xyz/api.php?types=search&source=netease&name=${encodeURIComponent(searchQ)}&count=5&pages=1`;
    const rawSearch = await fetchUrlText(searchUrl);
    const list = JSON.parse(rawSearch);
    if (Array.isArray(list) && list.length > 0) {
      const firstId = list[0]?.url_id || list[0]?.id;
      if (firstId) {
        const streamMetaUrl = `https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=${encodeURIComponent(String(firstId))}&br=320`;
        const rawStream = await fetchUrlText(streamMetaUrl);
        const streamData = JSON.parse(rawStream);
        if (typeof streamData?.url === 'string' && streamData.url.startsWith('http')) {
          return streamData.url.replace(/^http:\/\//i, 'https://');
        }
      }
    }
  } catch {
    // Fallback to iTunes AAC previewUrl if native curl or upstream fails
  }
  return '';
}

async function resolveTauriSong(
  origFetch: typeof window.fetch,
  query: string,
  useFlac = false
) {
  const parsed = parseMusicQuery(query);
  const rawQuery = parsed.searchQuery || query;
  const cleanQ = rawQuery
    .replace(/\s*(?:-|\|)\s*(?:YouTube Music|YouTube|Google Chrome|Microsoft Edge|Spotify).*$/i, '')
    .replace(/\s*-\s*Topic\b/gi, '')
    .trim();
  if (!cleanQ) return null;
  let title = cleanQ;
  let artist = '';
  let coverUrl = '';
  let previewUrl = '';
  let durationMs = 210000;

  try {
    const itRes = await origFetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQ)}&media=music&entity=song&limit=8`
    );
    if (itRes.ok) {
      const itData = await itRes.json();
      const results: any[] = Array.isArray(itData?.results) ? itData.results : [];
      const first = results.find((r) => typeof r?.previewUrl === 'string' && r.previewUrl.startsWith('http')) || results[0];
      if (first) {
        title = first.trackName || title;
        artist = first.artistName || artist;
        coverUrl = String(first.artworkUrl100 || '').replace('100x100bb', '600x600bb');
        if (typeof first.previewUrl === 'string' && first.previewUrl.startsWith('http')) {
          previewUrl = first.previewUrl;
        }
        if (typeof first.trackTimeMillis === 'number' && first.trackTimeMillis > 45000) {
          durationMs = first.trackTimeMillis;
        }
      }
    }
  } catch {
    // ignore
  }

  // Resolve full-length 320kbps MP3 stream if available, with guaranteed fallback to iTunes 256kbps AAC previewUrl
  const fullStreamUrl = await resolveFullLengthAudioStreamTauri(title, artist);
  const finalAudioUrl = fullStreamUrl || previewUrl;

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
    artist: artist || 'Various Artists',
    coverUrl,
    audioUrl: finalAudioUrl,
    previewUrl: previewUrl || finalAudioUrl,
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
        return jsonResponse({ hasKey: true, maskedKey: 'sk-nry••••ByRY', isPermanent: true });
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
        if (isBlockedNonMusicText(media.title, media.artist || '')) {
          return jsonResponse({ playing: false, shuffleActive: false });
        }
        if (media.duration_ms > 0 && media.duration_ms < 35000) {
          return jsonResponse({ playing: false, shuffleActive: false });
        }
        const cleaned = cleanExternalSongAndArtist(media.title, media.artist || '');
        if (!cleaned.title) {
          return jsonResponse({ playing: false, shuffleActive: false });
        }
        const isBrowserSource = /chrome|edge|brave|firefox|browser/i.test(media.source_app || '');
        if (isBrowserSource && !cleaned.artist) {
          return jsonResponse({ playing: false, shuffleActive: false });
        }

        const resolved = await resolveTauriSong(
          origFetch,
          `${cleaned.title} ${cleaned.artist}`.trim()
        );
        const finalTitle = cleaned.title || resolved?.title || media.title;
        const finalArtist = cleaned.artist || resolved?.artist || '';
        // Always prefer high-res official song album artwork (resolved.coverUrl) so browser logos are never shown
        const finalCover = resolved?.coverUrl || media.cover_url || '';

        return jsonResponse({
          playing: true,
          isPaused: !media.is_playing,
          shuffleActive: media.shuffle_active,
          sourceApp: isBrowserSource ? 'YouTube Music' : media.source_app || 'Music',
          positionMs: media.position_ms,
          track: {
            ...(resolved || {}),
            title: finalTitle,
            artist: finalArtist,
            coverUrl: finalCover,
            durationMs: media.duration_ms || resolved?.durationMs || 210000,
            sourceType: 'external',
            externalApp: isBrowserSource ? 'YouTube Music' : media.source_app || 'Music',
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
        const artist = (params.get('artist') || '').trim();
        const excludedRaw = (params.get('exclude') || '').toLowerCase();
        const candidates = artist
          ? [`${artist}`, ...DEFAULT_POPULAR_TRACKS]
          : DEFAULT_POPULAR_TRACKS;
        const picked =
          candidates.find((c) => !excludedRaw.includes(c.toLowerCase())) ||
          DEFAULT_POPULAR_TRACKS[Math.floor(Math.random() * DEFAULT_POPULAR_TRACKS.length)];
        const track = await resolveTauriSong(origFetch, picked, params.get('flac') === 'true');
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
        const requestedCity = (params.get('city') || '').trim();
        let city = requestedCity || 'Jakarta';
        let lat = Number(params.get('lat')) || -6.2088;
        let lon = Number(params.get('lon')) || 106.8456;
        try {
          if (requestedCity) {
            const gRes = await origFetch(
              `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(requestedCity)}&count=5&format=json`
            );
            if (gRes.ok) {
              const gData = await gRes.json();
              const results: any[] = Array.isArray(gData?.results) ? gData.results : [];
              if (results.length > 0) {
                const idMatch = results.find((r) => r.country_code?.toUpperCase() === 'ID');
                const best =
                  idMatch ||
                  [...results].sort((a, b) => (b.population || 0) - (a.population || 0))[0] ||
                  results[0];
                city = best.name || requestedCity;
                lat = typeof best.latitude === 'number' ? best.latitude : lat;
                lon = typeof best.longitude === 'number' ? best.longitude : lon;
              }
            }
          } else if (!params.get('lat')) {
            try {
              const ipRes = await origFetch('https://ipwho.is/');
              if (ipRes.ok) {
                const ipData = await ipRes.json();
                if (ipData?.success && typeof ipData.latitude === 'number' && typeof ipData.longitude === 'number') {
                  city = ipData.city || city;
                  lat = ipData.latitude;
                  lon = ipData.longitude;
                }
              }
            } catch {
              // ignore IP geo error
            }
          }
          const wRes = await origFetch(
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

            const currentIso = String(wData?.current?.time || '');
            let startIdx = times.findIndex((t) => currentIso && t.slice(0, 13) === currentIso.slice(0, 13));
            if (startIdx < 0) {
              const fallbackHourStr = String(new Date().getHours()).padStart(2, '0') + ':00';
              startIdx = times.findIndex((t) => t.endsWith(`T${fallbackHourStr}`));
              if (startIdx < 0) startIdx = 0;
            }

            const hourly = Array.from({ length: 7 }, (_, i) => {
              const idx = startIdx + i;
              const tIso = times[idx] || '';
              return {
                time: tIso.includes('T') ? tIso.split('T')[1].slice(0, 5) : `${String((startIdx + i) % 24).padStart(2, '0')}:00`,
                temp: typeof temps[idx] === 'number' ? Math.round(temps[idx]) : currentTemp,
                code: typeof codes[idx] === 'number' ? codes[idx] : weatherCode,
                precipitationProb: typeof precipProbs[idx] === 'number' ? Math.round(precipProbs[idx]) : 0,
              };
            });

            return jsonResponse({
              ok: true,
              city,
              lat,
              lon,
              currentTemp,
              apparentTemp,
              humidity,
              windSpeed,
              weatherCode,
              isDay,
              tempMax,
              tempMin,
              precipitationProb,
              sunrise,
              sunset,
              timezone: wData?.timezone || 'Asia/Jakarta',
              utcOffsetSeconds:
                typeof wData?.utc_offset_seconds === 'number'
                  ? wData.utc_offset_seconds
                  : undefined,
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
          apparentTemp: 31,
          humidity: 70,
          windSpeed: 10,
          weatherCode: 2,
          isDay: true,
          tempMax: 32,
          tempMin: 24,
          precipitationProb: 20,
          sunrise: '5:49',
          sunset: '17:52',
          timezone: 'Asia/Jakarta',
          hourly: [],
        });
      }
      if (pathname === '/api/gemini/assistant') {
        const rawPrompt = String(bodyObj?.prompt || '').trim();
        const res = await askGeminiAssistant({
          prompt: rawPrompt,
          apiKey: bodyObj?.apiKey,
          model: bodyObj?.model,
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
        // Fallback local intent detection for Indonesian/English music prompts ("puter musik", "puter lagu ...", etc.)
        if (detectedAction === 'none' && rawPrompt) {
          const songRegexMatch =
            rawPrompt.match(
              /\b(?:putar lagu|puter lagu|putarkan lagu|puterin lagu|stel lagu|setel musik|setel lagu|setelin lagu|mainkan lagu|mainin lagu|dengerin lagu|play song|play music|putar musik|puter musik|putarkan musik|puterin musik)\s+(.+)/i
            ) ||
            rawPrompt.match(
              /\b(?:putar|puter|putarkan|puterin|setel|setelin|stel|mainkan|mainin|play)\s+(?:lagunya|lagu|musik|musiknya|track|song)\s+(.+)/i
            );
          if (songRegexMatch && songRegexMatch[1]) {
            const parsedMusic = parseMusicQuery(songRegexMatch[1].trim());
            detectedAction = 'play_song';
            detectedParam = parsedMusic.searchQuery || songRegexMatch[1].trim();
          } else if (
            /\b(puter musik|putar musik|puter lagu|putar lagu|setel musik|setel lagu|mainkan musik|mainkan lagu|nyalain musik|nyalakan musik|play music|play song)\b/i.test(
              rawPrompt
            )
          ) {
            detectedAction = 'play_music';
          }
        }
        // If generic "play_music" is requested while no song is loaded, pick a popular song so real audio plays immediately
        const currentTrackTitle = String(bodyObj?.currentState?.trackTitle || 'Idle').trim();
        if (
          detectedAction === 'play_music' &&
          (!currentTrackTitle || currentTrackTitle === 'Idle' || currentTrackTitle === 'Media')
        ) {
          detectedAction = 'play_song';
          detectedParam =
            detectedParam ||
            DEFAULT_POPULAR_TRACKS[Math.floor(Math.random() * DEFAULT_POPULAR_TRACKS.length)];
        }
        let trackData: any;
        if ((detectedAction === 'play_song' || detectedAction === 'queue_song') && detectedParam) {
          trackData = await resolveTauriSong(
            origFetch,
            detectedParam,
            Boolean(bodyObj?.currentState?.flacEnabled)
          );
        }
        return jsonResponse({
          reply: replyText,
          activeStepHeadline: replyText.slice(0, 72),
          agentSteps: ['Understanding request', 'Executing action', 'Done'],
          action: detectedAction,
          actionParam: detectedParam,
          trackData,
          searchSources: res.searchSources?.map((s) => ({ title: s.title, uri: s.url })),
          source: bodyObj?.model || 'stepfun-3.7-flash',
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


