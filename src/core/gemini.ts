/**
 * Bynara Router OpenAI-Compatible AI Client (`muse-spark-1.3-contributor`) for WinIsle Dynamic Island.
 * Supports Chat History, Desktop Context, Multimodal Vision, and Action Intent Detection.
 */

import { isTauri, askBynaraAiNative } from './tauri-bridge';

export const DEFAULT_BYNARA_BASE_URL =
  (import.meta.env.VITE_AI_BASE_URL as string)?.trim() || 'https://router.bynara.id/v1';

export const DEFAULT_GEMINI_MODEL =
  (import.meta.env.VITE_GEMINI_MODEL as string)?.trim() || 'agnes-3.0-flash';

export const DEFAULT_BYNARA_KEY =
  (import.meta.env.VITE_BYNARA_API_KEY as string)?.trim() ||
  'sk-nry-2f6-6P7a7WIv0g3go0dRtL4rpR4zaTFhIb3uEAeByRY';

export const SUPPORTED_GEMINI_MODELS = [
  'agnes-3.0-flash',
  'agnes-2.5-flash',
  'muse-spark-1.3-contributor',
];

export interface GeminiAssistantParams {
  prompt: string;
  apiKey?: string;
  model?: string;
  image?: {
    data: string; // base64 without prefix
    mimeType: string;
  };
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  currentState?: Record<string, any>;
  signal?: AbortSignal;
}

export interface GeminiAssistantResult {
  reply: string;
  action?: string;
  actionParam?: any;
  trackData?: any;
  searchSources?: Array<{ title: string; url: string }>;
  error?: string;
}

const SYSTEM_INSTRUCTION = `You are the live AI Assistant & Windows PC Controller inside Isle (Windows Dynamic Island overlay).
Answer the user's question accurately, concisely, and conversationally in the same language they used (Indonesian or English).

FORMATTING RULES:
- Do NOT output raw markdown hashes like '###' or '##'. Use clean, short titles or paragraphs without hashes.
- Do NOT wrap your whole response in quotation marks ("").
- Avoid excessive asterisks (**) or raw markdown symbols. Speak naturally and elegantly so it looks clean inside the compact Dynamic Island.
- If giving steps or tips, use clean bullet points (- Item) with line breaks.

Whenever the user asks to perform an action, append a single tag at the very end of your reply in the exact format: [ACTION:action_name|optional_param]
Valid action_name values:
- add_todo|task_title|HH:mm (e.g. [ACTION:add_todo|Olahraga Pagi|05:00] or [ACTION:add_todo|Tugas Besok|09:00])
- set_timer|minutes (e.g. [ACTION:set_timer|15])
- set_alarm_and_reminder|prompt_text
- open_weather|optional_city (e.g. [ACTION:open_weather|Bandung] or [ACTION:open_weather])
- seek_music|seconds
- toggle_mini_capsule
- play_song|song_title_and_artist
- queue_song|song_title_and_artist
- set_volume|0_to_100, set_brightness|0_to_10, play_music, pause_music, next_track, prev_track, toggle_lyrics, mute_volume, unmute_volume, start_pomodoro, pause_pomodoro, reset_pomodoro, open_tasks, open_shelf, clear_shelf, open_calendar, open_notifications, toggle_dnd, none.`;

function resolveEffectiveBynaraKey(rawKey?: string): string {
  const cleaned = (rawKey || '').trim();
  if (cleaned.startsWith('sk-nry-')) return cleaned;
  return DEFAULT_BYNARA_KEY;
}

export async function askGeminiAssistant(
  params: GeminiAssistantParams
): Promise<GeminiAssistantResult> {
  const apiKey = resolveEffectiveBynaraKey(params.apiKey);
  const baseUrl = DEFAULT_BYNARA_BASE_URL;

  const promptText = params.prompt.trim();
  if (!promptText && !params.image) {
    return {
      reply: 'Silakan ketik pertanyaan atau lampirkan gambar/screenshot untuk dianalisis.',
      error: 'EMPTY_PROMPT',
    };
  }

  const cs = params.currentState || {};
  const stateContext = `Desktop State: activePage=${cs.activePage || 'music'}, nowPlaying=${
    cs.trackTitle || 'Idle'
  }, queueLength=${Number(cs.queueCount) || 0}, moodShuffle=${
    cs.moodShuffleEnabled ? 'ON' : 'OFF'
  }, volume=${Number(cs.volume) ?? 36}%, brightness=${
    Number(cs.brightness) ?? 7
  }/10, battery=${Number(cs.batteryLevel) ?? 82}%, pomodoro=${
    cs.pomoRemaining || '25:00'
  } (${cs.pomoRunning ? 'running' : 'paused'}), shelfFiles=${Number(cs.shelfCount) || 0}.`;

  const messages: Array<{ role: string; content: any }> = [
    {
      role: 'system',
      content: `${SYSTEM_INSTRUCTION}\n${stateContext}`,
    },
  ];

  if (Array.isArray(params.history)) {
    for (const h of params.history.slice(-6)) {
      if (!h.text || h.text.includes('Maaf, gagal memproses respon AI')) continue;
      messages.push({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.text,
      });
    }
  }

  const effectiveUserPrompt =
    promptText || 'Tolong analisis dan jelaskan kondisi layar/desktop saat ini secara ringkas.';

  messages.push({
    role: 'user',
    content: params.image
      ? `${effectiveUserPrompt}\n\n[Konteks Tangkapan Layar / Sistem Saat Ini: ${stateContext}]`
      : effectiveUserPrompt,
  });

  const candidateModels = [
    params.model?.trim() || DEFAULT_GEMINI_MODEL,
    'agnes-3.0-flash',
    'agnes-2.5-flash',
    'muse-spark-1.3-contributor',
  ];
  const models = Array.from(new Set(candidateModels.filter(Boolean)));
  let lastError = '';

  for (const model of models) {
    if (params.signal?.aborted) {
      return {
        reply: 'Permintaan dibatalkan.',
        error: 'ABORTED',
      };
    }

    const payloadStr = JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 800,
    });

    try {
      let data: any = null;

      if (isTauri()) {
        // Call via native Rust curl.exe command to bypass WebView2 CORS restrictions
        const rawJson = await askBynaraAiNative(baseUrl, apiKey, payloadStr);
        data = JSON.parse(rawJson);
      } else {
        const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          signal: params.signal,
          body: payloadStr,
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          lastError = errJson?.error?.message || `HTTP ${res.status}`;
          continue;
        }
        data = await res.json();
      }

      if (data?.error) {
        lastError =
          typeof data.error === 'string'
            ? data.error
            : data.error.message || JSON.stringify(data.error);
        continue;
      }

      const choice = data?.choices?.[0];
      const replyText = String(choice?.message?.content || '').trim();
      if (replyText) {
        return {
          reply: replyText,
        };
      }
      lastError = 'Empty completion content';
    } catch (err: any) {
      if (params.signal?.aborted) {
        return {
          reply: 'Permintaan dibatalkan.',
          error: 'ABORTED',
        };
      }
      lastError = err?.message || String(err);
      continue;
    }
  }

  return {
    reply: `Maaf, gagal memproses respon AI (${lastError || 'Koneksi sibuk'}). Silakan coba lagi.`,
    error: lastError || 'TIMEOUT',
  };
}
