// Ported from crates/isle-core/src/lrc.rs + Dominant Cover Hue Extraction

export interface LyricWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface LyricLine {
  timeMs: number;
  text: string;
  words?: LyricWord[];
}

function parseTimestamp(tag: string): number | null {
  const colonIdx = tag.indexOf(':');
  if (colonIdx === -1) return null;
  const minStr = tag.slice(0, colonIdx);
  const secStr = tag.slice(colonIdx + 1);
  if (!/^\d+$/.test(minStr)) return null;
  const minutes = parseInt(minStr, 10);
  if (minutes < 0 || minutes > 9999) return null;

  let wholeStr = secStr;
  let fracStr = '';
  const dotIdx = secStr.search(/[.:]/);
  if (dotIdx !== -1) {
    wholeStr = secStr.slice(0, dotIdx);
    fracStr = secStr.slice(dotIdx + 1);
  }
  if (!/^\d+$/.test(wholeStr)) return null;
  const whole = parseInt(wholeStr, 10);
  if (whole < 0 || whole >= 60) return null;
  if (fracStr.length > 0 && !/^\d+$/.test(fracStr)) return null;

  let fractionMs = 0;
  if (fracStr.length === 1) fractionMs = parseInt(fracStr, 10) * 100;
  else if (fracStr.length === 2) fractionMs = parseInt(fracStr, 10) * 10;
  else if (fracStr.length >= 3) fractionMs = parseInt(fracStr.slice(0, 3), 10);

  return minutes * 60_000 + whole * 1000 + fractionMs;
}

