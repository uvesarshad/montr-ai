/**
 * Model Definitions and Catalogue
 * 
 * This file contains the curated list of AI models from AI-SDK.dev providers.
 * Models are categorized by type (text, image, video) and tier (free, pro, enterprise).
 * 
 * Credit costs are mapped to approximate real-world API costs.
 */

export type ModelType = 'text' | 'image' | 'video' | 'avatar' | 'audio';
export type ModelTier = 'free' | 'pro' | 'enterprise';

export interface ModelDefinition {
  /** Unique model identifier (e.g., 'gpt-4o', 'claude-sonnet-4-5') */
  id: string;
  /** Display name for UI (e.g., 'GPT-4o', 'Claude Sonnet 4.5') */
  name: string;
  /** Provider identifier (e.g., 'openai', 'anthropic', 'google') */
  provider: string;
  /** Model type */
  type: ModelType;
  /** Access tier - determines plan-based availability */
  tier: ModelTier;
  /** Credits consumed per request */
  creditCost: number;
  /** Can use direct API key via Genkit */
  supportsDirectApi: boolean;
  /** Available via AI SDK providers */
  supportsAiSdk: boolean;
  /** Model capabilities for filtering */
  capabilities?: string[];
  /** Whether this is a custom model added by admin */
  isCustom?: boolean;
  /** Original OpenRouter model ID (for custom models) */
  openRouterId?: string;
}

export interface ScrapingServiceDefinition {
  /** Service identifier */
  id: string;
  /** Display name */
  name: string;
  /** Credits consumed per request */
  creditCost: number;
}

// =============================================================================
// TEXT MODELS - AI-SDK.dev Providers
// =============================================================================

