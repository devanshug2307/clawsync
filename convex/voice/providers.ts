'use node';

import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';

/**
 * Voice Provider Abstraction
 *
 * Supports multiple voice providers:
 * - ElevenLabs: Industry-leading voice synthesis
 * - NVIDIA Personaplex: NVIDIA's voice AI platform
 *
 * Each provider has its own implementation but shares a common interface.
 * 
 * IMPORTANT: Only actions are in this file (requires Node.js).
 * Queries and mutations are in ./queries.ts
 */

export interface VoiceConfig {
  providerId: string;
  voiceId: string;
  apiKey: string;
  options?: Record<string, unknown>;
}

export interface TextToSpeechResult {
  audio: ArrayBuffer;
  format: 'mp3' | 'wav' | 'ogg';
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface SpeechToTextResult {
  text: string;
  confidence: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

// Text-to-speech using configured provider
export const textToSpeech = internalAction({
  args: {
    text: v.string(),
    providerId: v.optional(v.string()),
    voiceId: v.optional(v.string()),
    options: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Get provider config
    const provider = args.providerId
      ? await ctx.runQuery(internal.voice.queries.getProvider, {
        providerId: args.providerId,
      })
      : await ctx.runQuery(internal.voice.queries.getDefaultProvider);

    if (!provider || !provider.enabled) {
      throw new Error('No voice provider available');
    }

    // Get API key from environment
    const apiKey = process.env[provider.apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(`Missing API key: ${provider.apiKeyEnvVar}`);
    }

    const config = provider.config ? JSON.parse(provider.config) : {};
    const voiceId = args.voiceId ?? config.defaultVoiceId;

    switch (provider.providerId) {
      case 'elevenlabs':
        return await elevenLabsTTS({
          text: args.text,
          voiceId,
          apiKey,
          options: { ...config, ...args.options },
        });

      case 'personaplex':
        return await personaplexTTS({
          text: args.text,
          voiceId,
          apiKey,
          options: { ...config, ...args.options },
        });

      default:
        throw new Error(`Unknown provider: ${provider.providerId}`);
    }
  },
});

// Speech-to-text using configured provider
export const speechToText = internalAction({
  args: {
    audioUrl: v.string(),
    providerId: v.optional(v.string()),
    options: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const provider = args.providerId
      ? await ctx.runQuery(internal.voice.queries.getProvider, {
        providerId: args.providerId,
      })
      : await ctx.runQuery(internal.voice.queries.getDefaultProvider);

    if (!provider || !provider.enabled || !provider.supportsSTT) {
      throw new Error('No STT provider available');
    }

    const apiKey = process.env[provider.apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(`Missing API key: ${provider.apiKeyEnvVar}`);
    }

    const config = provider.config ? JSON.parse(provider.config) : {};

    switch (provider.providerId) {
      case 'elevenlabs':
        // ElevenLabs doesn't have native STT, could use Whisper or similar
        throw new Error('ElevenLabs STT not implemented - use alternative provider');

      case 'personaplex':
        return await personaplexSTT({
          audioUrl: args.audioUrl,
          apiKey,
          options: { ...config, ...args.options },
        });

      default:
        throw new Error(`Unknown provider: ${provider.providerId}`);
    }
  },
});

// ============================================
// Provider Implementations
// ============================================

/**
 * ElevenLabs TTS Implementation
 */
async function elevenLabsTTS(config: {
  text: string;
  voiceId: string;
  apiKey: string;
  options?: Record<string, unknown>;
}): Promise<TextToSpeechResult> {
  const { text, voiceId, apiKey, options = {} } = config;

  const modelId = (options.modelId as string) ?? 'eleven_multilingual_v2';
  const stability = (options.stability as number) ?? 0.5;
  const similarityBoost = (options.similarityBoost as number) ?? 0.75;
  const style = (options.style as number) ?? 0;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
          style,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  const audio = await response.arrayBuffer();

  // Estimate duration based on text length (rough approximation)
  // Average speaking rate: ~150 words per minute
  const wordCount = text.split(/\s+/).length;
  const estimatedDurationMs = (wordCount / 150) * 60 * 1000;

  return {
    audio,
    format: 'mp3',
    durationMs: estimatedDurationMs,
    metadata: {
      provider: 'elevenlabs',
      voiceId,
      modelId,
    },
  };
}

/**
 * NVIDIA Personaplex TTS Implementation
 */
async function personaplexTTS(config: {
  text: string;
  voiceId: string;
  apiKey: string;
  options?: Record<string, unknown>;
}): Promise<TextToSpeechResult> {
  const { text, voiceId, apiKey, options = {} } = config;

  const baseUrl = (options.baseUrl as string) ?? 'https://api.nvidia.com/personaplex/v1';
  const sampleRate = (options.sampleRate as number) ?? 22050;
  const format = (options.format as string) ?? 'mp3';

  const response = await fetch(`${baseUrl}/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      sample_rate: sampleRate,
      output_format: format,
      ...(options.emotion && { emotion: options.emotion }),
      ...(options.speed && { speed: options.speed }),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Personaplex API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const audioBase64 = data.audio;
  const audio = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0)).buffer;

  return {
    audio,
    format: format as 'mp3' | 'wav' | 'ogg',
    durationMs: data.duration_ms ?? 0,
    metadata: {
      provider: 'personaplex',
      voiceId,
      sampleRate,
    },
  };
}

/**
 * NVIDIA Personaplex STT Implementation
 */
async function personaplexSTT(config: {
  audioUrl: string;
  apiKey: string;
  options?: Record<string, unknown>;
}): Promise<SpeechToTextResult> {
  const { audioUrl, apiKey, options = {} } = config;

  const baseUrl = (options.baseUrl as string) ?? 'https://api.nvidia.com/personaplex/v1';
  const language = (options.language as string) ?? 'en';

  // Fetch audio data
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
  }

  const audioData = await audioResponse.arrayBuffer();
  const audioBase64 = btoa(
    String.fromCharCode(...new Uint8Array(audioData))
  );

  const response = await fetch(`${baseUrl}/stt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      audio: audioBase64,
      language,
      ...(options.punctuate !== undefined && { punctuate: options.punctuate }),
      ...(options.timestamps !== undefined && { timestamps: options.timestamps }),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Personaplex STT error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return {
    text: data.text,
    confidence: data.confidence ?? 1.0,
    words: data.words,
  };
}
