/**
 * Connected-channels aggregation (strategy grounding allowlist).
 *
 * Strategy validation must only recommend channels a brand has ACTUALLY
 * connected. This module defines a canonical channel taxonomy + a free-text
 * normalizer, and unions four data sources (social accounts, WhatsApp, email
 * provider, integration connections) into a single allowlist for a brand.
 *
 * Usage:
 *   const { channels } = await getConnectedChannels(orgId, brandId);
 *   if (!channels.has(normalizeChannel(recommended)!)) reject();
 *
 * Robustness mirrors `generator.ts`: each source fetch is wrapped in its own
 * try/catch so one bad repository can't crash the whole aggregation.
 */

import { connectMongoose } from '@/lib/mongodb';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';
import MarketingProvider from '@/lib/db/models/marketing-email/provider.model';

export type CanonicalChannel =
  | 'instagram' | 'facebook' | 'x' | 'linkedin' | 'youtube' | 'tiktok'
  | 'google_business' | 'bluesky' | 'mastodon' | 'threads' | 'reddit'
  | 'pinterest' | 'telegram' | 'discord' | 'slack'
  | 'email' | 'whatsapp' | 'voice';

/**
 * Every canonical literal maps to itself (identity), plus common aliases for
 * free-text channel names that AI generation or imports might produce.
 */
const ALIAS_MAP: Record<string, CanonicalChannel> = {
  // identity
  instagram: 'instagram',
  facebook: 'facebook',
  x: 'x',
  linkedin: 'linkedin',
  youtube: 'youtube',
  tiktok: 'tiktok',
  google_business: 'google_business',
  bluesky: 'bluesky',
  mastodon: 'mastodon',
  threads: 'threads',
  reddit: 'reddit',
  pinterest: 'pinterest',
  telegram: 'telegram',
  discord: 'discord',
  slack: 'slack',
  email: 'email',
  whatsapp: 'whatsapp',
  voice: 'voice',
  // aliases
  twitter: 'x',
  tweet: 'x',
  ig: 'instagram',
  insta: 'instagram',
  fb: 'facebook',
  gbp: 'google_business',
  'google business': 'google_business',
  googlebusiness: 'google_business',
  wa: 'whatsapp',
  yt: 'youtube',
  li: 'linkedin',
  call: 'voice',
  calls: 'voice',
  phone: 'voice',
  newsletter: 'email',
  mail: 'email',
};

/** Lowercase + alias-map a free-text channel name to a canonical id, or null if unknown. */
export function normalizeChannel(raw: string): CanonicalChannel | null {
  const key = raw.trim().toLowerCase();
  return ALIAS_MAP[key] ?? null;
}

export interface ConnectedChannels {
  /** normalized set the validator compares against */
  channels: Set<CanonicalChannel>;
  /** raw per-source detail for debugging/surfacing */
  detail: {
    social: string[];        // connected social platform ids (raw enum values)
    whatsapp: boolean;
    email: boolean;
    integrations: string[];  // connected integration provider ids
  };
}

/** Aggregate all connected channels for a brand. orgId/brandId are session-derived strings. */
export async function getConnectedChannels(orgId: string, brandId: string): Promise<ConnectedChannels> {
  const channels = new Set<CanonicalChannel>();
  const detail: ConnectedChannels['detail'] = {
    social: [],
    whatsapp: false,
    email: false,
    integrations: [],
  };

  // 1. SOCIAL — active social accounts for this brand.
  try {
    const accounts = await socialAccountRepository.findByBrandId(brandId);
    for (const account of accounts) {
      if (!account.isActive || account.connectionStatus !== 'active') continue;
      detail.social.push(account.platform);
      const canonical = normalizeChannel(account.platform);
      if (canonical) channels.add(canonical);
    }
  } catch (err) {
    console.error('[connected-channels] social failed:', err);
  }

  // 2. WHATSAPP — active account scoped to this brand or org-level (no brandId).
  try {
    const accounts = await whatsappAccountRepository.findByOrganizationId();
    const connected = accounts.some(
      (account) =>
        account.status === 'active' &&
        (account.brandId == null || String(account.brandId) === brandId),
    );
    if (connected) {
      detail.whatsapp = true;
      channels.add('whatsapp');
    }
  } catch (err) {
    console.error('[connected-channels] whatsapp failed:', err);
  }

  // 3. EMAIL — org-scoped marketing provider (active + verified). No brandId.
  try {
    await connectMongoose();
    const provider = await MarketingProvider.findOne({
      isActive: true,
      isVerified: true,
    }).lean();
    if (provider) {
      detail.email = true;
      channels.add('email');
    }
  } catch (err) {
    console.error('[connected-channels] email failed:', err);
  }

  // 4. INTEGRATIONS — connected integration connections for this brand or org-level.
  try {
    const connections = await integrationConnectionRepository.findByOrganization();
    for (const connection of connections) {
      if (connection.status !== 'connected') continue;
      if (connection.brandId != null && connection.brandId !== brandId) continue;
      detail.integrations.push(connection.provider);
      // Some integration providers double as marketing channels; add any that map.
      const canonical = normalizeChannel(connection.provider);
      if (canonical) channels.add(canonical);
    }
  } catch (err) {
    console.error('[connected-channels] integrations failed:', err);
  }

  return { channels, detail };
}
