/**
 * Provider registry — single import point for the router.
 *
 * Every provider exports a `ProviderClient`. Stubs throw at execution time
 * but expose the same shape so the router can advertise their `capabilities`
 * to the UI / model picker without crashing.
 */

import { ProviderClient, ProviderId } from './types';
import { googleProvider } from './google';
import { openaiProvider } from './openai';
import { anthropicProvider } from './anthropic';
import { xaiProvider } from './xai';
import { sarvamProvider } from './sarvam';
import { kimiProvider } from './kimi';
import { zaiProvider } from './zai';
import { deepseekProvider } from './deepseek';
import { openrouterProvider } from './openrouter';
import { vercelAisdkProvider } from './vercel-aisdk';
import { runwayProvider } from './runway';
import { pikaProvider } from './pika';
import { lumaProvider } from './luma';
import { klingProvider } from './kling';
import { seedanceProvider } from './seedance';
import { replicateProvider } from './replicate';
import { ideogramProvider } from './ideogram';
import { elevenlabsProvider } from './elevenlabs';
import { didProvider } from './d-id';
import { heygenProvider } from './heygen';

const PROVIDERS: Record<ProviderId, ProviderClient> = {
  google: googleProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
  xai: xaiProvider,
  sarvam: sarvamProvider,
  kimi: kimiProvider,
  zai: zaiProvider,
  deepseek: deepseekProvider,
  openrouter: openrouterProvider,
  'vercel-aisdk': vercelAisdkProvider,
  runway: runwayProvider,
  pika: pikaProvider,
  luma: lumaProvider,
  kling: klingProvider,
  seedance: seedanceProvider,
  replicate: replicateProvider,
  ideogram: ideogramProvider,
  elevenlabs: elevenlabsProvider,
  did: didProvider,
  heygen: heygenProvider,
};

export function getProvider(id: ProviderId): ProviderClient {
  return PROVIDERS[id];
}

export function listProviders(): ProviderClient[] {
  return Object.values(PROVIDERS);
}

export type { ProviderClient, ProviderId } from './types';
