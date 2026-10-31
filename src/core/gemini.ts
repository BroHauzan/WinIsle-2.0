/**
 * Direct Google Gemini API Client for WinIsle Dynamic Island.
 * Supports Multimodal Vision (screenshots/images), Chat History, and Action Intent Detection.
 */

/**
 * Configurable active Gemini model.
 * Defaults to `gemini-3.8-flash` (recommended by Google AI Studio for all new requests),
 * or can be configured via `VITE_GEMINI_MODEL` environment variable.
 */
export const DEFAULT_GEMINI_MODEL =
  (import.meta.env.VITE_GEMINI_MODEL as string)?.trim() || 'gemini-3.1-flash-lite';

export const SUPPORTED_GEMINI_MODELS = [
  DEFAULT_GEMINI_MODEL,
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
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

const DEFAULT_FALLBACK_KEY = 'AQ.Ab8RN6KdBVqg30x69prVlTWNqkpxqGYvT0ozWdATn5ni9d46ng';

const SYSTEM_INSTRUCTION = `You are the live Multimodal AI Assistant inside Isle (Windows Dynamic Island overlay).
Answer the user's question accurately and concisely (1-3 sentences) in the same language they used (Indonesian or English).
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

export async function askGeminiAssistant(
  params: GeminiAssistantParams
): Promise<GeminiAssistantResult> {
  const apiKey = (params.apiKey || DEFAULT_FALLBACK_KEY).trim();

  const promptText = params.prompt.trim();
  if (!promptText && !params.image) {
    return {
      reply: 'Silakan ketik pertanyaan atau lampirkan gambar/screenshot untuk dianalisis.',
      error: 'EMPTY_PROMPT',
    };
  }

  // Build Gemini contents array with history
  const contents: any[] = [];

  if (Array.isArray(params.history)) {
    for (const h of params.history.slice(-6)) {
      if (!h.text) continue;
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.text }],
      });
    }
  }

  // Current user turn
  const userParts: any[] = [];
  if (promptText) {
    userParts.push({ text: promptText });
  }

  if (params.image && params.image.data) {
    userParts.push({
      inlineData: {
        mimeType: params.image.mimeType || 'image/png',
        data: params.image.data,
      },
    });
  }

  contents.push({
    role: 'user',
    parts: userParts,
  });

  const activeModel = params.model?.trim() || DEFAULT_GEMINI_MODEL;
  const candidateModels = [
    activeModel,
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
  ];
  const models = Array.from(new Set(candidateModels));
  let lastError = '';

  for (const model of models) {
    if (params.signal?.aborted) {
      return {
        reply: 'Permintaan dibatalkan.',
        error: 'ABORTED',
      };
    }

    // Strict 5-second per-model timeout to eliminate any freezing or hanging
    const modelController = new AbortController();
    const timeoutId = setTimeout(() => {
      modelController.abort();
    }, 5000);

    const abortHandler = () => modelController.abort();
    if (params.signal) {
      params.signal.addEventListener('abort', abortHandler, { once: true });
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: modelController.signal,
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      });

      clearTimeout(timeoutId);
      if (params.signal) {
        params.signal.removeEventListener('abort', abortHandler);
      }

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        const errMsg = errorJson?.error?.message || `HTTP ${res.status}`;
        lastError = errMsg;

        // If rate limit reached, return immediately
        if (res.status === 429) {
          return {
            reply: 'Batas kuota Gemini API tercapai (Rate Limit). Mohon tunggu beberapa detik sebelum mencoba lagi.',
            error: 'RATE_LIMIT',
          };
        }

        // If API key is invalid
        if (res.status === 400 && errMsg.toLowerCase().includes('api key')) {
          return {
            reply: 'API Key Gemini Anda tidak valid. Silakan periksa kembali API Key yang Anda masukkan di menu Pengaturan.',
            error: 'INVALID_API_KEY',
          };
        }

        if (res.status === 403) {
          return {
            reply: `Akses Gemini API ditolak (${errMsg}). Pastikan API Key aktif dan memiliki izin yang sesuai di Google AI Studio.`,
            error: errMsg,
          };
        }

        // If model not found (404) or unsupported in this region/version, try next model
        continue;
      }

      const data = await res.json();
      clearTimeout(timeoutId);

      const candidate = data?.candidates?.[0];
      const replyText =
        candidate?.content?.parts?.map((p: any) => p.text || '').join('') ||
        'Tidak ada respon dari model.';

      // Extract search grounding sources if present
      const sources: Array<{ title: string; url: string }> = [];
      const metadata = candidate?.groundingMetadata;
      if (Array.isArray(metadata?.groundingChunks)) {
        for (const chunk of metadata.groundingChunks) {
          if (chunk?.web?.uri) {
            sources.push({
              title: chunk.web.title || chunk.web.uri,
              url: chunk.web.uri,
            });
          }
        }
      }

      return {
        reply: replyText.trim(),
        searchSources: sources.length > 0 ? sources : undefined,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (params.signal) {
        params.signal.removeEventListener('abort', abortHandler);
      }

      if (params.signal?.aborted) {
        return {
          reply: 'Permintaan dibatalkan.',
          error: 'ABORTED',
        };
      }

      lastError = err?.message || String(err);
      // Timeout or network drop for this specific model, attempt next candidate
      continue;
    }
  }

  return {
    reply: `Maaf, gagal memproses respon AI (${lastError || 'Batas waktu terlampaui'}). Silakan periksa API Key dan koneksi internet Anda.`,
    error: lastError || 'TIMEOUT',
  };
}
