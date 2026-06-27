/**
 * Social OAuth platform registry — every platform served by the generic
 * engine (src/lib/social/oauth/engine.ts) registers its config here.
 *
 * NOT in this registry (deliberately):
 *   - telegram   — bot-token POST flow, not OAuth (static route remains)
 *   - meta/*     — facebook/instagram asset-selector sub-routes (static);
 *     the facebook/instagram entries below only run the first OAuth leg and
 *     hand off to those sub-routes via cookies
 *   - shopify / wordpress (self-hosted) — served by the integrations hub
 *     under /api/v2/integrations (src/lib/integrations/registry.ts)
 */

import type { SocialOAuthPlatformConfig } from '../types';
import { notionPlatform } from './notion';
import { discordPlatform } from './discord';
import { gmailPlatform } from './gmail';
import { youtubePlatform } from './youtube';
import { googleBusinessPlatform } from './google-business';
import { googleDrivePlatform } from './google-drive';
import { googleCalendarPlatform } from './google-calendar';
import { outlookPlatform } from './outlook';
import { outlookCalendarPlatform } from './outlook-calendar';
import { linkedinPlatform } from './linkedin';
import { slackPlatform } from './slack';
import { pinterestPlatform } from './pinterest';
import { redditPlatform } from './reddit';
import { dribbblePlatform } from './dribbble';
import { threadsPlatform } from './threads';
import { tiktokPlatform } from './tiktok';
import { xPlatform } from './x';
import { facebookPlatform } from './facebook';
import { instagramPlatform } from './instagram';

const PLATFORMS: Record<string, SocialOAuthPlatformConfig> = {
    notion: notionPlatform,
    discord: discordPlatform,
    gmail: gmailPlatform,
    youtube: youtubePlatform,
    'google-business': googleBusinessPlatform,
    'google-drive': googleDrivePlatform,
    'google-calendar': googleCalendarPlatform,
    outlook: outlookPlatform,
    'outlook-calendar': outlookCalendarPlatform,
    linkedin: linkedinPlatform,
    slack: slackPlatform,
    pinterest: pinterestPlatform,
    reddit: redditPlatform,
    dribbble: dribbblePlatform,
    threads: threadsPlatform,
    tiktok: tiktokPlatform,
    x: xPlatform,
    facebook: facebookPlatform,
    instagram: instagramPlatform,
};

export function getSocialOAuthPlatform(platform: string): SocialOAuthPlatformConfig | null {
    return PLATFORMS[platform] ?? null;
}

export function listSocialOAuthPlatforms(): string[] {
    return Object.keys(PLATFORMS);
}
