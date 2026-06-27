/**
 * ElevenLabs voice provider — TTS, voice cloning, multi-character voices.
 *
 * API:
 *  - TTS:           POST `/v1/text-to-speech/{voice_id}` → audio bytes
 *  - STT:           POST `/v1/speech-to-text` (multipart) — added when needed
 *
 * The route's `resolvedModelId` carries either a model id (`eleven_turbo_v2_5`)
 * or `voice:<voice_id>` to override the voice. Default voice is Rachel.
 *
 * Voice subsystem (Bundle 3) consumes this provider for AI voice bots and
 * for the AiCharacter voice profile (B2-3.13).
 */

import {
  ProviderClient,
  GenerateTextRequest,
  GenerateTextResult,
  GenerateAudioRequest,
  GenerateAudioResult,
  TranscribeAudioRequest,
  TranscribeAudioResult,
} from './types';

const ELEVENLABS_BASE = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io';
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel
const DEFAULT_MODEL = 'eleven_turbo_v2_5';

export const elevenlabsProvider: ProviderClient = {
  id: 'elevenlabs',
  sdk: 'native',
  capabilities: {
    text: false,
    image: false,
    video: false,
    audio: true,
    transcription: true,
    streaming: false,
    toolCalling: false,
    vision: false,
    promptCaching: false,
  },

  async generateText(_req: GenerateTextRequest): Promise<GenerateTextResult> {
    throw new Error('ElevenLabs provider exposes audio generation only.');
  },
  async streamText(_req: GenerateTextRequest): Promise<AsyncGenerator<string>> {
    throw new Error('ElevenLabs provider exposes audio generation only.');
  },

  async generateAudio(req: GenerateAudioRequest): Promise<GenerateAudioResult> {
    const { route, text, voice } = req;
    const voiceId = voice ?? extractVoiceId(route.resolvedModelId) ?? DEFAULT_VOICE;
    const modelId = extractModelId(route.resolvedModelId) ?? DEFAULT_MODEL;

    const response = await fetch(`${ELEVENLABS_BASE}/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': route.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: (req.speed && req.speed !== 1) ? 0.4 : 0.5,
          similarity_boost: 0.75,
        },
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs TTS error (${response.status}): ${errText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      audioUrl: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
      mimeType: 'audio/mpeg',
    };
  },

  async transcribeAudio(req: TranscribeAudioRequest): Promise<TranscribeAudioResult> {
    const { route, audio, mimeType, language } = req;
    const blob = await audioToBlob(audio, mimeType);
    const form = new FormData();
    form.append('file', blob, 'audio.wav');
    form.append('model_id', 'scribe_v1');
    if (language) form.append('language_code', language);

    const response = await fetch(`${ELEVENLABS_BASE}/v1/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': route.apiKey },
      body: form,
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs STT error (${response.status}): ${errText}`);
    }
    const json = await response.json() as { text?: string; language_code?: string };
    return {
      text: json.text ?? '',
      language: json.language_code,
    };
  },
};

function extractVoiceId(resolvedModelId: string): string | undefined {
  const match = resolvedModelId.match(/voice:([^:/]+)/i);
  return match ? match[1] : undefined;
}

function extractModelId(resolvedModelId: string): string | undefined {
  if (resolvedModelId.startsWith('eleven_')) return resolvedModelId;
  const match = resolvedModelId.match(/model:([^:/]+)/i);
  return match ? match[1] : undefined;
}

async function audioToBlob(audio: string | Buffer | Uint8Array, mimeType?: string): Promise<Blob> {
  let bytes: Uint8Array;
  let detectedMime = mimeType ?? 'audio/wav';
  if (typeof audio === 'string') {
    if (audio.startsWith('data:')) {
      const match = audio.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error('Invalid audio data URL');
      detectedMime = match[1];
      bytes = Buffer.from(match[2], 'base64');
    } else {
      const res = await fetch(audio);
      if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
      detectedMime = res.headers.get('content-type') ?? detectedMime;
    }
  } else {
    bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
  }
  return new Blob([bytes as BlobPart], { type: detectedMime });
}
