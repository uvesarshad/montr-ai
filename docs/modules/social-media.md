# Social Media Module

> Scope: Social media publishing — brands, accounts, scheduling, drafts, and analytics.
> Rendering context: Client-side
> Project tier: 4
> Last updated: 2026-06-05

## Overview

The Social Media module manages brand-scoped social publishing across multiple platforms. Users connect social accounts per brand, create and schedule posts, manage a content calendar, and track analytics. Content can flow from the Canvas module. Supported platforms include X (Twitter), LinkedIn, Instagram, Facebook, Pinterest, YouTube, and others.

## Entry Points

- src/app/(app)/social/ — Social module pages (calendar, drafts, create-post, analytics, approvals, templates, media).
- src/app/(app)/social/layout.tsx — Module sub-layout with platform navigation.
- src/app/api/social/ — Social API: accounts (src/app/api/social/brands/[brandId]/accounts/), OAuth (src/app/api/social/oauth/[platform]/), drafts, templates, approvals, analytics, media, and activity.
- src/app/api/v2/social/posts/ — Scheduled-post create/list route (the only social endpoint under v2).
- src/app/api/social/brands/ — Brand management API.

## Key Pages

src/app/(app)/social/page.tsx — Main calendar/dashboard view. Shows scheduled posts.
src/app/(app)/social/create-post/ — Post composition with platform preview.
src/app/(app)/social/drafts/ — Draft post management.
src/app/(app)/social/calendar/ — Visual content calendar.
src/app/(app)/social/analytics/ — Per-account and per-post analytics.
src/app/(app)/social/approvals/ — Post approval workflow.
src/app/(app)/social/templates/ — Post templates.
src/app/(app)/social/media/ — Media library for social assets.
src/app/(app)/social/activity/ — Brand-scoped activity feed: log of social actions (post created/submitted/approved/published/scheduled, draft saved/deleted, brand created, account connected/disconnected, member added/removed) with per-action filtering. Reads from src/app/api/social/activity/route.ts. Client Component.
src/app/(app)/social/oauth-callback/ — OAuth callback page for platform connections.

## Data Models

social_accounts — Connected accounts per brand. Fields: userId, organizationId, brandId, platform, platformAccountId, accessToken (encrypted), refreshToken (encrypted), accountName, accountHandle, profileImage, expiresAt.

scheduled_posts — Posts queued for publishing. Fields: userId, organizationId, brandId, platform, content (platform-specific), mediaUrls, scheduledAt, status (scheduled/published/failed), publishedAt, platformPostId.

drafts — Draft posts. Fields: userId, organizationId, brandId, platform, content, mediaUrls.

recurring_posts — Posts on a recurring schedule. Fields: userId, brandId, platform, content, cronExpression, nextRunAt.

post_approvals — Approval workflow records. Fields: postId, requestedBy, approvedBy, status.

brands — Brand configurations. Fields: userId, organizationId, name, logo, colors, voiceTone, targetAudience, defaultPlatforms.

media_assets, media_folders — Media library. Fields: userId, organizationId, brandId, key (S3 key), url, mimeType, size, tags.

## Social Account OAuth Flow

One generic engine serves every platform (consolidated 2026-06-05 from 21 per-provider route directories):

1. User selects a platform to connect (social-connections.tsx opens /api/social/oauth/[platform]/?brandId=…).
2. The dynamic route delegates to initiateSocialOAuth in src/lib/social/oauth/engine.ts: state + PKCE cookies (social_oauth_*), auth-URL built from the platform's config.
3. The platform redirects back to /api/social/oauth/[platform]/callback/ — same dynamic route pair; the engine verifies state, exchanges the code (src/lib/social/oauth/exchange.ts), then calls the platform config's persist() hook.
4. persist() owns storage — most platforms write encrypted tokens to social_accounts; gmail/outlook with ?source=crm write to CRM email accounts, google-calendar/outlook-calendar to CRM calendar accounts, google-drive to user storage; facebook/instagram set a user-token cookie and hand off to the asset selector.
5. The browser lands on /social/oauth-callback (popup-closing page) or /settings?tab=connections, per platform.

Per-platform behavior is config-driven: each platform is one file in src/lib/social/oauth/platforms/ (endpoints, scopes, token transport, persist hook) registered in platforms/index.ts. Adding a platform = one config file + one registry line. Static exceptions that take routing precedence over [platform]: telegram (bot-token POST, not OAuth) and meta/assets + meta/select (facebook/instagram page/account selection). Meta-family token exchanges use tokenMethod 'GET' (Meta's query-string wire format).

AGENT NOTE: Access tokens in social_accounts are stored encrypted. Never log or return raw tokens in API responses.
AGENT SEE: docs/api/route-handlers-part2.md — Social Media Routes; docs/infra/environment.md — Social OAuth env vars.

## Content Publishing

Social publish node processor (src/lib/workflow/node-processors/social/publish-post.ts) handles Canvas-triggered posting. Dispatches to the appropriate platform SDK based on the account's platform field.

Platform adapters in src/lib/social/ handle the per-platform posting API calls.

Scheduled post delivery runs through a BullMQ queue. Posts are enqueued on the 'social-posts' queue via getSocialPostsQueue (src/lib/queue/queue.ts); the worker process picks up each job at its scheduled time and publishes the post, updating status from 'scheduled' to 'published' or 'failed'.

## Post Approval Workflow

Posts can be routed through an approval step before publishing. post_approvals tracks the approval state. The approvals page (src/app/(app)/social/approvals/) lets admins review and approve/reject queued posts.

## Media Library

Media assets are uploaded to S3/Wasabi via the standard upload endpoint. Keys stored in media_assets. Used by post composition and canvas design nodes. Organized into media_folders.

AGENT UPDATE: Update this file when new platforms are added, when the OAuth flow changes, or when the post scheduling mechanism changes.

## Related Docs

- docs/api/external-services.md — Platform SDK details
- docs/modules/canvas.md — Canvas-to-social content flow
- docs/api/database.md — social_accounts, scheduled_posts model details
