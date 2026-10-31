// Ported from crates/isle-core/src/calendar.rs

export interface CalendarEvent {
  id: number;
  title: string;
  date: string; // YYYY-MM-DD
  start?: string; // HH:MM
  end?: string; // HH:MM
  source: 'isle' | 'desktop';
  meetingUrl?: string;
  meetingProvider?: 'Google Meet' | 'Zoom' | 'Teams';
}

export interface ParsedEventInput {
  title: string;
  start?: string;
  end?: string;
}

const BEFORE_TIME = new Set(['at', '@', 'from', 'jam', 'pukul', 'pkl', 'dari', 'mulai']);
const RANGE_WORDS = new Set(['-', '–', '—', 'to', 'until', 'till', 'sampai', 'hingga', 's/d']);

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function parseClock(text: string, bareOk: boolean): number | null {
  let digits = text;
  let meridiem: 'am' | 'pm' | null = null;
  if (text.endsWith('am')) {
    digits = text.slice(0, -2);
    meridiem = 'am';
  } else if (text.endsWith('pm')) {
    digits = text.slice(0, -2);
    meridiem = 'pm';
  }

  let hourStr = digits;
  let minStr: string | null = null;
  const sepIdx = digits.search(/[.:]/);
  if (sepIdx !== -1) {
    hourStr = digits.slice(0, sepIdx);
    minStr = digits.slice(sepIdx + 1);
    if (minStr.length !== 2 || !/^\d{2}$/.test(minStr)) return null;
  }

  if (hourStr.length === 0 || hourStr.length > 2 || !/^\d+$/.test(hourStr)) return null;
  if (minStr === null && meridiem === null && !bareOk) return null;

  const minute = minStr ? parseInt(minStr, 10) : 0;
  let hour = parseInt(hourStr, 10);

  if (meridiem !== null) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }

  if (minute >= 60) return null;
  return hour * 60 + minute;
}

function timeAt(words: string[], i: number, bareOk: boolean): { start: number; end?: number; wordsUsed: number } | null {
  const rawWord = words[i];
  if (!rawWord) return null;
  const word = rawWord.toLowerCase().replace(/[,;]+$/, '');
  const nextWord = words[i + 1]?.toLowerCase();
  const suffix = nextWord === 'am' || nextWord === 'pm' ? nextWord : null;
  const text = suffix ? `${word}${suffix}` : word;
  const wordsUsed = suffix ? 2 : 1;

  const rangeMatch = text.match(/^([^-–—]+)[-–—]([^-–—]+)$/);
  if (rangeMatch) {
    const first = rangeMatch[1];
    const second = rangeMatch[2];
    const isPrecise = (p: string) => p.includes(':') || p.includes('.') || p.endsWith('m');
    if (!first || !second || (!isPrecise(first) && !isPrecise(second))) return null;

    const end = parseClock(second, true);
    if (end === null) return null;

    const endMeridiem = second.endsWith('am') ? 'am' : second.endsWith('pm') ? 'pm' : null;
    let start: number | null = null;
    if (endMeridiem && !first.endsWith('m')) {
      const candidate = parseClock(`${first}${endMeridiem}`, true);
      if (candidate !== null && candidate < end) {
        start = candidate;
      } else {
        start = parseClock(first, true);
      }
    } else {
      start = parseClock(first, true);
    }
    if (start === null) return null;
    return { start, end: end > start ? end : undefined, wordsUsed };
  }

  const single = parseClock(text, bareOk);
  if (single === null) return null;
  return { start: single, wordsUsed };
}

/**
 * Parses one-line natural event strings like:
 * - "Dinner 8:00 pm" -> { title: "Dinner", start: "20:00" }
 * - "Standup 9:00-9:15" -> { title: "Standup", start: "09:00", end: "09:15" }
 * - "Gym at 7pm" -> { title: "Gym", start: "19:00" }
 * - "Rapat jam 14.00 sampai 15.30" -> { title: "Rapat", start: "14:00", end: "15:30" }
 */
export function parseEventLine(text: string): ParsedEventInput | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  let startMin: number | undefined;
  let endMin: number | undefined;
  const used = new Array(words.length).fill(false);

  for (let i = 0; i < words.length; i++) {
    const prevWord = i > 0 ? words[i - 1].toLowerCase() : '';
    const afterWord = i > 0 && BEFORE_TIME.has(prevWord);
    const found = timeAt(words, i, afterWord);
    if (!found) continue;

    let last = found.end;
    let next = i + found.wordsUsed;

    if (last === undefined && next < words.length && RANGE_WORDS.has(words[next].toLowerCase())) {
      const second = timeAt(words, next + 1, true);
      if (second && second.end === undefined) {
        last = second.start;
        next += 1 + second.wordsUsed;
      }
    }

    startMin = found.start;
    endMin = last !== undefined && last > found.start ? last : undefined;
    const from = afterWord ? i - 1 : i;
    for (let k = from; k < next; k++) used[k] = true;
    break;
  }

  const title = words
    .filter((_, idx) => !used[idx])
    .join(' ')
    .replace(/^[-,\s]+|[-,\s]+$/g, '');

  if (!title) return null;

  return {
    title: title.slice(0, 200),
    start: startMin !== undefined ? formatMinutes(startMin) : undefined,
    end: endMin !== undefined ? formatMinutes(endMin) : undefined,
  };
}
