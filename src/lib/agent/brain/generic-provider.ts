/**
 * GenericBrainProvider — the OSS CORE brain (master §2A.6 L2).
 *
 * Binds the generic, own-data brain the platform has always used. Every method
 * is a faithful wrap of the pre-seam behaviour, so resolving the brain through
 * this provider is a no-op change in CORE:
 *
 *   - getSystemPromptAddenda → '' (core adds no premium/tuned instructions; the
 *     soul + brand-context system prompt is built by the caller as before).
 *   - getPlaybooks           → the brand's Agent-Workspace Playbooks/ (the
 *     ~12-15 static starters + the agent's own distilled plays) via
 *     getPlaybookContext — exactly what generator.ts read before.
 *   - getGroundingBands      → the static, own-data benchmark bands via
 *     formatBandsForPrompt — same ranges as before.
 *   - getPreferredModel      → AISettingsService (user → system → fallback),
 *     i.e. BYOK-capable own-key routing — same model selection as before.
 *
 * DB-touching dependencies are dynamic-imported inside the methods (matching
 * generator.ts) so importing this module is cheap and side-effect free.
 */

import { formatBandsForPrompt } from '@/lib/strategy/benchmarks';
import type {
  BrainProvider,
  BrainContext,
  BrainPlaybookQuery,
  BrainGroundingQuery,
  BrainTask,
  BrainModelPreference,
} from './provider';

export class GenericBrainProvider implements BrainProvider {
  readonly id = 'generic';

  /** Core ships no premium/tuned system-prompt addenda. */
  async getSystemPromptAddenda(_ctx: BrainContext): Promise<string> {
    return '';
  }

  /** Wraps the brand's own workspace playbooks (static starters + distilled). */
  async getPlaybooks(query: BrainPlaybookQuery): Promise<string> {
    try {
      const { getPlaybookContext } = await import('@/lib/agent/workspace');
      return await getPlaybookContext({
        userId: query.userId,
        brandId: query.brandId,
        maxChars: query.maxChars,
        maxDocs: query.maxDocs,
      });
    } catch (error) {
      // getPlaybookContext already fails soft, but guard the dynamic import too.
      console.error('[Brain] generic getPlaybooks failed:', error);
      return '';
    }
  }

  /** Wraps the static, own-data benchmark bands (channel-relevant ranges). */
  getGroundingBands(query: BrainGroundingQuery): string {
    return formatBandsForPrompt(query.channels);
  }

  /** Wraps AISettingsService routing (user → system → fallback / BYOK). */
  async getPreferredModel(ctx: BrainContext, task: BrainTask): Promise<BrainModelPreference> {
    const { AISettingsService } = await import('@/lib/services/ai-settings.service');
    const pref = await AISettingsService.getPreferredModel(ctx.userId, task);
    return {
      modelId: pref.modelId,
      routeHint: pref.routeHint,
      source: pref.source,
    };
  }
}
