/**
 * Bynara Router OpenAI-Compatible AI Client (`muse-spark-1.3-contributor`) for WinIsle Dynamic Island.
 * Supports Chat History, Desktop Context, Multimodal Vision, and Action Intent Detection.
 */

import { isTauri, askBynaraAiNative } from './tauri-bridge';

export const DEFAULT_BYNARA_BASE_URL =
  (import.meta.env.VITE_AI_BASE_URL as string)?.trim() || 'https://router.bynara.id/v1';

export const DEFAULT_BYNARA_KEY =
  (import.meta.env.VITE_BYNARA_API_KEY as string)?.trim() ||
  'sk-nry-2f6-6P7a7WIv0g3go0dRtL4rpR4zaTFhIb3uEAeByRY';

export const DEFAULT_AGNES_BASE_URL =
  (import.meta.env.VITE_AGNES_BASE_URL as string)?.trim() || 'https://apihub.agnes-ai.com/v1';

export const DEFAULT_AGNES_KEY =
  (import.meta.env.VITE_AGNES_API_KEY as string)?.trim() ||
  'sk-MqH1SO7S1v9a34UPe4iWtE3r088xPK2h8KLCp738tsbmGucj';

export const DEFAULT_GEMINI_MODEL =
  (import.meta.env.VITE_GEMINI_MODEL as string)?.trim() || 'agnes-3.0-flash';

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

const SYSTEM_INSTRUCTION = `You are the live AI Companion & Windows PC Controller inside Isle (Windows Dynamic Island overlay).
Follow this natural Indonesian conversational companion style ("conversational-companion-id") in all replies:

1. GAYA BAHASA & PENULISAN (NATURAL & RAPI):
- Huruf Kapital Wajar: Gunakan huruf kapital dengan benar pada awal kalimat dan pada kata-kata yang memang memerlukan huruf kapital (nama orang, tempat, brand, judul lagu, aplikasi, atau istilah khusus). Jangan gunakan huruf kecil semua.
- Ringkas & Mengalir: Jawab dengan ringkas, padat, dan langsung ke inti (1 sampai 3 kalimat pendek untuk obrolan biasa). Jangan membuat paragraf bertele-tele atau poin-poin kaku jika tidak diminta.
- Tanpa Format Berlebihan: Hindari penggunaan tanda seru (!) yang berlebihan dan jangan membungkus seluruh jawaban dengan tanda kutip ("").

2. SAPAAN & KEPRIBADIAN TEMAN NGOBROL:
- Panggilan: Gunakan kata ganti "aku" dan "kamu" secara konsisten (jangan gunakan saya/Anda).
- Karakter: Teman ngobrol yang asik, hangat, cerdas, santai, dan nyambung dengan konteks pembicaraan.
- Anti-Kaku & Anti-Lebay:
  - DILARANG memaksakan partikel atau huruf panjang di akhir kalimat seperti "donggg", "iyaaa", "nihh", "tuhh", atau "hehehe" yang tidak nyambung dengan konteks kalimat.
  - Gunakan kosakata santai sehari-hari yang wajar (seperti "nggak", "udah", "lagi", "bikin", "gimana", "kenapa") secara natural tanpa dibuat-buat.
  - Jangan membuka dengan template robot "Halo! Ada yang bisa aku bantu?" dan jangan menutup dengan "Ada lagi yang bisa kubantu?".

3. KENDALI LAPTOP & DYNAMIC ISLAND ACTION TAG:
Whenever the user asks to perform an action on their PC or Dynamic Island, respond naturally in the style above AND append a single tag at the very end of your reply in the exact format: [ACTION:action_name|optional_param]
Valid action_name values:
- add_todo|task_title|HH:mm (e.g. [ACTION:add_todo|Olahraga Pagi|05:00] or [ACTION:add_todo|Tugas Besok|09:00])
- set_timer|minutes (e.g. [ACTION:set_timer|15])
- set_alarm_and_reminder|prompt_text
- open_weather|optional_city (e.g. [ACTION:open_weather|Bandung] or [ACTION:open_weather])
- seek_music|seconds
- toggle_mini_capsule
- play_song|song_title_and_artist
- queue_song|song_title_and_artist
- set_volume|0_to_100, set_brightness|0_to_10, play_music, pause_music, next_track, prev_track, toggle_lyrics, mute_volume, unmute_volume, start_pomodoro, pause_pomodoro, reset_pomodoro, open_tasks, open_shelf, clear_shelf, open_calendar, open_notifications, toggle_dnd, none`;

export function enforceCompanionStyle(rawReply: string): string {
  if (!rawReply) return '';
  let actionTag = '';
  const actionMatch = rawReply.match(/\[ACTION:[^\]]+\]/i);
  if (actionMatch) {
    actionTag = actionMatch[0];
  }
  let text = rawReply
    .replace(/\[ACTION:[^\]]+\]/gi, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Remove any weird forced trailing particles like "donggg, iyaaa" if model hallucinated them
  text = text.replace(/[,\s]*(?:dong{2,}|iya{2,}|nih{2,}|tuh{2,}|nggak{2,})(?:[,\s]+(?:dong{2,}|iya{2,}|nih{2,}|tuh{2,}))*[.!?]*$/gi, '').trim();

  // Ensure the first character is capitalized properly
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return actionTag ? `${text} ${actionTag}`.trim() : text;
}