export const TEXT_MODELS: ModelDefinition[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // OpenAI
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'gpt-5.2-pro',
    name: 'GPT-5.2 Pro',
    provider: 'openai',
    type: 'text',
    tier: 'enterprise',
    creditCost: 50,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming', 'json-mode']
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    provider: 'openai',
    type: 'text',
    tier: 'pro',
    creditCost: 30,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming', 'json-mode']
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    provider: 'openai',
    type: 'text',
    tier: 'pro',
    creditCost: 20,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming', 'json-mode']
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    provider: 'openai',
    type: 'text',
    tier: 'pro',
    creditCost: 15,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming', 'json-mode']
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    provider: 'openai',
    type: 'text',
    tier: 'free',
    creditCost: 5,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming', 'json-mode']
  },
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    type: 'text',
    tier: 'pro',
    creditCost: 15,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming', 'json-mode']
  },
  {
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    provider: 'openai',
    type: 'text',
    tier: 'free',
    creditCost: 3,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming', 'json-mode']
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    type: 'text',
    tier: 'pro',
    creditCost: 10,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming', 'json-mode']
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    type: 'text',
    tier: 'free',
    creditCost: 2,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming', 'json-mode']
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Anthropic
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    type: 'text',
    tier: 'enterprise',
    creditCost: 60,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming']
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    type: 'text',
    tier: 'pro',
    creditCost: 25,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming']
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    type: 'text',
    tier: 'free',
    creditCost: 5,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming']
  },
  {
    id: 'claude-opus-4-1',
    name: 'Claude Opus 4.1',
    provider: 'anthropic',
    type: 'text',
    tier: 'enterprise',
    creditCost: 50,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming']
  },
  {
    id: 'claude-sonnet-4-0',
    name: 'Claude Sonnet 4.0',
    provider: 'anthropic',
    type: 'text',
    tier: 'pro',
    creditCost: 20,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming']
  },
  {
    id: 'claude-3-7-sonnet-latest',
    name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    type: 'text',
    tier: 'pro',
    creditCost: 15,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming']
  },
  {
    id: 'claude-3-5-haiku-latest',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    type: 'text',
    tier: 'free',
    creditCost: 3,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming']
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Google
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    provider: 'google',
    type: 'text',
    tier: 'enterprise',
    creditCost: 40,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming', 'json-mode']
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    type: 'text',
    tier: 'pro',
    creditCost: 20,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming', 'json-mode']
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    type: 'text',
    tier: 'free',
    creditCost: 3,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming', 'json-mode']
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    provider: 'google',
    type: 'text',
    tier: 'free',
    creditCost: 1,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming', 'json-mode']
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // xAI (Grok)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'grok-4-fast-reasoning',
    name: 'Grok 4 Fast Reasoning',
    provider: 'xai',
    type: 'text',
    tier: 'enterprise',
    creditCost: 50,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming', 'reasoning']
  },
  {
    id: 'grok-4',
    name: 'Grok 4',
    provider: 'xai',
    type: 'text',
    tier: 'pro',
    creditCost: 30,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming']
  },
  {
    id: 'grok-3',
    name: 'Grok 3',
    provider: 'xai',
    type: 'text',
    tier: 'pro',
    creditCost: 15,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming']
  },
  {
    id: 'grok-3-fast',
    name: 'Grok 3 Fast',
    provider: 'xai',
    type: 'text',
    tier: 'pro',
    creditCost: 10,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming']
  },
  {
    id: 'grok-3-mini',
    name: 'Grok 3 Mini',
    provider: 'xai',
    type: 'text',
    tier: 'free',
    creditCost: 5,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming']
  },
  {
    id: 'grok-2-vision-1212',
    name: 'Grok 2 Vision',
    provider: 'xai',
    type: 'text',
    tier: 'pro',
    creditCost: 12,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming']
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // DeepSeek
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    type: 'text',
    tier: 'free',
    creditCost: 2,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming']
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    provider: 'deepseek',
    type: 'text',
    tier: 'pro',
    creditCost: 10,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming', 'reasoning']
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Mistral
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'pixtral-large-latest',
    name: 'Pixtral Large',
    provider: 'mistral',
    type: 'text',
    tier: 'pro',
    creditCost: 20,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['vision', 'function-calling', 'streaming']
  },
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    provider: 'mistral',
    type: 'text',
    tier: 'pro',
    creditCost: 15,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming', 'json-mode']
  },
  {
    id: 'magistral-medium-2506',
    name: 'Magistral Medium',
    provider: 'mistral',
    type: 'text',
    tier: 'pro',
    creditCost: 12,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming', 'reasoning']
  },
  {
    id: 'magistral-small-2506',
    name: 'Magistral Small',
    provider: 'mistral',
    type: 'text',
    tier: 'free',
    creditCost: 5,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming', 'reasoning']
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    provider: 'mistral',
    type: 'text',
    tier: 'free',
    creditCost: 3,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming']
  },
  {
    id: 'ministral-8b-latest',
    name: 'Ministral 8B',
    provider: 'mistral',
    type: 'text',
    tier: 'free',
    creditCost: 1,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming']
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Cohere
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'command-a-03-2025',
    name: 'Command A',
    provider: 'cohere',
    type: 'text',
    tier: 'pro',
    creditCost: 12,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming']
  },
  {
    id: 'command-a-reasoning-08-2025',
    name: 'Command A Reasoning',
    provider: 'cohere',
    type: 'text',
    tier: 'pro',
    creditCost: 15,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming', 'reasoning']
  },
  {
    id: 'command-r-plus',
    name: 'Command R+',
    provider: 'cohere',
    type: 'text',
    tier: 'pro',
    creditCost: 8,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming']
  },
  {
    id: 'command-r',
    name: 'Command R',
    provider: 'cohere',
    type: 'text',
    tier: 'free',
    creditCost: 3,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming']
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Groq (Fast Inference)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout 17B',
    provider: 'groq',
    type: 'text',
    tier: 'free',
    creditCost: 1,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming']
  },
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    provider: 'groq',
    type: 'text',
    tier: 'free',
    creditCost: 2,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming']
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 Distill Llama 70B',
    provider: 'groq',
    type: 'text',
    tier: 'free',
    creditCost: 2,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming', 'reasoning']
  },
  {
    id: 'qwen-qwq-32b',
    name: 'Qwen QwQ 32B',
    provider: 'groq',
    type: 'text',
    tier: 'free',
    creditCost: 1,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['function-calling', 'streaming', 'reasoning']
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Perplexity
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'sonar-pro',
    name: 'Sonar Pro',
    provider: 'perplexity',
    type: 'text',
    tier: 'pro',
    creditCost: 15,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['streaming', 'web-search']
  },
  {
    id: 'sonar',
    name: 'Sonar',
    provider: 'perplexity',
    type: 'text',
    tier: 'free',
    creditCost: 5,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['streaming', 'web-search']
  },
];

