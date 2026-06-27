/**
 * Social-publish provider registry (audit Epic 0). Maps a platform key to its
 * PlatformProvider. The worker dispatches publishing through this registry
 * instead of a giant inline switch; the composer reads `PLATFORM_CAPABILITIES`
 * to decide which features (carousel, threads, first-comment, settings) to show.
 */
import type { PlatformProvider, PlatformCapabilities } from './types';
import { xProvider } from './x.provider';
import { linkedinProvider } from './linkedin.provider';
import { facebookProvider } from './facebook.provider';
import { telegramProvider } from './telegram.provider';
import { redditProvider } from './reddit.provider';
import { instagramProvider } from './instagram.provider';
import { dribbbleProvider } from './dribbble.provider';
import { pinterestProvider } from './pinterest.provider';
import { tiktokProvider } from './tiktok.provider';
import { wordpressProvider } from './wordpress.provider';
import { threadsProvider } from './threads.provider';
import { youtubeProvider } from './youtube.provider';
import { blueskyProvider } from './bluesky.provider';
import { mastodonProvider } from './mastodon.provider';
import { googleBusinessProvider } from './google-business.provider';
import { discordProvider } from './discord.provider';
import { slackProvider } from './slack.provider';
import { devtoProvider } from './devto.provider';

const PROVIDERS: Record<string, PlatformProvider> = {
    x: xProvider,
    linkedin: linkedinProvider,
    facebook: facebookProvider,
    telegram: telegramProvider,
    reddit: redditProvider,
    instagram: instagramProvider,
    dribbble: dribbbleProvider,
    pinterest: pinterestProvider,
    tiktok: tiktokProvider,
    wordpress: wordpressProvider,
    threads: threadsProvider,
    youtube: youtubeProvider,
    bluesky: blueskyProvider,
    mastodon: mastodonProvider,
    google_business: googleBusinessProvider,
    discord: discordProvider,
    slack: slackProvider,
    devto: devtoProvider,
};

export function getPlatformProvider(platform: string): PlatformProvider | null {
    return PROVIDERS[platform] ?? null;
}

export function listPublishPlatforms(): string[] {
    return Object.keys(PROVIDERS);
}

export function getPlatformCapabilities(platform: string): PlatformCapabilities | null {
    return PROVIDERS[platform]?.capabilities ?? null;
}

/** Capability map keyed by platform — for the composer UI / client. */
export const PLATFORM_CAPABILITIES: Record<string, PlatformCapabilities> = Object.fromEntries(
    Object.entries(PROVIDERS).map(([k, p]) => [k, p.capabilities]),
);
