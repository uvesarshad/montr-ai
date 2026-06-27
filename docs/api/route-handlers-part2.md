# API Route Handlers (Part 2: Social, Documents, Notifications, Voice, AI Bots, Admin, Infrastructure)

> Scope: API routes by domain — paths, methods, auth requirements, and purpose.
> Rendering context: Server-side
> Project tier: 4
> Last updated: 2026-06-05

AGENT SEE: docs/api/route-handlers-part1.md — continues from here (Overview, Canvas, CRM, Agent)

## Social Media Routes

src/app/api/social/ — Legacy-path social API (still canonical for this module): posts (schedule, scheduled, draft-from-scheduled, schedule-from-draft), drafts, brands + brands/[brandId]/accounts, media + media/folders, templates, analytics, activity, approvals, ai (enhance, ideas, hashtags, repurpose, translate), upload. Auth: required.
src/app/api/social/oauth/[platform]/ — Generic social OAuth engine (one dynamic route pair serving initiation + callback for 19 platforms: notion, discord, gmail, youtube, google-business, google-drive, google-calendar, outlook, outlook-calendar, linkedin, slack, pinterest, reddit, dribbble, threads, tiktok, x, facebook, instagram). Per-platform behavior is config-driven from src/lib/social/oauth/platforms/; the engine (src/lib/social/oauth/engine.ts) owns state/PKCE/cookies/token exchange and each config's persist hook owns storage (SocialAccount, CRM email/calendar accounts, or user storage). Redirect URIs keep the per-platform path. Static siblings take precedence: telegram/ (bot-token POST, not OAuth) and meta/assets + meta/select (facebook/instagram asset selector). Shopify and self-hosted WordPress connect via the integrations hub, not here. Auth: callback requires a session.
src/app/api/v2/social/posts/ — POST. Auth: required. The only social route under v2.
src/app/api/v2/brands/ — Brand management (GET, POST, PUT [id], DELETE [id]). Auth: required.

AGENT NOTE: The social module is the exception to the "all routes under src/app/api/v2/" rule — its routes live under src/app/api/social/.

## Inbox, WhatsApp, and Marketing Email Routes

src/app/api/v2/conversations/ — GET, POST. Auth: required. Omnichannel inbox conversations; [id]/ (GET, PUT, DELETE) and [id]/duplicate/ (POST).
src/app/api/v2/inbox/webhook/[channel]/ — POST. Auth: channel signature verification. Inbound webhooks per channel.
src/app/api/whatsapp/ — Legacy-path WhatsApp module API: accounts, contacts, groups, conversations, messages, campaigns, templates, auto-replies, custom-fields, media, team, analytics, ai, workflows, webhook. Auth: required (webhook signature-verified).
src/app/api/v2/marketing-email/ — campaigns/ (GET, POST; [id] with pause, resume, send, ab-results), providers/ (+ [id]/verify), templates/ (+ generate, [id]), stats/, track/[type]/ (public open/click tracking via base64 data param). Auth: required except track.

AGENT SEE: docs/modules/inbox.md, docs/modules/whatsapp.md, docs/modules/marketing-email.md — module-level detail

## Document and Forms Routes

src/app/api/v2/documents/ — GET, POST, PUT [id], DELETE [id]. Auth: required.
src/app/api/v2/documents/[id]/notion-sync/ — GET (link status), POST (create link + initial sync), PATCH (change direction and/or sync now), DELETE (unlink). Auth: required; verifies document ownership and brand ownership before using the brand's Notion connection. AGENT SEE: docs/api/external-services.md — Notion Doc Sync section.
src/app/api/v2/documents/notion-import/ — POST. Auth: required; brand-ownership verified. Bulk import: creates up to 50 documents linked to the items of a Notion database, then kicks a one-off sync job.
src/app/api/v2/documents/[id]/publish-wordpress/ — POST. Auth: required; document ownership verified. Publishes the doc's HTML as a WordPress post via the org/brand WordPress connection.
src/app/api/v2/folders/ — GET, POST, PUT [id], DELETE [id]. Auth: required.
src/app/api/v2/forms/ — GET, POST, PUT [id], DELETE [id]. Auth: required.
src/app/api/v2/public/forms/[id]/submit/ — POST. Auth: none. Public form submission.

## Integrations Hub Routes