// =============================================================================
// IMAGE MODELS
// =============================================================================

export const IMAGE_MODELS: ModelDefinition[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // OpenAI
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'dall-e-3',
    name: 'DALL-E 3',
    provider: 'openai',
    type: 'image',
    tier: 'pro',
    creditCost: 40,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['hd-quality', 'prompt-rewriting']
  },
  {
    id: 'dall-e-2',
    name: 'DALL-E 2',
    provider: 'openai',
    type: 'image',
    tier: 'free',
    creditCost: 15,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['standard-quality']
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Google
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'imagen-3',
    name: 'Imagen 3',
    provider: 'google',
    type: 'image',
    tier: 'pro',
    creditCost: 35,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['hd-quality', 'photorealistic']
  },
  {
    id: 'imagen-3-fast',
    name: 'Imagen 3 Fast',
    provider: 'google',
    type: 'image',
    tier: 'free',
    creditCost: 10,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['standard-quality', 'fast']
  },
  {
    id: 'imagen-4.0-ultra-generate-001',
    name: 'Imagen 4 Ultra',
    provider: 'google',
    type: 'image',
    tier: 'enterprise',
    creditCost: 50,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['hd-quality', 'photorealistic', 'ultra-high-res']
  },
  {
    id: 'imagen-4.0-generate-001',
    name: 'Imagen 4',
    provider: 'google',
    type: 'image',
    tier: 'pro',
    creditCost: 35,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['hd-quality', 'photorealistic']
  },
  {
    id: 'imagen-4.0-fast-generate-001',
    name: 'Imagen 4 Fast',
    provider: 'google',
    type: 'image',
    tier: 'free',
    creditCost: 10,
    supportsDirectApi: true,
    supportsAiSdk: true,
    capabilities: ['standard-quality', 'fast']
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Fal AI
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'fal-flux-pro',
    name: 'Flux Pro',
    provider: 'fal',
    type: 'image',
    tier: 'pro',
    creditCost: 30,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['hd-quality', 'photorealistic']
  },
  {
    id: 'fal-flux-schnell',
    name: 'Flux Schnell',
    provider: 'fal',
    type: 'image',
    tier: 'free',
    creditCost: 5,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['fast', 'standard-quality']
  },
  {
    id: 'fal-flux-dev',
    name: 'Flux Dev',
    provider: 'fal',
    type: 'image',
    tier: 'pro',
    creditCost: 15,
    supportsDirectApi: false,
    supportsAiSdk: true,
    capabilities: ['standard-quality']
  },
];

// =============================================================================
// VIDEO MODELS
// Modular design - more models can be added as needed
// =============================================================================

export const VIDEO_MODELS: ModelDefinition[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // Google Veo
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'veo-3.1',
    name: 'Google Veo 3.1',
    provider: 'google',
    type: 'video',
    tier: 'enterprise',
    creditCost: 200,
    supportsDirectApi: true,
    supportsAiSdk: false,
    capabilities: ['hd-quality', '8-seconds', 'text-to-video']
  },
  // More video models can be added here (Runway, Luma, etc.)
];

// =============================================================================
// TALKING-AVATAR MODELS (AI Studio revamp M2 — script + character → video)
// =============================================================================

export const AVATAR_MODELS: ModelDefinition[] = [
  {
    id: 'd-id-talk',
    name: 'D-ID Talking Avatar',
    provider: 'did',
    type: 'avatar',
    tier: 'pro',
    creditCost: 150,
    supportsDirectApi: true,
    supportsAiSdk: false,
    capabilities: ['photo-driven', 'talking-head', 'script-to-video'],
  },
  {
    id: 'heygen-avatar',
    name: 'HeyGen Avatar',
    provider: 'heygen',
    type: 'avatar',
    tier: 'enterprise',
    creditCost: 250,
    supportsDirectApi: true,
    supportsAiSdk: false,
    capabilities: ['preset-avatar', 'presenter', 'script-to-video'],
  },
];