function resolveEffectiveBynaraKey(rawKey?: string): string {
  const cleaned = (rawKey || '').trim();
  if (cleaned.startsWith('sk-nry-')) return cleaned;
  return DEFAULT_BYNARA_KEY;
}

export async function askGeminiAssistant(
  params: GeminiAssistantParams
): Promise<GeminiAssistantResult> {
  const promptText = params.prompt.trim();
  if (!promptText && !params.image) {
    return {
      reply: 'Ketik dulu apa yang mau kita obrolin atau kirim gambarnya ke aku ya.',
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
      if (!h.text || h.text.includes('maaf') || h.text.includes('gagal memproses')) continue;
      messages.push({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.text,
      });
    }
  }

  const effectiveUserPrompt =
    promptText || 'tolong jelasin kondisi layar atau desktop aku sekarang secara singkat dongg';

  messages.push({
    role: 'user',
    content: params.image
      ? [
          {
            type: 'text',
            text: `${effectiveUserPrompt}\n\n[Konteks Tangkapan Layar / Sistem Saat Ini: ${stateContext}]`,
          },
          {
            type: 'image_url',
            image_url: { url: `data:${params.image.mimeType};base64,${params.image.data}` },
          },
        ]
      : effectiveUserPrompt,
  });

  const requestedModel = params.model?.trim() || DEFAULT_GEMINI_MODEL;
  const isThinkingModel = requestedModel === 'muse-spark-1.3-contributor';

  // Build ordered routing targets: Fast -> Agnes AI first, Thinking -> Bynara Muse Spark first (with cross-provider fallback)
  const routeTargets: Array<{
    model: string;
    baseUrl: string;
    apiKey: string;
    maxTokens: number;
  }> = isThinkingModel
    ? [
        {
          model: 'muse-spark-1.3-contributor',
          baseUrl: DEFAULT_BYNARA_BASE_URL,
          apiKey: resolveEffectiveBynaraKey(params.apiKey),
          maxTokens: 3500, // High ceiling so internal thinking tokens never truncate visible content
        },
        {
          model: 'agnes-3.0-flash',
          baseUrl: DEFAULT_AGNES_BASE_URL,
          apiKey: DEFAULT_AGNES_KEY,
          maxTokens: 260,
        },
        {
          model: 'agnes-2.5-flash',
          baseUrl: DEFAULT_AGNES_BASE_URL,
          apiKey: DEFAULT_AGNES_KEY,
          maxTokens: 260,
        },
      ]
    : [
        {
          model: requestedModel === 'agnes-2.5-flash' ? 'agnes-2.5-flash' : 'agnes-3.0-flash',
          baseUrl: DEFAULT_AGNES_BASE_URL,
          apiKey: DEFAULT_AGNES_KEY,
          maxTokens: 260,
        },
        {
          model: requestedModel === 'agnes-2.5-flash' ? 'agnes-3.0-flash' : 'agnes-2.5-flash',
          baseUrl: DEFAULT_AGNES_BASE_URL,
          apiKey: DEFAULT_AGNES_KEY,
          maxTokens: 260,
        },
        {
          model: 'muse-spark-1.3-contributor',
          baseUrl: DEFAULT_BYNARA_BASE_URL,
          apiKey: resolveEffectiveBynaraKey(params.apiKey),
          maxTokens: 3500,
        },
      ];

  let lastError = '';

  for (const target of routeTargets) {
    if (params.signal?.aborted) {
      return {
        reply: 'Permintaan tadi udah dibatalin ya.',
        error: 'ABORTED',
      };
    }

    const payloadStr = JSON.stringify({
      model: target.model,
      messages,
      temperature: 0.7,
      max_tokens: target.maxTokens,
    });

    try {
      let data: any = null;

      if (isTauri()) {
        // Call via native Rust curl.exe command to bypass WebView2 CORS restrictions
        const rawJson = await askBynaraAiNative(target.baseUrl, target.apiKey, payloadStr);
        data = JSON.parse(rawJson);
      } else {
        const endpoint = `${target.baseUrl.replace(/\/+$/, '')}/chat/completions`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${target.apiKey}`,
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
      const rawContent = String(
        choice?.message?.content || choice?.message?.reasoning_content || ''
      ).trim();
      if (rawContent) {
        return {
          reply: enforceCompanionStyle(rawContent),
        };
      }
      lastError = 'Empty completion content';
    } catch (err: any) {
      if (params.signal?.aborted) {
        return {
          reply: 'Permintaan tadi udah dibatalin ya.',
          error: 'ABORTED',
        };
      }
      lastError = err?.message || String(err);
      continue;
    }
  }

  return {
    reply: `Koneksinya lagi agak sibuk, coba tanya lagi ke aku ya.`,
    error: lastError || 'TIMEOUT',
  };
}