src/app/api/v2/integrations/ — GET (list org connections, credentials never included), POST (connect an api_key provider; key validated with a live call before storing). Auth: required; organizationId read from the session user's record.
src/app/api/v2/integrations/[id]/ — DELETE. Auth: required. Disconnect (org-scoped).
src/app/api/v2/integrations/[id]/test/ — POST. Auth: required. Live health check; updates connection status and lastError.
src/app/api/v2/integrations/[id]/import/ — POST (run a Mailchimp/HubSpot data import into the integration_import_records staging store), GET (imported-record count). Auth: required; Mailchimp/HubSpot only.
src/app/api/v2/integrations/oauth/[provider]/ — GET. Auth: required. Initiates the generic OAuth flow; accepts brandId (optional pin), region (Zoho), and the Shopify shop name via the same parameter slot.
src/app/api/v2/integrations/oauth/[provider]/callback/ — GET. Auth: required. Verifies state (and provider match), exchanges the code, fetches account identity, upserts the connection, redirects to /settings?tab=connections.
src/app/api/webhooks/shopify/[connectionId]/ — POST. Auth: raw-body HMAC-SHA256 against SHOPIFY_CLIENT_SECRET. Publishes shopify.webhook_received domain events; app/uninstalled marks the connection errored.
src/app/api/webhooks/revenuecat/[connectionId]/ — POST. Auth: optional Authorization-header match against connection metadata webhookSecret (timing-safe); unverified events flagged verified false. Publishes revenuecat.webhook_received domain events; verified events also dispatch the integration_webhook workflow trigger.
src/app/api/webhooks/mailchimp/[connectionId]/ — GET (Mailchimp URL-validation ping), POST (form-encoded events). Auth: optional ?secret= match against connection metadata webhookSecret (timing-safe). Publishes mailchimp.webhook_received domain events.

AGENT NOTE: The Shopify webhook route also dispatches the integration_webhook workflow trigger on every verified delivery, and Shopify webhook subscriptions (orders/create, customers/create, app/uninstalled) are auto-registered by the OAuth callback at connect time via src/lib/integrations/server/shopify-webhooks.ts.

AGENT SEE: docs/api/external-services.md — Integrations Hub provider catalog and credential model.

## Ads and Analytics Routes

Ads OAuth (separate from both the social OAuth engine and the integrations hub):
src/app/api/ads/oauth/google-ads/ + /callback/ — GET. Initiation requires GOOGLE_ADS_DEVELOPER_TOKEN; offline access + forced consent (refresh token mandatory — callback rejects without one). Callback stores tokens in 10-minute cookies and redirects to the picker.
src/app/api/ads/oauth/meta-ads/ + /callback/ — GET. Reuses the Meta app (NEXT_PUBLIC_FACEBOOK_APP_ID); callback exchanges for a long-lived (~60d) user token before the picker.
src/app/api/ads/oauth/assets/ — GET ?platform=. Auth: required + brand access. Lists connectable ad accounts (Google: accessible customers expanded one MCC level; managers listed but not connectable).
src/app/api/ads/oauth/select/ — POST {platform, assetId}. Auth: required + brand access. Re-fetches assets server-side (client only ever sends an ID), creates/updates the AdAccount, generates the google_ads webhookKey, enqueues a 90-day metrics backfill.

Analytics OAuth (GA4 / Search Console, read-only scopes):
src/app/api/analytics/oauth/[source]/ + /callback/ — GET. source ∈ ga4|search_console. Same cookie→picker flow; refresh token mandatory.
src/app/api/analytics/oauth/assets/ + /select/ — GET/POST. Auth: required + brand access. GA4 property picker (Admin API account summaries) / GSC site picker.