export function parseLrc(source: string, wordsByLine?: any[]): LyricLine[] {
  // If native word timestamps are already provided by BetterLyrics / SimpMusic / LyricsPlus
  if (Array.isArray(wordsByLine) && wordsByLine.length > 0) {
    let maxRawTime = 0;
    for (const item of wordsByLine) {
      const t = Number(item?.timeMs ?? item?.startTimeMs ?? item?.time ?? 0);
      if (Number.isFinite(t) && t > maxRawTime) maxRawTime = t;
    }
    const mult = maxRawTime > 0 && maxRawTime < 900 ? 1000 : 1;

    const lines: LyricLine[] = [];
    for (const item of wordsByLine) {
      const text = String(item?.text || '').trim();
      const rawLineTime = Number(item?.timeMs ?? item?.startTimeMs ?? item?.time ?? 0);
      const timeMs = Number.isFinite(rawLineTime) ? Math.max(0, Math.round(rawLineTime * mult)) : 0;
      let words: LyricWord[] | undefined = undefined;
      if (Array.isArray(item?.words) && item.words.length > 0) {
        words = item.words.map((w: any) => {
          const rawStart = Number(w?.startMs ?? w?.startTimeMs ?? w?.time ?? timeMs);
          const startMs = Number.isFinite(rawStart)
            ? Math.max(0, Math.round(rawStart * mult))
            : timeMs;
          const rawEnd = Number(w?.endMs ?? w?.endTimeMs ?? startMs + 400);
          const endMs = Number.isFinite(rawEnd)
            ? Math.max(startMs + 80, Math.round(rawEnd * mult))
            : startMs + 400;
          return {
            word: String(w?.word ?? w?.text ?? ''),
            startMs,
            endMs,
          };
        });
      }
      if (text) {
        lines.push({ timeMs, text, words });
      }
    }
    // Only return wordsByLine if it actually has valid increasing timestamps (not all 0)
    const hasValidTiming = lines.length <= 1 || lines.some((l) => l.timeMs > 0);
    if (lines.length > 0 && hasValidTiming) {
      lines.sort((a, b) => a.timeMs - b.timeMs);
      return lines;
    }
  }

  let offsetMs = 0;
  const lines: LyricLine[] = [];

  for (const raw of source.split('\n')) {
    let rest = raw.trim();
    const times: number[] = [];

    while (rest.startsWith('[')) {
      const endIdx = rest.indexOf(']');
      if (endIdx === -1) break;
      const tag = rest.slice(1, endIdx);
      const time = parseTimestamp(tag);
      if (time !== null) {
        times.push(time);
      } else if (tag.startsWith('offset:')) {
        const parsedOffset = parseInt(tag.slice(7).trim(), 10);
        if (!Number.isNaN(parsedOffset)) offsetMs = parsedOffset;
      }
      rest = rest.slice(endIdx + 1).trimStart();
    }

    // Check for inline syllable tags e.g. <00:12.34> word
    let text = rest.trim();
    let words: LyricWord[] | undefined = undefined;
    if (text.includes('<') && text.includes('>')) {
      const sylRegex = /<(\d+:\d+(?:[.:]\d+)?)>\s*([^<]+)/g;
      let m: RegExpExecArray | null;
      const parsedSyllables: LyricWord[] = [];
      while ((m = sylRegex.exec(text)) !== null) {
        const tMs = parseTimestamp(m[1]);
        const wStr = m[2].trim();
        if (tMs !== null && wStr) {
          parsedSyllables.push({
            word: wStr,
            startMs: Math.max(0, tMs - offsetMs),
            endMs: Math.max(0, tMs - offsetMs + 400),
          });
        }
      }
      if (parsedSyllables.length > 0) {
        words = parsedSyllables;
        text = parsedSyllables.map((s) => s.word).join(' ');
      }
    }

    for (const t of times) {
      if (text) {
        lines.push({
          timeMs: Math.max(0, t - offsetMs),
          text,
          words,
        });
      }
    }
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [
    Number.isFinite(r) ? r : 0.25,
    Number.isFinite(g) ? g : 0.5,
    Number.isFinite(b) ? b : 0.95,
  ];
}

// Extracts the most vibrant dominant color from a cover's color palette (by saturation * luminance weight)
export function extractDominantCoverRgb(coverColors: [string, string, string]): [number, number, number] {
  let bestRgb: [number, number, number] = [0.22, 0.48, 0.95];
  let bestScore = -1;

  for (const hex of coverColors) {
    const [r, g, b] = hexToRgb01(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const s = max === min ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
    // Favor saturated, mid-to-bright hues so the wash is vivid and never muddy grey
    const score = s * 1.6 + (1 - Math.abs(l - 0.52));
    if (score > bestScore) {
      bestScore = score;
      bestRgb = [r, g, b];
    }
  }

  return bestRgb;
}

export interface TrackItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  app: 'Spotify' | 'YouTube Music' | 'Rhythmbox';
  durationMs: number;
  coverGradient: [string, string, string];
  tintRgb: [number, number, number];
  lrc: string;
}

export const SAMPLE_TRACKS: TrackItem[] = [
  {
    id: 'isle-theme-zerebro',
    title: 'Isle: a Dynamic Island for Windows',
    artist: 'zerebro',
    album: 'Desktop Sessions',
    app: 'Spotify',
    durationMs: 137_000,
    coverGradient: ['#1e3a8a', '#2563eb', '#60a5fa'],
    tintRgb: extractDominantCoverRgb(['#1e3a8a', '#2563eb', '#60a5fa']),
    lrc: `[00:00.00]Even in the background, everything stays close
[00:04.00]Resting in the top bar while your windows breathe
[00:08.50]Press Alt and Q whenever you need a hand
[00:13.00]Springing open smoothly with zero frame drops
[00:18.00]Synced lyrics glowing with the album's hue
[00:24.00]Focus timer ticking while your code compiles
[00:30.00]Everything you need in one liquid island`,
  },
  {
    id: 'midnight-city-lights',
    title: 'Midnight Analog',
    artist: 'Kiasmos & Olafur',
    album: 'Blurred Horizons',
    app: 'Spotify',
    durationMs: 48_000,
    coverGradient: ['#4c1d95', '#c026d3', '#f43f5e'],
    tintRgb: extractDominantCoverRgb(['#4c1d95', '#c026d3', '#f43f5e']),
    lrc: `[00:00.00]Walking through the glass top bezel
[00:03.00]Every pixel settles on the frame clock
[00:07.50]Wait for the spring to catch the light
[00:12.00]Soft shadows under neon rain
[00:19.50]Nothing polls while the city sleeps
[00:24.00]Sing along in synced time
[00:33.00]Waking only when the next line starts
[00:40.00]Fading into quiet midnight`,
  },
  {
    id: 'northern-auroras',
    title: 'Subpixel Drift',
    artist: 'Tycho & Nils Frahm',
    album: 'Wayland Sessions',
    app: 'Spotify',
    durationMs: 45_000,
    coverGradient: ['#065f46', '#10b981', '#06b6d4'],
    tintRgb: extractDominantCoverRgb(['#065f46', '#10b981', '#06b6d4']),
    lrc: `[00:00.00]Drifting past the concave shoulder
[00:05.00]Sixty hertz without a dropped frame
[00:10.00]Light rises from the bottom edge
[00:18.50]Across the workspace in a single swipe
[00:23.50]Hold the pointer still to peek inside
[00:29.00]Warm synth waves over dark obsidian
[00:35.00]Settled by five hundred milliseconds`,
  },
  {
    id: 'velvet-espresso',
    title: 'Jakarta After Hours',
    artist: 'Sore & White Shoes',
    album: 'Menteng Archives',
    app: 'YouTube Music',
    durationMs: 42_000,
    coverGradient: ['#7c2d12', '#ea580c', '#f59e0b'],
    tintRgb: extractDominantCoverRgb(['#7c2d12', '#ea580c', '#f59e0b']),
    lrc: `[00:00.00]Lampu jalan mulai redup di sudut kota
[00:05.50]Nada pelan menemani malam panjang
[00:11.00]Buka pulau kecil di atas layar
[00:16.50]Semua rapi tanpa gangguan
[00:25.50]Kopi hangat dan daftar pengingat
[00:31.00]Satu ketukan untuk mulai fokus
[00:36.50]Sampai pagi menyapa kembali`,
  },
];
