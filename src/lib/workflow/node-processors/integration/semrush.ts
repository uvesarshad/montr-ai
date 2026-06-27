/**
 * Semrush integration — Analytics API (import-only).
 *
 * Auth: API key (`key` query param), resolved via resolveProcessorCredentials.
 * Responses are CSV-like; the service parses them into rows (or throws on an
 * `ERROR XX :: message` body).
 *
 * Actions:
 *   domain_overview     — type=domain_ranks (config.domain, config.database)
 *   keyword_overview    — type=phrase_this (config.phrase, config.database)
 *   backlinks_summary   — backlinks_overview (config.target)
 *
 * Config:
 *   credentialId?: string  — workflow credential vault key { apiKey }
 *   connectionId?: string  — explicit IntegrationConnection id
 *   brandId?: string       — brand-scoped connection lookup
 *   action: string         — one of the actions above (default 'domain_overview')
 *   domain?: string        — domain_overview
 *   phrase?: string        — keyword_overview
 *   target?: string        — backlinks_summary
 *   database?: string      — Semrush regional db (default 'us')
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { runWithConnectionHealth } from '@/lib/integrations/server/connection-health';
import { SemrushService } from '@/lib/services/semrush.service';

type Action = 'domain_overview' | 'keyword_overview' | 'backlinks_summary';

const VALID_ACTIONS: readonly Action[] = [
  'domain_overview',
  'keyword_overview',
  'backlinks_summary',
];

export class SemrushProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const { credentials, connectionId } = await resolveProcessorCredentials({
      provider: 'semrush',
      config,
      workflowCredentials: context.credentials,
    });

    const apiKey = String(credentials.apiKey || '').trim();
    if (!apiKey) throw new Error('Semrush: API key is required');

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'domain_overview';

    const database = String(config.database || 'us').trim() || 'us';
    const service = new SemrushService(apiKey);

    return runWithConnectionHealth(
      {
        connectionId,
        provider: 'semrush',
        userId: context.workflow?.createdById ? String(context.workflow.createdById) : undefined,
      },
      async () => {
    switch (action) {
      case 'domain_overview': {
        const domain = String(config.domain || '').trim();
        if (!domain) throw new Error('Semrush: "domain" is required for domain_overview');
        const rows = await service.domainOverview(domain, database);
        return { success: true, action, count: rows.length, rows };
      }
      case 'keyword_overview': {
        const phrase = String(config.phrase || '').trim();
        if (!phrase) throw new Error('Semrush: "phrase" is required for keyword_overview');
        const rows = await service.keywordOverview(phrase, database);
        return { success: true, action, count: rows.length, rows };
      }
      case 'backlinks_summary': {
        const target = String(config.target || '').trim();
        if (!target) throw new Error('Semrush: "target" is required for backlinks_summary');
        const rows = await service.backlinksSummary(target);
        return { success: true, action, count: rows.length, rows };
      }
    }
      }
    );
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (config.action as string | undefined) || 'domain_overview';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    if (action === 'domain_overview' && !config.domain) {
      errors.push('domain_overview requires a domain');
    }
    if (action === 'keyword_overview' && !config.phrase) {
      errors.push('keyword_overview requires a phrase');
    }
    if (action === 'backlinks_summary' && !config.target) {
      errors.push('backlinks_summary requires a target');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