// =============================================================================
// AUDIO / TTS MODELS (AI Studio revamp — text → speech)
// =============================================================================

export const AUDIO_MODELS: ModelDefinition[] = [
  {
    id: 'openai-tts',
    name: 'OpenAI TTS',
    provider: 'openai',
    type: 'audio',
    tier: 'free',
    creditCost: 3,
    supportsDirectApi: true,
    supportsAiSdk: false,
    capabilities: ['text-to-speech', 'multi-voice'],
  },
  {
    id: 'elevenlabs-tts',
    name: 'ElevenLabs',
    provider: 'elevenlabs',
    type: 'audio',
    tier: 'pro',
    creditCost: 8,
    supportsDirectApi: true,
    supportsAiSdk: false,
    capabilities: ['text-to-speech', 'voice-cloning', 'multi-voice'],
  },
  {
    id: 'sarvam-tts',
    name: 'Sarvam (Indic)',
    provider: 'sarvam',
    type: 'audio',
    tier: 'free',
    creditCost: 3,
    supportsDirectApi: true,
    supportsAiSdk: false,
    capabilities: ['text-to-speech', 'indic-languages', 'multi-voice'],
  },
];

// =============================================================================
// SCRAPING SERVICES (Share same credit pool as AI models)
// =============================================================================

export const SCRAPING_SERVICES: ScrapingServiceDefinition[] = [
  {
    id: 'jinaai',
    name: 'Jina AI Reader',
    creditCost: 5
  },
  {
    id: 'apify',
    name: 'Apify Scraper',
    creditCost: 10
  },
];

// =============================================================================
// PROVIDER METADATA
// =============================================================================

export interface ProviderInfo {
  id: string;
  name: string;
  /** Provider supports BYOK (Bring Your Own Key) */
  supportsByok: boolean;
  /** Environment variable name for platform API key */
  envKeyName?: string;
  /** User API key field name */
  userKeyField?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: 'openai', name: 'OpenAI', supportsByok: true, envKeyName: 'OPENAI_API_KEY', userKeyField: 'openai' },
  { id: 'anthropic', name: 'Anthropic', supportsByok: true, envKeyName: 'ANTHROPIC_API_KEY', userKeyField: 'anthropic' },
  { id: 'google', name: 'Google AI', supportsByok: true, envKeyName: 'GEMINI_API_KEY', userKeyField: 'google' },
  { id: 'xai', name: 'xAI (Grok)', supportsByok: true, envKeyName: 'XAI_API_KEY', userKeyField: 'xai' },
  { id: 'deepseek', name: 'DeepSeek', supportsByok: true, envKeyName: 'DEEPSEEK_API_KEY', userKeyField: 'deepseek' },
  { id: 'mistral', name: 'Mistral AI', supportsByok: true, envKeyName: 'MISTRAL_API_KEY', userKeyField: 'mistral' },
  { id: 'cohere', name: 'Cohere', supportsByok: true, envKeyName: 'COHERE_API_KEY', userKeyField: 'cohere' },
  { id: 'groq', name: 'Groq', supportsByok: true, envKeyName: 'GROQ_API_KEY', userKeyField: 'groq' },
  { id: 'perplexity', name: 'Perplexity', supportsByok: true, envKeyName: 'PERPLEXITY_API_KEY', userKeyField: 'perplexity' },
  { id: 'fal', name: 'Fal AI', supportsByok: true, envKeyName: 'FAL_API_KEY', userKeyField: 'fal' },
  { id: 'openrouter', name: 'OpenRouter', supportsByok: true, envKeyName: 'OPENROUTER_API_KEY', userKeyField: 'openrouter' },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all built-in models (TEXT + IMAGE + VIDEO)
 */
export function getAllBuiltInModels(): ModelDefinition[] {
  return [...TEXT_MODELS, ...IMAGE_MODELS, ...VIDEO_MODELS, ...AVATAR_MODELS, ...AUDIO_MODELS];
}

/**
 * Get models by type
 */
export function getModelsByType(type: ModelType): ModelDefinition[] {
  return getAllBuiltInModels().filter(m => m.type === type);
}

/**
 * Get models by tier
 */
