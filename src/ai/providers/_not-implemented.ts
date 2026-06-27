/**
 * Shared "not implemented yet" stub for providers reserved by the rollout
 * order but not yet wired. The factory returns a `ProviderClient` whose
 * methods throw a clear "implement me — task B2-3.X" error. Replace the
 * stub with a real implementation when the corresponding task is worked.
 */

import {
  ProviderClient,
  ProviderId,
  ProviderSdk,
  GenerateTextRequest,
  GenerateTextResult,
} from './types';

interface StubOptions {
  id: ProviderId;
  sdk: ProviderSdk;
  task: string;
  capabilities?: Partial<ProviderClient['capabilities']>;
}

const DEFAULT_CAPS: ProviderClient['capabilities'] = {
  text: false,
  image: false,
  video: false,
  audio: false,
  streaming: false,
  toolCalling: false,
  vision: false,
  promptCaching: false,
};

export function makeNotImplementedProvider(opts: StubOptions): ProviderClient {
  const errMsg = `Provider "${opts.id}" is reserved in the router but not yet implemented. See task ${opts.task}.`;
  return {
    id: opts.id,
    sdk: opts.sdk,
    capabilities: { ...DEFAULT_CAPS, ...opts.capabilities },
    async generateText(_req: GenerateTextRequest): Promise<GenerateTextResult> {
      throw new Error(errMsg);
    },
    async streamText(_req: GenerateTextRequest): Promise<AsyncGenerator<string>> {
      throw new Error(errMsg);
    },
  };
}
