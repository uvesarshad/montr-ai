/**
 * Apollo.io integration — REST API v1 (import-only).
 *
 * Auth: API key (X-Api-Key header), resolved via resolveProcessorCredentials.
 *
 * Actions:
 *   enrich_person        — POST /people/match (email/name/domain/linkedin_url)
 *   search_people        — POST /mixed_people/search
 *   enrich_organization  — GET /organizations/enrich?domain=
 *
 * Config:
 *   credentialId?: string     — workflow credential vault key { apiKey }
 *   connectionId?: string     — explicit IntegrationConnection id
 *   brandId?: string          — brand-scoped connection lookup
 *   action: string            — one of the actions above (default 'enrich_person')
 *   email?, name?, domain?, linkedin_url?: string  — enrich_person
 *   q_keywords?: string                            — search_people
 *   person_titles?: string[]                       — search_people
 *   organization_domains?: string[]                — search_people
 *   page?: number, per_page?: number (cap 100)     — search_people
 *   domain?: string                                — enrich_organization
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { runWithConnectionHealth } from '@/lib/integrations/server/connection-health';
import { ApolloService } from '@/lib/services/apollo.service';

type Action = 'enrich_person' | 'search_people' | 'enrich_organization';

const VALID_ACTIONS: readonly Action[] = [
  'enrich_person',
  'search_people',
  'enrich_organization',
];

function asStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

export class ApolloProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const { credentials, connectionId } = await resolveProcessorCredentials({
      provider: 'apollo',
      config,
      workflowCredentials: context.credentials,
    });

    const apiKey = String(credentials.apiKey || '').trim();
    if (!apiKey) throw new Error('Apollo: API key is required');

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'enrich_person';

    const service = new ApolloService(apiKey);

    return runWithConnectionHealth(
      {
        connectionId,
        provider: 'apollo',
        userId: context.workflow?.createdById ? String(context.workflow.createdById) : undefined,
      },
      async () => {
    switch (action) {
      case 'enrich_person': {
        const result = await service.enrichPerson({
          email: config.email as string | undefined,
          name: config.name as string | undefined,
          domain: config.domain as string | undefined,
          linkedin_url: config.linkedin_url as string | undefined,
        });
        return { success: true, action, person: result.person ?? null, raw: result };
      }
      case 'search_people': {
        const result = await service.searchPeople({
          q_keywords: config.q_keywords as string | undefined,
          person_titles: asStringArray(config.person_titles),
          organization_domains: asStringArray(config.organization_domains),
          page: Number(config.page) || undefined,
          per_page: Number(config.per_page) || undefined,
        });
        const people = (result.people as unknown[] | undefined) || [];
        return {
          success: true,
          action,
          count: people.length,
          people,
          pagination: result.pagination ?? null,
        };
      }
      case 'enrich_organization': {
        const domain = String(config.domain || '').trim();
        if (!domain) {
          throw new Error('Apollo: "domain" is required for enrich_organization');
        }
        const result = await service.enrichOrganization(domain);
        return {
          success: true,
          action,
          organization: result.organization ?? null,
          raw: result,
        };
      }
    }
      }
    );
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (config.action as string | undefined) || 'enrich_person';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    if (
      action === 'enrich_person' &&
      !config.email &&
      !config.name &&
      !config.domain &&
      !config.linkedin_url
    ) {
      errors.push('enrich_person requires one of: email, name, domain, linkedin_url');
    }
    if (action === 'enrich_organization' && !config.domain) {
      errors.push('enrich_organization requires a domain');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
