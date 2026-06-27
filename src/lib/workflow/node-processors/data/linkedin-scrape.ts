/**
 * LinkedIn data loader — LinkedIn REST API (v2).
 *
 * LinkedIn does not allow profile scraping without a third-party provider. This
 * processor uses LinkedIn's *own* API, which requires an OAuth 2.0 access token.
 * Typical scopes: `r_liteprofile`, `r_emailaddress`, `w_member_social`,
 * `r_organization_social`, `rw_organization_admin`.
 *
 * Modes:
 *   me:            /v2/me → authenticated user's lite profile
 *   user_posts:    /v2/shares or /v2/ugcPosts for the authenticated user
 *   org_profile:   /v2/organizations/{orgId}
 *   org_posts:     /v2/shares?q=owners&owners=urn:li:organization:{orgId}
 *
 * Config:
 *   credentialId?: string        — credential key holding { accessToken }
 *   accessToken?: string         — direct OAuth bearer
 *   mode?: 'me' | 'user_posts' | 'org_profile' | 'org_posts' (default 'me')
 *   organizationId?: string      — required for org_* modes
 *   limit?: number               — posts per page (default 20, cap 50)
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';

const API = 'https://api.linkedin.com';
const VERSION_HEADER = '202401';

type Mode = 'me' | 'user_posts' | 'org_profile' | 'org_posts';
const VALID_MODES: readonly Mode[] = ['me', 'user_posts', 'org_profile', 'org_posts'];

export class LinkedInScrapeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, credentials } = context;
    const cred = (config.credentialId && credentials?.[config.credentialId as string]) as Record<string, unknown> | undefined;
    const accessToken: string =
      ((cred?.accessToken as string | undefined) || (cred?.token as string | undefined) || (config.accessToken as string | undefined) || '').trim();
    if (!accessToken) {
      throw new Error('LinkedIn: access token is required');
    }

    const configMode = config.mode as string | undefined;
    const mode: Mode = (configMode && VALID_MODES.includes(configMode as Mode)) ? (configMode as Mode) : 'me';
    const limit = Math.max(1, Math.min(Number(config.limit) || 20, 50));

    if (mode === 'me') {
      const data = await fetchLi(`${API}/v2/me`, accessToken);
      return { success: true, mode, profile: data };
    }

    if (mode === 'user_posts') {
      const me = await fetchLi(`${API}/v2/me`, accessToken);
      const urn = `urn:li:person:${me.id}`;
      const url = `${API}/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(urn)})&count=${limit}&sortBy=LAST_MODIFIED`;
      const data = await fetchLi(url, accessToken);
      const elements = data.elements as unknown[] | undefined;
      return {
        success: true,
        mode,
        ownerUrn: urn,
        count: elements?.length || 0,
        posts: elements || [],
      };
    }

    const orgId = String('').trim();
    const orgUrn = orgId.startsWith('urn:') ? orgId : `urn:li:organization:${orgId}`;

    if (mode === 'org_profile') {
      const data = await fetchLi(
        `${API}/v2/organizations/${encodeURIComponent(orgId.replace(/^urn:li:organization:/, ''))}`,
        accessToken
      );
      return { success: true, mode, organization: data };
    }

    // org_posts
    const url = `${API}/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(orgUrn)})&count=${limit}&sortBy=LAST_MODIFIED`;
    const data = await fetchLi(url, accessToken);
    const orgElements = data.elements as unknown[] | undefined;
    return {
      success: true,
      mode,
      ownerUrn: orgUrn,
      count: orgElements?.length || 0,
      posts: orgElements || [],
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.credentialId && !config.accessToken) {
      errors.push('credentialId or accessToken is required');
    }
    if (config.mode && !VALID_MODES.includes(config.mode as Mode)) {
      errors.push(`mode must be one of: ${VALID_MODES.join(', ')}`);
    }
    if ((config.mode === 'org_profile' || config.mode === 'org_posts') && !config.organizationId) {
      errors.push('organizationId is required for org modes');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

async function fetchLi(url: string, token: string): Promise<Record<string, unknown>> {
  const res = await safeOutboundFetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'LinkedIn-Version': VERSION_HEADER,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data?.message as string | undefined) || (data?.error_description as string | undefined) || res.statusText;
    throw new Error(`LinkedIn API: ${res.status} — ${msg}`);
  }
  return data;
}