Ads API:
src/app/api/v2/ads/accounts/ — GET (?brandId= filter; google_ads rows include webhookKey). src/app/api/v2/ads/accounts/[id]/ — DELETE. Auth: required; org from session user's record.
src/app/api/v2/ads/leads/ — GET (filters: brandId/platform/status, paging, statusCounts). src/app/api/v2/ads/leads/[id]/retry/ — POST (re-runs CRM intake). Auth: required.
src/app/api/v2/ads/lead-field-maps/ — GET, PUT. Auth: required. Per-form custom-field → CRM identity mapping (ad_lead_field_maps).
src/app/api/v2/ads/campaigns/ — POST. Auth: required. THE ONLY ads write entry point: Zod discriminated union (Meta campaign/adset/ad · Google budget/campaign/ad-group/RSA with 30/90-char limits), dispatches the create-only write-ops allowlist; everything created PAUSED; 201 created / 207 partial (failedStep + created entities).
src/app/api/v2/ads/generate-copy/ — POST. Auth: required; rate bucket ai:ads-copy. Format-aware AI ad copy (BrandContext voice; credits consumed).
src/app/api/v2/ads/generate-creative/ — POST. Auth: required; rate bucket ai:ads-copy. AI ad image at a platform preset size (1:1/9:16/16:9). With brandId: uploaded PUBLIC to S3 + saved as a media_assets row (tags ad-creative, permanent URL, reusable from the wizard's library picker). Without brandId: legacy 24h presigned URL.
src/app/api/v2/ads/recommendations/ — POST. Auth: required; rate bucket ai:ads-insights. AI analysis of campaign stats (current vs previous period) — read-only suggestions; returns hasData:false without burning credits when there is no campaign data.

Analytics API (org-scoped reads over metrics_snapshots; Zod in src/validations/analytics.ts; default range last 30 days):
src/app/api/v2/analytics/sources/ — GET. src/app/api/v2/analytics/sources/[id]/ — DELETE.
src/app/api/v2/analytics/summary/ — GET. Cross-source totals; defaults to top-level entities so breakdown rows don't double-count.
src/app/api/v2/analytics/timeseries/ — GET. Daily series (metrics summed per day).
src/app/api/v2/analytics/breakdown/ — GET. Per-entity totals; entityType required.
src/app/api/v2/analytics/sync/ — POST. Manual "Sync now": one connection (ownership verified) or all org ad accounts + sources; enqueues source-metrics-sync jobs.

Lead-capture webhooks (public):
src/app/api/webhooks/meta-leads/ — GET (hub verification, META_LEADS_WEBHOOK_VERIFY_TOKEN), POST (leadgen events). Auth: x-hub-signature-256 HMAC against FACEBOOK_APP_SECRET (dev fails open when unset; production fails closed). ALWAYS returns 200 on processed events so Meta never disables the subscription. Lead details fetched via the connected FB Page token, falling back to connected Meta ad-account tokens.
src/app/api/webhooks/google-leads/ — POST. Auth: body google_key must match an AdAccount.webhookKey (authenticates AND routes the delivery); unknown key → 403.
Both lead webhooks also dispatch the ad_lead_captured workflow trigger after the CRM intake (fire-and-forget — trigger failures never affect the webhook response).

AGENT NOTE: There are NO update/delete/pause routes for ads campaigns by design (create-only PAUSED guardrail — see overview.md Key Architectural Decisions).
AGENT SEE: docs/modules/ads-analytics.md — module deep-dive.

## Notification Routes

src/app/api/v2/notifications/ — GET. Auth: required. List caller's notifications.
src/app/api/v2/notifications/unread-count/ — GET. Auth: required.
src/app/api/v2/notifications/read-all/ — POST. Auth: required. Mark all read.
src/app/api/v2/notifications/[id]/ — PATCH (mark read), DELETE. Auth: required.
src/app/api/v2/notifications/[id]/action/ — POST. Auth: required. Invoke a notification action.
src/app/api/v2/notifications/preferences/ — GET, PATCH. Auth: required. Per-user channel preferences.
src/app/api/v2/notifications/admin/broadcast/ — GET, POST. Auth: admin only. Broadcast notifications.

AGENT SEE: docs/api/database.md — notification, notification-broadcast, notification-preference models

## Voice Routes

src/app/api/v2/voice/calls/ — GET (list), POST (place call). Auth: required.
src/app/api/v2/voice/calls/[id]/ — GET, DELETE. Auth: required.
src/app/api/v2/voice/calls/[id]/dtmf/ — POST. Auth: required. Send DTMF tones.
src/app/api/v2/voice/calls/[id]/hangup/ — POST. Auth: required.
src/app/api/v2/voice/calls/[id]/play/ — POST. Auth: required. Play audio into call.
src/app/api/v2/voice/calls/[id]/recording/ — GET. Auth: required.
src/app/api/v2/voice/calls/[id]/transcript/ — GET. Auth: required.
src/app/api/v2/voice/bulk-calls/ — GET, POST. Auth: required. Bulk call batches.
src/app/api/v2/voice/bulk-calls/[id]/ — GET. Auth: required.
src/app/api/v2/voice/bulk-calls/[id]/decide/ — POST. Auth: required. Approve/decline a batch.
src/app/api/v2/voice/numbers/ — GET, POST. Auth: required. Phone numbers.
src/app/api/v2/voice/numbers/[id]/ — GET, DELETE. Auth: required.
src/app/api/v2/voice/numbers/[id]/routing/ — PUT. Auth: required. Inbound routing config.
src/app/api/v2/voice/numbers/provision/ — POST. Auth: required. Provision a new number.
src/app/api/v2/voice/provider-configs/ — GET, POST. Auth: required. Org/user-scoped voice provider credentials.
src/app/api/v2/voice/provider-configs/[id]/ — PATCH, DELETE. Auth: required.
src/app/api/v2/voice/webhooks/twilio/inbound/[numberId]/ — POST. Auth: signature-verified. Twilio inbound call webhook.
src/app/api/v2/voice/webhooks/[provider]/[...path]/ — POST. Auth: signature-verified. Generic provider webhook catch-all.

AGENT SEE: docs/api/external-services.md — voice provider abstraction, STT/TTS services
AGENT SEE: docs/api/database.md — voice models (call-session, call-transcript, voice-phone-number, voice-provider-config, voice-bulk-batch)

## AI Bot Routes

src/app/api/v2/ai-bots/ — GET, POST. Auth: required. Conversational AI bots.
src/app/api/v2/ai-bots/[id]/ — GET, PATCH, DELETE. Auth: required.
src/app/api/v2/ai-bots/[id]/conversations/ — GET. Auth: required. Bot conversation states.
src/app/api/v2/ai-bots/[id]/stats/ — GET. Auth: required.
src/app/api/v2/ai-bots/[id]/test/ — POST. Auth: required. Test a bot reply.

AGENT SEE: docs/api/database.md — ai-bot, ai-bot-conversation-state models

AGENT SEE: docs/architecture/data-flow.md — route handler lifecycle
AGENT UPDATE: Update part1 or part2 when a route handler is added, removed, or its contract (auth requirement, method, request/response shape) changes.

## User and Admin Routes

src/app/api/v2/users/me/ — GET (profile), PUT (update profile). Auth: required.
src/app/api/v2/admin/users/ — GET (all users), POST (create user). Auth: admin only.
src/app/api/v2/admin/users/[id]/ — GET, PUT (role, plan, status), DELETE. Auth: admin only.
src/app/api/v2/admin/users/bulk/ — POST. Auth: admin only. Bulk user operations.
src/app/api/v2/admin/users/[id]/model-access/ — GET, PATCH, DELETE. Auth: super_admin. Per-user model access grants.
src/app/api/v2/admin/organizations/ — GET, POST, PATCH, DELETE. Auth: super_admin.
src/app/api/v2/admin/audit-logs/ — GET. Auth: super_admin. Read-only admin audit trail.
src/app/api/v2/admin/stats/ — GET. Auth: super_admin. Platform-wide stats.
src/app/api/v2/admin/system-settings/ — GET, POST. Auth: super_admin.
src/app/api/v2/admin/providers/ai/ — GET. Auth: super_admin. AI provider config.
src/app/api/v2/admin/plans/ — Plan management. Auth: super_admin.
src/app/api/v2/admin/models/custom/ — GET, POST. Auth: super_admin. Custom (OpenRouter) models.
src/app/api/v2/admin/models/custom/[id]/ — PATCH, DELETE. Auth: super_admin.
src/app/api/v2/admin/models/custom/[id]/toggle/ — PATCH. Auth: super_admin. Enable/disable.
src/app/api/v2/admin/models/overrides/ — GET, POST, DELETE. Auth: super_admin. Model overrides.
src/app/api/v2/admin/scraping/actors/ — GET, POST. Auth: super_admin. Apify actor registry.
src/app/api/v2/admin/scraping/actors/[id]/ — PATCH, DELETE. Auth: super_admin.
src/app/api/v2/admin/scraping/actors/[id]/toggle/ — PATCH. Auth: super_admin.
src/app/api/v2/admin/canvas-templates/ — GET. Auth: admin only. Template moderation queue.
src/app/api/v2/admin/canvas-templates/[id]/approve/ — PATCH. Auth: admin only.
src/app/api/v2/admin/canvas-templates/[id]/reject/ — PATCH. Auth: admin only.
src/app/api/v2/admin/canvas-templates/[id]/feature/ — PATCH. Auth: admin only.
src/app/api/v2/admin/voice/provider-configs/ — GET, POST. Auth: super_admin. System-scope voice credentials.
src/app/api/v2/admin/voice/provider-configs/[id]/ — PATCH, DELETE. Auth: super_admin.
src/app/api/v2/admin/voice/reconcile/ — POST. Auth: super_admin. Cost reconciliation.
src/app/api/v2/admin/voice/test-call/ — POST. Auth: super_admin. Provider test call.
src/app/api/v2/plans/ — GET, POST. Auth: super_admin.

## Infrastructure Routes

src/app/api/v2/health/ — GET. Public. Returns { status: 'ok' } and sub-service checks.
src/app/api/v2/health/workers/ — GET. Public. Worker health.
src/app/api/cron/ — POST endpoints triggered by cron scheduler. Each verifies Bearer CRON_SECRET.
src/app/api/upload — POST. Public (rate-limited in handler). File upload endpoint.

## Related Docs

- docs/api/route-handlers-part1.md — Canvas, CRM, Agent routes
- docs/auth/auth-flow.md — How auth() and session work
- docs/api/external-services.md — External APIs called from route handlers
- docs/modules/crm.md — CRM module detail