export function getModelsByTier(tier: ModelTier): ModelDefinition[] {
  return getAllBuiltInModels().filter(m => m.tier === tier);
}

/**
 * Get models by provider
 */
export function getModelsByProvider(provider: string): ModelDefinition[] {
  return getAllBuiltInModels().filter(m => m.provider === provider);
}

/**
 * Find a model by ID
 */
export function findModelById(id: string): ModelDefinition | undefined {
  return getAllBuiltInModels().find(m => m.id === id);
}

/**
 * Like findModelById but tolerates provider-dated snapshot IDs stored in plan
 * features (e.g. 'claude-haiku-4-5-20251001' resolves to 'claude-haiku-4-5').
 */
export function findModelByIdLoose(id: string): ModelDefinition | undefined {
  return findModelById(id) ?? findModelById(id.replace(/-\d{8}$/, ''));
}

/**
 * Get credit cost for a model or scraping service
 */


// =============================================================================
// AI TASKS
// =============================================================================

export interface AITask {
  id: string;
  label: string;
  description: string;
  defaultModel: string;
}

export const AI_TASKS: AITask[] = [
  { id: 'summarization', label: 'Summarization', description: 'Used for summarizing text in Docs and Chat', defaultModel: 'gemini-2.5-flash' },
  { id: 'canvasTemplate', label: 'Canvas Template Creation', description: 'Generates initial workflow structures', defaultModel: 'gemini-2.5-pro' },
  { id: 'audioToText', label: 'Audio Transcription', description: 'Converts audio files to text', defaultModel: 'whisper-1' },
  { id: 'docsAI', label: 'AI in Docs', description: 'Content generation within the document editor', defaultModel: 'gemini-2.5-flash' },
  { id: 'socialAssistant', label: 'Social Assistant', description: 'Generates post ideas and enhances social content', defaultModel: 'gpt-4o-mini' },
  { id: 'socialCaptions', label: 'Social Media Captions', description: 'Generates captions for social posts', defaultModel: 'gpt-4o' },
  { id: 'crmMessages', label: 'CRM Messages', description: 'Drafts emails and messages for contacts', defaultModel: 'gpt-4o' },
  { id: 'workflowGenerator', label: 'Workflow Generator', description: 'AI-powered canvas workflow generation from text prompts', defaultModel: 'gemini-2.5-pro' },
  { id: 'onboardingAgent', label: 'Onboarding Agent', description: 'Powering the conversational onboarding experience', defaultModel: 'gemini-2.5-flash' },
  { id: 'promptEnhancer', label: 'Prompt Enhancer', description: 'Improves prompts in the AI Studio composer (image/video/audio)', defaultModel: 'gemini-2.5-flash-lite' },
  { id: 'copilotAgent', label: 'MontrAI Agent', description: 'Powering the platform-wide AI agent workspace', defaultModel: 'gpt-4o-mini' },
  { id: 'agentStrategy', label: 'Agent Strategy Generation', description: 'Generates and iterates marketing strategies in Goal Mode', defaultModel: 'claude-haiku-4-5' },
  { id: 'agentCompaction', label: 'Agent Context Compaction', description: 'Summarizes long agent conversations to stay within context budgets', defaultModel: 'gemini-2.5-flash' },
];

export function getCreditCost(modelOrServiceId: string): number {
  const model = findModelById(modelOrServiceId);
  if (model) return model.creditCost;

  const service = SCRAPING_SERVICES.find(s => s.id === modelOrServiceId);
  if (service) return service.creditCost;

  // Default cost for unknown models (custom OpenRouter models)
  return 10;
}

/**
 * Get provider info by ID
 */
export function getProviderInfo(providerId: string): ProviderInfo | undefined {
  return PROVIDERS.find(p => p.id === providerId);
}

/**
 * Group models by provider for UI display
 */
export function groupModelsByProvider(models: ModelDefinition[]): Record<string, ModelDefinition[]> {
  return models.reduce((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<string, ModelDefinition[]>);
}

// Legacy export for backward compatibility
export const modelGroups = PROVIDERS.map(provider => ({
  label: provider.name,
  models: getModelsByProvider(provider.id).map(m => ({
    value: m.id,
    label: m.name,
  }))
})).filter(group => group.models.length > 0);
